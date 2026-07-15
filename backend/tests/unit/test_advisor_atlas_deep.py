"""SCHOLARDOCX-0109: deep-research upgrade tests.

Covers deep-candidate selection, the Discovery deep phase, per-candidate
research telemetry, deep-failure isolation, and crawler politeness under
concurrent fetches.
"""

import asyncio
from pathlib import Path

import pytest

import app.services.advisor_atlas.crawler as crawler_module
from app.core.config import Settings
from app.db.connection import initialize_database
from app.services.advisor_atlas.crawler import PublicCrawler
from app.services.advisor_atlas.research_pipeline import (
    DEEP_DISCOVERY_LIMIT,
    DEEP_MATCH_FLOOR,
    select_deep_candidates,
)
from app.services.advisor_atlas.service import AdvisorAtlasService


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.media_path = tmp_path / "workspace" / "media"
    settings.glm_api_key = ""
    settings.tavily_api_key = ""
    initialize_database(settings.database_target)
    return settings


def make_department_run(service: AdvisorAtlasService, interests: list[str]) -> dict:
    return service.repository.create_run(
        1,
        {
            "mode": "department",
            "university_name": "Example University",
            "department": "Computer Science",
            "research_profile": {"interests": interests},
        },
    )


def test_deep_candidate_selection_ranks_by_fit_and_applies_floor():
    candidates = [
        {"id": index, "match_score": 100 - index, "evidence_confidence": 50}
        for index in range(20)
    ]
    candidates.append({"id": 99, "match_score": DEEP_MATCH_FLOOR - 1, "evidence_confidence": 99})

    selected = select_deep_candidates(candidates)

    assert len(selected) == DEEP_DISCOVERY_LIMIT
    assert [item["id"] for item in selected] == list(range(DEEP_DISCOVERY_LIMIT))
    assert all(item["match_score"] >= DEEP_MATCH_FLOOR for item in selected)


def test_deep_candidate_selection_breaks_score_ties_by_confidence():
    selected = select_deep_candidates(
        [
            {"id": 1, "match_score": 70, "evidence_confidence": 40},
            {"id": 2, "match_score": 70, "evidence_confidence": 90},
        ]
    )
    assert [item["id"] for item in selected] == [2, 1]


