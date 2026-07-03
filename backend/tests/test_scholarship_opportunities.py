import pytest
from sqlalchemy import text

from app.api import scholarship_opportunities as opp_api
from app.db.connection import initialize_database
from app.services.store import Store


def _store(tmp_path, user_id=1):
    database_path = tmp_path / "scholardocx.db"
    initialize_database(database_path)
    from app.db.connection import get_engine
    from sqlalchemy.orm import sessionmaker

    engine = get_engine(database_path)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    store = Store(session)
    store.current_user_id = user_id
    return session, store


FREE_USER = {"id": 1, "roles": ["free_user"]}
MAX_USER = {"id": 1, "roles": ["max_user"]}


# --- Catalog -----------------------------------------------------------


@pytest.mark.asyncio
async def test_catalog_endpoint_makes_zero_network_calls(tmp_path, monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("catalog browsing must not open a network client")

    monkeypatch.setattr("httpx.AsyncClient", fail)
    connection, store = _store(tmp_path)
    try:
        result = await opp_api.get_scholarship_catalog(
            levels=None, destinations=None, funding_coverage=None, user=MAX_USER, store=store
        )
        assert len(result) > 0
        assert all("in_library" in entry for entry in result)
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_check_cycle_makes_exactly_one_tavily_call(tmp_path, monkeypatch):
    connection, store = _store(tmp_path)
    search_calls = []

    async def fake_search(**kwargs):
        search_calls.append(kwargs)
        return {"status": "success", "totalResults": 1, "results": []}

    monkeypatch.setattr(opp_api.news_service, "api_key", "test-key")
    monkeypatch.setattr(opp_api.news_service, "search_scholarships", fake_search)
    monkeypatch.setattr(
        opp_api, "_charge_scholarship_hunt", lambda user, store: None
    )

    try:
        result = await opp_api.check_scholarship_cycle("chevening", user=MAX_USER, store=store)
        assert result["status"] == "success"
        assert len(search_calls) == 1
        assert "Chevening Scholarship" in search_calls[0]["approved_query"]
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_check_cycle_unknown_catalog_id_returns_404(tmp_path):
    connection, store = _store(tmp_path)
    try:
        with pytest.raises(opp_api.HTTPException) as error:
            await opp_api.check_scholarship_cycle("not-a-real-id", user=MAX_USER, store=store)
        assert error.value.status_code == 404
    finally:
        store.db.close()


# --- Analyze -------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyze_blocked_for_role_without_permission(tmp_path):
    connection, store = _store(tmp_path)
    try:
        with pytest.raises(opp_api.HTTPException) as error:
            await opp_api.analyze_scholarship_opportunity(
                opp_api.AnalyzeRequest(source_url="https://example.org/s"),
                user=FREE_USER,
                store=store,
            )
        assert error.value.status_code == 403
    finally:
        store.db.close()


def _fake_extraction_result(**overrides):
    result = {
        "canonical_name": "Example Scholarship",
        "sponsor": "Example Sponsor",
        "degree_levels": ["master's"],
        "destination_countries": ["Germany"],
        "eligible_nationalities": [],
        "funding": {"coverage": "full", "notes": None},
        "deadlines": [{"date": "2026-12-01", "label": None}],
        "requirements": ["CV"],
        "application_url": "https://example.org/apply",
        "field_confidence": {"canonical_name": 0.9},
        "extraction_source": "configured_provider",
    }
    result.update(overrides)
    return result


@pytest.mark.asyncio
async def test_analyze_charges_tokens_exactly_once_and_creates_opportunity(tmp_path, monkeypatch):
    connection, store = _store(tmp_path)
    spend_calls = []

    async def fake_extract(ai_service, **kwargs):
        return _fake_extraction_result()

    monkeypatch.setattr(opp_api.scholarship_extraction_service, "extract", fake_extract)
    monkeypatch.setattr(opp_api, "verify_model_permission", lambda *a, **k: None)
    monkeypatch.setattr(
        opp_api.ai_tokens,
        "ensure_can_spend",
        lambda user, session, min_tokens=1: spend_calls.append(user["id"]) or True,
    )

    try:
        result = await opp_api.analyze_scholarship_opportunity(
            opp_api.AnalyzeRequest(
                source_url="https://example.org/scholarship",
                source_title="Example Scholarship",
                source_snippet="Fully funded master's in Germany, apply by Dec 2026.",
            ),
            user=MAX_USER,
            store=store,
        )
        assert spend_calls == [1]
        assert result["canonical_name"] == "Example Scholarship"
        assert result["funding"] == {"coverage": "full", "notes": None}
        assert result["status"] == "Found"

        rows = connection.execute(text("SELECT * FROM scholarship_opportunities")).mappings().fetchall()
        assert len(rows) == 1
        assert rows[0]["normalized_url"] == "example.org/scholarship"
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_analyze_upserts_instead_of_duplicating_on_same_url(tmp_path, monkeypatch):
    connection, store = _store(tmp_path)

    async def fake_extract(ai_service, **kwargs):
        return _fake_extraction_result()

    monkeypatch.setattr(opp_api.scholarship_extraction_service, "extract", fake_extract)
    monkeypatch.setattr(opp_api, "verify_model_permission", lambda *a, **k: None)
    monkeypatch.setattr(
        opp_api.ai_tokens, "ensure_can_spend", lambda user, session, min_tokens=1: True
    )

    request = opp_api.AnalyzeRequest(
        source_url="https://example.org/scholarship?utm=1",
        source_title="Example Scholarship",
        source_snippet="text",
    )

    try:
        await opp_api.analyze_scholarship_opportunity(request, user=MAX_USER, store=store)
        await opp_api.analyze_scholarship_opportunity(request, user=MAX_USER, store=store)

        rows = connection.execute(text("SELECT * FROM scholarship_opportunities")).mappings().fetchall()
        assert len(rows) == 1
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_analyze_never_fabricates_missing_fields(tmp_path, monkeypatch):
    connection, store = _store(tmp_path)

    async def fake_extract(ai_service, **kwargs):
        return _fake_extraction_result(
            sponsor=None, funding={}, deadlines=[], application_url=None
        )

    monkeypatch.setattr(opp_api.scholarship_extraction_service, "extract", fake_extract)
    monkeypatch.setattr(opp_api, "verify_model_permission", lambda *a, **k: None)
    monkeypatch.setattr(
        opp_api.ai_tokens, "ensure_can_spend", lambda user, session, min_tokens=1: True
    )

    try:
        result = await opp_api.analyze_scholarship_opportunity(
            opp_api.AnalyzeRequest(source_url="https://example.org/empty"),
            user=MAX_USER,
            store=store,
        )
        assert result["sponsor"] is None
        assert result["funding"] == {}
        assert result["deadlines"] == []
        # application_url falls back to the source URL, never a guessed link
        assert result["application_url"] == "https://example.org/empty"
    finally:
        store.db.close()


# --- Library + bookmark migration ----------------------------------------


@pytest.mark.asyncio
async def test_library_migrates_bookmarks_additively_and_idempotently(tmp_path):
    connection, store = _store(tmp_path)
    try:
        store.create_record(
            "bookmarked_news",
            {
                "article_id": "abc123",
                "title": "Old Bookmarked Scholarship",
                "link": "https://example.org/old-bookmark",
            },
        )

        first = await opp_api.list_scholarship_opportunities(user=MAX_USER, store=store)
        assert len(first) == 1
        assert first[0]["source"] == "bookmark_migration"
        assert first[0]["status"] == "Found"

        second = await opp_api.list_scholarship_opportunities(user=MAX_USER, store=store)
        assert len(second) == 1  # idempotent, no duplicate migration

        bookmarks = store.list_records("bookmarked_news")
        assert len(bookmarks) == 1  # bookmarked_news itself is untouched
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_update_and_delete_opportunity(tmp_path, monkeypatch):
    connection, store = _store(tmp_path)

    async def fake_extract(ai_service, **kwargs):
        return _fake_extraction_result()

    monkeypatch.setattr(opp_api.scholarship_extraction_service, "extract", fake_extract)
    monkeypatch.setattr(opp_api, "verify_model_permission", lambda *a, **k: None)
    monkeypatch.setattr(
        opp_api.ai_tokens, "ensure_can_spend", lambda user, session, min_tokens=1: True
    )

    try:
        created = await opp_api.analyze_scholarship_opportunity(
            opp_api.AnalyzeRequest(source_url="https://example.org/track-me"),
            user=MAX_USER,
            store=store,
        )
        updated = await opp_api.update_scholarship_opportunity(
            created["id"],
            opp_api.Payload(data={"status": "Applying", "linked_sheet_id": 7}),
            user=MAX_USER,
            store=store,
        )
        assert updated["status"] == "Applying"
        assert updated["linked_sheet_id"] == 7

        await opp_api.delete_scholarship_opportunity(created["id"], user=MAX_USER, store=store)
        remaining = await opp_api.list_scholarship_opportunities(user=MAX_USER, store=store)
        assert remaining == []
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_update_accepts_last_deadline_notified_at_for_radar_dedupe(tmp_path, monkeypatch):
    connection, store = _store(tmp_path)

    async def fake_extract(ai_service, **kwargs):
        return _fake_extraction_result()

    monkeypatch.setattr(opp_api.scholarship_extraction_service, "extract", fake_extract)
    monkeypatch.setattr(opp_api, "verify_model_permission", lambda *a, **k: None)
    monkeypatch.setattr(
        opp_api.ai_tokens, "ensure_can_spend", lambda user, session, min_tokens=1: True
    )

    try:
        created = await opp_api.analyze_scholarship_opportunity(
            opp_api.AnalyzeRequest(source_url="https://example.org/radar-me"),
            user=MAX_USER,
            store=store,
        )
        assert created["last_deadline_notified_at"] is None

        updated = await opp_api.update_scholarship_opportunity(
            created["id"],
            opp_api.Payload(data={"last_deadline_notified_at": "2026-07-03 00:00:00"}),
            user=MAX_USER,
            store=store,
        )
        assert updated["last_deadline_notified_at"] == "2026-07-03 00:00:00"
    finally:
        store.db.close()
