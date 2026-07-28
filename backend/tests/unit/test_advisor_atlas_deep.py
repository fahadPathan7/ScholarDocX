"""SCHOLARDOCX-0109: deep-research upgrade tests.

Covers deep-candidate selection, the Discovery deep phase, per-candidate
research telemetry, deep-failure isolation, and crawler politeness under
concurrent fetches.
"""

import asyncio
import uuid
from pathlib import Path

import pytest

import app.services.advisor_atlas.crawler as crawler_module
from app.core.config import Settings
from app.db.connection import connect, initialize_database
from app.services.advisor_atlas.crawler import PublicCrawler
from app.services.advisor_atlas.research_pipeline import (
    DEEP_DISCOVERY_LIMIT,
    DEEP_MATCH_FLOOR,
    select_deep_candidates,
)
from app.services.advisor_atlas.service import AdvisorAtlasService


# Fixed UUID for the synthetic user created in tests that need a real DB row.
_DEEP_TEST_USER_ID = "00000000-0000-0000-0000-000000000de9"


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.media_path = tmp_path / "workspace" / "media"
    settings.glm_api_key = ""
    settings.tavily_api_key = ""
    initialize_database(settings.database_target)
    return settings


def _ensure_test_user(settings: Settings) -> str:
    """Insert (or re-use) a fixed-UUID user for deep tests that need a real FK."""
    with connect(settings.database_target) as db:
        db.execute(
            "DELETE FROM users WHERE id = ?",
            (_DEEP_TEST_USER_ID,),
        )
        db.execute(
            "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (?, ?, 'x', 'Deep Test User', '[\"max_user\"]', 1, 0)",
            (_DEEP_TEST_USER_ID, f"advisor-atlas-deep-{_DEEP_TEST_USER_ID}@test.local"),
        )
        db.commit()
    return _DEEP_TEST_USER_ID


