import pytest
from sqlalchemy import text

from app.api import scholarship_opportunities as opp_api
from app.db.connection import connect, get_engine
from app.services.store import Store

from tests.helpers import cleanup_user_records, make_settings


# SCHOLARDOCX-0140: primary keys are UUID strings. Fixed UUIDs let the test
# fixture seed a real user row and reference it consistently.
_TEST_USER_UUID = "00000000-0000-0000-0000-0000000000f1"


def _store(tmp_path, user_id=_TEST_USER_UUID):
    settings = make_settings(tmp_path)
    email = f"max-{user_id}@test.local"
    with connect(settings.database_target) as db:
        cleanup_user_records(db, user_id, email)
        db.commit()
    from sqlalchemy.orm import sessionmaker

    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    # Seed the user so FK constraints on scholarship_opportunities.user_id hold.
    session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (:uid, :email, 'x', 'Test', '[\"max_user\"]', 1, 0) "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {"uid": user_id, "email": email},
    )
    session.commit()
    store = Store(session)
    store.current_user_id = user_id
    return session, store


FREE_USER = {"id": _TEST_USER_UUID, "roles": ["free_user"]}
MAX_USER = {"id": _TEST_USER_UUID, "roles": ["max_user"]}


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
async def test_catalog_endpoint_filters_by_category(tmp_path):
    """SCHOLARDOCX-0176: GET /scholarship-catalog?category=university returns
    only university-specific scholarships. Static-only — no network calls."""
    connection, store = _store(tmp_path)
    try:
        all_entries = await opp_api.get_scholarship_catalog(user=MAX_USER, store=store)
        university = await opp_api.get_scholarship_catalog(
            category="university", user=MAX_USER, store=store
        )
        program = await opp_api.get_scholarship_catalog(
            category="program", user=MAX_USER, store=store
        )
        assert len(all_entries) == len(university) + len(program)
        assert all(e["category"] == "university" for e in university)
        assert all(e["category"] == "program" for e in program)
        # Every entry has the new schema: links[], tags[], description.
        for e in all_entries:
            assert isinstance(e["links"], list) and e["links"]
            assert isinstance(e["tags"], list) and e["tags"]
            assert e["description"]
            assert "in_library" in e
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
        assert spend_calls == [_TEST_USER_UUID]
        assert result["canonical_name"] == "Example Scholarship"
        assert result["funding"] == {"coverage": "full", "notes": None}
        assert result["status"] == "Found"

        # Scoped to this test's user_id — the table is shared across the
        # whole test suite (real database, not per-test isolated), so an
        # unscoped table-wide query is fragile and can spuriously fail on
        # leftover rows from unrelated tests (SCHOLARDOCX-0178 hardening).
        rows = connection.execute(
            text("SELECT * FROM scholarship_opportunities WHERE user_id = :uid"),
            {"uid": _TEST_USER_UUID},
        ).mappings().fetchall()
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

        # Scoped to this test's user_id (see SCHOLARDOCX-0178 hardening note above).
        rows = connection.execute(
            text("SELECT * FROM scholarship_opportunities WHERE user_id = :uid"),
            {"uid": _TEST_USER_UUID},
        ).mappings().fetchall()
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
        project = store.create_record("projects", {"name": "Scholarship Tracker Project"})
        sheet = store.create_record(
            "project_sheets",
            {"project_id": project["id"], "name": "Scholarship Tracker"},
        )
        updated = await opp_api.update_scholarship_opportunity(
            created["id"],
            opp_api.Payload(data={"status": "Applying", "linked_sheet_id": sheet["id"]}),
            user=MAX_USER,
            store=store,
        )
        assert updated["status"] == "Applying"
        assert updated["linked_sheet_id"] == sheet["id"]

        await opp_api.delete_scholarship_opportunity(created["id"], user=MAX_USER, store=store)
        remaining = await opp_api.list_scholarship_opportunities(user=MAX_USER, store=store)
        assert remaining == []
    finally:
        store.db.close()


# --- Library cap (SCHOLARDOCX-0178) ---------------------------------------


def _minimal_extracted(name: str) -> dict:
    return {
        "canonical_name": name,
        "sponsor": None,
        "degree_levels": [],
        "fields_of_study": [],
        "destination_countries": [],
        "eligible_nationalities": [],
        "funding": {},
        "deadlines": [],
        "requirements": [],
        "application_url": None,
        "field_confidence": {},
    }


