"""SCHOLARDOCX-0191: publications from the scholarly index, and honest metrics.

The reported dossier showed "No publication list could be verified from
accessible sources" beside "1 AI analyses · 0 Credits used" — two symptoms of
the same thing, an analysis that silently did not happen and a publication
source that cannot be crawled.
"""

from __future__ import annotations

import pytest

from app.services.advisor_atlas.analysis import _record_ai_usage
from app.services.advisor_atlas.openalex import (
    LIST_COST_USD,
    METERED_CALL_COST_RATIO,
    METERED_CALL_SOURCE,
    SEARCH_COST_USD,
    OpenAlexClient,
)
from app.services.advisor_atlas.service import AdvisorAtlasService


# --- Provider failures must not read as completed work ----------------------

def test_a_failed_call_is_not_counted_as_an_analysis():
    usage: dict = {}
    _record_ai_usage(usage, "sys", "prompt", "", None, "provider-error")
    assert usage["failed_ai_calls"] == 1
    assert usage.get("ai_calls", 0) == 0
    assert usage["last_ai_failure"] == "provider-error"


def test_a_local_fallback_is_also_a_failure():
    usage: dict = {}
    _record_ai_usage(usage, "sys", "prompt", "", None, "local-fallback")
    assert usage["failed_ai_calls"] == 1
    assert usage.get("ai_calls", 0) == 0


def test_a_real_call_still_counts_and_accumulates_credits():
    usage: dict = {}
    _record_ai_usage(
        usage,
        "sys",
        "prompt",
        "answer",
        {"input_tokens": 100, "output_tokens": 20, "credits_charged": 7},
        "glm-GLM-5.2",
    )
    assert usage["ai_calls"] == 1
    assert usage["credits_charged"] == 7
    assert usage.get("failed_ai_calls", 0) == 0


# --- Publications from OpenAlex --------------------------------------------

WORK = {
    "id": "https://openalex.org/W123",
    "doi": "https://doi.org/10.1109/tpami.2025.1",
    "title": "Deep learning for biometric identification",
    "publication_year": 2025,
    "type": "article",
    "cited_by_count": 14,
    "authorships": [
        {"author": {"display_name": "Afzel Noore"}},
        {"author": {"display_name": "Richa Singh"}},
    ],
    "primary_location": {
        "landing_page_url": "https://ieeexplore.ieee.org/document/1",
        "source": {"display_name": "IEEE TPAMI"},
    },
    "open_access": {"oa_url": "https://arxiv.org/pdf/1"},
}


def test_a_work_maps_onto_the_dossier_publication_shape():
    publication = OpenAlexClient.to_publication(WORK)
    assert publication["title"] == "Deep learning for biometric identification"
    assert publication["authors"] == ["Afzel Noore", "Richa Singh"]
    assert publication["publication_year"] == 2025
    assert publication["venue"] == "IEEE TPAMI"
    assert publication["citation_count"] == 14
    assert publication["evidence_source"] == "OpenAlex"
    # A DOI is the most durable link, so it wins over the OA and landing URLs.
    assert publication["source_url"] == "https://doi.org/10.1109/tpami.2025.1"


def test_a_work_without_a_title_is_dropped():
    assert OpenAlexClient.to_publication({"id": "https://openalex.org/W1"}) is None


def test_open_access_url_is_used_when_there_is_no_doi():
    publication = OpenAlexClient.to_publication({**WORK, "doi": None})
    assert publication["source_url"] == "https://arxiv.org/pdf/1"


def test_indexed_works_lead_and_page_derived_extras_are_kept():
    analysis = {
        "publications": [
            # Same paper the index has, found on a faculty page: dropped.
            {"title": "Deep Learning for Biometric Identification!", "source_url": "https://tamuk.edu/cv"},
            # Something the index has not got: kept behind the indexed works.
            {"title": "An unindexed workshop paper", "source_url": "https://tamuk.edu/cv", "publication_year": 2019},
        ]
    }
    AdvisorAtlasService._merge_scholarly_publications(
        analysis,
        [OpenAlexClient.to_publication(WORK)],
    )
    titles = [item["title"] for item in analysis["publications"]]
    assert titles == [
        "Deep learning for biometric identification",
        "An unindexed workshop paper",
    ]
    assert analysis["publications"][0]["reading_priority"] == 5


def test_merge_caps_the_list_and_orders_by_year():
    works = [
        {"title": f"Paper {year}", "publication_year": year, "source_url": f"https://doi.org/{year}"}
        for year in range(2015, 2027)
    ]
    analysis: dict = {"publications": []}
    AdvisorAtlasService._merge_scholarly_publications(analysis, works)
    years = [item["publication_year"] for item in analysis["publications"]]
    assert len(years) == 8
    assert years == sorted(years, reverse=True)


# --- Billing ----------------------------------------------------------------

@pytest.mark.asyncio
async def test_each_metered_call_is_recorded_with_its_own_class(monkeypatch):
    """Two OpenAlex calls per professor must mean two charges, not one.

    AGENTS.md: an external provider call that is not billed is never
    acceptable, and the works lookup is a second real call. It is a *list*
    call though, which OpenAlex prices at a tenth of a search — so the caller
    needs the class of each call, not just how many there were.
    """
    client = OpenAlexClient()

    async def fake_get(path, params):
        if path == "authors":
            return {
                "results": [
                    {
                        "id": "https://openalex.org/A1",
                        "display_name": "Afzel Noore",
                        "works_count": 40,
                        "orcid": "0000",
                        "summary_stats": {"h_index": 12},
                        "affiliations": [
                            {"institution": {"display_name": "Texas A&M University Kingsville"}}
                        ],
                    }
                ]
            }
        return {"results": [WORK]}

    monkeypatch.setattr(client, "_get", fake_get)
    record = await client.resolve_author("Afzel Noore", "Texas A&M University Kingsville")
    assert record is not None
    works = await client.recent_works(record["author_id"])
    assert len(works) == 1
    assert client.metered_calls == ["search", "list"]
    assert client.attempted_metered_call is True


def test_a_works_lookup_is_billed_at_a_tenth_of_a_search():
    """The admin setting is the *search* price; a list call is not one.

    Billing both classes at the configured figure would double the user's
    OpenAlex charge per professor while the real cost rose by 10%.
    """
    assert METERED_CALL_COST_RATIO["search"] == 1.0
    assert METERED_CALL_COST_RATIO["list"] == pytest.approx(0.1)
    assert LIST_COST_USD * 10 == pytest.approx(SEARCH_COST_USD)


def test_each_call_class_has_its_own_ledger_source():
    """Otherwise the admin dashboard reports two author lookups per professor."""
    assert METERED_CALL_SOURCE["search"] == "openalex_author_lookup"
    assert METERED_CALL_SOURCE["list"] == "openalex_works_lookup"
    assert len(set(METERED_CALL_SOURCE.values())) == len(METERED_CALL_SOURCE)


@pytest.mark.asyncio
async def test_works_lookup_declines_when_the_budget_is_gone():
    client = OpenAlexClient()
    client.budget_exhausted = True
    assert await client.recent_works("A1") == []
    assert client.metered_calls == []
