from pathlib import Path

import pytest

import app.services.advisor_atlas.analysis as analysis_module
from app.api.advisor_atlas import CreateRunRequest, ResearchProfile
from app.core.config import Settings
from app.db.connection import connect, initialize_database
from app.services.advisor_atlas.analysis import (
    analyze_visual_source,
    analyze_with_glm,
    deterministic_analysis,
)
from app.services.advisor_atlas.crawler import (
    canonicalize_url,
    clean_person_name,
    is_visual_url,
    validate_public_url,
)
from app.services.advisor_atlas.discovery import (
    DiscoveryResearcher,
    build_discovery_action_center,
    select_directory_targets,
)
from app.services.advisor_atlas.repository import AdvisorAtlasRepository
from app.services.advisor_atlas.service import AdvisorAtlasService
from app.services.advisor_atlas.professor_research import (
    discover_profile_links,
    extract_verified_professor_facts,
    is_scholarly_publication,
    linked_professor_targets,
    publication_supported_by_sources,
    professor_query_plan,
    select_candidate_email,
)
from app.services.advisor_atlas.intelligence import (
    UNIT_PATTERN,
    UNIT_PATTERN_TRAILING,
    clean_unit_name,
    concept_family,
    extract_related_units,
    opportunity_forecast,
    related_unit_score,
    semantic_fallback,
    upcoming_semesters,
)
from tests.helpers import cleanup_user_records


TEST_USER_ID = "00000000-0000-0000-0000-0000000000a7"
TEST_INTRUDER_ID = "00000000-0000-0000-0000-0000000000a8"


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.media_path = tmp_path / "workspace" / "media"
    settings.glm_api_key = ""
    settings.tavily_api_key = ""
    initialize_database(settings.database_target)
    with connect(settings.database_target) as db:
        cleanup_user_records(db, TEST_USER_ID, "advisor-atlas@test.local")
        cleanup_user_records(db, TEST_INTRUDER_ID, "advisor-atlas-intruder@test.local")
        db.execute(
            """
            INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked)
            VALUES (?, 'advisor-atlas@test.local', 'x', 'Advisor Atlas User', '["max_user"]', 1, 0)
            """,
            (TEST_USER_ID,),
        )
        db.execute(
            """
            INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked)
            VALUES (?, 'advisor-atlas-intruder@test.local', 'x', 'Advisor Atlas Intruder', '["max_user"]', 1, 0)
            """,
            (TEST_INTRUDER_ID,),
        )
        db.commit()
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
        {"interests": ["research project"], "degree_target": "PhD"},
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
        {"interests": ["computer science"], "degree_target": "PhD"},
    )
    assert result["candidate"]["recruitment_state"] == "confirmed_open"


def test_related_department_mapping_expands_beyond_literal_field():
    units = extract_related_units(
        "Computer Science",
        [
            {
                "title": "School of Software Engineering | Example University",
                "url": "https://example.edu/software",
                "content": "Department of Electrical Engineering and Department of Data Science",
            },
            {
                "title": "Department of History",
                "url": "https://example.edu/history",
                "content": "Department of History",
            },
        ],
    )
    names = {item["name"].lower() for item in units}
    assert any("software engineering" in name for name in names)
    assert any("data science" in name for name in names)
    assert not any("history" in name for name in names)


def test_semantic_fallback_uses_related_concepts_not_only_exact_phrase():
    result = semantic_fallback(
        ["machine learning for healthcare"],
        "The lab develops artificial intelligence and health informatics systems.",
    )
    assert result["is_research_match"] is True
    assert result["semantic_score"] >= 60
    assert result["matching_method"] == "weighted_concept_fallback"


def test_opportunity_forecast_is_separate_from_current_opening():
    result = opportunity_forecast(
        "The lab received a 2026 grant for a new project and is growing the team.",
        "possible_opportunity",
        84,
    )
    assert result["status"] == "high_likelihood"
    assert result["confidence"] <= 84
    assert len(result["likely_semesters"]) == 3
    assert result["likely_semesters"] == upcoming_semesters(3)


