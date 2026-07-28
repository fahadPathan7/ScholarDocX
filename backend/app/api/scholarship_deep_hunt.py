"""Deep Hunt runs API (Phase 5 of the Scholarship Hunt pipeline, SCHOLARDOCX-0125).

Mirrors `app/api/advisor_atlas.py`'s run lifecycle shape (create/list/get/
cancel/resume/delete via `BackgroundTasks`), plan-gated by the single
`can_use_scholarship_hunt` permission (Pro/Max by default).
"""

from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.auth.dependencies import get_current_user, get_user_store
from app.auth.limits import check_and_increment_limit, feature_plan_phrase, UsageLimitExceeded
from app.auth.rate_limit import rate_limiter, user_identity
from app.core.config import Settings, get_settings
from app.services import ai_tokens
from app.services.scholarship_deep_hunt import ScholarshipDeepHuntService
from app.services.store import Store


router = APIRouter(prefix="/scholarship-deep-hunt", tags=["Scholarship Deep Hunt"])


class CreateDeepHuntRunRequest(BaseModel):
    goal: str = Field(min_length=3, max_length=500)
    degree_level: Optional[str] = Field(default=None, max_length=80)
    destinations: list[str] = Field(default_factory=list, max_length=10)
    intake_term: Optional[str] = Field(default=None, max_length=100)
    # SCHOLARDOCX-0173: field of study from the Hunt Profile so the intent
    # planner + relevance filter can match results to the user's field.
    field_of_study: Optional[str] = Field(default=None, max_length=120)

    @field_validator("goal")
    @classmethod
    def normalize_goal(cls, value: str) -> str:
        normalized = re.sub(r"\s+", " ", value).strip()
        if len(normalized) < 3:
            raise ValueError("Goal must be at least 3 characters.")
        return normalized

    @field_validator("degree_level", "intake_term", "field_of_study")
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = re.sub(r"\s+", " ", value).strip()
        return normalized or None

    @field_validator("destinations")
    @classmethod
    def normalize_destinations(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for value in values:
            text = re.sub(r"\s+", " ", str(value)).strip()
            key = text.casefold()
            if text and key not in seen:
                seen.add(key)
                cleaned.append(text)
        return cleaned


def _service(settings: Settings = Depends(get_settings)) -> ScholarshipDeepHuntService:
    return ScholarshipDeepHuntService(settings)


def _require_scholarship_deep_hunt_access(user: dict, session) -> None:
    """Gate Deep Hunt behind the `can_use_scholarship_hunt` role limit.

    Scholarship Hunt (Pro/Max by default; Free/General off) is the single
    permission for the whole scholarship suite. Applies only to work-creating
    actions so a downgraded user can still read existing runs and results.
    """
    try:
        check_and_increment_limit(user, "can_use_scholarship_hunt", 0, session)
    except UsageLimitExceeded:
        phrase = feature_plan_phrase("can_use_scholarship_hunt", session)
        raise HTTPException(
            status_code=403,
            detail=(
                f"Scholarship Hunt is available on {phrase}. "
                "Upgrade to run multi-pass scholarship research."
            ),
        )


class SaveDeepHuntResultRequest(BaseModel):
    normalized_url: str = Field(min_length=1, max_length=2000)


@router.post("/runs", status_code=202)
async def create_run(
    payload: CreateDeepHuntRunRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    service: ScholarshipDeepHuntService = Depends(_service),
    store: Store = Depends(get_user_store),
    settings: Settings = Depends(get_settings),
):
    """Start a Scholarship Hunt deep search run.

    SCHOLARDOCX-0175: pre-flight checks the user can afford the worst-case
    per-hit charge (4 passes x 20 results x per-hit price) before enqueue.
    Actual charges scale with real hits per pass. The run response carries
    a cost_estimate so the frontend can show the ceiling upfront.
    """
    import math
    from app.services.ai_tokens import (
        ensure_can_spend,
        get_brave_call_cost_per_hit_usd,
        get_token_rate,
    )
    from app.services.scholarship_deep_hunt import MAX_RAW_HITS_PER_RUN

    # Rate limit first: 5 runs per user per 10 minutes, before any plan/token work.
    rate_limiter.check_and_record("scholarship_deep_hunt_run", user_identity(user))
    # Plan-gated (Pro/Max) before any token spend.
    _require_scholarship_deep_hunt_access(user, store.db)
    # SCHOLARDOCX-0175: per-hit pre-flight. Reject with a clear message if the
    # user can't afford the worst case before we burn any provider credits.
    per_hit_cost = get_brave_call_cost_per_hit_usd(store.db)
    max_tokens = math.ceil(MAX_RAW_HITS_PER_RUN * per_hit_cost * get_token_rate(store.db))
    try:
        ensure_can_spend(user, store.db, min_tokens=max_tokens)
    except ai_tokens.OutOfTokens:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Not enough credits for this search. It scans up to "
                f"{MAX_RAW_HITS_PER_RUN} sources."
            ),
        )

    from app.api.routes import verify_model_permission
    verify_model_permission(None, user, store.db, settings)

    run = service.repository.create_run(str(user["id"]), payload.model_dump())
    run["cost_estimate"] = {
        "max_sources": MAX_RAW_HITS_PER_RUN,
        "max_credits": max_tokens,
    }
    background_tasks.add_task(service.run, str(run["id"]), str(user["id"]))
    return run


