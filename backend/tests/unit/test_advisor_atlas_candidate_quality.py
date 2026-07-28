"""SCHOLARDOCX-0190 (round 2): advising eligibility, confidence, dedupe, ranking.

Every title, name and page shape below is taken from the live Texas A&M
University-Kingsville Discovery run that prompted the ticket.
"""

from __future__ import annotations

import pytest

from app.services.advisor_atlas.candidate_quality import (
    advising_eligibility,
    calibrate_evidence_confidence,
    merge_duplicate_candidates,
    naming_source_count,
    person_tokens,
    same_person,
    surname_of,
)
from app.services.advisor_atlas.discovery import build_discovery_action_center


# --- Advising eligibility ---------------------------------------------------

@pytest.mark.parametrize(
    "title,status",
    [
        ("Lab Manager, Department of Chemical and Natural Gas Engineering", "ineligible"),
        ("Professor Emeritus of Physics and Geosciences", "ineligible"),
        ("Dean's Office Staff", "ineligible"),
        ("PhD Candidate and Lecturer I", "ineligible"),
        ("Lecturer I", "limited"),
        ("Adjunct Lecturer for Geology", "limited"),
        ("Assistant Professor of Practice / Visiting Assistant Professor", "limited"),
        ("Research Scientist", "limited"),
    ],
)
def test_non_supervising_roles_are_identified(title, status):
    result = advising_eligibility({"title": title})
    assert result["status"] == status
    assert result["can_supervise"] is False
    assert result["reason"]


@pytest.mark.parametrize(
    "title",
    [
        "Associate Professor of Computer Science",
        "Professor & Mechanical Engineering Graduate Coordinator",
        "Regents Professor of Chemistry",
        "Professor, ASME Fellow",
        # UK ranks: permanent faculty who do supervise doctorates.
        "Senior Lecturer in Machine Learning",
        # A real tenure-track-adjacent rank, not research staff.
        "Research Assistant Professor",
    ],
)
def test_supervising_ranks_are_not_penalised(title):
    result = advising_eligibility({"title": title})
    assert result["can_supervise"] is True
    assert result["status"] == "eligible"


def test_retiree_contact_address_is_a_disqualifying_signal():
    result = advising_eligibility(
        {
            "title": "Professor of Electrical Engineering, P.E.",
            "email": "rajab.challoo@retiree.tamuk.edu",
        }
    )
    assert result["status"] == "ineligible"
    assert "retiree" in result["reason"].lower() or "alumni" in result["reason"].lower()


def test_profile_text_is_only_consulted_when_the_title_is_missing():
    """Page text names other people's ranks constantly — it is a weak signal."""
    sources = [
        {
            "url": "https://tamuk.edu/eecs/smith",
            "content": "Jane Smith. Lab Manager for the robotics facility.",
        }
    ]
    with_title = advising_eligibility(
        {
            "display_name": "Jane Smith",
            "title": "Associate Professor",
            "official_profile_url": "https://tamuk.edu/eecs/smith",
        },
        sources,
    )
    without_title = advising_eligibility(
        {
            "display_name": "Jane Smith",
            "official_profile_url": "https://tamuk.edu/eecs/smith",
        },
        sources,
    )
    assert with_title["can_supervise"] is True
    assert without_title["can_supervise"] is False


# --- Evidence confidence ----------------------------------------------------

SOURCES = [
    {
        "url": "https://www.tamuk.edu/engineering/eecs/noore",
        "title": "Afzel Noore",
        "content": "Dr. Noore researches biometrics and pattern recognition.",
    },
    {
        "url": "https://news.example.com/grants",
        "title": "College grants",
        "content": "A. Mishra (PI), D. Hicks (PI), A. Goyal (PI) received funding.",
    },
    {
        "url": "https://ieeexplore.ieee.org/document/1",
        "title": "Paper",
        "content": "Noore, A. Deep learning for biometric identification.",
    },
]


def test_confidence_is_capped_when_no_source_names_the_person():
    """The 95%-confidence junk entries are the reason this exists."""
    calibrated, basis = calibrate_evidence_confidence(
        95,
        {"display_name": "Faculty Resources"},
        SOURCES,
    )
    assert calibrated == 25
    assert basis["naming_sources"] == 0
    assert basis["generated"] == 95


