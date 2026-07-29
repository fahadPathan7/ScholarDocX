"""OpenAlex scholarly-graph client tests (SCHOLARDOCX-0183).

IMPORTANT — these fixtures are built from the published OpenAlex schema
(https://developers.openalex.org/api-reference/authors/get-a-single-author),
NOT captured from a live response. The parser has never seen real API output.
Before trusting this in production, run one real query and diff the shape.
See the task's Completion Notes.
"""

from typing import Any

import pytest

from app.services.advisor_atlas.openalex import (
    MIN_MATCH_CONFIDENCE,
    OpenAlexClient,
    summarise_activity,
)


def author_fixture(**overrides: Any) -> dict[str, Any]:
    base = {
        "id": "https://openalex.org/A5023888391",
        "orcid": "https://orcid.org/0000-0002-1825-0097",
        "display_name": "Elena Vasquez",
        "display_name_alternatives": ["E. Vasquez", "Elena M. Vasquez"],
        "works_count": 84,
        "cited_by_count": 3120,
        "summary_stats": {"2yr_mean_citedness": 4.2, "h_index": 29, "i10_index": 61},
        "affiliations": [
            {
                "institution": {
                    "id": "https://openalex.org/I1",
                    "display_name": "Example University",
                    "ror": "https://ror.org/01abcde11",
                    "country_code": "US",
                    "type": "education",
                },
                "years": [2018, 2019, 2020],
            },
            {
                "institution": {
                    "id": "https://openalex.org/I2",
                    "display_name": "Yale University",
                    "ror": "https://ror.org/03v76x132",
                    "country_code": "US",
                    "type": "education",
                },
                "years": [2011, 2012],
            },
        ],
        "last_known_institutions": [
            {"id": "https://openalex.org/I1", "display_name": "Example University"}
        ],
        "topics": [
            {"id": "T1", "display_name": "Labour Economics", "count": 31},
            {"id": "T2", "display_name": "Applied Microeconometrics", "count": 18},
        ],
        "counts_by_year": [
            {"year": 2024, "works_count": 6, "cited_by_count": 410},
            {"year": 2025, "works_count": 9, "cited_by_count": 505},
            {"year": 2023, "works_count": 4, "cited_by_count": 350},
        ],
        "ids": {"openalex": "https://openalex.org/A5023888391"},
        "works_api_url": "https://api.openalex.org/works?filter=author.id:A5023888391",
    }
    base.update(overrides)
    return base


class StubClient(OpenAlexClient):
    """Replaces only the HTTP layer, so scoring and parsing are exercised for real."""

    def __init__(self, payload: dict[str, Any] | None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.payload = payload
        self.calls: list[tuple[str, dict[str, str]]] = []

    async def _get(self, path: str, params: dict[str, str]) -> dict[str, Any] | None:
        self.calls.append((path, params))
        return self.payload


# ── Parsing ──────────────────────────────────────────────────────────────────


def test_scholarly_record_maps_the_documented_schema():
    record = OpenAlexClient.to_scholarly_record(author_fixture())
    assert record is not None
    assert record["author_id"] == "A5023888391"
    assert record["h_index"] == 29
    assert record["i10_index"] == 61
    assert record["cited_by_count"] == 3120
    assert [topic["name"] for topic in record["topics"]] == [
        "Labour Economics",
        "Applied Microeconometrics",
    ]
    # Cadence is sorted newest-first regardless of the order the API returns.
    assert [entry["year"] for entry in record["publication_cadence"]] == [2025, 2024, 2023]
    # affiliations[].years collapses to a real timeline, most recent first.
    assert record["affiliation_history"][0]["institution"] == "Example University"
    assert record["affiliation_history"][0]["start_year"] == 2018
    assert record["affiliation_history"][1]["institution"] == "Yale University"


def test_missing_metrics_are_absent_not_zero():
    """"No h-index available" and "an h-index of zero" are different claims."""
    record = OpenAlexClient.to_scholarly_record(author_fixture(summary_stats={}))
    assert record["h_index"] is None
    assert record["i10_index"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {},                                   # no id
        {"id": ""},                           # empty id
        {"id": "https://openalex.org/A1", "topics": "not-a-list"},
        {"id": "https://openalex.org/A1", "counts_by_year": [{"year": None}]},
        {"id": "https://openalex.org/A1", "affiliations": [{"institution": None}]},
        {"id": "https://openalex.org/A1", "summary_stats": "unexpected"},
    ],
)
def test_malformed_payloads_degrade_instead_of_raising(payload):
    """The parser was written against docs, not a live response, so every field
    is treated as optional and any surprise shape must not raise."""
    result = OpenAlexClient.to_scholarly_record(payload)
    assert result is None or isinstance(result, dict)


