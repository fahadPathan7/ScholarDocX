from pathlib import Path

import pytest
from fastapi import BackgroundTasks

from app.api import advisor_atlas as advisor_atlas_api
from app.api.advisor_atlas import CreateRunRequest
from app.auth.limits import UsageLimitExceeded, check_and_increment_limit, invalidate_limits_cache
from app.core.config import Settings
from app.db.connection import connect, get_db, initialize_database


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.database_path = settings.workspace_path / "db" / "app.db"
    settings.media_path = settings.workspace_path / "media"
    initialize_database(settings.database_path)
    return settings


def professor_request() -> CreateRunRequest:
    return CreateRunRequest(
        mode="professor",
        professor_name="Ada Scholar",
        university_name="Example University",
        university_url="https://example.edu/faculty/ada",
        department="Computer Science",
        degree_target="PhD",
        intake_term="Fall 2027",
        research_profile={"interests": ["Accessible AI"]},
    )


def test_advisor_atlas_monthly_role_defaults(tmp_path):
    settings = make_settings(tmp_path)

    with connect(settings.database_path) as db:
        rows = db.execute(
            """
            SELECT role, limit_count, reset_period
            FROM role_limits
            WHERE feature = 'advisor_atlas_searches_per_month'
            ORDER BY role
            """
        ).fetchall()

    assert [(row["role"], row["limit_count"], row["reset_period"]) for row in rows] == [
        ("general_user", 3, "monthly"),
        ("max_user", 30, "monthly"),
        ("pro_user", 10, "monthly"),
    ]


def test_database_reinitialization_preserves_custom_advisor_atlas_limit(tmp_path):
    settings = make_settings(tmp_path)

    with connect(settings.database_path) as db:
        db.execute(
            """
            UPDATE role_limits
            SET limit_count = 8
            WHERE role = 'general_user'
              AND feature = 'advisor_atlas_searches_per_month'
            """
        )
        db.commit()

    initialize_database(settings.database_path)

    with connect(settings.database_path) as db:
        row = db.execute(
            """
            SELECT limit_count
            FROM role_limits
            WHERE role = 'general_user'
              AND feature = 'advisor_atlas_searches_per_month'
            """
        ).fetchone()

    assert row["limit_count"] == 8


def test_general_user_is_blocked_after_three_monthly_actions(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_path))
    invalidate_limits_cache()
    user = {"id": 1, "roles": ["general_user"]}

    try:
        for _ in range(3):
            check_and_increment_limit(
                user,
                "advisor_atlas_searches_per_month",
                increment=1,
                session=session,
            )

        with pytest.raises(UsageLimitExceeded, match="plan allows 3"):
            check_and_increment_limit(
                user,
                "advisor_atlas_searches_per_month",
                increment=1,
                session=session,
            )
    finally:
        session.close()
        invalidate_limits_cache()


@pytest.mark.asyncio
async def test_create_run_consumes_one_advisor_atlas_unit(monkeypatch):
    limit_calls = []
    created = []

    class FakeRepository:
        def create_run(self, user_id, payload):
            created.append((user_id, payload))
            return {"id": 44, "status": "queued"}

    class FakeService:
        repository = FakeRepository()

        async def run(self, run_id, user_id):
            return None

    class FakeStore:
        db = object()

    def fake_limit(user, feature, increment, session):
        limit_calls.append((user["id"], feature, increment, session))

    monkeypatch.setattr(advisor_atlas_api, "check_and_increment_limit", fake_limit)

    result = await advisor_atlas_api.create_run(
        professor_request(),
        BackgroundTasks(),
        user={"id": 7, "roles": ["general_user"]},
        service=FakeService(),
        store=FakeStore(),
    )

    assert result["id"] == 44
    assert len(created) == 1
    assert [(feature, increment) for _, feature, increment, _ in limit_calls] == [
        ("advisor_atlas_searches_per_month", 1)
    ]


@pytest.mark.asyncio
async def test_create_run_stops_before_persistence_when_limit_is_reached(monkeypatch):
    created = []

    class FakeRepository:
        def create_run(self, user_id, payload):
            created.append((user_id, payload))
            return {"id": 44, "status": "queued"}

    class FakeService:
        repository = FakeRepository()

    class FakeStore:
        db = object()

    def reject_limit(user, feature, increment, session):
        raise UsageLimitExceeded("Limit exceeded for advisor_atlas_searches_per_month.")

    monkeypatch.setattr(advisor_atlas_api, "check_and_increment_limit", reject_limit)

    with pytest.raises(UsageLimitExceeded):
        await advisor_atlas_api.create_run(
            professor_request(),
            BackgroundTasks(),
            user={"id": 7, "roles": ["general_user"]},
            service=FakeService(),
            store=FakeStore(),
        )

    assert created == []


@pytest.mark.asyncio
async def test_owned_candidate_refresh_consumes_one_advisor_atlas_unit(monkeypatch):
    limit_calls = []

    class FakeRepository:
        def get_candidate(self, candidate_id, user_id):
            assert (candidate_id, user_id) == (12, 7)
            return {"id": candidate_id}

    class FakeService:
        repository = FakeRepository()

        async def refresh_candidate(self, candidate_id, user_id):
            return {"id": candidate_id, "user_id": user_id}

    class FakeStore:
        db = object()

    def fake_limit(user, feature, increment, session):
        limit_calls.append((feature, increment, session))

    monkeypatch.setattr(advisor_atlas_api, "check_and_increment_limit", fake_limit)

    result = await advisor_atlas_api.refresh_candidate(
        12,
        user={"id": 7, "roles": ["general_user"]},
        service=FakeService(),
        store=FakeStore(),
    )

    assert result["id"] == 12
    assert [(feature, increment) for feature, increment, _ in limit_calls] == [
        ("advisor_atlas_searches_per_month", 1)
    ]


@pytest.mark.asyncio
async def test_missing_candidate_is_rejected_before_quota_charge(monkeypatch):
    limit_calls = []

    class FakeRepository:
        def get_candidate(self, candidate_id, user_id):
            raise LookupError("Advisor candidate not found.")

    class FakeService:
        repository = FakeRepository()

    class FakeStore:
        db = object()

    def fake_limit(user, feature, increment, session):
        limit_calls.append((feature, increment))

    monkeypatch.setattr(advisor_atlas_api, "check_and_increment_limit", fake_limit)

    with pytest.raises(advisor_atlas_api.HTTPException) as error:
        await advisor_atlas_api.refresh_candidate(
            999,
            user={"id": 7, "roles": ["general_user"]},
            service=FakeService(),
            store=FakeStore(),
        )

    assert error.value.status_code == 404
    assert limit_calls == []
