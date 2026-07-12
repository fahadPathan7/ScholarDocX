from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user, get_user_store
from app.auth.rate_limit import rate_limiter, user_identity
from app.api.dependencies import get_store
from app.services.store import Store
from app.services.news_feedback import (
    claim_query_preview_feedback,
    complete_search_feedback,
    create_query_preview_feedback,
    create_search_feedback,
)
from app.services.news_service import MAX_TAVILY_QUERY_LENGTH, news_service
from app.services.news_query_generator import scholarship_query_generator
from app.auth.limits import check_and_increment_limit, UsageLimitExceeded
from app.services import ai_tokens
from app.services.ai_tokens import charge_flat_fee, get_tavily_call_cost_usd, ensure_can_spend

router = APIRouter()

class BookmarkCreate(BaseModel):
    article_id: str
    title: str
    link: str
    source_name: Optional[str] = None
    pub_date: Optional[str] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    country: Optional[str] = None


class SavedQueryCreate(BaseModel):
    name: str
    query_string: str
    filters_json: str


class SavedQueryUpdate(BaseModel):
    seen_article_ids_json: str


class ScholarshipSearchFilters(BaseModel):
    levels: Optional[List[str]] = None
    countries: Optional[List[str]] = None
    seasons: Optional[List[str]] = None
    years: Optional[List[str]] = None
    funding_types: Optional[List[str]] = None
    fields_of_study: Optional[List[str]] = None
    popular_scholarships: Optional[List[str]] = None
    custom_prompt: Optional[str] = None
    language: str = "en"
    sort_by: str = "latest"


class QueryPreviewRequest(BaseModel):
    filters: ScholarshipSearchFilters


class ConfirmedSearchRequest(BaseModel):
    filters: ScholarshipSearchFilters
    preview_feedback_id: int = Field(ge=0)
    approved_query: str = Field(min_length=3, max_length=MAX_TAVILY_QUERY_LENGTH)
    query_approved: bool


def _filter_kwargs(filters: ScholarshipSearchFilters) -> Dict[str, Any]:
    return filters.model_dump(exclude_none=True)


def _now_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _charge_scholarship_hunt(user: dict, store: Store) -> None:
    try:
        check_and_increment_limit(
            user,
            "can_use_scholarship_hunt",
            increment=0,
            session=store.db,
        )
        ensure_can_spend(user, store.db)
        cost_usd = get_tavily_call_cost_usd(store.db)
        charge_flat_fee(user, store.db, cost_usd, source="scholarship_hunt")
    except UsageLimitExceeded as error:
        raise HTTPException(status_code=429, detail=str(error.detail))


@router.post("/news/query-preview")
async def preview_news_query(
    payload: QueryPreviewRequest,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    rate_limiter.check_and_record("news_query_preview", user_identity(user))
    if not news_service.api_key:
        raise HTTPException(
            status_code=500,
            detail="Scholarship Hunt Tavily API key is not configured.",
        )

    # Query building is AI-metered (tokens), not search-counted. The actual
    # Tavily search in /news/search keeps its daily/monthly count limits.
    ai_tokens.ensure_can_spend(user, store.db)
    generated = await scholarship_query_generator.generate(
        _filter_kwargs(payload.filters)
    )
    if generated.get("source") == "openrouter":
        usage = generated.get("usage", {})
        ai_tokens.charge(
            user,
            model_id="openrouter",
            provider="openrouter",
            input_tokens=int(usage.get("input_tokens", 0)),
            output_tokens=int(usage.get("output_tokens", 0)),
            source="scholarship_query_build",
            session=store.db,
        )
    feedback_id = create_query_preview_feedback(
        store.db,
        int(user["id"]),
        generated["query"],
        _filter_kwargs(payload.filters),
    )
    return {
        "preview_feedback_id": feedback_id,
        "initial_query": generated["query"],
        "max_length": MAX_TAVILY_QUERY_LENGTH,
        "generation_source": generated["source"],
        "generation_model": generated["model"],
        "generation_notice": generated["notice"],
    }


@router.post("/news/search")
async def search_news_confirmed(
    payload: ConfirmedSearchRequest,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    rate_limiter.check_and_record("news_search", user_identity(user))
    if not payload.query_approved:
        raise HTTPException(
            status_code=422,
            detail="Review and approve the query before searching.",
        )
    if not news_service.api_key:
        raise HTTPException(
            status_code=500,
            detail="Scholarship Hunt Tavily API key is not configured.",
        )
    filters = _filter_kwargs(payload.filters)
    approved_query = payload.approved_query.strip()
    if len(approved_query) < 3:
        raise HTTPException(
            status_code=422,
            detail="Approved query must contain at least 3 characters.",
        )

    if payload.preview_feedback_id == 0:
        _charge_scholarship_hunt(user, store)
        feedback_id = create_search_feedback(store.db, int(user["id"]), approved_query, approved_query, filters)
    else:
        try:
            initial_query = claim_query_preview_feedback(
                store.db,
                payload.preview_feedback_id,
                int(user["id"]),
                approved_query,
            )
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error))
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error))
        
        # Charge for the actual search even if they used preview
        _charge_scholarship_hunt(user, store)
        
        feedback_id = payload.preview_feedback_id

    try:
        results = await news_service.search_scholarships(
            **filters,
            approved_query=approved_query,
        )
    except Exception:
        complete_search_feedback(
            store.db,
            feedback_id,
            "failed",
        )
        raise

    complete_search_feedback(
        store.db,
        feedback_id,
        "success",
        int(results.get("totalResults") or 0),
    )
    return results


