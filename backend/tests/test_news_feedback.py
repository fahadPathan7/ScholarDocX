import json
import sqlite3

import pytest
from sqlalchemy import text

from app.api import news as news_api
from app.db.connection import connect, initialize_database
from app.services.store import Store


def _store(tmp_path):
    database_path = tmp_path / "scholardocx.db"
    initialize_database(database_path)
    from app.db.connection import get_engine
    from sqlalchemy.orm import sessionmaker
    engine = get_engine(database_path)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    return session, Store(session)


def test_legacy_database_adds_user_scope_before_schema_indexes(tmp_path):
    database_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(database_path)
    connection.executescript(
        """
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT 'User',
          roles TEXT NOT NULL DEFAULT '["general_user"]',
          token_version INTEGER NOT NULL DEFAULT 1,
          is_active INTEGER NOT NULL DEFAULT 1,
          is_blocked INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE local_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          display_name TEXT
        );
        """
    )
    connection.close()

    initialize_database(database_path)

    with connect(database_path) as migrated:
        columns = {
            row["name"]
            for row in migrated.execute("PRAGMA table_info(local_profiles)")
        }
        feedback_table = migrated.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'scholarship_search_feedback'
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
        user={"id": 1, "roles": ["general_user"]},
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
    assert spend_calls == [(1, 1)]
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
        1,
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
            user={"id": 1},
            store=store,
        )

        row = connection.connection().connection.dbapi_connection.execute(
            "SELECT * FROM scholarship_search_feedback ORDER BY id DESC LIMIT 1"
        ).fetchone()
        assert response["totalResults"] == 2
        assert row["user_id"] == 1
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
        1,
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
                user={"id": 1},
                store=store,
            )

        row = connection.connection().connection.dbapi_connection.execute(
            "SELECT * FROM scholarship_search_feedback ORDER BY id DESC LIMIT 1"
        ).fetchone()
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
        1,
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
        user={"id": 1},
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
            user={"id": 1},
            store=store,
        )

    assert error.value.status_code == 409
    store.db.close()
