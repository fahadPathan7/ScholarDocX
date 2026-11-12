"""Scholarship Hunt recall and accuracy (SCHOLARDOCX-0256)."""

from __future__ import annotations

from datetime import date

from app.services.brave_search_service import BraveSearchService
from app.services.deep_hunt_query_planner import DeepHuntRelevanceFilter
from app.services.news_filter_rules import conflicts_with_destinations, conflicts_with_fields
from app.services.scholarship_deep_hunt import (
    MAX_RAW_HITS_PER_RUN,
    SEARCH_PASSES,
    all_deadlines_passed,
    focused_excerpt,
)


def _article(text: str, link: str = "https://example.org/page") -> dict:
    return {"title": text, "description": text, "content": text, "link": link}


# ── Pre-crawl filters reject contradictions, not silence ─────────────────────


def test_snippet_that_does_not_name_the_country_is_kept():
    snippet = _article("Scholarships for development-related postgraduate courses. Apply online.")
    assert conflicts_with_destinations(snippet, ["Germany"]) is False


def test_snippet_naming_only_another_country_is_dropped():
    snippet = _article("Fully funded master's scholarships to study in Canada for 2027.")
    assert conflicts_with_destinations(snippet, ["Germany"]) is True


def test_snippet_naming_a_selected_country_is_kept():
    snippet = _article("Study in Germany or Canada with this joint scholarship.")
    assert conflicts_with_destinations(snippet, ["Germany"]) is False


def test_open_to_all_fields_never_conflicts_on_field():
    snippet = _article(
        "Open to all fields of study, including medicine, law, engineering and the humanities."
    )
    assert conflicts_with_fields(snippet, ["Computer Science"]) is False


# ── Extraction sees the useful part of the page ──────────────────────────────


def test_focused_excerpt_keeps_a_deadline_deep_in_the_page():
    page = "Home About News Menu " * 800 + " The application deadline is 15 January 2027. " + "Footer " * 400
    excerpt = focused_excerpt(page, limit=8000)
    assert len(excerpt) <= 8100
    assert "15 January 2027" in excerpt
    assert excerpt.startswith("Home About")  # page head is kept for context


def test_short_pages_are_passed_whole():
    assert focused_excerpt("Deadline: 1 March 2027.") == "Deadline: 1 March 2027."


# ── Expired opportunities ────────────────────────────────────────────────────

TODAY = date(2026, 11, 12)


def test_all_past_deadlines_are_dropped():
    extracted = {"deadlines": [{"date": "2025-01-15"}, {"date": "2026-03-01"}]}
    assert all_deadlines_passed(extracted, TODAY) is True


def test_any_future_or_free_text_deadline_keeps_it():
    assert all_deadlines_passed({"deadlines": [{"date": "2025-01-15"}, {"date": "2027-01-15"}]}, TODAY) is False
    assert all_deadlines_passed({"deadlines": [{"date": "Rolling admissions"}]}, TODAY) is False
    assert all_deadlines_passed({"deadlines": []}, TODAY) is False


# ── Search breadth, cost, and freshness ──────────────────────────────────────


def test_every_planned_query_is_searched_at_the_same_cost():
    assert SEARCH_PASSES == 4
    assert MAX_RAW_HITS_PER_RUN == 16  # unchanged worst-case cost


def test_freshness_can_be_switched_off():
    service = BraveSearchService.__new__(BraveSearchService)
    assert "freshness" not in service.build_params("daad scholarship", freshness=None)
    assert service.build_params("daad scholarship")["freshness"] == "py"


# ── The relevance judge sees the form filters ────────────────────────────────


def test_relevance_prompt_includes_selected_filters():
    judge = DeepHuntRelevanceFilter.__new__(DeepHuntRelevanceFilter)
    prompt = judge._build_prompt(
        "fully funded master's",
        [{"canonical_name": "DAAD EPOS"}],
        {"degree_level": "master's", "destinations": ["Germany"], "field_of_study": "Computer Science", "intake_term": None},
    )
    assert '"destinations": ["Germany"]' in prompt
    assert '"field_of_study": "Computer Science"' in prompt
    assert "intake_term" not in prompt  # empty filters are omitted