def test_discovery_prefers_official_faculty_directories():
    selected = select_directory_targets(
        [
            {
                "title": "Computer Science Faculty Directory",
                "url": "https://example.edu/cs/faculty",
                "content": "Faculty and professor profiles",
            },
            {
                "title": "Example University on LinkedIn",
                "url": "https://linkedin.com/school/example",
                "content": "People",
            },
            {
                "title": "Computer Science news",
                "url": "https://example.edu/cs/news",
                "content": "Department announcements",
            },
        ],
        "https://example.edu",
    )
    assert [item["url"] for item in selected] == [
        "https://example.edu/cs/faculty"
    ]


@pytest.mark.asyncio
async def test_discovery_crawls_selected_directory_and_preserves_unit_relation():
    searches = []

    async def fake_search(query, max_results):
        searches.append((query, max_results))
        if "academic departments" in query:
            return [
                {
                    "title": "Department of Computer Science",
                    "url": "https://example.edu/cs",
                    "content": "Department of Computer Science",
                }
            ]
        if "official faculty directory" in query:
            return [
                {
                    "title": "Computer Science Faculty Directory",
                    "url": "https://example.edu/cs/faculty",
                    "content": "Faculty and professor profiles",
                }
            ]
        return []

    class FakeCrawler:
        async def fetch(self, url):
            assert url == "https://example.edu/cs/faculty"
            return {
                "title": "Computer Science Faculty",
                "url": url,
                "text": "Ada Scholar Professor",
                "links": [],
            }

        def faculty_candidates(self, page, institution, department):
            return [
                {
                    "display_name": "Ada Scholar",
                    "institution": institution,
                    "department": department,
                    "official_profile_url": "https://example.edu/cs/faculty/ada",
                }
            ]

    candidates, sources = await DiscoveryResearcher(
        FakeCrawler(),  # type: ignore
        fake_search,
        {},
    ).collect(
        {
            "university_name": "Example University",
            "university_url": "https://example.edu",
            "department": "Computer Science",
        },
        [],
        [],
    )
    assert len(searches) >= 3
    assert candidates[0]["display_name"] == "Ada Scholar"
    assert candidates[0]["department_relation"]["relation"] == "direct"
    directory = next(
        item for item in sources if item.get("source_kind") == "faculty_directory"
    )
    assert directory["fetch_status"] == "accessible"
    assert directory["faculty_candidates"] == 1


def test_discovery_summary_reports_coverage_and_excludes_possible_outlook():
    candidates = [
        {
            "id": "1",
            "display_name": "Ada Scholar",
            "department": "Computer Science",
            "match_score": 91,
            "evidence_confidence": 88,
            "recruitment_state": "confirmed_open",
            "intelligence": {
                "is_research_match": True,
                "opportunity_outlook": {"status": "current_open"},
            },
        },
        {
            "id": "2",
            "display_name": "Grace Researcher",
            "department": "Software Engineering",
            "match_score": 84,
            "evidence_confidence": 80,
            "recruitment_state": "possible_opportunity",
            "intelligence": {
                "is_research_match": True,
                "opportunity_outlook": {"status": "possible"},
            },
        },
        {
            "id": "3",
            "display_name": "Lin Faculty",
            "department": "Software Engineering",
            "match_score": 79,
            "evidence_confidence": 76,
            "recruitment_state": "strong_signal",
            "intelligence": {
                "is_research_match": True,
                "opportunity_outlook": {"status": "high_likelihood"},
            },
        },
    ]
    sources = [
        {
            "source_kind": "university_map",
            "url": "https://example.edu/map",
            "mapped_units": [
                {"name": "Computer Science", "relation": "direct"},
                {"name": "Software Engineering", "relation": "adjacent"},
            ],
        },
        {
            "source_kind": "faculty_directory",
            "url": "https://example.edu/cs/faculty",
            "mapped_unit": "Computer Science",
            "fetch_status": "accessible",
        },
        {
            "source_kind": "faculty_directory",
            "url": "https://example.edu/software/faculty",
            "mapped_unit": "Software Engineering",
            "fetch_status": "inaccessible",
            "access_note": "Blocked by public access rules.",
        },
    ]
    action_center = build_discovery_action_center(
        candidates,
        sources,
        {"mode": "department", "department": "Computer Science"},
    )
    summary = action_center["discovery"]
    assert summary["opportunity_match_ids"] == ["1", "3"]
    assert summary["coverage"]["directories_inspected"] == 2
    assert summary["coverage"]["directories_accessible"] == 1
    assert summary["coverage"]["directories_inaccessible"] == 1
    assert summary["department_map"][1]["faculty_count"] == 2
    assert summary["department_map"][1]["research_match_count"] == 2
    assert summary["department_map"][1]["opportunity_count"] == 1
    assert "Blocked by public access rules" in summary["coverage"]["coverage_gaps"][0]


