"""SCHOLARDOCX-0188: two real bugs found from a live dossier quality report.

1. YEAR_PATTERN (`analysis.py` / `intelligence.py`) matched any bare 20xx
   number, so a Google Scholar "Cited by 2094"-style citation count (or any
   other stray figure in that range) was read as a real year — producing an
   impossible "Latest Visible Year: 2094" and permanently-true
   `recent_activity`. Fixed by clamping to <= current year.
2. `_publications_from_table` requires authors in their own table column.
   Google Scholar's citation table renders title+authors+venue combined in
   ONE cell (nested divs the generic HTML parser flattens), so every row was
   silently dropped even when the profile itself was found and linked — "zero
   papers" despite a verified Google Scholar URL. Fixed with a Scholar-aware
   extractor that doesn't require a separate author column (page ownership,
   via the `user=` query param, already establishes authorship).

Root cause for why the *crawl* often never reaches Scholar's real table at
all: Google Scholar's robots.txt disallows `/citations` — the crawler
correctly refuses to fetch it, so `table_rows` is usually empty regardless
of this parsing fix. That is expected, correct behavior (not a bug), not
something this fix set out to change.
"""
from datetime import datetime, timezone

from app.services.advisor_atlas.analysis import deterministic_analysis
from app.services.advisor_atlas.intelligence import opportunity_forecast
from app.services.advisor_atlas.professor_research import (
    _publications_from_google_scholar_profile,
)

CANDIDATE = {
    "display_name": "Shaif Chowdhury",
    "institution": "Texas A&M Kingsville",
}


def _scholar_source(rows: list[list[str]], links: list[dict] | None = None) -> dict:
    return {
        "url": "https://scholar.google.com/citations?user=abc123",
        "content": "Shaif Chowdhury Cited by 2094",
        "page": {
            "url": "https://scholar.google.com/citations?user=abc123",
            "table_rows": rows,
            "links": links or [],
        },
    }


def test_year_pattern_ignores_citation_counts_beyond_current_year():
    current_year = datetime.now(timezone.utc).year
    stray_future_number = current_year + 68  # mirrors the observed "2094" bug
    sources = [
        {
            "url": "https://scholar.google.com/citations?user=abc123",
            "content": (
                f"Shaif Chowdhury Cited by {stray_future_number} h-index 12 "
                "assistant professor computer vision"
            ),
        }
    ]
    result = deterministic_analysis(CANDIDATE, sources, {"interests": ["computer vision"]})
    latest_visible_year = result["dossier"]["trajectory"]["latest_visible_year"]
    assert latest_visible_year != stray_future_number
    assert (latest_visible_year or 0) <= current_year


def test_opportunity_forecast_recent_activity_ignores_future_year():
    current_year = datetime.now(timezone.utc).year
    stray_future_number = current_year + 68
    text = f"cited by {stray_future_number} assistant professor computer vision"
    forecast = opportunity_forecast(text, "unknown", 50)
    # Without any real recent-dated evidence, recent_activity must not be
    # forced true by a citation-count number that looks like a year.
    assert "Recent dated research activity is visible." not in forecast["signals"]


def test_google_scholar_publications_extracted_without_author_column():
    rows = [
        ["Deep Learning of Visual Features with Limited Supervision", "42", "2024"],
        ["Domain Adaptation for Underwater Imaging Applications", "17", "2023"],
        ["Cited by", "", ""],  # non-publication header-ish row, no valid year match anyway
    ]
    links = [
        {"url": "https://scholar.google.com/citations?...", "text": "Deep Learning of Visual Features with Limited Supervision"},
        {"url": "https://scholar.google.com/citations?...", "text": "Domain Adaptation for Underwater Imaging Applications"},
    ]
    source = _scholar_source(rows, links)
    publications = _publications_from_google_scholar_profile(source, CANDIDATE["display_name"])
    assert len(publications) == 2
    titles = {item["title"] for item in publications}
    assert "Deep Learning of Visual Features with Limited Supervision" in titles
    assert "Domain Adaptation for Underwater Imaging Applications" in titles
    for item in publications:
        assert item["authors"] == [CANDIDATE["display_name"]]
        assert item["publication_year"] in (2023, 2024)


def test_google_scholar_publications_empty_for_non_scholar_url():
    source = {
        "url": "https://university.edu/faculty/chowdhury",
        "page": {"table_rows": [["Title Author Year", "1", "2024"]], "links": []},
    }
    assert _publications_from_google_scholar_profile(source, CANDIDATE["display_name"]) == []


def test_google_scholar_publications_empty_when_not_own_profile():
    # A Scholar *search* URL (no user= identity) must not be treated as an
    # authorship-verified profile.
    source = {
        "url": "https://scholar.google.com/scholar?q=shaif+chowdhury",
        "page": {"table_rows": [["Some Paper Title Here", "1", "2024"]], "links": []},
    }
    assert _publications_from_google_scholar_profile(source, CANDIDATE["display_name"]) == []