@router.get("/news/search")
async def search_news(
    levels: Optional[List[str]] = Query(None),
    countries: Optional[List[str]] = Query(None),
    seasons: Optional[List[str]] = Query(None),
    years: Optional[List[str]] = Query(None),
    funding_types: Optional[List[str]] = Query(None),
    fields_of_study: Optional[List[str]] = Query(None),
    popular_scholarships: Optional[List[str]] = Query(None),
    custom_prompt: Optional[str] = Query(None),
    language: str = "en",
    sort_by: str = "latest",
    page: Optional[str] = None,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_store),
):
    if not news_service.api_key:
        raise HTTPException(
            status_code=500,
            detail="Scholarship Hunt Tavily API key is not configured.",
        )
        
    _charge_scholarship_hunt(user, store)

    results = await news_service.search_scholarships(
        levels=levels,
        countries=countries,
        seasons=seasons,
        years=years,
        funding_types=funding_types,
        fields_of_study=fields_of_study,
        popular_scholarships=popular_scholarships,
        custom_prompt=custom_prompt,
        language=language,
        sort_by=sort_by,
        page=page,
    )
    
    return results

@router.get("/news/bookmarks")
async def get_bookmarks(
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    return store.list_records("bookmarked_news")

@router.post("/news/bookmarks")
async def add_bookmark(
    bookmark: BookmarkCreate,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    try:
        return store.create_record("bookmarked_news", bookmark.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/news/bookmarks/{article_id}")
async def delete_bookmark(
    article_id: str,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    # need to find the record ID first to delete
    record = store.connection.execute(
        "SELECT id FROM bookmarked_news WHERE user_id = ? AND article_id = ?",
        (user["id"], article_id)
    ).fetchone()
    
    if not record:
        raise HTTPException(status_code=404, detail="Bookmark not found")
        
    return store.delete_record("bookmarked_news", record["id"])


@router.get("/news/saved-queries")
async def get_saved_queries(
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    return store.list_records("saved_scholarship_queries")

@router.post("/news/saved-queries")
async def add_saved_query(
    saved_query: SavedQueryCreate,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    try:
        return store.create_record("saved_scholarship_queries", saved_query.model_dump())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/news/saved-queries/{query_id}")
async def update_saved_query(
    query_id: int,
    payload: SavedQueryUpdate,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    """Updates a watchlist's seen-article-IDs after a re-run diff (FR-8.41);
    bumps last_used_at server-side so "run again" freshness isn't client-set."""
    try:
        return store.update_record(
            "saved_scholarship_queries",
            query_id,
            {
                "seen_article_ids_json": payload.seen_article_ids_json,
                "last_used_at": _now_iso(),
            },
        )
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.delete("/news/saved-queries/{query_id}")
async def delete_saved_query(
    query_id: int,
    user: dict = Depends(get_current_user),
    store: Store = Depends(get_user_store),
):
    return store.delete_record("saved_scholarship_queries", query_id)