def test_professor_search_requires_research_interest():
    with pytest.raises(ValueError, match="At least one research interest"):
        CreateRunRequest(
            mode="professor",
            professor_name="Ada Scholar",
            university_name="Example University",
            university_url="https://example.edu/faculty/ada",
            department="Computer Science",
            degree_target="PhD",
            intake_term="Fall 2027",
            research_profile=ResearchProfile(interests=["   "]),
        )


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("university_url", None, "official university or professor URL"),
        ("department", " ", "department or research area"),
        ("degree_target", None, "degree target"),
        ("intake_term", "", "intended intake"),
    ],
)
def test_professor_search_requires_strong_identity_and_intake_context(
    field,
    value,
    expected,
):
    payload = {
        "mode": "professor",
        "professor_name": "Ada Scholar",
        "university_name": "Example University",
        "university_url": "https://example.edu/faculty/ada",
        "department": "Computer Science",
        "degree_target": "PhD",
        "intake_term": "Fall 2027",
        "research_profile": {"interests": ["Accessible AI"]},
    }
    payload[field] = value
    with pytest.raises(ValueError, match=expected):
        CreateRunRequest(**payload)  # type: ignore[arg-type]


@pytest.mark.parametrize("intake", ["Fall", "2027", "Next fall", "September 2027"])
def test_professor_search_rejects_ambiguous_intake(intake):
    with pytest.raises(ValueError, match="academic term and year"):
        CreateRunRequest(
            mode="professor",
            professor_name="Ada Scholar",
            university_name="Example University",
            university_url="https://example.edu/faculty/ada",
            department="Computer Science",
            degree_target="PhD",
            intake_term=intake,
            research_profile=ResearchProfile(interests=["Accessible AI"]),
        )


def test_professor_search_rejects_malformed_official_url():
    with pytest.raises(ValueError, match="complete HTTP or HTTPS"):
        CreateRunRequest(
            mode="professor",
            professor_name="Ada Scholar",
            university_name="Example University",
            university_url="example.edu/faculty/ada",
            department="Computer Science",
            degree_target="PhD",
            intake_term="Fall 2027",
            research_profile=ResearchProfile(interests=["Accessible AI"]),
        )


def test_professor_search_requires_full_professor_name():
    with pytest.raises(ValueError, match="first and last name"):
        CreateRunRequest(
            mode="professor",
            professor_name="Ada",
            university_name="Example University",
            university_url="https://example.edu/faculty/ada",
            department="Computer Science",
            degree_target="PhD",
            intake_term="Fall 2027",
            research_profile=ResearchProfile(interests=["Accessible AI"]),
        )


def test_professor_search_rejects_too_short_research_interest():
    with pytest.raises(ValueError, match="at least two characters"):
        CreateRunRequest(
            mode="professor",
            professor_name="Ada Scholar",
            university_name="Example University",
            university_url="https://example.edu/faculty/ada",
            department="Computer Science",
            degree_target="PhD",
            intake_term="Fall 2027",
            research_profile=ResearchProfile(interests=["A"]),
        )


def test_professor_search_normalizes_research_interests():
    request = CreateRunRequest(
        mode="professor",
        professor_name="  Ada   Scholar ",
        university_name="  Example   University ",
        university_url="https://example.edu/faculty/ada",
        department="  Computer   Science ",
        degree_target="PhD",
        intake_term=" Fall   2027 ",
        research_profile=ResearchProfile(
            interests=[
                "  Accessible AI  ",
                "accessible ai",
                "Human-computer interaction",
            ]
        ),
    )

    assert request.research_profile.interests == [
        "Accessible AI",
        "Human-computer interaction",
    ]
    assert request.professor_name == "Ada Scholar"
    assert request.university_name == "Example University"
    assert request.department == "Computer Science"
    assert request.intake_term == "Fall 2027"


