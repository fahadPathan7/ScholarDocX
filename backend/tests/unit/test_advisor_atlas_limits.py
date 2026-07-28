from pathlib import Path

import pytest
from fastapi import BackgroundTasks

from app.api import advisor_atlas as advisor_atlas_api
from app.api.advisor_atlas import CreateRunRequest, ResearchProfile
from app.services import ai_tokens
from app.core.config import Settings
from app.db.connection import connect, get_db, initialize_database


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.media_path = tmp_path / "workspace" / "media"
    initialize_database(settings.database_target)
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
        research_profile=ResearchProfile(interests=["Accessible AI"]),
    )


def test_deprecated_count_limits_are_removed(tmp_path):
    """Phase 5 teardown: the dead AI-count limits (daily/monthly chats, advisor
    atlas searches) are gone from role_limits on a fresh DB and stay gone after
    re-init (migrate_database drops non-canonical features)."""
    settings = make_settings(tmp_path)

    def present(db):
        return {
            row["feature"]
            for row in db.execute(
                "SELECT feature FROM role_limits "
                "WHERE feature IN ('daily_ai_chats', 'monthly_ai_chats', "
                "'advisor_atlas_searches_per_month')"
            ).fetchall()
        }

    with connect(settings.database_target) as db:
        assert present(db) == set()

    # Re-initializing must not resurrect them.
    initialize_database(settings.database_target)
    with connect(settings.database_target) as db:
        assert present(db) == set()


def test_advisor_atlas_permission_is_seeded(tmp_path):
    """can_use_advisor_atlas is seeded for all four user tiers (pro/max=1,
    free/general=0) on a fresh DB and survives re-init — the canonical-features
    cleanup in migrate_database must not drop it."""
    settings = make_settings(tmp_path)

    def limit_for(db, role):
        row = db.execute(
            "SELECT limit_count FROM role_limits "
            "WHERE role = ? AND feature = 'can_use_advisor_atlas'",
            (role,),
        ).fetchone()
        return row["limit_count"] if row else None

    expected = {"free_user": 0, "general_user": 0, "pro_user": 1, "max_user": 1}

    with connect(settings.database_target) as db:
        for role, value in expected.items():
            assert limit_for(db, role) == value

    # Re-initializing must not drop the feature (canonical-features cleanup).
    initialize_database(settings.database_target)
    with connect(settings.database_target) as db:
        for role, value in expected.items():
            assert limit_for(db, role) == value


def test_advisor_atlas_plan_phrase_reflects_role_limits(tmp_path):
    """The upgrade message is derived from role_limits, so it tracks admin
    edits instead of hardcoding 'Pro and Max'.

    STRICT RULE (SCHOLARDOCX-0178 incident): role_limits is GLOBAL, shared,
    admin-configured state — this suite runs against a real shared database
    (see tests/conftest.py's load_dotenv), so mutating a role's limit_count
    here and not restoring it corrupts real plan gating for every user of
    that role indefinitely. This exact test previously zeroed out
    can_use_advisor_atlas for EVERY role (including pro_user, which should
    default to 1) and never restored it. Snapshot every row this test
    touches before mutating and restore those exact values afterward.
    """
    from sqlalchemy import text
    from sqlalchemy.orm import sessionmaker

    from app.auth.limits import feature_plan_phrase
    from app.db.connection import get_engine

    settings = make_settings(tmp_path)
    session = sessionmaker(bind=get_engine(settings.database_target))()
    before = {
        row["role"]: row["limit_count"]
        for row in session.execute(
            text("SELECT role, limit_count FROM role_limits WHERE feature = 'can_use_advisor_atlas'")
        ).mappings().fetchall()
    }
    try:
        # Default seed: only pro/max enabled.
        assert feature_plan_phrase("can_use_advisor_atlas", session) == "the Pro and Max plans"

        # Admin enables general_user too -> phrase now leads with Basic.
        session.execute(
            text(
                "UPDATE role_limits SET limit_count = 1 "
                "WHERE role = 'general_user' AND feature = 'can_use_advisor_atlas'"
            )
        )
        session.commit()
        assert feature_plan_phrase("can_use_advisor_atlas", session) == "the Basic, Pro, and Max plans"

        # Admin disables the feature on every plan -> generic fallback.
        session.execute(
            text("UPDATE role_limits SET limit_count = 0 WHERE feature = 'can_use_advisor_atlas'")
        )
        session.commit()
        assert feature_plan_phrase("can_use_advisor_atlas", session) == "a higher plan"
    finally:
        for role, limit_count in before.items():
            session.execute(
                text(
                    "UPDATE role_limits SET limit_count = :limit_count "
                    "WHERE role = :role AND feature = 'can_use_advisor_atlas'"
                ),
                {"limit_count": limit_count, "role": role},
            )
        session.commit()
        session.close()


