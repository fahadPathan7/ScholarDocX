import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth.dependencies import get_current_user, get_user_store
from app.auth.limits import check_and_increment_limit, feature_plan_phrase, UsageLimitExceeded
from app.core.config import get_settings
from app.services import ai_tokens
from app.services.ai import AiService
from app.services.store import Store
from app.services.news_service import news_service
from app.services.scholarship_catalog import (
    catalog_entry_normalized_url,
    get_catalog_entry,
    list_catalog,
    normalize_url,
)
from app.services.scholarship_extraction import scholarship_extraction_service
from app.api.news import _charge_scholarship_hunt
from app.api.routes import Payload, verify_model_permission

router = APIRouter()


class AnalyzeRequest(BaseModel):
    source_url: str
    source_title: str = ""
    source_snippet: str = ""


def _require_scholarship_analyze(user: dict, store: Store) -> None:
    try:
        check_and_increment_limit(
            user,
            "can_use_scholarship_hunt",
            increment=0,
            session=store.db,
        )
    except UsageLimitExceeded:
        # Which plans include Scholarship Hunt is admin-configurable, so derive
        # the message from role_limits instead of hardcoding plan names.
        phrase = feature_plan_phrase("can_use_scholarship_hunt", store.db)
        raise HTTPException(
            status_code=403,
            detail=(
                f"Scholarship Hunt is available on {phrase}. "
                "Upgrade to extract structured scholarship details."
            ),
        )


@router.get("/scholarship-catalog")
async def get_scholarship_catalog(
    levels: Optional[List[str]] = Query(None),
    destinations: Optional[List[str]] = Query(None),
    funding_coverage: Optional[List[str]] = Query(None),
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
) -> List[Dict[str, Any]]:
    entries = list_catalog(levels=levels, destinations=destinations, funding_coverage=funding_coverage)
    owned = {
        row["normalized_url"]
        for row in store.list_records("scholarship_opportunities")
    }
    return [
        {**entry, "in_library": catalog_entry_normalized_url(entry) in owned}
        for entry in entries
    ]