def test_professor_research_uses_purpose_specific_query_plan():
    plan = professor_query_plan(
        {"display_name": "Ada Scholar", "institution": "Example University"},
        {"department": "Computer Science"},
    )
    assert [item["kind"] for item in plan] == [
        "identity",
        "profiles",
        "research",
        "publications",
        "scholar_metrics",
        "funding",
        "recruitment",
        "news_activity",
    ]
    assert len({item["query"] for item in plan}) == 8
    assert all(item["max_results"] >= 8 for item in plan)


def test_google_scholar_identity_parameter_is_preserved():
    expected = "https://scholar.google.com/citations?user=qJkLzcAAAAAJ"
    assert canonicalize_url(
        "https://scholar.google.com/citations?hl=en&user=qJkLzcAAAAAJ"
    ) == expected
    assert canonicalize_url(
        "https://scholar.google.com/citations;user=qJkLzcAAAAAJ"
    ) == expected
    assert canonicalize_url(
        "https://scholar.google.com/citations?hl=en"
    ) == "https://scholar.google.com/citations"


def test_professor_owned_links_and_email_are_identity_scoped():
    sources = [
        {
            "title": "Faculty directory",
            "url": "https://example.edu/faculty",
            "content": (
                "Other Professor other.person@example.edu Personnel Profile "
                "Ada Scholar Assistant Professor ada.scholar@example.edu "
                "Key Research Areas: Accessible AI Personnel Profile Next Professor"
            ),
            "source_kind": "official_profile",
            "page": {
                "emails": [
                    "other.person@example.edu",
                    "ada.scholar@example.edu",
                ],
                "links": [],
            },
        },
        {
            "title": "Ada Scholar",
            "url": "https://adascholar.dev/",
            "content": "Ada Scholar personal research homepage.",
            "source_kind": "profiles",
            "page": {
                "links": [
                    {
                        "url": "https://maps.google.com/maps",
                        "text": "Map",
                    },
                    {
                        "url": "https://scholar.google.com/citations?user=abc123",
                        "text": "Scholar",
                    },
                    {
                        "url": "https://github.com/adascholar",
                        "text": "GitHub",
                    },
                    {
                        "url": "https://adascholar.dev/publications.html",
                        "text": "Publications",
                    },
                ],
            },
        },
    ]

    profiles = discover_profile_links(sources, "Ada Scholar")
    targets = linked_professor_targets(sources, "Ada Scholar")

    assert select_candidate_email(sources, "Ada Scholar") == "ada.scholar@example.edu"
    assert profiles["personal_url"] == "https://adascholar.dev/"
    assert profiles["google_scholar_url"].endswith("?user=abc123")
    assert profiles["github_url"] == "https://github.com/adascholar"
    assert profiles["personal_url"] != "https://maps.google.com/maps"
    assert any(item["url"].endswith("/publications.html") for item in targets)


def test_verified_publication_table_returns_multiple_authored_papers():
    source = {
        "title": "Publications - Ada Scholar",
        "url": "https://adascholar.dev/publications.html",
        "content": "Ada Scholar publications",
        "source_kind": "publications",
        "page": {
            "links": [],
            "emails": [],
            "table_rows": [
                ["Title", "Authors", "Venue", "Year"],
                [
                    "Accessible Machine Learning Systems for Students",
                    "A Scholar, B Researcher",
                    "ACM Conference",
                    "2026",
                ],
                [
                    "Human Centered Artificial Intelligence Interfaces",
                    "A Scholar, C Author",
                    "IEEE Conference",
                    "2025",
                ],
            ],
        },
    }
    facts = extract_verified_professor_facts(
        {"display_name": "Ada Scholar", "institution": "Example University"},
        [source],
    )

    assert [paper["publication_year"] for paper in facts["publications"]] == [2026, 2025]
    assert all(
        publication_supported_by_sources(paper, "Ada Scholar", [source])
        for paper in facts["publications"]
    )


def test_verified_research_summary_uses_professor_voice():
    source = {
        "title": "Ada Scholar - Research",
        "url": "https://example.edu/faculty/ada-scholar",
        "content": (
            "Ada Scholar Research Interests "
            "My research focuses on accessible artificial intelligence and "
            "human-centered machine learning. I'm particularly interested in "
            "tools that support students. Recent Updates"
        ),
        "source_kind": "official_profile",
    }

    facts = extract_verified_professor_facts(
        {"display_name": "Ada Scholar", "institution": "Example University"},
        [source],
    )

    summary = facts["research_interests"]["summary"]
    assert summary.startswith("Scholar's research focuses")
    assert "My research" not in summary
    assert "I'm" not in summary
    assert "Scholar is particularly interested" in summary