@pytest.mark.asyncio
async def test_create_run_gates_on_ai_tokens(monkeypatch):
    spend_calls = []
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

    def fake_ensure(user, session, min_tokens=1):
        spend_calls.append((user["id"], min_tokens))
        return True

    monkeypatch.setattr(advisor_atlas_api.ai_tokens, "ensure_can_spend", fake_ensure)
    # Plan and model gates are tested separately; neutralize them here to
    # isolate token gating.
    monkeypatch.setattr(advisor_atlas_api, "_require_advisor_atlas_access", lambda *a, **k: None)
    import app.api.routes as routes_api
    monkeypatch.setattr(routes_api, "verify_model_permission", lambda *a, **k: None)

    result = await advisor_atlas_api.create_run(
        professor_request(),
        BackgroundTasks(),
        user={"id": 7, "roles": ["general_user"]},
        service=FakeService(),  # type: ignore
        store=FakeStore(),  # type: ignore
        settings=Settings(),
    )

    assert result["id"] == 44
    assert len(created) == 1
    # Advisor Atlas no longer consumes a monthly search count; it gates on the
    # AI-token balance instead.
    assert spend_calls == [(7, 1)]


@pytest.mark.asyncio
async def test_create_run_stops_before_persistence_when_out_of_tokens(monkeypatch):
    created = []

    class FakeRepository:
        def create_run(self, user_id, payload):
            created.append((user_id, payload))
            return {"id": 44, "status": "queued"}

    class FakeService:
        repository = FakeRepository()

    class FakeStore:
        db = object()

    def reject_ensure(user, session, min_tokens=1):
        raise ai_tokens.OutOfTokens("out of tokens")

    monkeypatch.setattr(advisor_atlas_api.ai_tokens, "ensure_can_spend", reject_ensure)
    monkeypatch.setattr(advisor_atlas_api, "_require_advisor_atlas_access", lambda *a, **k: None)

    with pytest.raises(ai_tokens.OutOfTokens):
        await advisor_atlas_api.create_run(
            professor_request(),
            BackgroundTasks(),
            user={"id": 7, "roles": ["general_user"]},
            service=FakeService(),  # type: ignore
            store=FakeStore(),  # type: ignore
            settings=Settings(),
        )

    assert created == []


@pytest.mark.asyncio
async def test_owned_candidate_refresh_gates_on_ai_tokens(monkeypatch):
    spend_calls = []

    class FakeAiService:
        def __init__(self):
            self.billed = None

        def set_billing(self, user, session):
            self.billed = (user, session)

    class FakeRepository:
        def get_candidate(self, candidate_id, user_id):
            assert (candidate_id, user_id) == (12, 7)
            return {"id": candidate_id}

    class FakeService:
        def __init__(self):
            self.repository = FakeRepository()
            self.ai_service = FakeAiService()

        async def refresh_candidate(self, candidate_id, user_id):
            return {"id": candidate_id, "user_id": user_id}

    class FakeStore:
        db = object()

    service = FakeService()

    def fake_ensure(user, session, min_tokens=1):
        spend_calls.append((user["id"], min_tokens))
        return True

    monkeypatch.setattr(advisor_atlas_api.ai_tokens, "ensure_can_spend", fake_ensure)
    monkeypatch.setattr(advisor_atlas_api, "_require_advisor_atlas_access", lambda *a, **k: None)

    result = await advisor_atlas_api.refresh_candidate(
        "12",
        user={"id": 7, "roles": ["general_user"]},
        service=service,  # type: ignore
        store=FakeStore(),  # type: ignore
    )

    assert result["id"] == "12"
    assert spend_calls == [(7, 1)]
    # Billing context is attached so the refresh's AI calls are metered.
    assert service.ai_service.billed == ({"id": 7, "roles": ["general_user"]}, FakeStore.db)


