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


def _with_parsed_opportunities(run: dict[str, Any]) -> dict[str, Any]:
    if "opportunities" not in run:
        return run
    from app.api.scholarship_opportunities import _with_parsed_fields

    result = dict(run)
    result["opportunities"] = [_with_parsed_fields(item) for item in run["opportunities"]]
    return result


@router.post("/runs", status_code=202)
async def create_run(
    payload: CreateDeepHuntRunRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    service: ScholarshipDeepHuntService = Depends(_service),
    store: Store = Depends(get_user_store),
    settings: Settings = Depends(get_settings),
):
    # Rate limit first: 5 runs per user per 10 minutes, before any plan/token work.
    rate_limiter.check_and_record("scholarship_deep_hunt_run", user_identity(user))
    # Plan-gated (Pro/Max) before any token spend, same as Advisor Atlas.
    _require_scholarship_deep_hunt_access(user, store.db)
    ai_tokens.ensure_can_spend(user, store.db)

    from app.api.routes import verify_model_permission
    verify_model_permission(None, user, store.db, settings)

    run = service.repository.create_run(str(user["id"]), payload.model_dump())
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
    return _with_parsed_opportunities(run)


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