def test_non_dict_input_is_rejected():
    assert OpenAlexClient.to_scholarly_record(None) is None
    assert OpenAlexClient.to_scholarly_record(["nope"]) is None


# ── Identity resolution ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_confident_name_and_institution_match_resolves():
    client = StubClient({"results": [author_fixture()]})
    record = await client.resolve_author("Elena Vasquez", "Example University")
    assert record is not None
    assert record["match_confidence"] >= MIN_MATCH_CONFIDENCE
    assert record["h_index"] == 29


@pytest.mark.asyncio
async def test_surname_only_match_is_not_enough():
    """Many researchers share a surname; attaching the wrong person's citation
    profile is worse than attaching none (FR-9.32)."""
    other = author_fixture(
        display_name="Ricardo Vasquez",
        display_name_alternatives=[],
        orcid=None,
        last_known_institutions=[
            {"id": "https://openalex.org/I9", "display_name": "Unrelated Polytechnic"}
        ],
        affiliations=[],
    )
    client = StubClient({"results": [other]})
    assert await client.resolve_author("Elena Vasquez", "Example University") is None


@pytest.mark.asyncio
async def test_ambiguous_top_two_candidates_resolve_to_nothing():
    twin = author_fixture(id="https://openalex.org/A999")
    client = StubClient({"results": [author_fixture(), twin]})
    assert await client.resolve_author("Elena Vasquez", "Example University") is None


@pytest.mark.asyncio
async def test_empty_or_missing_results_resolve_to_nothing():
    assert await StubClient({"results": []}).resolve_author("Elena Vasquez") is None
    assert await StubClient({}).resolve_author("Elena Vasquez") is None
    assert await StubClient(None).resolve_author("Elena Vasquez") is None


@pytest.mark.asyncio
async def test_blank_name_makes_no_request():
    client = StubClient({"results": [author_fixture()]})
    assert await client.resolve_author("   ", "Example University") is None
    assert client.calls == [], "a metered search was spent on an empty name"


@pytest.mark.asyncio
async def test_no_user_data_is_sent_outbound():
    """Only the professor's name and institution may leave the machine."""
    client = StubClient({"results": [author_fixture()]})
    await client.resolve_author("Elena Vasquez", "Example University")
    _, params = client.calls[0]
    assert params["search"] == "Elena Vasquez"
    serialised = " ".join(f"{key}={value}" for key, value in params.items())
    for forbidden in ("interest", "sop", "statement", "cv", "profile", "@"):
        assert forbidden not in serialised.lower()


@pytest.mark.asyncio
async def test_api_key_is_attached_only_when_configured():
    keyed = OpenAlexClient(api_key="secret-key")
    unkeyed = OpenAlexClient()
    assert keyed.api_key == "secret-key"
    assert unkeyed.api_key == ""


# ── Degradation ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 403, 429, 500, 503])
async def test_http_failures_return_none_rather_than_raising(status, monkeypatch):
    """Missing key, exhausted daily budget, rate limit and outage must all leave
    the run exactly as capable as it is without OpenAlex (FR-9.33)."""

    class FakeResponse:
        status_code = status

        def json(self):  # pragma: no cover - not reached for error codes
            raise AssertionError("body should not be parsed on an error status")

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, params=None):
            return FakeResponse()

    monkeypatch.setattr(
        "app.services.advisor_atlas.openalex.httpx.AsyncClient", FakeAsyncClient
    )
    assert await OpenAlexClient().resolve_author("Elena Vasquez") is None


@pytest.mark.asyncio
async def test_network_error_returns_none(monkeypatch):
    class ExplodingClient:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("dns failure")

    monkeypatch.setattr(
        "app.services.advisor_atlas.openalex.httpx.AsyncClient", ExplodingClient
    )
    assert await OpenAlexClient().resolve_author("Elena Vasquez") is None


# ── Activity summary ─────────────────────────────────────────────────────────


def test_activity_summary_reports_only_retrieved_counts():
    record = OpenAlexClient.to_scholarly_record(author_fixture())
    summary = summarise_activity(record)
    assert "2025: 9" in summary
    assert "2024: 6" in summary


def test_activity_summary_is_silent_without_enough_data():
    record = OpenAlexClient.to_scholarly_record(author_fixture(counts_by_year=[]))
    assert summarise_activity(record) == ""


def test_activity_summary_calls_out_a_dormant_record():
    record = OpenAlexClient.to_scholarly_record(
        author_fixture(
            counts_by_year=[
                {"year": 2025, "works_count": 0, "cited_by_count": 12},
                {"year": 2024, "works_count": 0, "cited_by_count": 20},
            ]
        )
    )
    assert "No indexed publications" in summarise_activity(record)