def test_publication_requires_candidate_authorship_evidence():
    source = {
        "title": "Unrelated Medical AI Paper",
        "url": "https://doi.org/10.1000/unrelated",
        "content": "Unrelated Medical AI Paper by Other Author and Second Author.",
    }
    item = {
        "title": "Unrelated Medical AI Paper",
        "authors": ["Other Author", "Second Author"],
        "venue": "Medical AI Journal",
        "source_url": source["url"],
    }
    assert not publication_supported_by_sources(item, "Ada Scholar", [source])


def test_source_deduplication_preserves_strongest_purpose(tmp_path):
    service = AdvisorAtlasService(make_settings(tmp_path))
    sources = service._dedupe_sources(
        [
            {
                "title": "Paper",
                "url": "https://example.org/paper",
                "content": "publication evidence",
                "source_kind": "publications",
            },
            {
                "title": "Recruitment result",
                "url": "https://example.org/paper",
                "content": "short",
                "source_kind": "recruitment",
                "page": {"links": [], "emails": [], "table_rows": []},
            },
        ]
    )
    assert sources[0]["source_kind"] == "publications"
    assert sources[0]["source_kinds"] == ["publications", "recruitment"]
    assert sources[0]["content"] == "short"
    assert sources[0]["page"]["links"] == []


def test_recruitment_and_profile_pages_are_not_publications():
    assert not is_scholarly_publication(
        {
            "title": "Fully Funded PhD in AI and Machine Learning | ApplyKite",
            "source_url": "https://applykite.example/opening",
            "relevance_reason": "Recruiting students.",
        }
    )
    assert not is_scholarly_publication(
        {
            "title": "Ada Scholar - Assistant Professor of Computer Science",
            "source_url": "https://example.edu/faculty/ada",
            "relevance_reason": "Faculty profile with publications.",
        }
    )
    assert is_scholarly_publication(
        {
            "title": "Communication-Efficient Federated Learning with Adaptive Consensus",
            "source_url": "https://doi.org/10.1000/example",
            "venue": "IEEE Transactions on Big Data",
        }
    )


@pytest.mark.asyncio
async def test_advisor_analysis_does_not_set_fixed_output_token_limit():
    calls = []

    class FakeAiService:
        settings = type(
            "Settings",
            (),
            {
                "glm_api_key": "configured",
                "advisor_atlas_glm_model": "GLM-5.1",
            },
        )()

        async def chat(self, message, **kwargs):
            calls.append({"message": message, **kwargs})
            return {"mode": "glm-GLM-5.1", "answer": "{}"}

    await analyze_with_glm(
        FakeAiService(),  # type: ignore
        {"display_name": "Ada Scholar"},
        [{"title": "Profile", "url": "https://example.edu/ada", "content": "AI research."}],
        {"interests": ["accessible AI"]},
    )

    assert len(calls) == 1
    assert "max_tokens" not in calls[0]
    assert calls[0]["request_label"] == "Advisor Atlas · Final Synthesis"


@pytest.mark.asyncio
async def test_advisor_vision_does_not_set_fixed_output_token_limit(monkeypatch):
    captured_payload = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"relevant": true, "extracted_text": "Recruiting PhD students.", '
                                '"evidence_types": ["recruitment"], "limitations": []}'
                            )
                        }
                    }
                ]
            }

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, json, headers):
            captured_payload.update(json)
            return FakeResponse()

    class FakeAiService:
        settings = type(
            "Settings",
            (),
            {
                "glm_api_key": "configured",
                "advisor_atlas_vision_model": "GLM-4.6V",
                "glm_base_url": "https://example.test/chat/completions",
            },
        )()

        def charge_tokens(self, **kwargs):
            # Vision charging is metered through the real AiService; the fake
            # stands in for the HTTP contract only.
            return None

    monkeypatch.setattr(analysis_module.httpx, "AsyncClient", FakeClient)

    result = await analyze_visual_source(
        FakeAiService(),  # type: ignore
        {"url": "https://example.edu/recruiting.png"},
        "Ada Scholar",
    )

    assert result is not None
    assert "max_tokens" not in captured_payload


