"""SCHOLARDOCX-0125: Deep Hunt runs (Phase 5 of the Scholarship Hunt pipeline).

Covers repository CRUD/lifecycle, the plan gate on the work-creating
endpoints, the service's search -> crawl -> extract -> persist pipeline
(mocked network boundaries), cancellation, dedupe, and the "no invented
fields" contract shared with Phase 1's Analyze extraction.
"""

from pathlib import Path

import pytest
from fastapi import BackgroundTasks

from app.api import scholarship_deep_hunt as deep_hunt_api
from app.auth.limits import UsageLimitExceeded
from app.core.config import Settings
from app.db.connection import connect, get_engine, initialize_database
from app.services.scholarship_deep_hunt import (
    ScholarshipDeepHuntRepository,
    ScholarshipDeepHuntService,
    _is_acceptable,
)
from app.services.store import Store


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.media_path = tmp_path / "workspace" / "media"
    settings.glm_api_key = ""
    settings.tavily_api_key = "test-tavily-key"
    initialize_database(settings.database_target)
    return settings


def _seed_user(settings: Settings, email: str, roles: str = '["max_user"]') -> str:
    """Insert a user and return its UUID id.

    SCHOLARDOCX-0140: primary keys are UUID strings, so repository methods that
    take a ``user_id`` (and hit a ``user_id`` FK on ``scholarship_deep_hunt_runs``)
    need a real user row. Previously tests passed the literal ``1`` which only
    worked under SQLite's lax FK enforcement.
    """
    with connect(settings.database_target) as db:
        db.execute(
            "DELETE FROM users WHERE email = ?",
            (email,),
        )
        db.execute(
            "INSERT INTO users (email, password_hash, display_name, roles) "
            "VALUES (?, 'x', 'Test', ?)",
            (email, roles),
        )
        db.commit()
        row = db.execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()
        return row["id"]


def _fake_extraction_result(**overrides):
    result = {
        "canonical_name": "Example Deep Hunt Scholarship",
        "sponsor": "Example Sponsor",
        "degree_levels": ["phd"],
        "destination_countries": ["Germany"],
        "eligible_nationalities": [],
        "funding": {"coverage": "full", "notes": None},
        "deadlines": [{"date": "2027-01-15", "label": None}],
        "requirements": ["CV", "Research proposal"],
        "application_url": "https://example.edu/apply",
        "field_confidence": {"canonical_name": 0.9},
        "extraction_source": "configured_provider",
    }
    result.update(overrides)
    return result


# --- Repository ------------------------------------------------------------


def test_repository_create_get_list_lifecycle(tmp_path):
    settings = make_settings(tmp_path)
    repo = ScholarshipDeepHuntRepository(settings.database_target)
    user_id = _seed_user(settings, "lifecycle@example.com")

    run = repo.create_run(
        user_id,
        {
            "goal": "fully funded CS PhD funding, EU, Fall 2027",
            "degree_level": "PhD",
            "destinations": ["Germany", "France"],
            "intake_term": "Fall 2027",
        },
    )
    assert run["status"] == "queued"
    assert run["current_stage"] == "queued"
    assert run["destinations"] == ["Germany", "France"]
    assert run["progress"]["message"] == "Queued"

    fetched = repo.get_run(run["id"], user_id, include_opportunities=False)
    assert fetched["goal"] == "fully funded CS PhD funding, EU, Fall 2027"

    listed = repo.list_runs(user_id)
    assert len(listed) == 1
    assert listed[0]["id"] == run["id"]


def test_repository_enforces_user_scope(tmp_path):
    settings = make_settings(tmp_path)
    repo = ScholarshipDeepHuntRepository(settings.database_target)
    # Seed two users so the FK constraint on user_id is satisfiable and we can
    # assert one user cannot see another's run.
    owner_id = _seed_user(settings, "owner@example.com")
    other_user_id = _seed_user(settings, "second@example.com")

    run = repo.create_run(owner_id, {"goal": "test goal"})

    with pytest.raises(LookupError):
        repo.get_run(run["id"], other_user_id)


