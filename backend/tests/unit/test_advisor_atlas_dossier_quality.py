"""SCHOLARDOCX-0188 (continued): remaining bugs found during a full review of
the Advisor Atlas dossier pipeline, prompted by a live quality report.

Kept separate from test_advisor_atlas_publications.py (year/publication bugs)
and from test_advisor_atlas.py (already past this project's 1150-line
file-size cap).
"""
from datetime import datetime, timezone

from app.services.advisor_atlas.analysis import deterministic_analysis
from app.services.advisor_atlas.intelligence import semantic_fallback
from app.services.advisor_atlas.professor_research import (
    _dedupe_education,
    professor_query_plan,
)


def test_semantic_fallback_rejects_short_interest_substring_coincidence():
    """A short interest like "ai" used to score a 92-point "supported research
    phrase" hit purely because "ai" is a substring of "domain"/"certain" — the
    exact bug class `_contains_phrase` was built to prevent elsewhere in this
    same file, just not applied on this specific line."""
    result = semantic_fallback(
        ["ai"],
        "Studies certain domains of medieval French poetry, unrelated to the field.",
    )
    assert result["is_research_match"] is False
    assert "ai" not in result["matched_interests"]


def test_semantic_fallback_still_matches_genuine_short_interest():
    result = semantic_fallback(
        ["ai"],
        "This lab focuses on AI and robotics research for healthcare applications.",
    )
    assert result["is_research_match"] is True
    assert "ai" in result["matched_interests"]


def test_lab_environment_known_rejects_substring_coincidence():
    """"lab" is a substring of "collaborate"/"elaborate"/"label" — this must
    not report lab info as verified purely from one of those words."""
    candidate = {"display_name": "Jane Doe", "institution": "Test University"}
    sources = [
        {
            "url": "https://test.edu/jane",
            "content": "Jane Doe likes to collaborate with colleagues on shared projects.",
        }
    ]
    result = deterministic_analysis(candidate, sources, {"interests": ["test"]})
    assert result["dossier"]["lab_environment"]["known"] is False


def test_lab_environment_known_true_for_genuine_mention():
    candidate = {"display_name": "Jane Doe", "institution": "Test University"}
    sources = [
        {"url": "https://test.edu/jane", "content": "Jane Doe runs a lab focused on robotics."}
    ]
    result = deterministic_analysis(candidate, sources, {"interests": ["test"]})
    assert result["dossier"]["lab_environment"]["known"] is True


def test_dedupe_education_keeps_distinct_institutions_separate():
    """SCHOLARDOCX-0188: the institution half of the dedup key used to
    recognize only two literal, hardcoded test-candidate institution names.
    For every other real candidate it never matched, so two genuinely
    different degrees from two different real institutions collapsed into
    one, silently dropping one of them."""
    values = [
        "PhD in Computer Science, Stanford University",
        "PhD in Computer Science, University of Toronto",
    ]
    result = _dedupe_education(values)
    assert len(result) == 2


def test_dedupe_education_still_collapses_same_entry_variants():
    values = [
        "PhD, Baylor University",
        "PhD — Computer Science, Baylor University, Waco, TX, 2025",
    ]
    result = _dedupe_education(values)
    assert len(result) == 1
    assert result[0] == "PhD — Computer Science, Baylor University, Waco, TX, 2025"


def test_professor_query_plan_years_track_the_current_year():
    """Was hardcoded to "2026 2025 2024 2023" / "2025 2026" — correct only for
    as long as "today" stayed inside that literal window."""
    current_year = datetime.now(timezone.utc).year
    plan = professor_query_plan(
        {"display_name": "Jane Doe", "institution": "Test University"},
        {"university_name": "Test University", "department": "Physics"},
    )
    publications_query = next(item["query"] for item in plan if item["kind"] == "publications")
    assert str(current_year) in publications_query
    assert str(current_year - 3) in publications_query
