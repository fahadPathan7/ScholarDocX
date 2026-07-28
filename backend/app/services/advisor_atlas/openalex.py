"""OpenAlex scholarly-graph client for Advisor Atlas (SCHOLARDOCX-0183).

Supplies the structured scholarly record — publication and citation counts,
h-index, publication cadence, verified topics, affiliation history — that the
dossier previously tried to reconstruct from search snippets and faculty HTML.

Three rules govern this module:

1. **Never fail a run.** Every entry point returns ``None`` or an empty result on
   any error. A missing key, an exhausted daily budget, a 429, or an outage must
   leave Advisor Atlas exactly as capable as it is without OpenAlex.
2. **Never attach the wrong person.** Author names are not unique. A weak match
   returns nothing, because showing another researcher's h-index next to a
   professor's name is a worse failure than showing no h-index at all.
3. **Never send user data.** Only the professor's name and institution — public
   facts already sent to Tavily on every run — go out. The applicant's interests,
   documents, and profile stay local; topic matching happens after results
   return.

Cost model (https://developers.openalex.org/guides/authentication): freemium,
$0.10/day of usage without a key and $1/day with a free key. Single-entity
lookups are unlimited within budget; searches are the metered part, so this
module spends at most one search per professor and prefers single-entity
lookups thereafter.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.openalex.org"
TIMEOUT_SECONDS = 12.0

# Confidence floor for accepting an author match. Below this we attach nothing.
MIN_MATCH_CONFIDENCE = 60

# Stop making metered calls once the remaining daily allowance falls to this
# fraction of the total. The daily budget is not a hard stop: OpenAlex bills
# usage beyond it against any prepaid balance, so running to zero could quietly
# cost real money. Leaving a reserve also keeps the developer's own browsing of
# openalex.org working, since the website draws on the same budget.
BUDGET_RESERVE_FRACTION = 0.05

# Per-call costs, published at
# https://developers.openalex.org/api-reference/authentication:
#   singleton (get by ID)  free
#   list+filter            $0.10 / 1,000  = $0.0001
#   search                 $1.00 / 1,000  = $0.001   <- the metered path we use
# A $1/day key therefore covers ~1,000 author resolutions per day.
SEARCH_COST_USD = 0.001
# A works lookup filtered by author id is a list+filter call, not a search:
# $0.0001, a tenth of the author resolution that precedes it.
LIST_COST_USD = 0.0001

# What each metered call class costs relative to a search. The admin-configured
# `openalex_call_cost_usd` is explicitly the *search* price (its default,
# $0.001, is OpenAlex's published per-search rate), so a list call must be
# billed at a tenth of it rather than at the same figure — otherwise fetching a
# publication list doubles the user's OpenAlex charge while raising the real
# cost by 10%.
METERED_CALL_COST_RATIO = {
    "search": 1.0,
    "list": LIST_COST_USD / SEARCH_COST_USD,
}

# Ledger source per call class, so the admin dashboard can tell an author
# resolution from a works lookup instead of reporting two of the former.
METERED_CALL_SOURCE = {
    "search": "openalex_author_lookup",
    "list": "openalex_works_lookup",
}

# Fields needed to render a publication line. Kept narrow deliberately —
# OpenAlex bills partly on payload size.
_WORK_FIELDS = ",".join(
    (
        "id",
        "doi",
        "title",
        "display_name",
        "publication_year",
        "type",
        "cited_by_count",
        "authorships",
        "primary_location",
        "open_access",
    )
)

# Trim responses; OpenAlex bills partly on payload and we need a narrow slice.
_AUTHOR_FIELDS = ",".join(
    (
        "id",
        "orcid",
        "display_name",
        "display_name_alternatives",
        "works_count",
        "cited_by_count",
        "summary_stats",
        "affiliations",
        "last_known_institutions",
        "topics",
        "counts_by_year",
        "ids",
        "works_api_url",
    )
)


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _surname(name: str) -> str:
    parts = [part for part in re.findall(r"[^\W\d_][\w'\-]*", name or "", re.UNICODE) if part]
    return parts[-1].lower() if parts else ""


def _as_int(value: Any) -> int | None:
    """Ints only when genuinely present.

    Returns ``None`` rather than 0 for a missing metric: "no h-index available"
    and "an h-index of zero" are different claims, and the dossier must not
    render the first as the second (FR-9.31).
    """
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    return None


class OpenAlexClient:
    def __init__(self, api_key: str = "", base_url: str = BASE_URL) -> None:
        self.api_key = (api_key or "").strip()
        self.base_url = base_url.rstrip("/")
        # Budget telemetry, refreshed from response headers on every call.
        self.daily_limit: float | None = None
        self.daily_remaining: float | None = None
        self.spent_usd: float = 0.0
        self.budget_exhausted = False
        # True once a metered `search` has actually been issued. This, not
        # whether a match was found, is what the caller bills on: OpenAlex
        # charges for the search regardless of whether we accepted the result.
        self.attempted_metered_call = False
        # Every metered call issued, in order, as ("search"|"list") — the two
        # OpenAlex call classes have a 10:1 published price difference, so a
        # caller cannot bill correctly from a count alone. `attempted_metered_
        # call` is kept as the boolean it always was.
        self.metered_calls: list[str] = []

    def has_budget(self) -> bool:
        """Whether a metered call is still safe to make.

        Returns False once a 429 has been seen, or once the reported remaining
        allowance drops into the reserve. Spending past the daily budget is not
        blocked by OpenAlex — it draws on any prepaid balance — so this is the
        guard that keeps enrichment from quietly costing money.
        """
        if self.budget_exhausted:
            return False
        if self.daily_remaining is None or not self.daily_limit:
            return True
        return self.daily_remaining > self.daily_limit * BUDGET_RESERVE_FRACTION

    def _record_budget(self, response: Any, payload: dict[str, Any] | None) -> None:
        """Absorb the cost signals OpenAlex returns on every response.

        Headers: X-RateLimit-Limit / -Remaining / -Credits-Used / -Reset.
        Body:    meta.cost_usd, the actual charge for this call.
        Both are best-effort — a missing or unparseable value must never break a
        request that otherwise succeeded.
        """
        headers = getattr(response, "headers", None) or {}

        def _number(value: Any) -> float | None:
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        limit = _number(headers.get("X-RateLimit-Limit"))
        remaining = _number(headers.get("X-RateLimit-Remaining"))
        if limit is not None:
            self.daily_limit = limit
        if remaining is not None:
            self.daily_remaining = remaining

        charged = _number(headers.get("X-RateLimit-Credits-Used"))
        if charged is None and isinstance(payload, dict):
            meta = payload.get("meta")
            if isinstance(meta, dict):
                charged = _number(meta.get("cost_usd"))
        if charged is not None:
            self.spent_usd += charged

        if not self.has_budget():
            logger.info(
                "OpenAlex daily budget nearly exhausted (%s of %s remaining); "
                "pausing enrichment for this run.",
                self.daily_remaining,
                self.daily_limit,
            )

    # ------------------------------------------------------------------ HTTP
    async def _get(self, path: str, params: dict[str, str]) -> dict[str, Any] | None:
        """One GET. Returns None on every failure mode, loudly logged, never raised."""
        query = dict(params)
        if self.api_key:
            query["api_key"] = self.api_key
        url = f"{self.base_url}/{path.lstrip('/')}"
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.get(url, params=query)
        except Exception as exc:
            logger.info("OpenAlex request failed (%s): %s", path, exc)
            return None

        if response.status_code == 429:
            # Daily budget exhausted, or >100 req/s. Expected operating condition
            # on the keyless tier, not an error worth surfacing. Latch it so the
            # rest of the run stops trying.
            self.budget_exhausted = True
            logger.info("OpenAlex budget/rate limit reached; skipping enrichment.")
            return None
        if response.status_code in (401, 403):
            logger.info("OpenAlex rejected credentials; continuing without enrichment.")
            return None
        if response.status_code != 200:
            logger.info("OpenAlex returned HTTP %s for %s", response.status_code, path)
            return None
        try:
            payload = response.json()
        except Exception:
            logger.info("OpenAlex returned a non-JSON body for %s", path)
            return None
        payload = payload if isinstance(payload, dict) else None
        self._record_budget(response, payload)
        return payload

    # ------------------------------------------------- Identity resolution
    def _score_candidate(
        self,
        item: dict[str, Any],
        name: str,
        institution: str,
    ) -> int:
        """Confidence that this OpenAlex author is the professor we are researching."""
        display = str(item.get("display_name") or "")
        alternatives = [str(value) for value in (item.get("display_name_alternatives") or [])]
        target = _normalize(name)
        target_surname = _surname(name)

        score = 0
        names = [_normalize(display)] + [_normalize(value) for value in alternatives]
        if target and target in names:
            score += 55
        elif target_surname and any(target_surname in value.split() for value in names):
            # Surname alone is weak — many researchers share one — so it earns
            # far less than a full-name match and cannot clear the floor by itself.
            score += 25

        given = [part for part in target.split() if part != target_surname]
        if given and any(
            any(part == token or (len(part) == 1 and token.startswith(part)) for token in value.split())
            for value in names
            for part in given
        ):
            score += 15

        if institution:
            institution_tokens = {
                token for token in _normalize(institution).split() if len(token) > 3
            }
            affiliations: list[str] = []
            for entry in item.get("last_known_institutions") or []:
                if isinstance(entry, dict):
                    affiliations.append(_normalize(str(entry.get("display_name") or "")))
            for entry in item.get("affiliations") or []:
                if isinstance(entry, dict):
                    inner = entry.get("institution")
                    if isinstance(inner, dict):
                        affiliations.append(_normalize(str(inner.get("display_name") or "")))
            if institution_tokens and any(
                institution_tokens & set(value.split()) for value in affiliations
            ):
                score += 35

        if item.get("orcid"):
            score += 5
        if (_as_int(item.get("works_count")) or 0) >= 5:
            score += 5
        return score

    async def resolve_author(
        self,
        name: str,
        institution: str = "",
    ) -> dict[str, Any] | None:
        """Find the OpenAlex author record for a professor, or None if unsure.

        Costs one metered search. Returns None below MIN_MATCH_CONFIDENCE, and
        also when the top two candidates are too close to separate — an ambiguous
        match is resolved by declining, not by guessing (FR-9.32).
        """
        if not (name or "").strip():
            return None
        if not self.has_budget():
            # Refuse the metered call rather than spending into a prepaid
            # balance. Enrichment is an enhancement; silence is the correct
            # degradation (FR-9.33).
            return None

        self.attempted_metered_call = True
        self.metered_calls.append("search")
        payload = await self._get(
            "authors",
            {"search": name, "per-page": "10", "select": _AUTHOR_FIELDS},
        )
        if not payload:
            return None
        results = payload.get("results")
        if not isinstance(results, list) or not results:
            return None

        scored = sorted(
            (
                (self._score_candidate(item, name, institution), item)
                for item in results
                if isinstance(item, dict)
            ),
            key=lambda pair: pair[0],
            reverse=True,
        )
        if not scored:
            return None

        best_score, best = scored[0]
        if best_score < MIN_MATCH_CONFIDENCE:
            logger.info(
                "OpenAlex match for %r below confidence floor (%s); attaching nothing.",
                name,
                best_score,
            )
            return None
        if len(scored) > 1 and best_score - scored[1][0] < 15:
            logger.info(
                "OpenAlex match for %r is ambiguous (%s vs %s); attaching nothing.",
                name,
                best_score,
                scored[1][0],
            )
            return None

        record = self.to_scholarly_record(best)
        if record:
            record["match_confidence"] = min(99, best_score)
        return record

    # ------------------------------------------------------------- Works
    async def recent_works(
        self,
        author_id: str,
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        """The professor's most recent indexed publications.

        SCHOLARDOCX-0191: the dossier's "Latest publications" section was
        effectively dependent on Google Scholar, whose ``robots.txt`` disallows
        ``/citations`` outright (established in SCHOLARDOCX-0188), while
        Semantic Scholar and ORCID return JavaScript shells with no text. So
        the section was empty for almost everybody. OpenAlex publishes the same
        works as structured data with DOIs, which needs no scraping and no
        model call to interpret.

        Costs one list+filter call ($0.0001), an order of magnitude cheaper
        than the author search that already ran. Returns ``[]`` on every
        failure, like the rest of this module.
        """
        identifier = str(author_id or "").strip().rsplit("/", 1)[-1]
        if not identifier or not self.has_budget():
            return []
        self.attempted_metered_call = True
        self.metered_calls.append("list")
        payload = await self._get(
            "works",
            {
                "filter": f"author.id:{identifier}",
                "sort": "publication_year:desc",
                "per-page": str(max(1, min(int(limit), 25))),
                "select": _WORK_FIELDS,
            },
        )
        if not payload:
            return []
        results = payload.get("results")
        if not isinstance(results, list):
            return []
        works = [
            shaped
            for item in results
            if isinstance(item, dict)
            for shaped in (self.to_publication(item),)
            if shaped
        ]
        return works[:limit]

    @staticmethod
    def to_publication(work: dict[str, Any]) -> dict[str, Any] | None:
        """Map an OpenAlex work onto the dossier's publication shape."""
        title = str(work.get("title") or work.get("display_name") or "").strip()
        if not title:
            return None
        doi = work.get("doi")
        landing = None
        location = work.get("primary_location")
        venue = None
        if isinstance(location, dict):
            landing = location.get("landing_page_url")
            source = location.get("source")
            if isinstance(source, dict):
                venue = str(source.get("display_name") or "").strip() or None

        authors: list[str] = []
        for entry in work.get("authorships") or []:
            if not isinstance(entry, dict):
                continue
            author = entry.get("author")
            if isinstance(author, dict):
                label = str(author.get("display_name") or "").strip()
                if label:
                    authors.append(label)

        open_access = work.get("open_access")
        oa_url = (
            open_access.get("oa_url") if isinstance(open_access, dict) else None
        )
        # Prefer a resolvable link the applicant can actually open, in order of
        # usefulness: DOI, open-access copy, publisher landing page, OpenAlex.
        source_url = (
            str(doi) if doi else oa_url or landing or str(work.get("id") or "")
        )
        if not source_url:
            return None
        return {
            "title": title,
            "authors": authors[:12],
            "publication_year": _as_int(work.get("publication_year")),
            "venue": venue,
            "doi": str(doi) if doi else None,
            "citation_count": _as_int(work.get("cited_by_count")),
            "work_type": str(work.get("type") or "").strip() or None,
            "open_access_url": oa_url,
            "source_url": source_url,
            "evidence_source": "OpenAlex",
            "relevance_reason": "Indexed publication from the verified scholarly record.",
        }

    # ------------------------------------------------------ Shaping output
    @staticmethod
    def to_scholarly_record(author: dict[str, Any]) -> dict[str, Any] | None:
        """Map an OpenAlex author object onto the dossier's shape.

        Defensive throughout: the parser has been written against the published
        schema, so every field is treated as optional and any unexpected shape
        degrades to omission rather than an exception.
        """
        if not isinstance(author, dict):
            return None
        author_id = str(author.get("id") or "").strip()
        if not author_id:
            return None

        stats = author.get("summary_stats")
        stats = stats if isinstance(stats, dict) else {}

        topics: list[dict[str, Any]] = []
        for entry in author.get("topics") or []:
            if not isinstance(entry, dict):
                continue
            label = str(entry.get("display_name") or "").strip()
            if label:
                topics.append({"name": label, "works": _as_int(entry.get("count"))})

        cadence: list[dict[str, Any]] = []
        for entry in author.get("counts_by_year") or []:
            if not isinstance(entry, dict):
                continue
            year = _as_int(entry.get("year"))
            if year is None:
                continue
            cadence.append(
                {
                    "year": year,
                    "works": _as_int(entry.get("works_count")),
                    "citations": _as_int(entry.get("cited_by_count")),
                }
            )
        cadence.sort(key=lambda item: item["year"], reverse=True)

        # affiliations[].years gives a career timeline from structured data,
        # with years — the section SCHOLARDOCX-0182 had to parse out of prose.
        affiliations: list[dict[str, Any]] = []
        for entry in author.get("affiliations") or []:
            if not isinstance(entry, dict):
                continue
            inner = entry.get("institution")
            if not isinstance(inner, dict):
                continue
            label = str(inner.get("display_name") or "").strip()
            if not label:
                continue
            years = [year for year in (_as_int(value) for value in entry.get("years") or []) if year]
            affiliations.append(
                {
                    "institution": label,
                    "ror": inner.get("ror"),
                    "country_code": inner.get("country_code"),
                    "start_year": min(years) if years else None,
                    "end_year": max(years) if years else None,
                }
            )
        affiliations.sort(key=lambda item: item.get("end_year") or 0, reverse=True)

        ids = author.get("ids")
        ids = ids if isinstance(ids, dict) else {}

        return {
            "source": "OpenAlex",
            "source_url": author_id,
            "author_id": author_id.rsplit("/", 1)[-1],
            "display_name": str(author.get("display_name") or "").strip() or None,
            "orcid": author.get("orcid") or ids.get("orcid"),
            "works_count": _as_int(author.get("works_count")),
            "cited_by_count": _as_int(author.get("cited_by_count")),
            "h_index": _as_int(stats.get("h_index")),
            "i10_index": _as_int(stats.get("i10_index")),
            "mean_citedness_2yr": stats.get("2yr_mean_citedness")
            if isinstance(stats.get("2yr_mean_citedness"), (int, float))
            else None,
            "topics": topics[:12],
            "publication_cadence": cadence[:10],
            "affiliation_history": affiliations[:10],
            "works_api_url": author.get("works_api_url"),
        }


def summarise_activity(record: dict[str, Any]) -> str:
    """One honest sentence on recent activity, or empty when unsupported.

    Answers the question no faculty page states and applicants care about most:
    is this lab publishing right now. Uses only the retrieved counts — no
    extrapolation, and silence when there is not enough data to say anything.
    """
    cadence = record.get("publication_cadence") or []
    recent = [entry for entry in cadence if entry.get("works") is not None][:3]
    if len(recent) < 2:
        return ""
    years = ", ".join(f"{entry['year']}: {entry['works']}" for entry in recent)
    total = sum(entry["works"] for entry in recent)
    if total == 0:
        return f"No indexed publications in the last {len(recent)} years ({years})."
    return f"Indexed publications by year — {years}."