# ── Budget guard (SCHOLARDOCX-0183) ──────────────────────────────────────────
#
# OpenAlex does NOT hard-stop at the daily budget: usage beyond it draws on any
# prepaid balance. So overspending can cost real money, and the guard below is
# what prevents it. Per-call costs are published as: singleton free,
# list+filter $0.10/1,000, search $1/1,000.


class BudgetClient(OpenAlexClient):
    """Drives the real header-parsing and guard logic with canned responses."""

    def __init__(self, headers: dict[str, str], meta_cost: float | None = None, **kw: Any):
        super().__init__(**kw)
        self._headers = headers
        self._meta_cost = meta_cost
        self.requests = 0

    async def _get(self, path: str, params: dict[str, str]) -> dict[str, Any] | None:
        self.requests += 1

        class FakeResponse:
            headers = self._headers

        payload: dict[str, Any] = {"results": [author_fixture()]}
        if self._meta_cost is not None:
            payload["meta"] = {"cost_usd": self._meta_cost}
        self._record_budget(FakeResponse(), payload)
        return payload


def test_budget_starts_available_when_nothing_is_known():
    assert OpenAlexClient().has_budget()


def test_budget_guard_trips_when_remaining_enters_the_reserve():
    client = BudgetClient({"X-RateLimit-Limit": "1.0", "X-RateLimit-Remaining": "0.01"})
    assert client.has_budget()  # nothing observed yet

    class FakeResponse:
        headers = {"X-RateLimit-Limit": "1.0", "X-RateLimit-Remaining": "0.01"}

    client._record_budget(FakeResponse(), None)
    assert not client.has_budget(), "guard failed to trip inside the reserve"


def test_budget_guard_stays_open_with_headroom():
    client = OpenAlexClient()

    class FakeResponse:
        headers = {"X-RateLimit-Limit": "1.0", "X-RateLimit-Remaining": "0.9"}

    client._record_budget(FakeResponse(), None)
    assert client.has_budget()


@pytest.mark.asyncio
async def test_exhausted_budget_blocks_the_metered_call_entirely():
    client = BudgetClient({"X-RateLimit-Limit": "1.0", "X-RateLimit-Remaining": "0.0"})
    client.budget_exhausted = True
    assert await client.resolve_author("Elena Vasquez", "Example University") is None
    assert client.requests == 0, "spent a metered search with no budget"
    assert client.attempted_metered_call is False, "would have billed the user"


@pytest.mark.asyncio
async def test_429_latches_so_the_rest_of_the_run_stops_trying(monkeypatch):
    class FakeResponse:
        status_code = 429
        headers: dict[str, str] = {}

    class FakeAsyncClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, params=None):
            return FakeResponse()

    monkeypatch.setattr(
        "app.services.advisor_atlas.openalex.httpx.AsyncClient", FakeAsyncClient
    )
    client = OpenAlexClient()
    assert await client.resolve_author("Elena Vasquez") is None
    assert client.budget_exhausted is True
    assert not client.has_budget()


def test_cost_is_taken_from_meta_when_the_header_is_absent():
    client = OpenAlexClient()

    class FakeResponse:
        headers: dict[str, str] = {}

    client._record_budget(FakeResponse(), {"meta": {"cost_usd": 0.001}})
    assert client.spent_usd == pytest.approx(0.001)


def test_unparseable_budget_signals_are_ignored_not_fatal():
    client = OpenAlexClient()

    class FakeResponse:
        headers = {"X-RateLimit-Limit": "nonsense", "X-RateLimit-Remaining": None}

    client._record_budget(FakeResponse(), {"meta": {"cost_usd": "not-a-number"}})
    assert client.daily_limit is None
    assert client.spent_usd == 0.0
    assert client.has_budget()


# ── Billing hook (charged per metered call, not per match) ───────────────────


@pytest.mark.asyncio
async def test_metered_call_is_flagged_even_when_no_match_is_accepted():
    """OpenAlex bills the search whether or not we accept the result, so the
    user must be charged on the call — not on a successful match."""
    twin = author_fixture(id="https://openalex.org/A999")
    client = StubClient({"results": [author_fixture(), twin]})
    assert await client.resolve_author("Elena Vasquez", "Example University") is None
    assert client.attempted_metered_call is True, "an issued search would go unbilled"


@pytest.mark.asyncio
async def test_blank_name_is_never_billable():
    client = StubClient({"results": [author_fixture()]})
    await client.resolve_author("")
    assert client.attempted_metered_call is False