def test_repository_cancel_and_resume(tmp_path):
    settings = make_settings(tmp_path)
    repo = ScholarshipDeepHuntRepository(settings.database_target)
    user_id = _seed_user(settings, "cancel@example.com")
    run = repo.create_run(user_id, {"goal": "test goal"})

    cancelled = repo.cancel_run(run["id"], user_id)
    assert cancelled["status"] == "cancelled"
    assert repo.is_cancelled(run["id"]) is True

    resumed = repo.prepare_resume(run["id"], user_id)
    assert resumed["status"] == "queued"
    assert resumed["error_message"] is None

    with pytest.raises(ValueError):
        # queued runs cannot be resumed again
        repo.prepare_resume(run["id"], user_id)


def test_repository_delete(tmp_path):
    settings = make_settings(tmp_path)
    repo = ScholarshipDeepHuntRepository(settings.database_target)
    user_id = _seed_user(settings, "delete@example.com")
    run = repo.create_run(user_id, {"goal": "test goal"})

    assert repo.delete_run(run["id"], user_id) is True
    with pytest.raises(LookupError):
        repo.get_run(run["id"], user_id, include_opportunities=False)
    assert repo.delete_run(run["id"], user_id) is False


def test_repository_fifo_evicts_oldest_run_past_cap(tmp_path):
    """SCHOLARDOCX-0178: "Previous Searches" is capped at MAX_STORED_RUNS
    (10). An 11th run deletes the oldest first."""
    from app.services.scholarship_deep_hunt import MAX_STORED_RUNS

    settings = make_settings(tmp_path)
    repo = ScholarshipDeepHuntRepository(settings.database_target)
    user_id = _seed_user(settings, "fifo@example.com")

    created_ids = [
        repo.create_run(user_id, {"goal": f"goal {i}"})["id"]
        for i in range(MAX_STORED_RUNS + 1)
    ]

    remaining = repo.list_runs(user_id)
    assert len(remaining) == MAX_STORED_RUNS
    remaining_ids = {r["id"] for r in remaining}
    assert created_ids[0] not in remaining_ids  # oldest evicted
    assert created_ids[-1] in remaining_ids  # newest kept
    assert all(cid in remaining_ids for cid in created_ids[1:])


def test_repository_delete_run_detaches_not_deletes_saved_opportunity(tmp_path):
    """SCHOLARDOCX-0178: deleting (or FIFO-evicting) a run must never delete
    an opportunity the user explicitly saved from it — only the run link is
    cleared."""
    from sqlalchemy.orm import sessionmaker

    from app.db.connection import get_engine
    from app.services.store import Store

    settings = make_settings(tmp_path)
    repo = ScholarshipDeepHuntRepository(settings.database_target)
    user_id = _seed_user(settings, "detach@example.com")
    run = repo.create_run(user_id, {"goal": "test goal"})

    engine = get_engine(settings.database_target)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    store = Store(session, current_user_id=user_id)
    try:
        saved = store.create_record(
            "scholarship_opportunities",
            {
                "source": "deep_hunt",
                "canonical_name": "Saved From Run",
                "normalized_url": "example.edu/saved-from-run",
                "status": "Found",
                "deep_hunt_run_id": run["id"],
                "degree_levels_json": "[]",
                "destinations_json": "[]",
                "eligible_nationalities_json": "[]",
                "funding_json": "{}",
                "deadlines_json": "[]",
                "requirements_json": "[]",
                "field_confidence_json": "{}",
            },
        )
    finally:
        session.close()

    assert repo.delete_run(run["id"], user_id) is True

    with connect(settings.database_target) as db:
        row = db.execute(
            "SELECT deep_hunt_run_id FROM scholarship_opportunities WHERE id = ?",
            (saved["id"],),
        ).fetchone()
        assert row is not None, "saved opportunity must survive its source run being deleted"
        assert row["deep_hunt_run_id"] is None


# --- Plan gate (API layer) --------------------------------------------------


def _create_payload():
    return deep_hunt_api.CreateDeepHuntRunRequest(goal="fully funded CS PhD funding, EU")


