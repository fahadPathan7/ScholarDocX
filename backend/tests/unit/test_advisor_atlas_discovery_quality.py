"""SCHOLARDOCX-0190: Advisor Atlas discovery quality guards.

Covers the four defects found in a live Texas A&M Kingsville Discovery run
that reported 79 "verified professors", of which a dozen were web-page
headings and a dozen more were chemists filed under Computer Science.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.advisor_atlas.analysis import (
    candidate_prompt_payload,
    json_dump,
)
from app.services.advisor_atlas.crawler import clean_person_name
from app.services.advisor_atlas.discovery import (
    candidates_from_search,
    source_belongs_to_unit,
    unit_identity_tokens,
)
from app.services.advisor_atlas.intelligence import (
    clean_unit_name,
    extract_related_units,
    is_academic_unit_name,
    strip_unit_article,
)
from app.services.advisor_atlas.professor_research import candidate_excerpt


# --- 1. Deep research must survive a candidate re-read from storage ---------

def test_json_dump_encodes_stored_candidate_timestamps():
    """A stored candidate carries real datetimes; plain json.dumps raises.

    This is what silently disabled every deep-research pass: the run still
    completed, so the only symptom was shallower dossiers.
    """
    row = {
        "display_name": "Afzel Noore",
        "created_at": datetime(2026, 7, 28, 10, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 28, 11, 0, tzinfo=timezone.utc),
    }
    with pytest.raises(TypeError):
        import json

        json.dumps(row)
    assert "2026-07-28T10:00:00" in json_dump(row)


def test_candidate_prompt_payload_drops_storage_and_prior_conclusions():
    payload = candidate_prompt_payload(
        {
            "id": 12,
            "run_id": 3,
            "user_id": "user-1",
            "display_name": "Ayush Goyal",
            "institution": "Texas A&M University Kingsville",
            "department": "Department of Electrical Engineering",
            "email": "ayush.goyal@tamuk.edu",
            "created_at": datetime.now(timezone.utc),
            "match_score": 71,
            "recruitment_state": "possible_opportunity",
            "intelligence": {"opportunity_outlook": {"status": "high_likelihood"}},
        }
    )
    assert payload == {
        "display_name": "Ayush Goyal",
        "institution": "Texas A&M University Kingsville",
        "department": "Department of Electrical Engineering",
        "email": "ayush.goyal@tamuk.edu",
    }


# --- 2. Page furniture is not a professor ----------------------------------

@pytest.mark.parametrize(
    "label",
    [
        "Skip to main content",
        "CLICK HERE FOR FULL RESUME",
        "CHNG Brochure",
        "Faculty Resources",
        "Dean's Office Staff",
        "Message from the Chair",
        "Online Programs",
        "Council Members",
        "About Us",
        "Graduate Faculty",
        "Contact Information for Graduate Programs",
        "Masters in Computer Science",
        "EECS Faculty and Staff",
        "Personnel Profile",
        "Cyber Intelligence Minor Program",
        "Electrical Engineering and Computer Science",
        "Student Resources",
        "Give Now",
        "Research Areas",
    ],
)
def test_non_person_labels_are_rejected(label):
    assert clean_person_name(label) is None


@pytest.mark.parametrize(
    "label,expected",
    [
        ("Afzel Noore", "Afzel Noore"),
        ("Ali A. Pilehvari", "Ali A. Pilehvari"),
        ("M. R. Riazi", "M. R. Riazi"),
        ("Jose Manuel Cabezas", "Jose Manuel Cabezas"),
        ("Dr. Ayush Goyal", "Ayush Goyal"),
        ("Smith, John", "John Smith"),
        ("Ludwig van Beethoven", "Ludwig van Beethoven"),
        ("Ana de la Cruz", "Ana de la Cruz"),
        ("Jürgen Müller", "Jürgen Müller"),
        ("Joon-Yeoul Oh", "Joon-Yeoul Oh"),
        ("Larry Page", "Larry Page"),
        ("李明", "李明"),
    ],
)
def test_real_names_still_pass(label, expected):
    assert clean_person_name(label) == expected


# --- 3. A unit only owns the faculty on its own pages -----------------------

def test_unit_identity_tokens_ignore_generic_words():
    assert unit_identity_tokens("Department of Computer Science") == {"computer"}
    assert unit_identity_tokens("Engineering") == set()


def test_chemistry_directory_does_not_belong_to_computer_science():
    chemistry = (
        "Department of Chemistry | Faculty and Staff — Texas A&M "
        "University-Kingsville https://www.tamuk.edu/artsci/chemistry/faculty"
    )
    assert source_belongs_to_unit(chemistry, "Computer Science") is False
    assert source_belongs_to_unit(chemistry, "Chemistry") is True


def test_unverifiable_unit_is_accepted_rather_than_dropped():
    assert source_belongs_to_unit("anything at all", "Engineering") is True


def test_candidates_from_search_skips_off_target_results():
    results = [
        {
            "title": "Kevin Francis | Department of Chemistry",
            "url": "https://www.tamuk.edu/artsci/chemistry/francis",
            "content": "Associate Professor of Chemistry.",
        },
        {
            "title": "Maleq Khan | Computer Science",
            "url": "https://www.tamuk.edu/engineering/eecs/khan",
            "content": "Associate Professor of Computer Science.",
        },
    ]
    found = candidates_from_search(
        results,
        {"university_name": "Texas A&M University Kingsville"},
        {"name": "Computer Science"},
    )
    assert [item["display_name"] for item in found] == ["Maleq Khan"]


# --- 4. A job title or a degree is not an academic unit ---------------------

@pytest.mark.parametrize(
    "name",
    [
        "Associate Professor of Computer Science and Director AI-Cyb",
        "Master of Science in Computer Science",
        "Cyber Intelligence Minor Program",
        "Message from the Chair",
        "Dean's Office",
    ],
)
def test_non_unit_names_are_rejected(name):
    assert is_academic_unit_name(name) is False


@pytest.mark.parametrize(
    "name",
    [
        "Computer Science",
        "Department of Electrical Engineering",
        "Center for Artificial Intelligence and Cybersecurity",
        "Applied Mathematics and Computational Science",
    ],
)
def test_real_unit_names_are_accepted(name):
    assert is_academic_unit_name(name) is True


def test_leading_article_is_stripped():
    assert strip_unit_article("The Computer Science") == "Computer Science"


def test_trailing_capture_stops_at_an_article():
    captured = "Department of Electrical Engineering and Computer Science The Computer Science"
    assert clean_unit_name(captured, from_end=True) == "Computer Science"


def test_extract_related_units_excludes_titles_and_degrees():
    sources = [
        {
            "title": "Associate Professor of Computer Science and Director AI-Cybersecurity Center",
            "content": "",
            "url": "https://example.edu/a",
        },
        {
            "title": "Master of Science in Computer Science | Program",
            "content": "",
            "url": "https://example.edu/b",
        },
        {
            "title": "Department of Electrical Engineering and Computer Science",
            "content": "Center for Artificial Intelligence and Cybersecurity is new.",
            "url": "https://example.edu/c",
        },
    ]
    names = [unit["name"] for unit in extract_related_units("computer science", sources)]
    assert "Department of Electrical Engineering and Computer Science" in names
    assert not any("Professor" in name for name in names)
    assert not any(name.lower().startswith("master of") for name in names)


# --- 5. Evidence quotes the professor, not the top of the page -------------

def test_evidence_excerpt_anchors_on_the_surname():
    page = (
        "A. Mishra (PI), D. Hicks (PI), A. Goyal (PI), M. Nijim (PI), "
        "Pathways to Graduate Studies in Cyber Intelligence, DHS CBTS COE TAMU. "
        "Dr. Afzel Noore researches biometrics and pattern recognition."
    )
    excerpt = candidate_excerpt(page, "Afzel A. Noore", 120)
    assert excerpt.startswith("Noore researches biometrics")