def _count_opportunities(connection, user_id: str) -> int:
    """Scoped to one user_id — the table is shared across the whole test
    suite (real database, not per-test isolated), so an unscoped table-wide
    COUNT is fragile and can spuriously fail on rows from unrelated tests
    (SCHOLARDOCX-0178 hardening)."""
    return connection.execute(
        text("SELECT COUNT(*) FROM scholarship_opportunities WHERE user_id = :uid"),
        {"uid": user_id},
    ).scalar()


def test_library_cap_rejects_a_brand_new_opportunity_past_the_limit(tmp_path, monkeypatch):
    # SCHOLARDOCX-0178 perf fix: this test only needs to prove the boundary
    # check works, not that it works specifically at 100. Patching the
    # constant to a small number keeps the exact same code path (still
    # `len(existing_rows) >= MAX_LIBRARY_ENTRIES`) while cutting ~100
    # sequential real-network round trips down to ~3 — the loop count was
    # making this test (and its two siblings below) by far the slowest in
    # the suite for no added coverage.
    monkeypatch.setattr(opp_api, "MAX_LIBRARY_ENTRIES", 3)
    connection, store = _store(tmp_path)
    try:
        for i in range(opp_api.MAX_LIBRARY_ENTRIES):
            opp_api.upsert_scholarship_opportunity(
                store,
                source="hunt",
                extracted=_minimal_extracted(f"Scholarship {i}"),
                source_url=f"https://example.org/s{i}",
            )
        assert _count_opportunities(connection, _TEST_USER_UUID) == opp_api.MAX_LIBRARY_ENTRIES

        with pytest.raises(opp_api.LibraryFullError):
            opp_api.upsert_scholarship_opportunity(
                store,
                source="hunt",
                extracted=_minimal_extracted("One Too Many"),
                source_url="https://example.org/overflow",
            )

        assert _count_opportunities(connection, _TEST_USER_UUID) == opp_api.MAX_LIBRARY_ENTRIES
    finally:
        store.db.close()


def test_library_cap_does_not_block_updating_an_already_owned_url(tmp_path, monkeypatch):
    monkeypatch.setattr(opp_api, "MAX_LIBRARY_ENTRIES", 3)  # see perf note above
    connection, store = _store(tmp_path)
    try:
        for i in range(opp_api.MAX_LIBRARY_ENTRIES):
            opp_api.upsert_scholarship_opportunity(
                store,
                source="hunt",
                extracted=_minimal_extracted(f"Scholarship {i}"),
                source_url=f"https://example.org/s{i}",
            )
        # Re-saving a URL the user already owns (re-analyzing, or the deep
        # hunt pipeline re-finding the same page) is never blocked by the cap.
        updated = opp_api.upsert_scholarship_opportunity(
            store,
            source="hunt",
            extracted=_minimal_extracted("Scholarship 0 Updated"),
            source_url="https://example.org/s0",
        )
        assert updated["canonical_name"] == "Scholarship 0 Updated"
        assert _count_opportunities(connection, _TEST_USER_UUID) == opp_api.MAX_LIBRARY_ENTRIES
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_analyze_endpoint_returns_409_when_library_full(tmp_path, monkeypatch):
    monkeypatch.setattr(opp_api, "MAX_LIBRARY_ENTRIES", 3)  # see perf note above
    connection, store = _store(tmp_path)

    async def fake_extract(ai_service, **kwargs):
        return _fake_extraction_result(canonical_name="Overflow Scholarship")

    monkeypatch.setattr(opp_api.scholarship_extraction_service, "extract", fake_extract)
    monkeypatch.setattr(opp_api, "verify_model_permission", lambda *a, **k: None)
    monkeypatch.setattr(
        opp_api.ai_tokens, "ensure_can_spend", lambda user, session, min_tokens=1: True
    )
    try:
        for i in range(opp_api.MAX_LIBRARY_ENTRIES):
            opp_api.upsert_scholarship_opportunity(
                store,
                source="hunt",
                extracted=_minimal_extracted(f"Scholarship {i}"),
                source_url=f"https://example.org/fill{i}",
            )
        with pytest.raises(opp_api.HTTPException) as error:
            await opp_api.analyze_scholarship_opportunity(
                opp_api.AnalyzeRequest(source_url="https://example.org/overflow-analyze"),
                user=MAX_USER,
                store=store,
            )
        assert error.value.status_code == 409
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
        assert str(updated["last_deadline_notified_at"]).startswith("2026-07-03 00:00:00")
    finally:
        store.db.close()
