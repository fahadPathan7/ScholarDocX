"""Corner-case tests for advisor_atlas.intelligence pure-logic helpers.

Covers upcoming_semesters (month-boundary date logic), normalize, and
concept_family (bidirectional substring matching). These have only indirect
coverage via higher-level tests.
"""

from datetime import datetime

import pytest

from app.services.advisor_atlas.intelligence import (
    concept_family,
    normalize,
    upcoming_semesters,
)


# ── upcoming_semesters ──────────────────────────────────────────────────────

class TestUpcomingSemesters:
    def test_zero_count(self):
        assert upcoming_semesters(0) == []

    def test_one(self):
        result = upcoming_semesters(1, datetime(2026, 7, 1))
        assert len(result) == 1
        assert result == ["Fall 2026"]

    def test_january_includes_spring(self):
        # January: Spring 2026 is current or upcoming.
        result = upcoming_semesters(3, datetime(2026, 1, 1))
        assert result == ["Spring 2026", "Fall 2026", "Spring 2027"]

    def test_august_includes_fall(self):
        result = upcoming_semesters(3, datetime(2026, 8, 1))
        assert result == ["Fall 2026", "Spring 2027", "Fall 2027"]

    def test_july_excludes_past_spring(self):
        # July: Spring 2026 already started (month 1 < 7), so excluded.
        result = upcoming_semesters(2, datetime(2026, 7, 1))
        assert result == ["Fall 2026", "Spring 2027"]

    def test_december_excludes_both_current_year(self):
        result = upcoming_semesters(2, datetime(2026, 12, 1))
        assert result == ["Spring 2027", "Fall 2027"]

    def test_count_cap_at_available_semesters(self):
        # Only 6 possible semesters (3 years × 2 seasons). A request for 10 is capped.
        result = upcoming_semesters(10, datetime(2026, 1, 1))
        assert len(result) <= 6

    def test_september_excludes_fall_start(self):
        # September is after August, so Fall 2026 is already past the start month.
        result = upcoming_semesters(1, datetime(2026, 9, 1))
        assert result == ["Spring 2027"]


# ── normalize ───────────────────────────────────────────────────────────────

class TestNormalize:
    def test_empty_string(self):
        assert normalize("") == ""

    def test_whitespace_only(self):
        assert normalize("   ") == ""

    def test_special_chars_only(self):
        assert normalize("---") == ""

    def test_simple_lowercase(self):
        assert normalize("Hello World!") == "hello world"

    def test_numbers_preserved(self):
        assert normalize("Test 123") == "test 123"

    def test_multiple_separators_collapse(self):
        assert normalize("a---b___c") == "a b c"

    def test_leading_trailing_stripped(self):
        assert normalize("  hello  ") == "hello"

    def test_already_lowercase_passthrough(self):
        assert normalize("computer science") == "computer science"


# ── concept_family ──────────────────────────────────────────────────────────

class TestConceptFamily:
    def test_empty_matches_all_families(self):
        # KNOWN EDGE CASE: normalize("") == "", and "" in normalize(term) is
        # True for every term (empty string is a substring of anything), so
        # concept_family("") returns ALL families instead of an empty set.
        # Documented here; guarding against empty input is a separate task.
        families = concept_family("")
        assert families == {"computing", "electrical", "human_technology", "life_science", "quantitative"}

    def test_no_match_returns_empty(self):
        assert concept_family("history") == set()

    def test_computing_direct_match(self):
        assert "computing" in concept_family("computer science")

    def test_computing_abbreviation_match(self):
        # "ai" is in the computing term set; normalize("AI") = "ai".
        assert "computing" in concept_family("AI")

    def test_life_science_match(self):
        assert "life_science" in concept_family("bioinformatics")

    def test_electrical_match(self):
        assert "electrical" in concept_family("electrical engineering")

    def test_bidirectional_substring(self):
        # "machine learning" is a computing term; "deep machine learning"
        # contains it as a substring via the bidirectional check.
        assert "computing" in concept_family("deep machine learning applications")

    def test_multiple_word_input(self):
        # A phrase that spans a family.
        families = concept_family("data science and cybersecurity")
        assert "computing" in families