@pytest.mark.asyncio
async def test_missing_candidate_is_rejected_before_token_charge(monkeypatch):
    spend_calls = []

    class FakeRepository:
        def get_candidate(self, candidate_id, user_id):
            raise LookupError("Advisor candidate not found.")

    class FakeService:
        repository = FakeRepository()

    class FakeStore:
        db = object()

    def fake_ensure(user, session, min_tokens=1):
        spend_calls.append((user["id"], min_tokens))
        return True

    monkeypatch.setattr(advisor_atlas_api.ai_tokens, "ensure_can_spend", fake_ensure)

    with pytest.raises(advisor_atlas_api.HTTPException) as error:
        await advisor_atlas_api.refresh_candidate(
            "999",
            user={"id": 7, "roles": ["general_user"]},
            service=FakeService(),  # type: ignore
            store=FakeStore(),  # type: ignore
        )

    assert error.value.status_code == 404
    assert spend_calls == []


@pytest.mark.asyncio
async def test_create_run_denied_for_non_pro_plan(monkeypatch):
    """Free/Basic users are blocked by the plan guard before any run is
    created or tokens are spent."""
    from app.auth.limits import UsageLimitExceeded

    created = []

    class FakeRepository:
        def create_run(self, user_id, payload):
            created.append((user_id, payload))
            return {"id": 44}

    class FakeService:
        repository = FakeRepository()

        async def run(self, run_id, user_id):
            return None

    class FakeStore:
        db = object()

    def deny(user, feature, increment=0, session=None):
        raise UsageLimitExceeded("Permission denied.")

    monkeypatch.setattr(advisor_atlas_api, "check_and_increment_limit", deny)
    monkeypatch.setattr(advisor_atlas_api, "feature_plan_phrase", lambda *a, **k: "the Pro and Max plans")

    with pytest.raises(advisor_atlas_api.HTTPException) as error:
        await advisor_atlas_api.create_run(
            professor_request(),
            BackgroundTasks(),
            user={"id": 7, "roles": ["general_user"]},
            service=FakeService(),  # type: ignore
            store=FakeStore(),  # type: ignore
        )

    assert error.value.status_code == 403
    assert created == []


@pytest.mark.asyncio
async def test_create_run_allowed_for_pro_plan(monkeypatch):
    """Pro users pass the plan guard and reach the normal create flow."""
    created = []

    class FakeRepository:
        def create_run(self, user_id, payload):
            created.append(user_id)
            return {"id": 50}

    class FakeService:
        repository = FakeRepository()

        async def run(self, run_id, user_id):
            return None

    class FakeStore:
        db = object()

    def allow(user, feature, increment=0, session=None):
        return True

    def fake_ensure(user, session, min_tokens=1):
        return True

    monkeypatch.setattr(advisor_atlas_api, "check_and_increment_limit", allow)
    monkeypatch.setattr(advisor_atlas_api.ai_tokens, "ensure_can_spend", fake_ensure)
    import app.api.routes as routes_api
    monkeypatch.setattr(routes_api, "verify_model_permission", lambda *a, **k: None)

    result = await advisor_atlas_api.create_run(
        professor_request(),
        BackgroundTasks(),
        user={"id": 9, "roles": ["pro_user"]},
        service=FakeService(),  # type: ignore
        store=FakeStore(),  # type: ignore
        settings=Settings(),
    )

    assert result["id"] == 50
    assert created == [9]


@pytest.mark.asyncio
async def test_refresh_candidate_denied_for_non_pro_plan(monkeypatch):
    """A Free/Basic user refreshing an existing candidate is blocked by the
    plan guard after the existence check but before token spend."""
    from app.auth.limits import UsageLimitExceeded

    class FakeRepository:
        def get_candidate(self, candidate_id, user_id):
            return {"id": candidate_id}

    class FakeService:
        def __init__(self):
            self.repository = FakeRepository()

    class FakeStore:
        db = object()

    def deny(user, feature, increment=0, session=None):
        raise UsageLimitExceeded("Permission denied.")

    monkeypatch.setattr(advisor_atlas_api, "check_and_increment_limit", deny)
    monkeypatch.setattr(advisor_atlas_api, "feature_plan_phrase", lambda *a, **k: "the Pro and Max plans")

    with pytest.raises(advisor_atlas_api.HTTPException) as error:
        await advisor_atlas_api.refresh_candidate(
            "12",
            user={"id": 7, "roles": ["free_user"]},
            service=FakeService(),  # type: ignore
            store=FakeStore(),  # type: ignore
        )

    assert error.value.status_code == 403
