from pathlib import Path

import pytest

from app.core.config import Settings
from app.db.connection import connect, initialize_database
from app.services.advisor_atlas.analysis import deterministic_analysis
from app.services.advisor_atlas.crawler import is_visual_url, validate_public_url
from app.services.advisor_atlas.repository import AdvisorAtlasRepository
from app.services.advisor_atlas.service import AdvisorAtlasService


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.database_path = settings.workspace_path / "db" / "app.db"
    settings.media_path = settings.workspace_path / "media"
    settings.glm_api_key = ""
    settings.tavily_api_key = ""
    initialize_database(settings.database_path)
    return settings


def test_private_and_non_http_sources_are_rejected():
    with pytest.raises(ValueError):
        validate_public_url("http://127.0.0.1:8000/private")
    with pytest.raises(ValueError):
        validate_public_url("file:///etc/passwd")


def test_visual_source_detection_is_limited_to_supported_images():
    assert is_visual_url("https://example.edu/lab/recruiting-poster.png")
    assert is_visual_url("https://example.edu/lab/team.JPEG")
    assert not is_visual_url("https://example.edu/lab/openings.pdf")
    assert not is_visual_url("https://example.edu/lab/profile.html")


def test_funding_signal_never_becomes_confirmed_open():
    result = deterministic_analysis(
        {
            "display_name": "Ada Scholar",
            "institution": "Example University",
            "department": "Computer Science",
            "official_profile_url": "https://example.edu/ada",
        },
        [
            {
                "title": "New funded research grant",
                "url": "https://example.edu/news/grant",
                "content": "The lab received a major funded grant for a new research project.",
            }
        ],
        {"keywords": ["research project"], "degree_target": "PhD"},
    )
    assert result["candidate"]["recruitment_state"] == "possible_opportunity"
    assert "no explicit student opening" in result["candidate"]["recruitment_summary"]


def test_explicit_recruitment_becomes_confirmed_open():
    result = deterministic_analysis(
        {
            "display_name": "Ada Scholar",
            "institution": "Example University",
            "department": "Computer Science",
            "official_profile_url": "https://example.edu/ada",
        },
        [
            {
                "title": "Join our lab",
                "url": "https://example.edu/ada/openings",
                "content": "We are accepting PhD students for Fall 2027. Students are encouraged to apply.",
            }
        ],
        {"keywords": ["computer science"], "degree_target": "PhD"},
    )
    assert result["candidate"]["recruitment_state"] == "confirmed_open"


def test_repository_persists_dossier_publications_and_save(tmp_path):
    settings = make_settings(tmp_path)
    repository = AdvisorAtlasRepository(settings.database_path)
    run = repository.create_run(
        1,
        {
            "mode": "professor",
            "search_depth": "focused",
            "professor_name": "Ada Scholar",
            "university_name": "Example University",
            "department": "Computer Science",
            "research_profile": {"keywords": ["accessible AI"]},
        },
    )
    candidate_id = repository.replace_candidate_data(
        run["id"],
        1,
        {
            "display_name": "Ada Scholar",
            "institution": "Example University",
            "department": "Computer Science",
            "official_profile_url": "https://example.edu/ada",
            "research_summary": "Accessible artificial intelligence.",
            "match_score": 88,
            "evidence_confidence": 82,
            "recruitment_state": "confirmed_open",
            "recruitment_summary": "Explicit PhD opening.",
            "decision_lane": "Open or Funded Signals",
            "coverage": {"identity": "Strong", "research": "Strong"},
            "risk_flags": [],
        },
        [
            {
                "source_url": "https://example.edu/ada",
                "source_type": "official",
                "page_title": "Ada Scholar",
                "claim_type": "profile",
                "claim_text": "Official professor profile.",
                "evidence_excerpt": "Accessible AI research and PhD openings.",
                "confidence": 90,
            }
        ],
        [
            {
                "title": "Accessible AI Systems",
                "authors": ["Ada Scholar"],
                "publication_year": 2026,
                "source_url": "https://doi.org/10.1000/example",
                "relevance_reason": "Direct topic match.",
                "reading_priority": 5,
            }
        ],
        {
            "decision_snapshot": {"why_this_professor": "Direct topic match."},
            "research_bridge": {"shared_terms": ["accessible AI"]},
            "verification_questions": ["Are you accepting students?"],
            "next_actions": [{"type": "read", "label": "Read the paper"}],
        },
    )
    detail = repository.get_candidate(candidate_id, 1)
    assert detail["coverage"]["identity"] == "Strong"
    assert detail["publications"][0]["title"] == "Accessible AI Systems"
    assert detail["dossier"]["decision_snapshot"]["why_this_professor"] == "Direct topic match."

    professor = repository.save_to_professors(candidate_id, 1)
    assert professor["name"] == "Ada Scholar"
    assert repository.get_candidate(candidate_id, 1)["saved_professor_id"] == professor["id"]


def test_repository_enforces_user_scope(tmp_path):
    settings = make_settings(tmp_path)
    repository = AdvisorAtlasRepository(settings.database_path)
    run = repository.create_run(
        1,
        {
            "mode": "department",
            "search_depth": "quick",
            "university_name": "Example University",
            "department": "Physics",
            "research_profile": {},
        },
    )
    with pytest.raises(LookupError):
        repository.get_run(run["id"], 999)


@pytest.mark.asyncio
async def test_service_completes_persisted_run_with_deterministic_fallback(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = AdvisorAtlasService(settings)
    run = service.repository.create_run(
        1,
        {
            "mode": "professor",
            "search_depth": "focused",
            "professor_name": "Ada Scholar",
            "university_name": "Example University",
            "department": "Computer Science",
            "degree_target": "PhD",
            "research_profile": {"keywords": ["accessible", "AI"]},
        },
    )

    async def fake_discovery(_run):
        return (
            [
                {
                    "display_name": "Ada Scholar",
                    "institution": "Example University",
                    "department": "Computer Science",
                    "official_profile_url": None,
                }
            ],
            [
                {
                    "title": "Ada Scholar research profile 2026",
                    "url": "https://example.edu/ada",
                    "content": "Accessible AI research. We are accepting PhD students for Fall 2027.",
                }
            ],
        )

    async def no_extra_search(query, max_results):
        return []

    monkeypatch.setattr(service, "_discover_candidates", fake_discovery)
    monkeypatch.setattr(service, "_tavily_search", no_extra_search)

    await service.run(run["id"], 1)

    completed = service.repository.get_run(run["id"], 1)
    assert completed["status"] == "completed"
    assert completed["candidates"][0]["display_name"] == "Ada Scholar"
    assert completed["candidates"][0]["recruitment_state"] == "confirmed_open"
    assert completed["action_center"]["top_candidates"][0]["name"] == "Ada Scholar"


@pytest.mark.asyncio
async def test_professor_mode_does_not_admit_other_search_result_names(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = AdvisorAtlasService(settings)

    async def fake_search(query, max_results):
        return [
            {
                "title": "Grace Hopper - Faculty Profile",
                "url": "https://example.edu/grace-hopper",
                "content": "A different professor at the same institution.",
            }
        ]

    monkeypatch.setattr(service, "_tavily_search", fake_search)
    candidates, sources = await service._discover_candidates(
        {
            "mode": "professor",
            "professor_name": "Ada Scholar",
            "university_name": "Example University",
            "department": "Computer Science",
            "university_url": None,
        }
    )

    assert [candidate["display_name"] for candidate in candidates] == ["Ada Scholar"]
    assert len(sources) == 1
