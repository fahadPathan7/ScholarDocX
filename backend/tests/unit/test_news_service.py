"""Unit tests for the Scholarship Hunt domain rules (SCHOLARDOCX-0175/0176).

This file covers what remains in news_service.py — the deterministic
`build_search_query` (used as the deep-search planner's fallback). The
`search_catalog` Brave wrapper was removed in SCHOLARDOCX-0176 (the catalog
is now static-only). Live web-search behavior is tested in
test_brave_search_service.py and test_scholarship_deep_hunt.py.
"""
import pytest
from datetime import date

from app.services.news_service import (
    MAX_SEARCH_QUERY_LENGTH,
    NewsService,
)


def test_erasmus_mundus_query_uses_canonical_names_and_aliases():
    service = NewsService(today_provider=lambda: date(2026, 6, 7))

    query = service.build_search_query(
        popular_scholarships=["Erasmus Mundus (EU)"],
    )

    assert "Erasmus Mundus" in query
    assert "Erasmus Mundus Joint Master" in query
    assert "EMJM" in query
    assert "(EU)" not in query
    assert "deadlines on or after June 7, 2026" in query
    assert "2026-2027 cycle" in query
    assert "Exclude closed, expired, archived, and past cycles" in query
    assert len(query) <= MAX_SEARCH_QUERY_LENGTH


def test_query_preserves_selected_filter_types():
    service = NewsService(today_provider=lambda: date(2026, 6, 7))

    query = service.build_search_query(
        levels=["Master's"],
        countries=["Europe"],
        fields_of_study=["Computer Science & Engineering"],
        funding_types=["Fully Funded"],
        seasons=["Fall"],
    )

    assert "postgraduate master's" in query
    assert "for study at universities in Europe" in query
    assert "in the field of computer science" in query
    assert "that are fully funded" in query
    assert "for Fall 2026 intake" in query
    assert len(query) <= MAX_SEARCH_QUERY_LENGTH


def test_search_date_and_cycle_refresh_for_each_query():
    current_date = [date(2026, 12, 31)]
    service = NewsService(today_provider=lambda: current_date[0])

    q1 = service.build_search_query(levels=["PhD"])
    assert "deadlines on or after December 31, 2026" in q1
    assert "2026-2027 cycle" in q1

    current_date[0] = date(2027, 3, 15)
    q2 = service.build_search_query(levels=["PhD"])
    assert "deadlines on or after March 15, 2027" in q2
    assert "2027-2028 cycle" in q2


def test_season_query_targets_the_next_available_intake_year():
    # June -> Fall of next year (current Fall intake is closing/closed).
    service = NewsService(today_provider=lambda: date(2026, 6, 1))
    query = service.build_search_query(seasons=["Fall"])
    assert "for Fall 2026 intake" in query


def test_realistic_full_query_keeps_every_required_dimension():
    service = NewsService(today_provider=lambda: date(2026, 6, 7))
    query = service.build_search_query(
        levels=["PhD"],
        countries=["Germany"],
        fields_of_study=["Computer Science"],
        funding_types=["Fully Funded"],
        seasons=["Fall"],
        years=["2027"],
        popular_scholarships=["DAAD EPOS Scholarship (Germany)"],
    )
    assert "DAAD EPOS Scholarship" in query
    assert "PhD doctoral" in query
    assert "Germany" in query
    assert "Computer Science" in query
    assert "fully funded" in query
    assert "Fall 2026" in query
    assert "2027" in query
    assert "Exclude closed, expired, archived, and past cycles." in query
    assert len(query) <= MAX_SEARCH_QUERY_LENGTH


def test_large_query_never_truncates_dynamic_deadline_clause():
    service = NewsService(today_provider=lambda: date(2026, 6, 7))
    query = service.build_search_query(
        levels=["PhD", "Master's", "Postdoctoral"],
        countries=["Germany", "France", "Netherlands", "Sweden", "Switzerland"],
        fields_of_study=[
            "Computer Science",
            "Electrical Engineering",
            "Mechanical Engineering",
            "Biotechnology",
        ],
        funding_types=["Fully Funded", "Tuition Waiver"],
        seasons=["Fall", "Spring"],
        years=["2027", "2028"],
        popular_scholarships=[
            "DAAD EPOS Scholarship (Germany)",
            "Erasmus Mundus (EU)",
            "Chevening Scholarship (UK)",
        ],
    )
    # The sealed deadline clause must always survive truncation.
    assert query.endswith("Exclude closed, expired, archived, and past cycles.")
    assert len(query) <= MAX_SEARCH_QUERY_LENGTH


# SCHOLARDOCX-0176: the `search_catalog` Brave wrapper was removed (catalog
# is now static-only). The build_search_query tests above cover what remains
# in news_service.py.