def make_department_run(service: AdvisorAtlasService, interests: list[str], user_id: str) -> dict:
    return service.repository.create_run(
        user_id,
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
    user_id = _ensure_test_user(settings)
    service = AdvisorAtlasService(settings)
    run = make_department_run(service, ["machine learning"], user_id)

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

    await service.run(run["id"], user_id)

    completed = service.repository.get_run(run["id"], user_id)
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
    user_id = _ensure_test_user(settings)
    service = AdvisorAtlasService(settings)
    run = make_department_run(service, ["machine learning"], user_id)

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

    await service.run(run["id"], user_id)

    completed = service.repository.get_run(run["id"], user_id)
    assert completed["status"] == "completed"
    candidate = completed["candidates"][0]
    assert candidate["display_name"] == "Ada Match"
    assert candidate["intelligence"]["research_depth"] == "screened"


@pytest.mark.asyncio
async def test_candidate_refresh_always_uses_deep_pipeline(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    user_id = _ensure_test_user(settings)
    service = AdvisorAtlasService(settings)
    run = make_department_run(service, ["machine learning"], user_id)
    candidate_id = service.repository.replace_candidate_data(
        run["id"],
        user_id,
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

    refreshed = await service.refresh_candidate(candidate_id, user_id)

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


# ── Professor dossier correctness & enrichment (SCHOLARDOCX-0182) ────────────
#
# The guiding rule for these: a missing fact is acceptable, an invented one is
# not. Seniority in particular is what an applicant uses to judge whether a
# professor can independently admit students.

from app.services.advisor_atlas.professor_facts import (  # noqa: E402
    build_enrichment,
    extract_education,
    extract_positions,
    extract_topics,
    name_tokens,
    section_text,
    INTEREST_LABELS,
)
from app.services.advisor_atlas.professor_research import (  # noqa: E402
    candidate_source_relevance,
    extract_verified_professor_facts,
)
from app.services.advisor_atlas.service import AdvisorAtlasService as _Svc  # noqa: E402


ECONOMIST = (
    "Elena Vasquez is Associate Professor of Economics at Example University. "
    "Research Interests: labour economics, applied microeconometrics, inequality "
    "and wage dynamics. "
    "Education: Ph.D. in Economics, MIT, 2011. M.A. in Statistics, LSE, 2006. "
    "Previously Assistant Professor at Yale University from 2011 to 2017."
)
CHEMIST = (
    "Hiroshi Tanaka, Professor of Chemistry and Director of the Catalysis "
    "Institute at Example University. "
    "Research Interests: heterogeneous catalysis, surface chemistry, sustainable "
    "hydrogen production. "
    "Education: Ph.D. in Chemistry, Kyoto University, 2003. B.Sc. Chemistry, Tokyo, 1998. "
    "Teaching: CHEM 401 Advanced Catalysis; CHEM 210 Physical Chemistry. "
    "Lab members: Yuki Sato, Amara Diallo, Peter Novak."
)
LINGUIST = (
    "Jürgen Müller is Reader in Linguistics at Example University. "
    "Research Interests: syntax, language typology, historical morphology. "
    "Education: Dr. rer. nat. Linguistics, Heidelberg, 2009."
)


def _official(name: str, text: str) -> dict:
    return {
        "url": "https://example.edu/~prof",
        "title": f"{name} | Example University",
        "content": text,
        "source_kind": "official_profile",
    }


def test_current_rank_is_not_taken_from_a_former_post_elsewhere():
    """The headline bug: any page mention of "assistant professor" was asserted
    as this professor's rank at the candidate's own institution."""
    current, history = extract_positions(ECONOMIST, "Elena Vasquez")
    current_ranks = {item["rank"].lower() for item in current}
    assert "associate professor" in current_ranks
    assert "assistant professor" not in current_ranks

    former = next(item for item in history if item["rank"].lower() == "assistant professor")
    assert former["institution"] == "Yale University"
    assert former["period"] == "2011–2017"


def test_leadership_role_accompanies_rather_than_replaces_the_rank():
    current, _ = extract_positions(CHEMIST, "Hiroshi Tanaka")
    ranks = {item["rank"].lower() for item in current}
    assert "professor" in ranks
    assert "director" in ranks
    # Academic rank leads, leadership follows.
    assert current[0]["rank"].lower() == "professor"


@pytest.mark.parametrize(
    "text, name, expected_rank",
    [
        (ECONOMIST, "Elena Vasquez", "associate professor"),
        (CHEMIST, "Hiroshi Tanaka", "professor"),
        (LINGUIST, "Jürgen Müller", "reader"),
    ],
)
def test_ranks_extract_across_disciplines_and_title_systems(text, name, expected_rank):
    current, _ = extract_positions(text, name)
    assert expected_rank in {item["rank"].lower() for item in current}


def test_no_rank_is_emitted_for_an_unrelated_person_on_the_page():
    text = (
        "Department news. Professor Alan Whitfield has retired after 30 years. "
        "The seminar will be chaired by Associate Professor Nina Roy."
    )
    current, _ = extract_positions(text, "Elena Vasquez")
    assert current == [], f"fabricated a rank for the wrong person: {current}"


@pytest.mark.parametrize(
    "text, expected_degrees",
    [
        (ECONOMIST, {"Ph.D", "M.A"}),
        (CHEMIST, {"Ph.D", "B.Sc"}),
        (LINGUIST, {"Dr. rer. nat"}),
    ],
)
def test_education_covers_degrees_beyond_phd_and_btech(text, expected_degrees):
    found = {item["degree"] for item in extract_education(text)}
    for degree in expected_degrees:
        assert any(degree.lower() in item.lower() for item in found), f"{degree} missing from {found}"


@pytest.mark.parametrize(
    "text, name, expected_topic",
    [
        (ECONOMIST, "Elena Vasquez", "labour economics"),
        (CHEMIST, "Hiroshi Tanaka", "heterogeneous catalysis"),
        (LINGUIST, "Jürgen Müller", "syntax"),
    ],
)
def test_research_themes_are_discipline_agnostic(text, name, expected_topic):
    """Themes came from a hardcoded eight-phrase computer-vision vocabulary, so
    every professor outside that subfield got an empty list."""
    topics = extract_topics(section_text(text, INTEREST_LABELS))
    assert topics, f"no themes extracted for {name}"
    assert any(expected_topic in topic.lower() for topic in topics)


def test_name_tokens_and_source_relevance_are_unicode_aware():
    assert name_tokens("Jürgen Müller") == ["jürgen", "müller"]
    assert candidate_source_relevance(
        {"title": "Jürgen Müller | Example University", "content": LINGUIST},
        "Jürgen Müller",
    )


def test_lab_members_and_courses_extract_when_present():
    enrichment = build_enrichment(CHEMIST, "Hiroshi Tanaka")
    assert "Yuki Sato" in enrichment["lab_members"]
    assert any("CHEM 401" in course for course in enrichment["courses"])


def test_enrichment_sections_stay_empty_rather_than_guessing():
    enrichment = build_enrichment(LINGUIST, "Jürgen Müller")
    assert enrichment["lab_members"] == []
    assert enrichment["courses"] == []
    assert enrichment["graduates"] == []


def test_verified_facts_expose_new_dossier_sections():
    facts = extract_verified_professor_facts(
        {"display_name": "Hiroshi Tanaka", "institution": "Example University"},
        [_official("Hiroshi Tanaka", CHEMIST)],
    )
    assert facts["lab_and_advisees"]["current_members"]
    assert facts["teaching_and_service"]["courses"]
    assert facts["background"]["career_history"] == []
    assert any("Professor" in item for item in facts["background"]["positions"])


def test_merge_keeps_ai_facts_when_deterministic_extraction_is_thin():
    """`intelligence["background"] = background` was a replace, so a thin
    deterministic result discarded everything GLM had correctly found."""
    merged = _Svc._merge_fact_section(
        {"positions": ["Associate Professor of Economics"], "education": ["PhD, MIT"]},
        {"positions": ["Associate Professor, Example University"], "education": []},
        list_keys=("education", "positions", "career_history"),
        text_keys=("summary",),
    )
    assert "PhD, MIT" in merged["education"], "AI-supplied education was discarded"
    assert len(merged["positions"]) == 2, "AI-supplied position was discarded"


def test_merge_prefers_the_longer_text_and_dedupes_lists():
    merged = _Svc._merge_fact_section(
        {"summary": "Short.", "themes": ["syntax"]},
        {"summary": "A considerably more informative summary.", "themes": ["Syntax", "typology"]},
        list_keys=("themes",),
        text_keys=("summary",),
    )
    assert merged["summary"] == "A considerably more informative summary."
    assert len(merged["themes"]) == 2, f"case-insensitive dedupe failed: {merged['themes']}"
