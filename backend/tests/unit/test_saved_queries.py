import pytest
from sqlalchemy import text

from app.api import news as news_api
from app.db.connection import connect, get_engine
from app.services.store import Store

from tests.helpers import cleanup_user_records, make_settings


# SCHOLARDOCX-0140: primary keys are UUID strings. Fixed UUID for the seeded
# test user so saved-query rows satisfy the user_id FK constraint.
_TEST_USER_ID = "00000000-0000-0000-0000-0000000000f5"


def _store(tmp_path, user_id=_TEST_USER_ID):
    settings = make_settings(tmp_path)
    email = f"savedqueries-{user_id}@test.local"
    with connect(settings.database_target) as db:
        cleanup_user_records(db, user_id, email)
        db.commit()
    from sqlalchemy.orm import sessionmaker

    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (:uid, :email, 'x', 'Test', '[\"general_user\"]', 1, 0) "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {"uid": user_id, "email": email},
    )
    session.commit()
    store = Store(session)
    store.current_user_id = user_id
    return session, store


@pytest.mark.asyncio
async def test_update_saved_query_sets_seen_ids_and_bumps_last_used_at(tmp_path):
    connection, store = _store(tmp_path)
    try:
        created = store.create_record(
            "saved_scholarship_queries",
            {"name": "Master's Germany", "query_string": "germany master's scholarship", "filters_json": "{}"},
        )
        original_last_used = created["last_used_at"]

        result = await news_api.update_saved_query(
            created["id"],
            news_api.SavedQueryUpdate(seen_article_ids_json='["a1", "a2"]'),
            user={"id": _TEST_USER_ID, "roles": ["pro_user"]},
            store=store,
        )

        assert result["seen_article_ids_json"] == '["a1", "a2"]'
        row = connection.execute(
            text("SELECT * FROM saved_scholarship_queries WHERE id = :id"), {"id": created["id"]}
        ).mappings().fetchone()
        assert row["seen_article_ids_json"] == '["a1", "a2"]'
        assert row["last_used_at"] is not None
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_update_saved_query_unknown_id_returns_404(tmp_path):
    connection, store = _store(tmp_path)
    try:
        with pytest.raises(news_api.HTTPException) as error:
            await news_api.update_saved_query(
                "00000000-0000-0000-0000-000000999999",
                news_api.SavedQueryUpdate(seen_article_ids_json="[]"),
                user={"id": _TEST_USER_ID, "roles": ["pro_user"]},
                store=store,
            )
        assert error.value.status_code == 404
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_update_saved_query_is_user_scoped(tmp_path):
    owner_id = "00000000-0000-0000-0000-0000000000a1"
    intruder_id = "00000000-0000-0000-0000-0000000000a2"
    connection, store_a = _store(tmp_path, user_id=owner_id)
    try:
        created = store_a.create_record(
            "saved_scholarship_queries",
            {"name": "Owner's query", "query_string": "phd funding", "filters_json": "{}"},
        )
    finally:
        store_a.db.close()

    connection2, store_b = _store(tmp_path, user_id=intruder_id)
    try:
        with pytest.raises(news_api.HTTPException) as error:
            await news_api.update_saved_query(
                created["id"],
                news_api.SavedQueryUpdate(seen_article_ids_json='["x"]'),
                user={"id": intruder_id, "roles": ["pro_user"]},
                store=store_b,
            )
        assert error.value.status_code == 404
    finally:
        store_b.db.close()