def test_repository_persists_dossier_publications_and_save(tmp_path):
    settings = make_settings(tmp_path)
    repository = AdvisorAtlasRepository(settings.database_target)
    run = repository.create_run(
        TEST_USER_ID,
        {
            "mode": "professor",
            "search_depth": "focused",
            "professor_name": "Ada Scholar",
            "university_name": "Example University",
            "department": "Computer Science",
            "research_profile": {"interests": ["accessible AI"]},
        },
    )
    candidate_id = repository.replace_candidate_data(
        run["id"],
        TEST_USER_ID,
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
            "intelligence": {
                "is_research_match": True,
                "opportunity_outlook": {"status": "current_open"},
            },
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
    detail = repository.get_candidate(str(candidate_id), TEST_USER_ID)
    assert detail["coverage"]["identity"] == "Strong"
    assert detail["intelligence"]["is_research_match"] is True
    assert detail["publications"][0]["title"] == "Accessible AI Systems"
    assert detail["dossier"]["decision_snapshot"]["why_this_professor"] == "Direct topic match."

    professor = repository.save_to_professors(str(candidate_id), TEST_USER_ID)
    assert professor["name"] == "Ada Scholar"
    assert repository.get_candidate(str(candidate_id), TEST_USER_ID)["saved_professor_id"] == professor["id"]


def test_repository_enforces_user_scope(tmp_path):
    settings = make_settings(tmp_path)
    repository = AdvisorAtlasRepository(settings.database_target)
    run = repository.create_run(
        TEST_USER_ID,
        {
            "mode": "department",
            "search_depth": "quick",
            "university_name": "Example University",
            "department": "Physics",
            "research_profile": {},
        },
    )
    with pytest.raises(LookupError):
        repository.get_run(run["id"], TEST_INTRUDER_ID)


@pytest.mark.asyncio
async def test_service_completes_persisted_run_with_deterministic_fallback(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = AdvisorAtlasService(settings)
    run = service.repository.create_run(
        TEST_USER_ID,
        {
            "mode": "professor",
            "search_depth": "focused",
            "professor_name": "Ada Scholar",
            "university_name": "Example University",
            "department": "Computer Science",
            "degree_target": "PhD",
            "research_profile": {"interests": ["accessible", "accepting", "fall", "2027"]},
        },
    )

    async def fake_discovery(_run, _usage):
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

    async def no_extra_search(query, max_results, usage=None):
        return []

    monkeypatch.setattr(service, "_discover_candidates", fake_discovery)
    monkeypatch.setattr(service, "_tavily_search", no_extra_search)

    await service.run(run["id"], TEST_USER_ID)
    completed = service.repository.get_run(run["id"], TEST_USER_ID)
    assert completed["status"] == "completed"
    assert completed["candidates"][0]["display_name"] == "Ada Scholar"
    assert completed["candidates"][0]["recruitment_state"] == "confirmed_open"
    assert completed["candidates"][0]["intelligence"]["matching_method"] != "not_requested"
    assert completed["candidates"][0]["intelligence"]["is_research_match"] is True
    assert completed["candidates"][0]["intelligence"]["research_metrics"]["sources_inspected"] >= 1
    assert completed["candidates"][0]["intelligence"]["research_metrics"]["token_measurement"] == "estimated"
    assert completed["action_center"]["matching_open"][0]["name"] == "Ada Scholar"


@pytest.mark.asyncio
async def test_professor_mode_does_not_admit_other_search_result_names(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    service = AdvisorAtlasService(settings)

    async def fake_search(query, max_results, usage=None):
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
        },
        service._new_usage(),
    )

    assert [candidate["display_name"] for candidate in candidates] == ["Ada Scholar"]
    assert len(sources) == 1


def test_repository_caps_visible_evidence_at_eight(tmp_path):
    settings = make_settings(tmp_path)
    repository = AdvisorAtlasRepository(settings.database_target)
    run = repository.create_run(
        TEST_USER_ID,
        {
            "mode": "professor",
            "professor_name": "Ada Scholar",
            "research_profile": {"interests": ["AI"]},
        },
    )
    candidate_id = repository.replace_candidate_data(
        run["id"],
        TEST_USER_ID,
        {
            "display_name": "Ada Scholar",
            "match_score": 50,
            "evidence_confidence": 60,
            "recruitment_state": "unknown",
            "decision_lane": "Needs Verification",
        },
        [
            {
                "source_url": f"https://example.edu/source-{index}",
                "page_title": f"Source {index}",
                "claim_text": "Evidence.",
                "confidence": 90 - index,
            }
            for index in range(12)
        ],
        [],
        {},
    )
    assert len(repository.get_candidate(str(candidate_id), TEST_USER_ID)["evidence"]) == 8


# ── Discovery recall (SCHOLARDOCX-0181) ──────────────────────────────────────
#
# Step 1 of the funnel is a hard multiplier: DiscoveryResearcher.collect() runs
# searches and directory crawls *per mapped unit*. Under-mapping silently shrinks
# the whole run, so these guard recall rather than formatting.


@pytest.mark.parametrize(
    "field, unit",
    [
        ("Chemistry", "Department of Chemical Engineering"),
        ("Chemistry", "Department of Materials Science"),
        ("Economics", "Department of Finance"),
        ("Psychology", "Department of Cognitive Science"),
        ("Mechanical Engineering", "Department of Aerospace Engineering"),
        ("Civil Engineering", "Department of Environmental Engineering"),
        ("Public Health", "Department of Epidemiology"),
        ("Linguistics", "Department of Cognitive Science"),
        # Named in the feature spec as an expected Computer Science match, yet
        # scored 0 before this task because the families were mutually exclusive.
        ("Computer Science", "Department of Electrical Engineering"),
    ],
)
def test_related_unit_score_spans_disciplines(field, unit):
    score, relation, _ = related_unit_score(field, unit)
    assert score >= 50, f"{field} -> {unit} was dropped as unrelated"
    assert relation in {"direct", "adjacent", "interdisciplinary"}


def test_related_units_found_for_field_outside_hardcoded_taxonomy():
    """A chemistry applicant must reach chemistry-adjacent departments.

    Previously returned exactly one unit — the applicant's own field, supplied by
    a setdefault fallback rather than discovered — regardless of what the source
    text listed.
    """
    units = extract_related_units(
        "Chemistry",
        [
            {
                "title": "Academic Departments | Example University",
                "url": "https://example.edu/departments",
                "content": (
                    "Department of Chemistry. Department of Chemical Engineering. "
                    "Department of Materials Science. Center for Catalysis."
                ),
            }
        ],
    )
    names = {item["name"].lower() for item in units}
    assert len(units) >= 3
    assert any("chemical engineering" in name for name in names)
    assert any("materials science" in name for name in names)


def test_concept_family_requires_word_boundaries():
    """`ai` must not match chair/certain/domain and invent a computing link."""
    assert "computing" not in concept_family("Chair of Marine Biology")
    assert "computing" not in concept_family("Certain domains of medieval history")
    assert "computing" not in concept_family("Professor of Domain Law")
    # Real signal still detected.
    assert "computing" in concept_family("Artificial Intelligence")
    assert "computing" in concept_family("AI and Robotics Lab")


def test_semantic_fallback_rejects_substring_coincidence():
    """A medieval-poetry professor was reported as a 72% AI match."""
    result = semantic_fallback(
        ["artificial intelligence"],
        "Professor of medieval French poetry, studies certain domains of verse.",
    )
    assert result["is_research_match"] is False


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Department of Computer Science.", "Computer Science"),
        # "Center for X" / "Institute for X" are where interdisciplinary
        # advisors sit; the `of`-only pattern missed all of them.
        ("Center for Machine Learning.", "Machine Learning"),
        ("Institute for Advanced Study.", "Advanced Study"),
        ("Computer Science Department.", "Computer Science"),
        ("Division of Biology.", "Biology"),
        ("Robotics Institute.", "Robotics"),
        ("Laboratory for Information and Decision Systems.", "Information and Decision Systems"),
        ("School of Public Health.", "Public Health"),
    ],
)
def test_unit_pattern_recognises_of_for_and_trailing_forms(text, expected):
    found = {
        clean_unit_name(match.group(1)) for match in UNIT_PATTERN.finditer(text)
    } | {
        clean_unit_name(match.group(1), from_end=True)
        for match in UNIT_PATTERN_TRAILING.finditer(text)
    }
    assert expected in found, f"{text!r} produced {found!r}"


