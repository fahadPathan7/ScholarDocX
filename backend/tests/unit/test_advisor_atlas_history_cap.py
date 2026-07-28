"""SCHOLARDOCX-0186: fixed 100-run cap on Advisor Atlas research history.

Kept in its own file rather than added to test_advisor_atlas.py, which is
already past this project's 1150-line file-size hard cap.
"""
from pathlib import Path

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api.advisor_atlas import (
    MAX_ADVISOR_ATLAS_RUNS,
    CreateRunRequest,
    ResearchProfile,
    create_run,
)
from app.core.config import Settings
from app.db.connection import connect, get_db, initialize_database
from app.services.advisor_atlas.repository import AdvisorAtlasRepository
from app.services.advisor_atlas.service import AdvisorAtlasService
from app.services.store import Store
from tests.helpers import cleanup_user_records

TEST_USER_ID = "00000000-0000-0000-0000-0000000000b1"


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.media_path = tmp_path / "workspace" / "media"
    initialize_database(settings.database_target)
    with connect(settings.database_target) as db:
        cleanup_user_records(db, TEST_USER_ID, "advisor-atlas-cap@test.local")
        db.execute(
            "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (?, 'advisor-atlas-cap@test.local', 'x', 'Cap Test User', '[\"max_user\"]', 1, 0)",
            (TEST_USER_ID,),
        )
        db.commit()
    return settings


def _run_payload(name: str) -> dict:
    return {
        "mode": "department",
        "search_depth": "quick",
        "university_name": name,
        "department": "Physics",
        "research_profile": {},
    }


def test_count_runs_reflects_created_and_deleted_runs(tmp_path):
    settings = make_settings(tmp_path)
    repository = AdvisorAtlasRepository(settings.database_target)
    assert repository.count_runs(TEST_USER_ID) == 0

    created = [repository.create_run(TEST_USER_ID, _run_payload(f"U{i}")) for i in range(5)]
    assert repository.count_runs(TEST_USER_ID) == 5

    repository.delete_run(created[0]["id"], TEST_USER_ID)
    assert repository.count_runs(TEST_USER_ID) == 4


@pytest.mark.asyncio
async def test_create_run_rejects_once_history_cap_reached(tmp_path):
    settings = make_settings(tmp_path)
    repository = AdvisorAtlasRepository(settings.database_target)
    for i in range(MAX_ADVISOR_ATLAS_RUNS):
        repository.create_run(TEST_USER_ID, _run_payload(f"U{i}"))
    assert repository.count_runs(TEST_USER_ID) == MAX_ADVISOR_ATLAS_RUNS

    session = next(get_db(settings.database_target))
    try:
        store = Store(session, current_user_id=TEST_USER_ID)
        service = AdvisorAtlasService(settings)
        user = {"id": TEST_USER_ID, "roles": ["max_user"]}
        payload = CreateRunRequest(
            mode="department",
            university_name="One Too Many University",
            department="Physics",
            research_profile=ResearchProfile(interests=["quantum computing"]),
        )

        with pytest.raises(HTTPException) as exc:
            await create_run(payload, BackgroundTasks(), user, service, store, settings)
        assert exc.value.status_code == 409
        assert "history limit" in exc.value.detail.lower()

        # Deleting one existing run must free up a slot for a new one.
        existing = repository.list_runs(TEST_USER_ID)
        repository.delete_run(existing[0]["id"], TEST_USER_ID)
        assert repository.count_runs(TEST_USER_ID) == MAX_ADVISOR_ATLAS_RUNS - 1
    finally:
        session.close()
