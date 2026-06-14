from __future__ import annotations

import re
from typing import Any, Literal, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from app.api.dependencies import get_store
from app.auth.dependencies import get_current_user
from app.auth.limits import check_and_increment_limit
from app.core.config import Settings, get_settings
from app.services.advisor_atlas import AdvisorAtlasService
from app.services.store import Store


router = APIRouter(prefix="/advisor-atlas", tags=["Advisor Atlas"])


class ResearchProfile(BaseModel):
    interests: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("interests")
    @classmethod
    def normalize_interests(cls, interests: list[str]) -> list[str]:
        normalized = []
        seen = set()
        for interest in interests:
            value = interest.strip()
            key = value.casefold()
            if value and len(value) < 2:
                raise ValueError("Each research interest must contain at least two characters.")
            if len(value) > 200:
                raise ValueError("Each research interest must be 200 characters or fewer.")
            if value and key not in seen:
                normalized.append(value)
                seen.add(key)
        return normalized


class CreateRunRequest(BaseModel):
    mode: Literal["department", "professor"]
    university_name: Optional[str] = Field(default=None, max_length=300)
    university_url: Optional[str] = Field(default=None, max_length=1000)
    department: Optional[str] = Field(default=None, max_length=300)
    professor_name: Optional[str] = Field(default=None, max_length=300)
    degree_target: Optional[str] = Field(default=None, max_length=80)
    intake_term: Optional[str] = Field(default=None, max_length=100)
    research_profile: ResearchProfile = Field(default_factory=ResearchProfile)
    approved_domains: list[str] = Field(default_factory=list, max_length=30)

    @field_validator(
        "university_name",
        "university_url",
        "department",
        "professor_name",
        "degree_target",
        "intake_term",
    )
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = re.sub(r"\s+", " ", value).strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_mode_inputs(self):
        if self.university_url:
            parsed = urlparse(self.university_url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise ValueError(
                    "Official URL must be a complete HTTP or HTTPS university or professor URL."
                )
        if self.mode == "department":
            if not self.university_name or not self.department:
                raise ValueError("University name and department are required.")
        if self.mode == "professor":
            required = {
                "professor name": self.professor_name,
                "university name": self.university_name,
                "official university or professor URL": self.university_url,
                "department or research area": self.department,
                "degree target": self.degree_target,
                "intended intake": self.intake_term,
            }
            missing = [label for label, value in required.items() if not value]
            if missing:
                raise ValueError(
                    "Professor search requires " + ", ".join(missing) + "."
                )
            if len((self.professor_name or "").split()) < 2:
                raise ValueError("Professor name must include at least a first and last name.")
            if self.degree_target not in {"PhD", "Research Master's", "Either"}:
                raise ValueError("Degree target must be PhD, Research Master's, or Either.")
            if not re.fullmatch(
                r"(Spring|Summer|Fall|Autumn|Winter)\s+20\d{2}",
                self.intake_term or "",
                re.IGNORECASE,
            ):
                raise ValueError(
                    "Intended intake must include an academic term and year, for example Fall 2027."
                )
        if not self.research_profile.interests:
            raise ValueError("At least one research interest is required for research matching.")
        return self


class CandidateUpdateRequest(BaseModel):
    shortlist_status: Optional[Literal["unreviewed", "shortlisted", "watch", "contacted", "dismissed"]] = None
    decision_lane: Optional[str] = Field(default=None, max_length=100)
    user_notes: Optional[str] = Field(default=None, max_length=5000)


class PublicationUpdateRequest(BaseModel):
    reading_status: Optional[Literal["unread", "read_next", "reading", "read"]] = None
    user_note: Optional[str] = Field(default=None, max_length=3000)


def _service(settings: Settings = Depends(get_settings)) -> AdvisorAtlasService:
    return AdvisorAtlasService(settings)


@router.post("/runs", status_code=202)
async def create_run(
    payload: CreateRunRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
    store: Store = Depends(get_store),
):
    check_and_increment_limit(
        user,
        "advisor_atlas_searches_per_month",
        increment=1,
        session=store.db,
    )
    run = service.repository.create_run(
        int(user["id"]),
        payload.model_dump(),
    )
    background_tasks.add_task(service.run, int(run["id"]), int(user["id"]))
    return run


@router.get("/runs")
def list_runs(
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
):
    return service.repository.list_runs(int(user["id"]))


@router.get("/runs/{run_id}")
def get_run(
    run_id: int,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
):
    try:
        return service.repository.get_run(run_id, int(user["id"]))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(
    run_id: int,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
):
    success = service.repository.delete_run(run_id, int(user["id"]))
    if not success:
        raise HTTPException(status_code=404, detail="Run not found.")


@router.post("/runs/{run_id}/cancel")
def cancel_run(
    run_id: int,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
):
    try:
        return service.repository.cancel_run(run_id, int(user["id"]))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/runs/{run_id}/resume", status_code=202)
def resume_run(
    run_id: int,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
):
    try:
        run = service.repository.prepare_resume(run_id, int(user["id"]))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    background_tasks.add_task(service.run, run_id, int(user["id"]))
    return run


@router.get("/candidates/{candidate_id}")
def get_candidate(
    candidate_id: int,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
):
    try:
        return service.repository.get_candidate(candidate_id, int(user["id"]))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/candidates/{candidate_id}")
def update_candidate(
    candidate_id: int,
    payload: CandidateUpdateRequest,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
):
    try:
        return service.repository.update_candidate(
            candidate_id,
            int(user["id"]),
            payload.model_dump(exclude_none=True),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/candidates/{candidate_id}/publications/{publication_id}")
def update_publication(
    candidate_id: int,
    publication_id: int,
    payload: PublicationUpdateRequest,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
):
    try:
        return service.repository.update_publication(
            publication_id,
            candidate_id,
            int(user["id"]),
            payload.model_dump(exclude_none=True),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/candidates/{candidate_id}/refresh")
async def refresh_candidate(
    candidate_id: int,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
    store: Store = Depends(get_store),
):
    try:
        service.repository.get_candidate(candidate_id, int(user["id"]))
        check_and_increment_limit(
            user,
            "advisor_atlas_searches_per_month",
            increment=1,
            session=store.db,
        )
        return await service.refresh_candidate(candidate_id, int(user["id"]))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (httpx.HTTPError, ValueError) as exc:  # type: ignore[name-defined]
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/candidates/{candidate_id}/save")
def save_candidate(
    candidate_id: int,
    user: dict = Depends(get_current_user),
    service: AdvisorAtlasService = Depends(_service),
):
    try:
        return service.repository.save_to_professors(candidate_id, int(user["id"]))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
