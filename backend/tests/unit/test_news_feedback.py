import json

import pytest
from sqlalchemy import text

from app.api import news as news_api
from app.db.connection import connect, get_engine
from app.services.store import Store

from tests.helpers import cleanup_user_records, make_settings


# SCHOLARDOCX-0140: primary keys are UUID strings. Fixed UUID for the seeded
# test user so feedback rows satisfy the user_id FK constraint.
_TEST_USER_ID = "00000000-0000-0000-0000-0000000000fb"
_TEST_USER = {"id": _TEST_USER_ID, "roles": ["pro_user"]}


def _store(tmp_path):
    settings = make_settings(tmp_path)
    with connect(settings.database_target) as db:
        cleanup_user_records(db, _TEST_USER_ID, "feedback-test@test.local")
        db.commit()
    from sqlalchemy.orm import sessionmaker
    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (:uid, :email, 'x', 'Test', '[\"pro_user\"]', 1, 0) "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {"uid": _TEST_USER_ID, "email": "feedback-test@test.local"},
    )
    session.commit()
    return session, Store(session)


def test_legacy_database_migration_is_no_longer_applicable(tmp_path):
    """SCHOLARDOCX-0139: the legacy-migration path (which added the
    user_id column to local_profiles and created scholarship_search_feedback
    when upgrading an old database file) was removed when the codebase became
    Postgres-only. A fresh Postgres DB gets its authoritative schema from
    Base.metadata.create_all + SEED_SQL, so there is no migration history to
    repair. This test now just asserts the authoritative schema lands the
    expected table and column on a fresh database.
    """
    settings = make_settings(tmp_path)
    with connect(settings.database_target) as migrated:
        columns = {
            row["name"]
            for row in migrated.execute(
                """
                SELECT column_name AS name
                FROM information_schema.columns
                WHERE table_name = 'local_profiles'
                """
            ).fetchall()
        }
        feedback_table = migrated.execute(
            """
            SELECT table_name AS name
            FROM information_schema.tables
            WHERE table_name = 'scholarship_search_feedback'
            """
        ).fetchone()
        assert "user_id" in columns
        assert feedback_table["name"] == "scholarship_search_feedback"


@pytest.mark.asyncio
async def test_query_preview_consumes_usage_without_tavily_provider_call(
    tmp_path,
    monkeypatch,
):
    spend_calls = []
    charge_calls = []
    provider_calls = []
    connection, store = _store(tmp_path)

    async def fake_generate(filters):
        assert filters["levels"] == ["Master's"]
        return {
            "query": "generated master's scholarship query",
            "source": "openrouter",
            "model": "free-test-model",
            "notice": "",
            "usage": {"input_tokens": 120, "output_tokens": 30},
        }

    async def fake_search(**kwargs):
        provider_calls.append(kwargs)

    monkeypatch.setattr(
        news_api.scholarship_query_generator,
        "generate",
        fake_generate,
    )
    monkeypatch.setattr(news_api.news_service, "api_key", "test-key")
    monkeypatch.setattr(news_api.news_service, "search_scholarships", fake_search)
    monkeypatch.setattr(
        news_api.ai_tokens,
        "ensure_can_spend",
        lambda user, session, min_tokens=1: spend_calls.append((user["id"], min_tokens)) or True,
    )
    monkeypatch.setattr(
        news_api.ai_tokens,
        "charge",
        lambda *args, **kwargs: charge_calls.append(kwargs),
    )

    response = await news_api.preview_news_query(
        payload=news_api.QueryPreviewRequest(
            filters=news_api.ScholarshipSearchFilters(levels=["Master's"])
        ),
        user=_TEST_USER,
        store=store,
    )

    row = connection.execute(text(
        "SELECT * FROM scholarship_search_feedback ORDER BY id DESC LIMIT 1"
    )).mappings().fetchone()
    assert response["initial_query"] == "generated master's scholarship query"
    assert response["preview_feedback_id"] == row["id"]
    assert response["generation_source"] == "openrouter"
    assert response["generation_model"] == "free-test-model"
    assert row["provider_status"] == "previewed"
    assert row["refined_query"] == "generated master's scholarship query"
    # Query building is metered by AI tokens, not by search counts.
    assert spend_calls == [(_TEST_USER_ID, 1)]
    assert len(charge_calls) == 1
    assert charge_calls[0]["source"] == "scholarship_query_build"
    assert charge_calls[0]["input_tokens"] == 120
    assert charge_calls[0]["output_tokens"] == 30
    assert provider_calls == []
    store.db.close()