def test_unit_name_cleaner_stops_at_prose():
    """Captures run to the sentence end, so names must be trimmed to the noun."""
    assert clean_unit_name("Chemistry and the") == "Chemistry"
    assert clean_unit_name("Chemical Engineering collaborate closely") == "Chemical Engineering"
    assert clean_unit_name("Biology may also work with the") == "Biology"
    assert clean_unit_name("Visit the Robotics", from_end=True) == "Robotics"
    # Legitimate interior connectors survive.
    assert clean_unit_name("Information and Decision Systems") == "Information and Decision Systems"


@pytest.mark.parametrize(
    "label, expected",
    [
        ("John Smith", "John Smith"),
        # Every one of these was silently dropped before this task, on a product
        # whose users apply to universities worldwide.
        ("Ana María Rodríguez", "Ana María Rodríguez"),
        ("Jürgen Müller", "Jürgen Müller"),
        ("Maria van der Berg", "Maria van der Berg"),
        ("François Lefèvre", "François Lefèvre"),
        ("Björn Andersson", "Björn Andersson"),
        ("李明", "李明"),
        ("Владимир Петров", "Владимир Петров"),
        ("Ahmed Al-Rashid", "Ahmed Al-Rashid"),
        # Honorifics were previously captured into display_name.
        ("Professor John Smith", "John Smith"),
        ("Dr. Sarah Chen", "Sarah Chen"),
        ("Associate Professor Wei Zhang", "Wei Zhang"),
        ("Prof. Dr. Ingrid Müller", "Ingrid Müller"),
        ("Jane Doe, PhD", "Jane Doe"),
        # Directory "Last, First" ordering.
        ("Smith, John", "John Smith"),
    ],
)
def test_clean_person_name_accepts_international_names(label, expected):
    assert clean_person_name(label) == expected