@router.post("/scholarship-catalog/{catalog_id}/check-cycle")
async def check_scholarship_cycle(
    catalog_id: str,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    entry = get_catalog_entry(catalog_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Unknown catalog entry.")
    if not news_service.api_key:
        raise HTTPException(
            status_code=500,
            detail="Scholarship Hunt Tavily API key is not configured.",
        )
    _charge_scholarship_hunt(user, store)

    domain = catalog_entry_normalized_url(entry)
    query = (
        f"{entry['canonical_name']} official scholarship page current application "
        f"cycle deadline eligibility requirements {domain}"
    )
    return await news_service.search_scholarships(approved_query=query)


def upsert_scholarship_opportunity(
    store: Store,
    *,
    source: str,
    extracted: Dict[str, Any],
    source_url: str,
    fallback_title: str = "",
    extra_fields: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Insert-or-update a `scholarship_opportunities` row for one extracted
    result, deduped by normalized URL per user. Shared by the "Analyze"
    endpoint (one card at a time) and the Deep Hunt service (Phase 5,
    SCHOLARDOCX-0125), which persists several results per run the same way.
    """
    normalized = normalize_url(source_url)
    canonical_name = extracted["canonical_name"] or fallback_title.strip() or normalized

    row_payload = {
        "source": source,
        "canonical_name": canonical_name,
        "normalized_url": normalized,
        "sponsor": extracted["sponsor"],
        "degree_levels_json": _dumps(extracted["degree_levels"]),
        "destinations_json": _dumps(extracted["destination_countries"]),
        "eligible_nationalities_json": _dumps(extracted["eligible_nationalities"]),
        "funding_json": _dumps(extracted["funding"]),
        "deadlines_json": _dumps(extracted["deadlines"]),
        "requirements_json": _dumps(extracted["requirements"]),
        "field_confidence_json": _dumps(extracted["field_confidence"]),
        "application_url": extracted["application_url"] or source_url,
    }
    if extra_fields:
        row_payload.update(extra_fields)

    existing = next(
        (
            row
            for row in store.list_records("scholarship_opportunities")
            if row["normalized_url"] == normalized
        ),
        None,
    )
    if existing:
        return store.update_record("scholarship_opportunities", existing["id"], row_payload)
    row_payload["status"] = "Found"
    return store.create_record("scholarship_opportunities", row_payload)


@router.post("/scholarship-opportunities/analyze")
async def analyze_scholarship_opportunity(
    payload: AnalyzeRequest,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
) -> Dict[str, Any]:
    _require_scholarship_analyze(user, store)
    settings = get_settings()
    verify_model_permission(None, user, store.db, settings)
    ai_tokens.ensure_can_spend(user, store.db)

    ai_service = AiService(settings)
    ai_service.set_billing(user, store.db)

    extracted = await scholarship_extraction_service.extract(
        ai_service,
        source_url=payload.source_url,
        source_title=payload.source_title,
        source_snippet=payload.source_snippet,
    )

    record = upsert_scholarship_opportunity(
        store,
        source="hunt",
        extracted=extracted,
        source_url=payload.source_url,
        fallback_title=payload.source_title,
    )
    return _with_parsed_fields(record)


@router.get("/scholarship-opportunities")
async def list_scholarship_opportunities(
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
) -> List[Dict[str, Any]]:
    _migrate_bookmarks(store)
    return [_with_parsed_fields(row) for row in store.list_records("scholarship_opportunities")]


@router.patch("/scholarship-opportunities/{opportunity_id}")
async def update_scholarship_opportunity(
    opportunity_id: int,
    payload: Payload,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
) -> Dict[str, Any]:
    try:
        record = store.update_record("scholarship_opportunities", opportunity_id, payload.data)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error))
    return _with_parsed_fields(record)


@router.delete("/scholarship-opportunities/{opportunity_id}")
async def delete_scholarship_opportunity(
    opportunity_id: int,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
) -> Dict[str, Any]:
    try:
        return store.delete_record("scholarship_opportunities", opportunity_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error))


def _migrate_bookmarks(store: Store) -> None:
    """Additively copy bookmarks with no matching opportunity row into the
    library. Idempotent; never touches or deletes bookmarked_news."""
    existing_urls = {
        row["normalized_url"] for row in store.list_records("scholarship_opportunities")
    }
    for bookmark in store.list_records("bookmarked_news"):
        link = bookmark.get("link")
        if not link:
            continue
        normalized = normalize_url(link)
        if normalized in existing_urls:
            continue
        store.create_record(
            "scholarship_opportunities",
            {
                "source": "bookmark_migration",
                "canonical_name": bookmark.get("title") or normalized,
                "normalized_url": normalized,
                "status": "Found",
                "application_url": link,
                "degree_levels_json": "[]",
                "destinations_json": "[]",
                "eligible_nationalities_json": "[]",
                "funding_json": "{}",
                "deadlines_json": "[]",
                "requirements_json": "[]",
                "field_confidence_json": "{}",
            },
        )
        existing_urls.add(normalized)


def _dumps(value: Any) -> str:
    return json.dumps(value)


_JSON_FIELD_DEFAULTS: Dict[str, Any] = {
    "degree_levels_json": [],
    "destinations_json": [],
    "eligible_nationalities_json": [],
    "funding_json": {},
    "deadlines_json": [],
    "requirements_json": [],
    "field_confidence_json": {},
}


def _with_parsed_fields(record: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(record)
    for key, default in _JSON_FIELD_DEFAULTS.items():
        raw = result.get(key)
        try:
            result[key[: -len("_json")]] = json.loads(raw) if raw else default
        except (TypeError, ValueError):
            result[key[: -len("_json")]] = default
    return result
