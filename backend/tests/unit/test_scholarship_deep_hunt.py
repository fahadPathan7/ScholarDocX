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
from app.db.connection import connect, initialize_database
from app.services.scholarship_deep_hunt import (
    ScholarshipDeepHuntRepository,
    ScholarshipDeepHuntService,
    _is_acceptable,
)


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.database_path = settings.workspace_path / "db" / "app.db"
    settings.media_path = settings.workspace_path / "media"
    settings.glm_api_key = ""
    settings.tavily_api_key = "test-tavily-key"
    initialize_database(settings.database_path)
    return settings


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
    repo = ScholarshipDeepHuntRepository(settings.database_path)

    run = repo.create_run(
        1,
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

    fetched = repo.get_run(run["id"], 1, include_opportunities=False)
    assert fetched["goal"] == "fully funded CS PhD funding, EU, Fall 2027"

    listed = repo.list_runs(1)
    assert len(listed) == 1
    assert listed[0]["id"] == run["id"]


def test_repository_enforces_user_scope(tmp_path):
    settings = make_settings(tmp_path)
    repo = ScholarshipDeepHuntRepository(settings.database_path)
    # Seed a second user row so the FK constraint on user_id is satisfiable.
    with connect(settings.database_path) as db:
        db.execute(
            "INSERT INTO users (email, password_hash, display_name, roles) "
            "VALUES ('second@example.com', 'x', 'Second', '[\"max_user\"]')"
        )
        db.commit()
        other_user_id = db.execute(
            "SELECT id FROM users WHERE email = 'second@example.com'"
        ).fetchone()["id"]

    run = repo.create_run(1, {"goal": "test goal"})

    with pytest.raises(LookupError):
        repo.get_run(run["id"], other_user_id)


def test_repository_cancel_and_resume(tmp_path):
    settings = make_settings(tmp_path)
    repo = ScholarshipDeepHuntRepository(settings.database_path)
    run = repo.create_run(1, {"goal": "test goal"})

    cancelled = repo.cancel_run(run["id"], 1)
    assert cancelled["status"] == "cancelled"
    assert repo.is_cancelled(run["id"]) is True

    resumed = repo.prepare_resume(run["id"], 1)
    assert resumed["status"] == "queued"
    assert resumed["error_message"] is None

    with pytest.raises(ValueError):
        # queued runs cannot be resumed again
        repo.prepare_resume(run["id"], 1)


def test_repository_delete(tmp_path):
    settings = make_settings(tmp_path)
    repo = ScholarshipDeepHuntRepository(settings.database_path)
    run = repo.create_run(1, {"goal": "test goal"})

    assert repo.delete_run(run["id"], 1) is True
    with pytest.raises(LookupError):
        repo.get_run(run["id"], 1, include_opportunities=False)
    assert repo.delete_run(run["id"], 1) is False


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
    import app.api.routes as routes_api
    monkeypatch.setattr(routes_api, "verify_model_permission", lambda *a, **k: None)

    result = await deep_hunt_api.create_run(
        _create_payload(),
        BackgroundTasks(),
        user={"id": 9, "roles": ["pro_user"]},
        service=FakeService(),  # type: ignore
        store=FakeStore(),  # type: ignore
        settings=Settings(),
    )

    assert result["id"] == 50
    assert created == [9]


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

    monkeypatch.setattr(service, "_tavily_search", fake_search)
    monkeypatch.setattr(service.crawler, "fetch", fake_fetch)
    import app.services.scholarship_deep_hunt as deep_hunt_module

    monkeypatch.setattr(deep_hunt_module.scholarship_extraction_service, "extract", fake_extract)


@pytest.mark.asyncio
async def test_service_run_persists_accepted_opportunities_tagged_with_run(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    run = service.repository.create_run(1, {"goal": "fully funded CS PhD funding, EU"})

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

    await service.run(run["id"], 1)

    finished = service.repository.get_run(run["id"], 1)
    assert finished["status"] == "completed"
    assert finished["result_count"] == 1
    assert len(finished["opportunities"]) == 1
    opportunity = finished["opportunities"][0]
    assert opportunity["source"] == "deep_hunt"
    assert opportunity["deep_hunt_run_id"] == run["id"]
    assert opportunity["canonical_name"] == "Example Deep Hunt Scholarship"


@pytest.mark.asyncio
async def test_service_run_rejects_results_with_no_name_or_signal(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    run = service.repository.create_run(1, {"goal": "fully funded CS PhD funding, EU"})

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

    await service.run(run["id"], 1)

    finished = service.repository.get_run(run["id"], 1)
    assert finished["status"] == "completed"
    assert finished["result_count"] == 0
    assert finished["opportunities"] == []


@pytest.mark.asyncio
async def test_service_run_dedupes_same_url_across_search_passes(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    run = service.repository.create_run(
        1, {"goal": "fully funded CS PhD funding, EU", "degree_level": "PhD"}
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

    await service.run(run["id"], 1)

    # Deduped by canonical URL before extraction, so the same source is only
    # ever extracted once even though every search pass surfaced it.
    assert extract_calls == [result["url"]]
    finished = service.repository.get_run(run["id"], 1)
    assert finished["result_count"] == 1
    assert len(finished["opportunities"]) == 1


@pytest.mark.asyncio
async def test_service_run_stops_when_cancelled_mid_run(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    run = service.repository.create_run(1, {"goal": "fully funded CS PhD funding, EU"})

    async def fake_search(query, max_results):
        # Cancel the run from underneath the in-flight search pass.
        service.repository.cancel_run(run["id"], 1)
        return [{"title": "X", "url": "example.edu/x", "content": "y", "score": 1}]

    async def fail_extract(ai_service, **kwargs):
        raise AssertionError("extraction must not run after cancellation")

    monkeypatch.setattr(service, "_tavily_search", fake_search)
    import app.services.scholarship_deep_hunt as deep_hunt_module

    monkeypatch.setattr(deep_hunt_module.scholarship_extraction_service, "extract", fail_extract)

    await service.run(run["id"], 1)

    finished = service.repository.get_run(run["id"], 1, include_opportunities=False)
    assert finished["status"] == "cancelled"


@pytest.mark.asyncio
async def test_service_run_fails_gracefully_with_no_search_results(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = ScholarshipDeepHuntService(settings)
    run = service.repository.create_run(1, {"goal": "an extremely obscure goal"})

    async def _empty_impl(query, max_results):
        return []

    monkeypatch.setattr(service, "_tavily_search", _empty_impl)

    await service.run(run["id"], 1)

    finished = service.repository.get_run(run["id"], 1, include_opportunities=False)
    assert finished["status"] == "failed"
    assert finished["error_message"]


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