@pytest.mark.parametrize(
    "label",
    [
        "Read more", "Faculty Directory", "view all people",
        "Room 214", "Publications", "Contact Us", "",
    ],
)
def test_clean_person_name_rejects_navigation_text(label):
    assert clean_person_name(label) is None


@pytest.mark.asyncio
async def test_discovery_uses_ai_mapped_units_when_available():
    """AI-proposed units must widen the funnel, not just annotate it."""
    searched: list[str] = []

    async def fake_search(query: str, max_results: int):
        searched.append(query)
        return []

    class FakeCrawler:
        async def fetch(self, url):  # pragma: no cover - not reached
            raise AssertionError("no directory targets expected")

        def faculty_candidates(self, page, institution, department):
            return []

    async def mapper(university, field, observed):
        return [
            {"name": "Chemical Engineering", "relation": "adjacent",
             "relevance_score": 80, "reason": "Shares reaction engineering methods."},
            {"name": "Materials Science", "relation": "adjacent",
             "relevance_score": 75, "reason": "Overlapping synthesis work."},
        ]

    _, sources = await DiscoveryResearcher(
        FakeCrawler(),  # type: ignore[arg-type]
        fake_search,
        {},
        unit_mapper=mapper,
    ).collect(
        {
            "university_name": "Example University",
            "university_url": "https://example.edu",
            "department": "Chemistry",
        },
        [],
        [],
    )

    university_map = next(
        item for item in sources if item.get("source_kind") == "university_map"
    )
    names = {unit["name"].lower() for unit in university_map["mapped_units"]}
    assert "chemical engineering" in names
    assert "materials science" in names
    assert any("chemical engineering" in query.lower() for query in searched)


@pytest.mark.asyncio
async def test_discovery_falls_back_when_unit_mapper_fails():
    """A mapper error must never degrade discovery below the deterministic path."""
    async def fake_search(query: str, max_results: int):
        return []

    class FakeCrawler:
        async def fetch(self, url):  # pragma: no cover
            raise AssertionError("not reached")

        def faculty_candidates(self, page, institution, department):
            return []

    async def broken_mapper(university, field, observed):
        raise RuntimeError("GLM unavailable")

    _, sources = await DiscoveryResearcher(
        FakeCrawler(),  # type: ignore[arg-type]
        fake_search,
        {},
        unit_mapper=broken_mapper,
    ).collect(
        {
            "university_name": "Example University",
            "university_url": "https://example.edu",
            "department": "Chemistry",
        },
        [],
        [],
    )

    university_map = next(
        item for item in sources if item.get("source_kind") == "university_map"
    )
    assert university_map["mapped_units"], "discovery must still map the requested field"