def test_confidence_survives_when_sources_actually_name_the_person():
    calibrated, basis = calibrate_evidence_confidence(
        95,
        {"display_name": "Afzel Noore"},
        SOURCES,
    )
    assert basis["naming_sources"] == 2
    assert basis["official_source"] is True
    assert calibrated == basis["ceiling"] == 80


def test_calibration_never_inflates_a_low_figure():
    calibrated, _ = calibrate_evidence_confidence(
        40,
        {"display_name": "Afzel Noore"},
        SOURCES,
    )
    assert calibrated == 40


def test_naming_count_ignores_repeats_of_the_same_page():
    count, _, _ = naming_source_count(
        [SOURCES[0], {**SOURCES[0], "url": SOURCES[0]["url"] + "/"}],
        "Afzel Noore",
    )
    assert count == 1


def test_short_surnames_are_not_erased():
    """`professor_facts.name_tokens` drops 2-character tokens; this must not."""
    assert person_tokens("Hua Li") == ["hua", "li"]
    assert surname_of("Hua Li") == "li"
    assert surname_of("Joon-Yeoul Oh") == "oh"


# --- Same-person merging ----------------------------------------------------

def test_initials_merge_into_the_full_name():
    merged = merge_duplicate_candidates(
        [
            {"display_name": "A. Goyal", "institution": "TAMUK"},
            {
                "display_name": "Ayush Goyal",
                "institution": "TAMUK",
                "email": "ayush.goyal@tamuk.edu",
            },
        ]
    )
    assert len(merged) == 1
    assert merged[0]["display_name"] == "Ayush Goyal"
    assert merged[0]["email"] == "ayush.goyal@tamuk.edu"
    assert merged[0]["discovered_aliases"] == ["A. Goyal"]


def test_a_shared_profile_url_is_enough_to_merge():
    merged = merge_duplicate_candidates(
        [
            {
                "display_name": "Haitham Adarbah",
                "official_profile_url": "https://tamuk.edu/eecs/adarbah",
            },
            {
                "display_name": "H. Adarbah",
                "official_profile_url": "https://tamuk.edu/eecs/adarbah/",
            },
        ]
    )
    assert len(merged) == 1


def test_different_people_with_the_same_surname_are_never_merged():
    """Hua Li and Hui Li are two real professors in the same college."""
    people = [
        {"display_name": "Hua Li", "institution": "TAMUK"},
        {"display_name": "Hui Li", "institution": "TAMUK"},
    ]
    assert len(merge_duplicate_candidates(people)) == 2
    assert same_person(*people) is False


def test_the_same_name_at_two_institutions_is_two_people():
    assert same_person(
        {"display_name": "John Smith", "institution": "MIT"},
        {"display_name": "John Smith", "institution": "Stanford"},
    ) is False


# --- Ranking ----------------------------------------------------------------

def test_non_supervising_candidates_are_excluded_from_research_matches():
    candidates = [
        {
            "id": "1",
            "display_name": "Ayush Goyal",
            "department": "Computer Science",
            "match_score": 88,
            "evidence_confidence": 80,
            "recruitment_state": "possible_opportunity",
            "intelligence": {
                "is_research_match": True,
                "advising_eligibility": {"can_supervise": True},
            },
        },
        {
            # Topically aligned, but emeritus — must not be offered as a match.
            "id": "2",
            "display_name": "Thomas McGehee",
            "department": "Engineering",
            "match_score": 65,
            "evidence_confidence": 40,
            "recruitment_state": "unknown",
            "intelligence": {
                "is_research_match": True,
                "advising_eligibility": {
                    "can_supervise": False,
                    "status": "ineligible",
                    "reason": "Emeritus appointment.",
                },
            },
        },
    ]
    summary = build_discovery_action_center(
        candidates,
        [],
        {"mode": "discovery", "department": "computer science"},
    )["discovery"]
    assert summary["research_match_ids"] == ["1"]
    assert summary["coverage"]["supervision_limited"] == 1
    assert summary["coverage"]["verified_faculty"] == 2
    assert any("supervision authority" in gap for gap in summary["coverage"]["coverage_gaps"])