@pytest.mark.asyncio
async def test_create_run_denied_for_non_pro_plan(monkeypatch):
    created = []

    class FakeRepository:
        def create_run(self, user_id, payload):
            created.append((user_id, payload))
            return {"id": 1}

    class FakeService:
        repository = FakeRepository()

    class FakeStore:
        db = object()

    def deny(user, feature, increment=0, session=None):
        raise UsageLimitExceeded("Permission denied.")

    monkeypatch.setattr(deep_hunt_api, "check_and_increment_limit", deny)
    monkeypatch.setattr(deep_hunt_api, "feature_plan_phrase", lambda *a, **k: "the Pro and Max plans")

    with pytest.raises(deep_hunt_api.HTTPException) as error:
        await deep_hunt_api.create_run(
            _create_payload(),
            BackgroundTasks(),
            user={"id": 7, "roles": ["free_user"]},
            service=FakeService(),  # type: ignore
            store=FakeStore(),  # type: ignore
            settings=Settings(),
        )

    assert error.value.status_code == 403
    assert created == []


@pytest.mark.asyncio
async def test_create_run_allowed_for_pro_plan(monkeypatch):
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

    monkeypatch.setattr(deep_hunt_api, "check_and_increment_limit", lambda *a, **k: True)
    monkeypatch.setattr(deep_hunt_api.ai_tokens, "ensure_can_spend", lambda *a, **k: True)
    # SCHOLARDOCX-0175: per-hit pre-flight reads the Brave price + token rate.
    monkeypatch.setattr(
        deep_hunt_api.ai_tokens, "get_brave_call_cost_per_hit_usd", lambda session: 0.015
    )
    monkeypatch.setattr(
        deep_hunt_api.ai_tokens, "get_token_rate", lambda session: 10000
    )
    import app.api.routes as routes_api
    monkeypatch.setattr(routes_api, "verify_model_permission", lambda *a, **k: None)

    result = await deep_hunt_api.create_run(
        _create_payload(),
        BackgroundTasks(),
        user={"id": "00000000-0000-0000-0000-000000000009", "roles": ["pro_user"]},
        service=FakeService(),  # type: ignore
        store=FakeStore(),  # type: ignore
        settings=Settings(),
    )

    assert result["id"] == 50
    assert created == ["00000000-0000-0000-0000-000000000009"]


@pytest.mark.asyncio
async def test_resume_denied_for_non_pro_plan(monkeypatch):
    class FakeRepository:
        def prepare_resume(self, run_id, user_id):
            raise AssertionError("must not reach resume when the plan gate denies access")

    class FakeService:
        repository = FakeRepository()

    class FakeStore:
        db = object()

    def deny(user, feature, increment=0, session=None):
        raise UsageLimitExceeded("Permission denied.")

    monkeypatch.setattr(deep_hunt_api, "check_and_increment_limit", deny)
    monkeypatch.setattr(deep_hunt_api, "feature_plan_phrase", lambda *a, **k: "the Pro and Max plans")

    with pytest.raises(deep_hunt_api.HTTPException) as error:
        deep_hunt_api.resume_run(
            1,
            BackgroundTasks(),
            user={"id": 7, "roles": ["general_user"]},
            service=FakeService(),  # type: ignore
            store=FakeStore(),  # type: ignore
        )

    assert error.value.status_code == 403


# --- Service pipeline (network boundaries mocked) ---------------------------