@pytest.mark.asyncio
async def test_discovery_run_deep_researches_matching_candidates(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = AdvisorAtlasService(settings)
    run = make_department_run(service, ["machine learning"])

    async def fake_discovery(_run, _usage):
        return (
            [
                {
                    "display_name": "Ada Match",
                    "institution": "Example University",
                    "department": "Computer Science",
                    "official_profile_url": None,
                },
                {
                    "display_name": "Lin Distant",
                    "institution": "Example University",
                    "department": "Computer Science",
                    "official_profile_url": None,
                },
            ],
            [
                {
                    "title": "Ada Match research",
                    "url": "https://example.edu/ada-match",
                    "content": "Ada Match works on machine learning and artificial intelligence.",
                },
                {
                    "title": "Lin Distant profile",
                    "url": "https://example.edu/lin-distant",
                    "content": "Lin Distant curates the medieval manuscript archive.",
                },
            ],
        )

    search_log: list[str] = []

    async def fake_search(query, max_results, usage=None):
        search_log.append(query)
        if usage is not None:
            usage["tavily_searches"] = int(usage.get("tavily_searches", 0)) + 1
        return []

    monkeypatch.setattr(service, "_discover_candidates", fake_discovery)
    monkeypatch.setattr(service, "_tavily_search", fake_search)

    await service.run(run["id"], 1)

    completed = service.repository.get_run(run["id"], 1)
    assert completed["status"] == "completed"
    by_name = {item["display_name"]: item for item in completed["candidates"]}

    match = by_name["Ada Match"]
    distant = by_name["Lin Distant"]
    assert match["match_score"] >= DEEP_MATCH_FLOOR
    assert match["intelligence"]["research_depth"] == "deep"
    # Deep research replaces the single screening search with the full
    # eight-pass professor query plan, tracked per candidate.
    assert match["intelligence"]["research_metrics"]["tavily_searches"] == 8
    assert distant["match_score"] < DEEP_MATCH_FLOOR
    assert distant["intelligence"]["research_depth"] == "screened"
    assert distant["intelligence"]["research_metrics"]["tavily_searches"] == 1


@pytest.mark.asyncio
async def test_deep_phase_failure_keeps_run_and_screened_result(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = AdvisorAtlasService(settings)
    run = make_department_run(service, ["machine learning"])

    async def fake_discovery(_run, _usage):
        return (
            [
                {
                    "display_name": "Ada Match",
                    "institution": "Example University",
                    "department": "Computer Science",
                    "official_profile_url": None,
                }
            ],
            [
                {
                    "title": "Ada Match research",
                    "url": "https://example.edu/ada-match",
                    "content": "Ada Match works on machine learning systems.",
                }
            ],
        )

    async def no_search(query, max_results, usage=None):
        return []

    original_process = service._process_candidate

    async def flaky_process(run_row, user_id, candidate, sources, deep=False):
        if deep:
            raise RuntimeError("provider exploded mid-dossier")
        return await original_process(run_row, user_id, candidate, sources, deep=deep)

    monkeypatch.setattr(service, "_discover_candidates", fake_discovery)
    monkeypatch.setattr(service, "_tavily_search", no_search)
    monkeypatch.setattr(service, "_process_candidate", flaky_process)

    await service.run(run["id"], 1)

    completed = service.repository.get_run(run["id"], 1)
    assert completed["status"] == "completed"
    candidate = completed["candidates"][0]
    assert candidate["display_name"] == "Ada Match"
    assert candidate["intelligence"]["research_depth"] == "screened"


@pytest.mark.asyncio
async def test_candidate_refresh_always_uses_deep_pipeline(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = AdvisorAtlasService(settings)
    run = make_department_run(service, ["machine learning"])
    candidate_id = service.repository.replace_candidate_data(
        run["id"],
        1,
        {
            "display_name": "Ada Match",
            "institution": "Example University",
            "department": "Computer Science",
            "match_score": 40,
            "evidence_confidence": 40,
            "recruitment_state": "unknown",
            "decision_lane": "Needs Verification",
        },
        [],
        [],
        {},
    )

    async def fake_search(query, max_results, usage=None):
        if usage is not None:
            usage["tavily_searches"] = int(usage.get("tavily_searches", 0)) + 1
        return []

    monkeypatch.setattr(service, "_tavily_search", fake_search)

    refreshed = await service.refresh_candidate(candidate_id, 1)

    assert refreshed["intelligence"]["research_depth"] == "deep"
    assert refreshed["intelligence"]["research_metrics"]["tavily_searches"] == 8


@pytest.mark.asyncio
async def test_crawler_preserves_per_host_delay_under_concurrency(monkeypatch):
    crawler = PublicCrawler()
    request_times: list[float] = []

    async def allow_robots(url):
        return True

    class FakeResponse:
        is_redirect = False
        headers = {"content-type": "text/html"}
        content = b"<html><title>ok</title><body>Ada Scholar</body></html>"
        encoding = "utf-8"
        url = "https://example.edu/page"

        def raise_for_status(self):
            return None

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def get(self, url):
            request_times.append(asyncio.get_running_loop().time())
            return FakeResponse()

    monkeypatch.setattr(crawler, "_robots_allowed", allow_robots)
    monkeypatch.setattr(crawler_module.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(
        crawler_module,
        "_validate_public_host",
        lambda hostname: None,
    )

    await asyncio.gather(
        crawler.fetch("https://example.edu/page-one"),
        crawler.fetch("https://example.edu/page-two"),
    )

    assert len(request_times) == 2
    assert abs(request_times[1] - request_times[0]) >= 0.4