@router.get("/runs")
def list_runs(
    user: dict = Depends(get_current_user),
    service: ScholarshipDeepHuntService = Depends(_service),
):
    return service.repository.list_runs(str(user["id"]))


@router.get("/runs/{run_id}")
def get_run(
    run_id: str,
    user: dict = Depends(get_current_user),
    service: ScholarshipDeepHuntService = Depends(_service),
):
    try:
        run = service.repository.get_run(run_id, str(user["id"]))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return run


@router.post("/runs/{run_id}/cancel")
def cancel_run(
    run_id: str,
    user: dict = Depends(get_current_user),
    service: ScholarshipDeepHuntService = Depends(_service),
):
    try:
        return service.repository.cancel_run(run_id, str(user["id"]))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/runs/{run_id}/resume", status_code=202)
def resume_run(
    run_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    service: ScholarshipDeepHuntService = Depends(_service),
    store: Store = Depends(get_user_store),
):
    _require_scholarship_deep_hunt_access(user, store.db)
    try:
        run = service.repository.prepare_resume(run_id, str(user["id"]))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    background_tasks.add_task(service.run, run_id, str(user["id"]))
    return run


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(
    run_id: str,
    user: dict = Depends(get_current_user),
    service: ScholarshipDeepHuntService = Depends(_service),
):
    success = service.repository.delete_run(run_id, str(user["id"]))
    if not success:
        raise HTTPException(status_code=404, detail="Run not found.")


@router.post("/runs/{run_id}/results/save")
def save_result(
    run_id: str,
    payload: SaveDeepHuntResultRequest,
    user: dict = Depends(get_current_user),
    service: ScholarshipDeepHuntService = Depends(_service),
    store: Store = Depends(get_user_store),
):
    """Persist exactly one chosen Search result to the Opportunity Library.

    SCHOLARDOCX-0178: a completed run no longer auto-saves every accepted
    result — the user picks which ones to keep, one at a time, via this
    endpoint. Reuses the same dedup-by-URL, no-invented-fields contract as
    "Analyze" (`upsert_scholarship_opportunity`), including the Library cap.
    """
    from app.api.scholarship_opportunities import (
        LibraryFullError,
        _with_parsed_fields,
        upsert_scholarship_opportunity,
    )

    try:
        run = service.repository.get_run(run_id, str(user["id"]), include_opportunities=True)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    result = next(
        (r for r in run.get("results", []) if r.get("normalized_url") == payload.normalized_url),
        None,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="That result is no longer part of this run.")

    extracted = {
        "canonical_name": result.get("canonical_name"),
        "sponsor": result.get("sponsor"),
        "degree_levels": result.get("degree_levels") or [],
        "fields_of_study": result.get("fields_of_study") or [],
        "destination_countries": result.get("destination_countries") or [],
        "eligible_nationalities": result.get("eligible_nationalities") or [],
        "funding": result.get("funding") or {},
        "deadlines": result.get("deadlines") or [],
        "requirements": result.get("requirements") or [],
        "application_url": result.get("application_url"),
        "field_confidence": {},
    }
    try:
        record = upsert_scholarship_opportunity(
            store,
            source="deep_hunt",
            extracted=extracted,
            source_url=result["source_url"],
            fallback_title=result.get("source_title", ""),
            extra_fields={
                "deep_hunt_run_id": run_id,
                "relevance_score": result.get("relevance_score", 0),
            },
        )
    except LibraryFullError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return _with_parsed_fields(record)