def _install_pipeline_mocks(monkeypatch, service, *, results_by_query, pages_by_url, extraction_by_url):
    async def fake_search(query, max_results):
        return list(results_by_query.get(query, []))

    async def fake_fetch(url):
        if url not in pages_by_url:
            raise ValueError("no route to host")
        return pages_by_url[url]

    async def fake_extract(ai_service, *, source_url, source_title, source_snippet):
        return extraction_by_url.get(source_url, _fake_extraction_result(canonical_name=None))

    # SCHOLARDOCX-0173: stub the intent planner + relevance filter so these
    # pipeline tests stay deterministic regardless of OPENROUTER_API_KEY. The
    # planner returns the deterministic fallback queries (which the hardcoded
    # ``results_by_query`` keys already match), and the relevance filter passes
    # every well-formed item so the accept gate behaves as it did pre-0173.
    async def fake_plan_queries(run):
        from app.services.scholarship_deep_hunt import _fallback_queries
        return _fallback_queries(run), []

    async def fake_relevance_score(goal, opportunities, *, field_synonyms=None, degree_level=None):
        return [1.0 for _ in opportunities]

    # SCHOLARDOCX-0175: per-hit billing stubs. The run loop charges per Brave
    # pass; tests just need it not to touch the DB. charge_calls is exposed for
    # tests that want to assert on the per-hit charge shape.
    charge_calls = []
    import app.services.scholarship_deep_hunt as deep_hunt_module
    from app.services import ai_tokens as ai_tokens_mod

    def fake_charge_flat_fee(user, session, cost_usd, source, ref_id=None):
        charge_calls.append({"cost_usd": cost_usd, "source": source})

    monkeypatch.setattr(service, "_brave_search", fake_search)
    monkeypatch.setattr(service, "_plan_queries", fake_plan_queries)
    monkeypatch.setattr(service.relevance_filter, "score", fake_relevance_score)
    monkeypatch.setattr(service.crawler, "fetch", fake_fetch)
    # Per-hit billing runs inside the run loop via a deferred import, so patch
    # the source module's symbol.
    monkeypatch.setattr(ai_tokens_mod, "charge_flat_fee", fake_charge_flat_fee)
    monkeypatch.setattr(
        ai_tokens_mod,
        "get_brave_call_cost_per_hit_usd",
        lambda session: 0.015,
    )
    monkeypatch.setattr(ai_tokens_mod, "get_token_rate", lambda session: 10000)
    monkeypatch.setattr(deep_hunt_module.scholarship_extraction_service, "extract", fake_extract)
    # Stash for tests that assert on billing.
    service._test_charge_calls = charge_calls  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_service_run_stores_accepted_results_without_auto_saving(tmp_path, monkeypatch):
    """SCHOLARDOCX-0178: a completed run stores its accepted results on the
    run itself (results_json) and does NOT upsert them into
    scholarship_opportunities — the user must explicitly save a result."""
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    user_id = _seed_user(settings, "svc-persist@example.com")
    run = service.repository.create_run(user_id, {"goal": "fully funded CS PhD funding, EU"})

    result_url = "example.edu/scholarship"
    result = {"title": "Example Scholarship", "url": result_url, "content": "snippet", "score": 0.9}
    page = {"title": "Example Scholarship - Official", "url": result_url, "text": "Full page text about the scholarship."}

    _install_pipeline_mocks(
        monkeypatch,
        service,
        results_by_query={
            "fully funded CS PhD funding, EU scholarship funding official application": [result],
        },
        pages_by_url={result_url: page},
        extraction_by_url={result_url: _fake_extraction_result()},
    )

    await service.run(run["id"], user_id)

    finished = service.repository.get_run(run["id"], user_id)
    assert finished["status"] == "completed"
    assert finished["result_count"] == 1
    assert len(finished["results"]) == 1
    result_entry = finished["results"][0]
    assert result_entry["canonical_name"] == "Example Deep Hunt Scholarship"
    assert result_entry["normalized_url"] == "example.edu/scholarship"
    # Not saved yet — no scholarship_opportunities row exists for it.
    assert result_entry["in_library"] is False
    assert result_entry["opportunity_id"] is None
    with connect(settings.database_target) as db:
        rows = db.execute(
            "SELECT COUNT(*) AS n FROM scholarship_opportunities WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        assert rows["n"] == 0


@pytest.mark.asyncio
async def test_service_run_rejects_results_with_no_name_or_signal(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    user_id = _seed_user(settings, "svc-reject@example.com")
    run = service.repository.create_run(user_id, {"goal": "fully funded CS PhD funding, EU"})

    result_url = "example.edu/thin-result"
    result = {"title": "Thin Result", "url": result_url, "content": "snippet", "score": 0.5}

    _install_pipeline_mocks(
        monkeypatch,
        service,
        results_by_query={
            "fully funded CS PhD funding, EU scholarship funding official application": [result],
        },
        pages_by_url={},  # crawl fails -> falls back to the search snippet
        extraction_by_url={
            result_url: _fake_extraction_result(canonical_name=None, deadlines=[], funding={})
        },
    )

    await service.run(run["id"], user_id)

    finished = service.repository.get_run(run["id"], user_id)
    assert finished["status"] == "completed"
    assert finished["result_count"] == 0
    assert finished["results"] == []


@pytest.mark.asyncio
async def test_service_run_dedupes_same_url_across_search_passes(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    user_id = _seed_user(settings, "svc-dedupe@example.com")
    run = service.repository.create_run(
        user_id, {"goal": "fully funded CS PhD funding, EU", "degree_level": "PhD"}
    )

    result_url = "example.edu/scholarship"
    result = {"title": "Example Scholarship", "url": result_url, "content": "snippet", "score": 0.9}
    page = {"title": "Example Scholarship", "url": result_url, "text": "Full page text."}

    # Same URL is returned by every search pass.
    all_queries_return_same_result = {
        query: [result]
        for query in [
            "fully funded CS PhD funding, EU scholarship funding official application",
            "fully funded CS PhD funding, EU PhD scholarship deadline eligibility",
            "fully funded CS PhD funding, EU scholarship deadline requirements official portal",
        ]
    }

    _install_pipeline_mocks(
        monkeypatch,
        service,
        results_by_query=all_queries_return_same_result,
        pages_by_url={result_url: page},
        extraction_by_url={result_url: _fake_extraction_result()},
    )

    extract_calls = []
    import app.services.scholarship_deep_hunt as deep_hunt_module

    original_extract = deep_hunt_module.scholarship_extraction_service.extract

    async def counting_extract(ai_service, *, source_url, source_title, source_snippet):
        extract_calls.append(source_url)
        return _fake_extraction_result()

    monkeypatch.setattr(deep_hunt_module.scholarship_extraction_service, "extract", counting_extract)

    await service.run(run["id"], user_id)

    # Deduped by canonical URL before extraction, so the same source is only
    # ever extracted once even though every search pass surfaced it.
    assert extract_calls == [result["url"]]
    finished = service.repository.get_run(run["id"], user_id)
    assert finished["result_count"] == 1
    assert len(finished["results"]) == 1


@pytest.mark.asyncio
async def test_service_run_collapses_near_duplicate_titles_across_urls(tmp_path, monkeypatch):
    """SCHOLARDOCX-0177: two different source pages describing the same generic
    program (titles differing only by year/punctuation) must collapse into one
    persisted opportunity, keeping the higher-relevance extraction."""
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    user_id = _seed_user(settings, "svc-namededupe@example.com")
    run = service.repository.create_run(user_id, {"goal": "emjm scholarships for cse background"})

    weak_url = "aggregator.example/emjm-list"
    strong_url = "ec.europa.eu/emjm-official"
    weak_result = {"title": "Erasmus Mundus Scholarship 2026", "url": weak_url, "content": "snippet", "score": 0.5}
    strong_result = {"title": "Erasmus Mundus Scholarship 2026-2027", "url": strong_url, "content": "snippet", "score": 0.9}
    weak_page = {"title": "Erasmus Mundus Scholarship 2026", "url": weak_url, "text": "text"}
    strong_page = {"title": "Erasmus Mundus Scholarship 2026-2027", "url": strong_url, "text": "text"}

    fallback_query = "emjm scholarships for cse background scholarship funding official application"

    _install_pipeline_mocks(
        monkeypatch,
        service,
        results_by_query={fallback_query: [weak_result, strong_result]},
        pages_by_url={weak_url: weak_page, strong_url: strong_page},
        extraction_by_url={
            weak_url: _fake_extraction_result(canonical_name="Erasmus Mundus Scholarship 2026", sponsor=None),
            strong_url: _fake_extraction_result(canonical_name="Erasmus Mundus Scholarship 2026-2027", sponsor="European Commission"),
        },
    )

    # Give the two near-duplicate titles different relevance scores so the
    # test can assert the higher-scoring one wins the dedup.
    async def fake_relevance_score(goal, opportunities, *, field_synonyms=None, degree_level=None):
        scores = []
        for opp in opportunities:
            scores.append(0.5 if "2026-2027" in (opp.get("canonical_name") or "") else 0.9)
        return scores

    monkeypatch.setattr(service.relevance_filter, "score", fake_relevance_score)

    await service.run(run["id"], user_id)

    finished = service.repository.get_run(run["id"], user_id)
    assert finished["status"] == "completed"
    assert finished["result_count"] == 1
    assert len(finished["results"]) == 1
    # The weak-URL extraction scored higher (0.9) and wins the dedup even
    # though the strong-URL extraction was more complete (has a sponsor).
    assert finished["results"][0]["canonical_name"] == "Erasmus Mundus Scholarship 2026"


@pytest.mark.asyncio
async def test_service_run_stops_when_cancelled_mid_run(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    user_id = _seed_user(settings, "svc-cancel@example.com")
    run = service.repository.create_run(user_id, {"goal": "fully funded CS PhD funding, EU"})

    async def fake_search(query, max_results):
        # Cancel the run from underneath the in-flight search pass.
        service.repository.cancel_run(run["id"], user_id)
        return [{"title": "X", "url": "example.edu/x", "content": "y", "score": 1}]

    async def fail_extract(ai_service, **kwargs):
        raise AssertionError("extraction must not run after cancellation")

    monkeypatch.setattr(service, "_brave_search", fake_search)
    import app.services.scholarship_deep_hunt as deep_hunt_module

    monkeypatch.setattr(deep_hunt_module.scholarship_extraction_service, "extract", fail_extract)

    await service.run(run["id"], user_id)

    finished = service.repository.get_run(run["id"], user_id, include_opportunities=False)
    assert finished["status"] == "cancelled"


@pytest.mark.asyncio
async def test_service_run_completes_with_zero_when_no_results_match(tmp_path, monkeypatch):
    """SCHOLARDOCX-0175: an empty result set completes cleanly (no on-target
    matches) rather than failing. A scary 'failed' state is reserved for real
    errors; 'no matches' is an honest, friendly outcome."""
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    user_id = _seed_user(settings, "svc-empty@example.com")
    run = service.repository.create_run(user_id, {"goal": "an extremely obscure goal"})

    async def _empty_impl(query, max_results):
        return []

    monkeypatch.setattr(service, "_brave_search", _empty_impl)
    # Stub billing so the run loop doesn't touch the DB.
    from app.services import ai_tokens as ai_tokens_mod

    monkeypatch.setattr(
        ai_tokens_mod, "charge_flat_fee", lambda *a, **k: None
    )
    monkeypatch.setattr(
        ai_tokens_mod, "get_brave_call_cost_per_hit_usd", lambda session: 0.015
    )
    monkeypatch.setattr(ai_tokens_mod, "get_token_rate", lambda session: 10000)

    await service.run(run["id"], user_id)

    finished = service.repository.get_run(run["id"], user_id, include_opportunities=False)
    assert finished["status"] == "completed"
    assert finished["result_count"] == 0
    # No scary error message on a clean empty result.
    assert not finished.get("error_message")


# --- Acceptance filter (no invented fields contract) ------------------------


def test_is_acceptable_requires_name_and_a_concrete_signal():
    assert _is_acceptable({"canonical_name": None, "deadlines": [], "funding": {}}) is False
    assert (
        _is_acceptable({"canonical_name": "X", "deadlines": [], "funding": {}}) is False
    )  # name alone is not enough
    assert (
        _is_acceptable(
            {"canonical_name": "X", "deadlines": [{"date": "2027-01-01"}], "funding": {}}
        )
        is True
    )
    assert (
        _is_acceptable(
            {"canonical_name": "X", "deadlines": [], "funding": {"coverage": "full"}}
        )
        is True
    )


# --- Explicit save-to-library endpoint (SCHOLARDOCX-0178) -------------------


def _store_for(settings: Settings, user_id: str) -> Store:
    engine = get_engine(settings.database_target)
    from sqlalchemy.orm import sessionmaker

    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    return Store(session, current_user_id=user_id)


async def _run_with_one_accepted_result(tmp_path, monkeypatch, email: str):
    """Shared setup: a completed run with exactly one accepted, unsaved result."""
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    user_id = _seed_user(settings, email)
    run = service.repository.create_run(user_id, {"goal": "fully funded CS PhD funding, EU"})

    result_url = "example.edu/save-me"
    result = {"title": "Save Me Scholarship", "url": result_url, "content": "snippet", "score": 0.9}
    page = {"title": "Save Me Scholarship", "url": result_url, "text": "text"}

    _install_pipeline_mocks(
        monkeypatch,
        service,
        results_by_query={
            "fully funded CS PhD funding, EU scholarship funding official application": [result],
        },
        pages_by_url={result_url: page},
        extraction_by_url={result_url: _fake_extraction_result(canonical_name="Save Me Scholarship")},
    )
    await service.run(run["id"], user_id)
    return settings, service, user_id, run["id"]


@pytest.mark.asyncio
async def test_save_result_persists_and_marks_result_saved(tmp_path, monkeypatch):
    settings, service, user_id, run_id = await _run_with_one_accepted_result(
        tmp_path, monkeypatch, "svc-save@example.com"
    )
    store = _store_for(settings, user_id)
    try:
        saved = deep_hunt_api.save_result(
            run_id,
            deep_hunt_api.SaveDeepHuntResultRequest(normalized_url="example.edu/save-me"),
            user={"id": user_id, "roles": ["max_user"]},
            service=service,
            store=store,
        )
        assert saved["canonical_name"] == "Save Me Scholarship"
        assert saved["source"] == "deep_hunt"
        assert saved["deep_hunt_run_id"] == run_id

        finished = service.repository.get_run(run_id, user_id)
        result_entry = finished["results"][0]
        assert result_entry["in_library"] is True
        assert result_entry["opportunity_id"] == saved["id"]
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_save_result_404_for_unknown_normalized_url(tmp_path, monkeypatch):
    settings, service, user_id, run_id = await _run_with_one_accepted_result(
        tmp_path, monkeypatch, "svc-save-404@example.com"
    )
    store = _store_for(settings, user_id)
    try:
        with pytest.raises(deep_hunt_api.HTTPException) as error:
            deep_hunt_api.save_result(
                run_id,
                deep_hunt_api.SaveDeepHuntResultRequest(normalized_url="example.edu/not-a-result"),
                user={"id": user_id, "roles": ["max_user"]},
                service=service,
                store=store,
            )
        assert error.value.status_code == 404
    finally:
        store.db.close()


@pytest.mark.asyncio
async def test_save_result_returns_409_when_library_full(tmp_path, monkeypatch):
    import app.api.scholarship_opportunities as opp_api
    from app.api.scholarship_opportunities import upsert_scholarship_opportunity

    # SCHOLARDOCX-0178 perf fix: patch the cap down to a small number so this
    # test exercises the exact same boundary check without ~100 sequential
    # real-network round trips (see the equivalent note in
    # test_scholarship_opportunities.py).
    monkeypatch.setattr(opp_api, "MAX_LIBRARY_ENTRIES", 3)

    settings, service, user_id, run_id = await _run_with_one_accepted_result(
        tmp_path, monkeypatch, "svc-save-full@example.com"
    )
    store = _store_for(settings, user_id)
    try:
        for i in range(opp_api.MAX_LIBRARY_ENTRIES):
            upsert_scholarship_opportunity(
                store,
                source="hunt",
                extracted={
                    "canonical_name": f"Filler {i}",
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
                },
                source_url=f"https://example.org/filler{i}",
            )
        with pytest.raises(deep_hunt_api.HTTPException) as error:
            deep_hunt_api.save_result(
                run_id,
                deep_hunt_api.SaveDeepHuntResultRequest(normalized_url="example.edu/save-me"),
                user={"id": user_id, "roles": ["max_user"]},
                service=service,
                store=store,
            )
        assert error.value.status_code == 409
    finally:
        store.db.close()