@pytest.mark.asyncio
async def test_confirmed_search_persists_initial_and_refined_queries(
    tmp_path,
    monkeypatch,
):
    connection, store = _store(tmp_path)
    search_calls = []

    async def fake_search(**kwargs):
        search_calls.append(kwargs)
        return {"status": "success", "totalResults": 2, "results": []}

    monkeypatch.setattr(news_api.news_service, "api_key", "test-key")
    monkeypatch.setattr(news_api.news_service, "search_scholarships", fake_search)
    preview_feedback_id = news_api.create_query_preview_feedback(
        connection,
        _TEST_USER_ID,
        "AI-generated USA master's query",
        {
            "countries": ["USA"],
            "language": "en",
            "levels": ["Master's"],
            "sort_by": "latest",
        },
    )

    try:
        response = await news_api.search_news_confirmed(
            payload=news_api.ConfirmedSearchRequest(
                filters=news_api.ScholarshipSearchFilters(
                    levels=["Master's"],
                    countries=["USA"],
                ),
                preview_feedback_id=preview_feedback_id,
                approved_query="refined USA master's scholarship query",
                query_approved=True,
            ),
            user=_TEST_USER,
            store=store,
        )

        row = connection.execute(text(
            "SELECT * FROM scholarship_search_feedback ORDER BY id DESC LIMIT 1"
        )).mappings().fetchone()
        assert response["totalResults"] == 2
        assert row["user_id"] == _TEST_USER_ID
        assert row["initial_query"] == "AI-generated USA master's query"
        assert row["refined_query"] == "refined USA master's scholarship query"
        assert row["was_edited"] == 1
        assert row["provider_status"] == "success"
        assert row["result_count"] == 2
        assert json.loads(row["filters_json"]) == {
            "countries": ["USA"],
            "language": "en",
            "levels": ["Master's"],
            "sort_by": "latest",
        }
        assert search_calls[0]["approved_query"] == "refined USA master's scholarship query"
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_failed_confirmed_search_keeps_feedback_without_consuming_usage(
    tmp_path,
    monkeypatch,
):
    connection, store = _store(tmp_path)

    async def fail_search(**kwargs):
        raise news_api.HTTPException(status_code=502, detail="Provider failed.")

    monkeypatch.setattr(news_api.news_service, "api_key", "test-key")
    monkeypatch.setattr(news_api.news_service, "search_scholarships", fail_search)
    preview_feedback_id = news_api.create_query_preview_feedback(
        connection,
        _TEST_USER_ID,
        "generated query",
        {
            "language": "en",
            "levels": ["PhD"],
            "sort_by": "latest",
        },
    )

    try:
        with pytest.raises(news_api.HTTPException):
            await news_api.search_news_confirmed(
                payload=news_api.ConfirmedSearchRequest(
                    filters=news_api.ScholarshipSearchFilters(levels=["PhD"]),
                    preview_feedback_id=preview_feedback_id,
                    approved_query="generated query",
                    query_approved=True,
                ),
                user=_TEST_USER,
                store=store,
            )

        row = connection.execute(text(
            "SELECT * FROM scholarship_search_feedback ORDER BY id DESC LIMIT 1"
        )).mappings().fetchone()
        assert row["was_edited"] == 0
        assert row["provider_status"] == "failed"
        assert row["result_count"] is None
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_confirmed_search_rejects_reused_preview_feedback(tmp_path, monkeypatch):
    connection, store = _store(tmp_path)

    async def fake_search(**kwargs):
        return {"status": "success", "totalResults": 1, "results": []}

    monkeypatch.setattr(news_api.news_service, "api_key", "test-key")
    monkeypatch.setattr(news_api.news_service, "search_scholarships", fake_search)
    preview_feedback_id = news_api.create_query_preview_feedback(
        connection,
        _TEST_USER_ID,
        "generated query",
        {
            "language": "en",
            "levels": ["Master's"],
            "sort_by": "latest",
        },
    )

    await news_api.search_news_confirmed(
        payload=news_api.ConfirmedSearchRequest(
            filters=news_api.ScholarshipSearchFilters(levels=["Master's"]),
            preview_feedback_id=preview_feedback_id,
            approved_query="generated query",
            query_approved=True,
        ),
        user=_TEST_USER,
        store=store,
    )

    with pytest.raises(news_api.HTTPException) as error:
        await news_api.search_news_confirmed(
            payload=news_api.ConfirmedSearchRequest(
                filters=news_api.ScholarshipSearchFilters(levels=["Master's"]),
                preview_feedback_id=preview_feedback_id,
                approved_query="generated query",
                query_approved=True,
            ),
            user=_TEST_USER,
            store=store,
        )

    assert error.value.status_code == 409
    store.db.close()
