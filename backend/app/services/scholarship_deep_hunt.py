"""Scholarship Hunt deep search runs (SCHOLARDOCX-0175 v2 restructure).

A run takes one free-text funding goal (optionally scoped by degree level /
destinations / intake term / field of study) and runs a bounded, persisted,
resumable search -> hard-filter -> crawl -> extract -> relevance-filter loop,
producing several evidence-backed results stored on the run itself
(`results_json`). SCHOLARDOCX-0178: results are NOT auto-saved into
`scholarship_opportunities` — the user explicitly picks which ones to keep
via `POST /scholarship-deep-hunt/runs/{id}/results/save`.

This is the ONLY search surface in Scholarship Hunt as of SCHOLARDOCX-0175.
The former filter-based "Hunt" tab and its query-building machinery are
deleted; this single deep pipeline replaces both.

This composes existing pieces rather than a parallel subsystem:
- Web search uses `BraveSearchService` (SCHOLARDOCX-0175; replaces Tavily).
  Tavily remains only for /ai/research.
- Crawling reuses `app.services.advisor_atlas.crawler.PublicCrawler`
  (politeness/robots handling already built for Advisor Atlas).
- Extraction reuses `scholarship_extraction_service` (the "Analyze"
  extraction, same anti-hallucination contract: missing stays missing).
- The explicit "save result" endpoint (`app/api/scholarship_deep_hunt.py`)
  reuses `upsert_scholarship_opportunity` (insert-or-update-by-normalized-URL
  logic, including the Opportunity Library's 100-entry cap).
- Run lifecycle (progress_json, cancellation, resume) mirrors
  `AdvisorAtlasRepository`/`AdvisorAtlasService`.

Cost model (SCHOLARDOCX-0175): per-hit user billing. Each Brave result
scanned is charged at the admin-configured `brave_call_cost_per_hit_usd`
(default $0.015), pre-flighted at worst case (4 passes x 20 = 80 hits)
before the run starts. Extraction calls are AI-token-metered separately.
"""

from __future__ import annotations

from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
import json
import logging
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings
from app.db.legacy_db import legacy_session
from app.services.advisor_atlas.crawler import PublicCrawler, canonicalize_url
from app.services.ai import AiService
from app.services.brave_search_service import BraveSearchService
from app.services.deep_hunt_query_planner import (
    DeepHuntQueryPlanner,
    DeepHuntRelevanceFilter,
)
from app.services.news_service import (
    _has_explicit_closed_status,
    _is_stale_cycle,
)
from app.services.news_filter_rules import (
    matches_destinations,
    has_conflicting_fields,
)
from app.services.scholarship_catalog import normalize_url
from app.services.scholarship_extraction import scholarship_extraction_service

logger = logging.getLogger(__name__)

STAGES = ["planning", "searching", "crawling", "extracting", "completed"]

# SCHOLARDOCX-0175 (tuned): funnel ends at the crawl/extract budget (12), so
# there is no value in scanning 40 raw hits just to throw 28 away. 2 passes ×
# 8 results = 16 raw hits, of which ~12 survive hard filters and feed the
# crawl/extract cap. Every scanned source now has a real chance of being
# vetted, and per-pass dup-billing is halved vs the 4-pass config.
SEARCH_PASSES = 2
MAX_RESULTS_PER_PASS = 8
MAX_CRAWL_PAGES = 12
MAX_EXTRACTIONS = 12

# SCHOLARDOCX-0175: per-hit billing worst case. Computed from the actual
# per-pass caps (PASSES × RESULTS), so the pre-flight checks users against
# the real ceiling — not a stale hardcoded number.
MAX_RAW_HITS_PER_RUN = SEARCH_PASSES * MAX_RESULTS_PER_PASS

# SCHOLARDOCX-0178: "Previous Searches" keeps at most this many runs per user.
# Starting a new search past the cap deletes the oldest run first (FIFO).
# Saved Library opportunities from an evicted run are detached, not deleted.
MAX_STORED_RUNS = 10

# Relevance floor below which an extracted opportunity is rejected as off-topic
# (planner LLM verdict <= 0.25, or deterministic heuristic score 0.1).
# SCHOLARDOCX-0177: raised from 0.3 -> 0.4. A run's biggest quality complaint
# was not "off-topic" results (those were already rejected) but generic,
# near-duplicate ones that cleared a low bar without being a close match.
RELEVANCE_FLOOR = 0.4

_YEAR_RANGE_RE = re.compile(r"\b(?:19|20)\d{2}\s*[-–/]\s*(?:19|20)?\d{2,4}\b")
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")


def _dedup_key(canonical_name: str) -> str:
    """Coarse dedup key for collapsing near-duplicate scholarship titles.

    SCHOLARDOCX-0177: a single generic program (e.g. "Erasmus Mundus Joint
    Master's Scholarship") is often described by several low-signal source
    pages whose titles differ only by year, plural/possessive punctuation, or
    filler words ("...Scholarships 2026" vs "...Scholarship 2026-2027" vs
    "...Scholarship"). Stripping those trivial differences lets the run
    collapse them into one entry. Distinctly-named programs (e.g. a specific
    joint-master consortium acronym) keep their own key because their core
    wording differs, not just the year/punctuation.
    """
    text = (canonical_name or "").casefold().replace("’", "").replace("'", "")
    text = _YEAR_RANGE_RE.sub(" ", text)
    text = _YEAR_RE.sub(" ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\bscholarships\b", "scholarship", text)
    text = re.sub(r"\bprogrammes\b", "programme", text)
    text = re.sub(r"\bprograms\b", "program", text)
    return re.sub(r"\s+", " ", text).strip()


def _extraction_completeness(extracted: dict[str, Any]) -> int:
    """Rough count of populated evidence fields, used as a dedup tie-breaker
    so the most informative extraction wins when two sources tie on
    relevance."""
    funding = extracted.get("funding") or {}
    signals = (
        extracted.get("sponsor"),
        extracted.get("fields_of_study"),
        extracted.get("destination_countries"),
        extracted.get("deadlines"),
        extracted.get("requirements"),
        funding.get("coverage") or funding.get("notes"),
    )
    return sum(1 for value in signals if value)


def _is_better_candidate(candidate: dict[str, Any], current: dict[str, Any]) -> bool:
    if candidate["relevance"] != current["relevance"]:
        return candidate["relevance"] > current["relevance"]
    return _extraction_completeness(candidate["extracted"]) > _extraction_completeness(current["extracted"])


def estimate_run_cost(session) -> dict[str, Any]:
    """Worst-case cost estimate for one Scholarship Hunt run (SCHOLARDOCX-0175).

    Returns the max sources scanned and max credits (tokens) a run could cost,
    used for the pre-flight balance check and the user-facing estimate shown
    before submit. Actual charges scale with real Brave hits per pass.
    """
    from app.services.ai_tokens import get_brave_call_cost_per_hit_usd, get_token_rate

    per_hit_cost = get_brave_call_cost_per_hit_usd(session)
    token_rate = get_token_rate(session)
    max_credits = math.ceil(MAX_RAW_HITS_PER_RUN * per_hit_cost * token_rate)
    return {
        "max_sources": MAX_RAW_HITS_PER_RUN,
        "max_credits": max_credits,
        "per_hit_cost_usd": per_hit_cost,
    }

JSON_FIELDS = {"destinations_json", "progress_json"}


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def _decode_row(row: Any) -> dict[str, Any]:
    item = dict(row)
    for field in JSON_FIELDS:
        if field in item and isinstance(item[field], str):
            try:
                item[field.removesuffix("_json")] = safe_json_loads(item[field], default=[])
            except (TypeError, ValueError):
                item[field.removesuffix("_json")] = {} if item[field].startswith("{") else []
            del item[field]
    # results_json is deliberately not auto-decoded here: get_run builds the
    # enriched `results` list itself (with live in_library flags), and
    # list_runs has no use for the raw blob, so it's just dropped.
    item.pop("results_json", None)
    return item


class ScholarshipDeepHuntRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def create_run(self, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        with legacy_session(self.database_url) as db:
            # SCHOLARDOCX-0178: FIFO-cap "Previous Searches" at MAX_STORED_RUNS.
            self._evict_oldest_over_cap(db, user_id)
            cursor = db.execute(
                """
                INSERT INTO scholarship_deep_hunt_runs (
                    user_id, goal, degree_level, destinations_json, intake_term,
                    fields_of_study, progress_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    payload["goal"],
                    payload.get("degree_level"),
                    _json(payload.get("destinations", [])),
                    payload.get("intake_term"),
                    payload.get("field_of_study"),
                    _json({"completed": 0, "total": None, "message": "Queued"}),
                ),
            )
            db.commit()
            return self.get_run(str(cursor.lastrowid), user_id, include_opportunities=False)

    def list_runs(self, user_id: str) -> list[dict[str, Any]]:
        with legacy_session(self.database_url) as db:
            rows = db.execute(
                """
                SELECT r.*, COUNT(o.id) AS live_opportunity_count
                FROM scholarship_deep_hunt_runs r
                LEFT JOIN scholarship_opportunities o ON o.deep_hunt_run_id = r.id
                WHERE r.user_id = ?
                GROUP BY r.id
                ORDER BY r.created_at DESC
                """,
                (user_id,),
            ).fetchall()
            return [_decode_row(row) for row in rows]

    def get_run(self, run_id: str, user_id: str, include_opportunities: bool = True) -> dict[str, Any]:
        with legacy_session(self.database_url) as db:
            row = db.execute(
                "SELECT * FROM scholarship_deep_hunt_runs WHERE id = ? AND user_id = ?",
                (run_id, user_id),
            ).fetchone()
            if not row:
                raise LookupError("Deep Hunt run not found.")
            raw_results_json = row.get("results_json", "[]")
            result = _decode_row(row)
            if include_opportunities:
                # SCHOLARDOCX-0178: results live on the run row (no auto-save).
                # `in_library`/`opportunity_id` are computed live against the
                # user's saved opportunities, same pattern as the Catalog's
                # `in_library` badge, so a re-opened run correctly reflects
                # anything saved since it last completed.
                stored_results = safe_json_loads(raw_results_json, default=[])
                owned = {
                    saved["normalized_url"]: saved["id"]
                    for saved in db.execute(
                        "SELECT id, normalized_url FROM scholarship_opportunities WHERE user_id = ?",
                        (user_id,),
                    ).fetchall()
                }
                results = []
                for item in stored_results:
                    entry = dict(item)
                    opportunity_id = owned.get(entry.get("normalized_url"))
                    entry["in_library"] = opportunity_id is not None
                    entry["opportunity_id"] = opportunity_id
                    results.append(entry)
                results.sort(key=lambda r: r.get("relevance_score") or 0, reverse=True)
                result["results"] = results
            return result

    def update_run(self, run_id: str, **values: Any) -> None:
        if not values:
            return
        allowed = {
            "status", "current_stage", "progress_json", "result_count",
            "error_message", "started_at", "completed_at", "cancelled_at",
            "results_json",
        }
        clean = {key: value for key, value in values.items() if key in allowed}
        for json_field in ("progress_json", "results_json"):
            if json_field in clean and not isinstance(clean[json_field], str):
                clean[json_field] = _json(clean[json_field])
        assignments = [f"{key} = ?" for key in clean]
        assignments.append("updated_at = CURRENT_TIMESTAMP")
        params = [*clean.values(), run_id]
        with legacy_session(self.database_url) as db:
            db.execute(
                f"UPDATE scholarship_deep_hunt_runs SET {', '.join(assignments)} WHERE id = ?",
                params,
            )
            db.commit()

    def is_cancelled(self, run_id: str) -> bool:
        with legacy_session(self.database_url) as db:
            row = db.execute(
                "SELECT status FROM scholarship_deep_hunt_runs WHERE id = ?",
                (run_id,),
            ).fetchone()
            return not row or row["status"] == "cancelled"

    def cancel_run(self, run_id: str, user_id: str) -> dict[str, Any]:
        with legacy_session(self.database_url) as db:
            cursor = db.execute(
                """
                UPDATE scholarship_deep_hunt_runs
                SET status = 'cancelled', current_stage = 'cancelled',
                    cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ? AND status IN ('queued', 'running', 'failed')
                """,
                (run_id, user_id),
            )
            if cursor.rowcount == 0:
                existing = db.execute(
                    "SELECT id FROM scholarship_deep_hunt_runs WHERE id = ? AND user_id = ?",
                    (run_id, user_id),
                ).fetchone()
                if not existing:
                    raise LookupError("Deep Hunt run not found.")
            db.commit()
        return self.get_run(run_id, user_id, include_opportunities=False)

    def prepare_resume(self, run_id: str, user_id: str) -> dict[str, Any]:
        run = self.get_run(run_id, user_id, include_opportunities=False)
        if run["status"] not in {"failed", "cancelled"}:
            raise ValueError("Only failed or cancelled runs can be resumed.")
        with legacy_session(self.database_url) as db:
            db.execute(
                """
                UPDATE scholarship_deep_hunt_runs
                SET status = 'queued', current_stage = 'queued', error_message = NULL,
                    cancelled_at = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
                """,
                (run_id, user_id),
            )
            db.commit()
        return self.get_run(run_id, user_id, include_opportunities=False)

    def delete_run(self, run_id: str, user_id: str) -> bool:
        with legacy_session(self.database_url) as db:
            # Verify ownership first without deleting anything
            row = db.execute(
                "SELECT id FROM scholarship_deep_hunt_runs WHERE id = ? AND user_id = ?",
                (run_id, user_id),
            ).fetchone()
            if not row:
                return False
            self._detach_saved_opportunities(db, run_id)
            db.execute(
                "DELETE FROM scholarship_deep_hunt_runs WHERE id = ? AND user_id = ?",
                (run_id, user_id),
            )
            db.commit()
            return True

    @staticmethod
    def _detach_saved_opportunities(db: Any, run_id: str) -> None:
        """Clear `deep_hunt_run_id` on any opportunities the user explicitly
        saved from this run (SCHOLARDOCX-0178), satisfying the FK constraint
        (`scholarship_opportunities.deep_hunt_run_id -> ...runs.id`) without
        deleting a saved, user-curated Library entry just because its source
        run is being removed — deleting or FIFO-evicting old runs must never
        delete something the user chose to keep.
        """
        db.execute(
            "UPDATE scholarship_opportunities SET deep_hunt_run_id = NULL WHERE deep_hunt_run_id = ?",
            (run_id,),
        )

    def _evict_oldest_over_cap(self, db: Any, user_id: str) -> None:
        """FIFO-evict the oldest runs so the user never has more than
        MAX_STORED_RUNS - 1 before a new one is inserted (SCHOLARDOCX-0178:
        "Previous Searches" is capped at 10; starting an 11th search deletes
        the oldest first). Saved opportunities from evicted runs are
        detached, not deleted (see `_detach_saved_opportunities`).
        """
        overflow = db.execute(
            """
            SELECT id FROM scholarship_deep_hunt_runs
            WHERE user_id = ?
            ORDER BY created_at DESC
            OFFSET ?
            """,
            (user_id, MAX_STORED_RUNS - 1),
        ).fetchall()
        for row in overflow:
            self._detach_saved_opportunities(db, row["id"])
            db.execute("DELETE FROM scholarship_deep_hunt_runs WHERE id = ?", (row["id"],))


def _fallback_queries(run: dict[str, Any]) -> list[str]:
    """Deterministic baseline queries (SCHOLARDOCX-0173 fallback).

    These are the original hard-coded templates: the goal verbatim plus a few
    suffixes. The intent planner (`DeepHuntQueryPlanner`) improves on them
    (acronym expansion, facet decomposition) and falls back to these when
    OpenRouter is unavailable or returns unusable output, so a run never
    hard-fails on an AI outage.
    """
    goal = str(run.get("goal") or "").strip()
    facets = []
    if run.get("degree_level"):
        facets.append(str(run["degree_level"]))
    destinations = run.get("destinations") or []
    if destinations:
        facets.append(" ".join(str(d) for d in destinations[:3]))
    if run.get("intake_term"):
        facets.append(str(run["intake_term"]))
    facet_str = " ".join(facets)

    candidates = [f"{goal} scholarship funding official application"]
    if facet_str:
        candidates.append(f"{goal} {facet_str} scholarship deadline eligibility")
    candidates.append(f"{goal} scholarship deadline requirements official portal")

    seen: set[str] = set()
    queries: list[str] = []
    for query in candidates:
        key = query.strip().lower()
        if key and key not in seen:
            seen.add(key)
            queries.append(query.strip())
    return queries[:SEARCH_PASSES]


def _is_acceptable(extracted: dict[str, Any], relevance_score: float = 1.0) -> bool:
    """Well-formedness gate + relevance precondition (SCHOLARDOCX-0173).

    A result must (a) have a canonical name, (b) carry a deadline or funding
    signal, AND (c) clear the relevance floor so off-topic pages are rejected
    even when they are well-formed. ``relevance_score`` defaults to 1.0 so
    callers that pre-date the intent filter (and tests) keep the old behaviour.
    """
    if relevance_score < RELEVANCE_FLOOR:
        return False
    if not extracted.get("canonical_name"):
        return False
    funding = extracted.get("funding") or {}
    has_funding_signal = bool(funding.get("coverage")) or bool(funding.get("notes"))
    return bool(extracted.get("deadlines")) or has_funding_signal


class ScholarshipDeepHuntService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repository = ScholarshipDeepHuntRepository(settings.database_target)
        self.crawler = PublicCrawler()
        self.ai_service = AiService(settings)
        # SCHOLARDOCX-0173: intent-aware query planning + relevance filtering,
        # so results match the user's goal instead of leaning entirely on raw
        # search output. Both fall back deterministically.
        self.query_planner = DeepHuntQueryPlanner(settings)
        self.relevance_filter = DeepHuntRelevanceFilter(settings)
        # SCHOLARDOCX-0175: Brave replaces Tavily as the search provider.
        self.brave = BraveSearchService(settings)

    async def _plan_queries(self, run: dict[str, Any]) -> tuple[list[str], list[str]]:
        """Ask the intent planner for diverse, acronym-expanded queries.

        Returns ``(queries, field_synonyms)``. The synonyms feed the
        relevance filter's deterministic fallback so field matching still
        works even when the relevance LLM call later fails.
        """
        goal = str(run.get("goal") or "").strip()
        fallback = _fallback_queries(run)
        plan = await self.query_planner.plan(
            goal,
            degree_level=run.get("degree_level"),
            destinations=run.get("destinations") or [],
            intake_term=run.get("intake_term"),
            field_of_study=run.get("fields_of_study"),
            fallback_queries=fallback,
        )
        return plan["queries"][:SEARCH_PASSES], plan.get("field_synonyms") or []

    async def run(self, run_id: str, user_id: str) -> None:
        run = self.repository.get_run(run_id, user_id, include_opportunities=False)
        billing_session = None
        try:
            from app.db.connection import get_engine
            from sqlalchemy.orm import sessionmaker
            from app.services.ai_tokens import load_user_dict

            billing_session = sessionmaker(
                autocommit=False, autoflush=False, bind=get_engine(self.settings.database_target)
            )()
            self.ai_service.set_billing(load_user_dict(user_id, billing_session), billing_session)

            self.repository.update_run(
                run_id,
                status="running",
                current_stage="planning",
                started_at=datetime.now(timezone.utc).isoformat(),
                progress_json={
                    "completed": 0,
                    "total": None,
                    "message": "Planning search passes",
                    "sources_scanned": 0,
                    "sources_filtered": 0,
                    "opportunities_extracted": 0,
                },
            )
            # SCHOLARDOCX-0173: intent-aware query planning (acronym expansion,
            # facet decomposition) with a deterministic fallback.
            queries, field_synonyms = await self._plan_queries(run)

            if self.repository.is_cancelled(run_id):
                return

            self.repository.update_run(
                run_id,
                current_stage="searching",
                progress_json={
                    "completed": 0,
                    "total": len(queries),
                    "message": "Searching for opportunities",
                    "sources_scanned": 0,
                    "sources_filtered": 0,
                    "opportunities_extracted": 0,
                },
            )
            # SCHOLARDOCX-0175: Brave search + per-hit billing + hard-filter.
            # Each pass charges the user for the raw Brave results scanned
            # (before filtering), per the per-hit billing contract. Hard
            # filters then reject pages that explicitly contradict intent
            # (closed status, stale cycle, destination/field mismatch),
            # retiring FR-8.27's no-filter rule.
            from app.services.ai_tokens import (
                charge_flat_fee,
                get_brave_call_cost_per_hit_usd,
                get_token_rate,
            )

            per_hit_cost = get_brave_call_cost_per_hit_usd(billing_session)
            results: dict[str, dict[str, Any]] = {}
            total_scanned = 0
            for index, query in enumerate(queries):
                if self.repository.is_cancelled(run_id):
                    return
                pass_items = await self._brave_search(query, MAX_RESULTS_PER_PASS)
                # Per-hit billing: charge for every raw result this pass
                # returned, before any filtering. Brave bills us per result
                # too, so this matches our upstream cost shape.
                hits_this_pass = len(pass_items)
                if hits_this_pass > 0:
                    charge_flat_fee(
                        load_user_dict(user_id, billing_session),
                        billing_session,
                        hits_this_pass * per_hit_cost,
                        source="scholarship_hunt_hit",
                    )
                total_scanned += hits_this_pass
                for item in pass_items:
                    canon = canonicalize_url(item["url"])
                    if canon not in results:
                        results[canon] = item
                self.repository.update_run(
                    run_id,
                    progress_json={
                        "completed": index + 1,
                        "total": len(queries),
                        "message": f"Completed search pass {index + 1} of {len(queries)}",
                        "sources_scanned": total_scanned,
                        "sources_filtered": 0,
                        "opportunities_extracted": 0,
                    },
                )
            # SCHOLARDOCX-0175: hard filters (FR-8.27 retirement). Deterministic,
            # free, never invent — they only reject pages that explicitly
            # contradict the user's intent. The relevance filter later handles
            # softer (AI-judged) on-topic scoring.
            selected_destinations = run.get("destinations") or []
            selected_fields_raw = run.get("fields_of_study")
            selected_fields = (
                [selected_fields_raw] if isinstance(selected_fields_raw, str) and selected_fields_raw else []
            )
            today = datetime.now(timezone.utc).date()
            filtered: dict[str, dict[str, Any]] = {}
            for canon, item in results.items():
                article = {
                    "title": item.get("title") or "",
                    "description": item.get("content") or item.get("description") or "",
                    "content": item.get("content") or "",
                    "link": item.get("url") or "",
                }
                if _has_explicit_closed_status(article):
                    continue
                if _is_stale_cycle(article, today):
                    continue
                if selected_destinations and not matches_destinations(article, selected_destinations):
                    continue
                if selected_fields and has_conflicting_fields(article, selected_fields):
                    continue
                filtered[canon] = item
            total_filtered = len(filtered)
            ranked_results = sorted(
                filtered.values(),
                key=lambda item: item.get("score") or item.get("_search_score") or 0,
                reverse=True,
            )
            if self.repository.is_cancelled(run_id):
                return
            if not ranked_results:
                self.repository.update_run(
                    run_id,
                    status="completed",
                    current_stage="completed",
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    result_count=0,
                    progress_json={
                        "completed": len(queries),
                        "total": len(queries),
                        "message": "No on-target opportunities matched your filters.",
                        "sources_scanned": total_scanned,
                        "sources_filtered": total_filtered,
                        "opportunities_extracted": 0,
                    },
                )
                return

            crawl_targets = ranked_results[:MAX_CRAWL_PAGES]
            self.repository.update_run(
                run_id,
                current_stage="crawling",
                progress_json={
                    "completed": 0,
                    "total": len(crawl_targets),
                    "message": f"Inspecting {len(crawl_targets)} pages",
                    "sources_scanned": total_scanned,
                    "sources_filtered": total_filtered,
                    "opportunities_extracted": 0,
                },
            )
            crawled_pages: dict[str, dict[str, Any]] = {}
            for index, item in enumerate(crawl_targets):
                if self.repository.is_cancelled(run_id):
                    return
                try:
                    page = await self.crawler.fetch(item["url"])
                    crawled_pages[canonicalize_url(page["url"])] = page
                except (httpx.HTTPError, PermissionError, ValueError) as exc:
                    logger.info("Scholarship Hunt crawl skipped for %s: %s", item["url"], exc)
                self.repository.update_run(
                    run_id,
                    progress_json={
                        "completed": index + 1,
                        "total": len(crawl_targets),
                        "message": f"Inspected {index + 1} of {len(crawl_targets)} pages",
                        "sources_scanned": total_scanned,
                        "sources_filtered": total_filtered,
                        "opportunities_extracted": 0,
                    },
                )

            extraction_targets = ranked_results[:MAX_EXTRACTIONS]
            self.repository.update_run(
                run_id,
                current_stage="extracting",
                progress_json={
                    "completed": 0,
                    "total": len(extraction_targets),
                    "message": f"Extracting structured details from {len(extraction_targets)} sources",
                    "sources_scanned": total_scanned,
                    "sources_filtered": total_filtered,
                    "opportunities_extracted": 0,
                },
            )
            # SCHOLARDOCX-0173: collect all extractions first, then run one
            # batched relevance filter so on-topic results surface and off-topic
            # pages are rejected before persistence. field_synonyms (from the
            # query planner) feed the filter's deterministic fallback.
            extracted_items: list[dict[str, Any]] = []
            for index, item in enumerate(extraction_targets):
                if self.repository.is_cancelled(run_id):
                    return
                page = crawled_pages.get(canonicalize_url(item["url"]))
                if page:
                    source_url = page["url"]
                    source_title = page["title"] or item.get("title", "")
                    source_snippet = (page["text"] or "")[:6000]
                else:
                    source_url = item["url"]
                    source_title = item.get("title", "")
                    source_snippet = (item.get("content") or "")[:3000]

                extracted = await scholarship_extraction_service.extract(
                    self.ai_service,
                    source_url=source_url,
                    source_title=source_title,
                    source_snippet=source_snippet,
                )
                extracted_items.append({
                    "extracted": extracted,
                    "source_url": source_url,
                    "source_title": source_title,
                    "tavily_score": float(item.get("score") or item.get("_search_score") or 0),
                })
                self.repository.update_run(
                    run_id,
                    progress_json={
                        "completed": index + 1,
                        "total": len(extraction_targets),
                        "message": f"Extracted {index + 1} of {len(extraction_targets)} sources",
                        "sources_scanned": total_scanned,
                        "sources_filtered": total_filtered,
                        "opportunities_extracted": index + 1,
                    },
                )

            # Relevance filter: one batched LLM call judges every extracted
            # opportunity against the goal's field/degree/funding intent.
            # Falls back to a deterministic synonym-keyword match on any error,
            # so relevance is always enforced even without AI.
            well_formed = [e["extracted"] for e in extracted_items if e["extracted"].get("canonical_name")]
            relevance_scores: list[float] = []
            if well_formed:
                relevance_scores = await self.relevance_filter.score(
                    str(run.get("goal") or ""),
                    well_formed,
                    field_synonyms=field_synonyms,
                    degree_level=run.get("degree_level"),
                )
            # Map scores back onto the full extracted_items list (non-well-formed
            # items get 0 so they fail the relevance floor below).
            score_by_url: dict[str, float] = {}
            score_iter = iter(relevance_scores)
            for entry in extracted_items:
                ext = entry["extracted"]
                if ext.get("canonical_name"):
                    score_by_url[entry["source_url"]] = next(score_iter, 0.0)
                else:
                    score_by_url[entry["source_url"]] = 0.0

            # SCHOLARDOCX-0177: collapse near-duplicate opportunities (the same
            # generic program surfaced by several low-signal source pages,
            # differing only by year/punctuation in the title) down to the
            # single best-evidenced entry before persisting, so a run does not
            # spam the library with repeats of the same program.
            best_by_key: dict[str, dict[str, Any]] = {}
            for entry in extracted_items:
                extracted = entry["extracted"]
                source_url = entry["source_url"]
                relevance = score_by_url.get(source_url, 0.0)
                if not _is_acceptable(extracted, relevance_score=relevance):
                    continue
                key = _dedup_key(extracted["canonical_name"])
                candidate = {**entry, "relevance": relevance}
                current = best_by_key.get(key)
                if current is None or _is_better_candidate(candidate, current):
                    best_by_key[key] = candidate

            # SCHOLARDOCX-0178: results are stored on the run, NOT auto-saved
            # into scholarship_opportunities. The user picks which ones to
            # keep via the "save result" endpoint.
            results: list[dict[str, Any]] = []
            for candidate in best_by_key.values():
                extracted = candidate["extracted"]
                funding = extracted.get("funding") or {}
                results.append({
                    "normalized_url": normalize_url(candidate["source_url"]),
                    "source_url": candidate["source_url"],
                    "source_title": candidate["source_title"],
                    "relevance_score": round(candidate["relevance"], 3),
                    "canonical_name": extracted.get("canonical_name"),
                    "sponsor": extracted.get("sponsor"),
                    "degree_levels": extracted.get("degree_levels") or [],
                    "fields_of_study": extracted.get("fields_of_study") or [],
                    "destination_countries": extracted.get("destination_countries") or [],
                    "eligible_nationalities": extracted.get("eligible_nationalities") or [],
                    "funding": funding,
                    "deadlines": extracted.get("deadlines") or [],
                    "requirements": extracted.get("requirements") or [],
                    "application_url": extracted.get("application_url"),
                })
            accepted = len(results)

            if self.repository.is_cancelled(run_id):
                return
            self.repository.update_run(
                run_id,
                status="completed",
                current_stage="completed",
                completed_at=datetime.now(timezone.utc).isoformat(),
                result_count=accepted,
                results_json=results,
                progress_json={
                    "completed": len(extraction_targets),
                    "total": len(extraction_targets),
                    "message": f"Found {accepted} opportunit{'y' if accepted == 1 else 'ies'}",
                    "sources_scanned": total_scanned,
                    "sources_filtered": total_filtered,
                    "opportunities_extracted": accepted,
                },
            )
        except Exception as exc:
            logger.exception("Scholarship Hunt run %s failed", run_id)
            if not self.repository.is_cancelled(run_id):
                self.repository.update_run(
                    run_id,
                    status="failed",
                    current_stage="failed",
                    error_message=str(exc),
                    progress_json={
                        "completed": 0,
                        "total": None,
                        "message": "The search stopped before completion",
                        "sources_scanned": 0,
                        "sources_filtered": 0,
                        "opportunities_extracted": 0,
                    },
                )
        finally:
            if billing_session is not None:
                billing_session.close()

    async def _brave_search(self, query: str, max_results: int) -> list[dict[str, Any]]:
        """Run one Brave web-search pass and return pipeline-shaped items.

        Maps the Brave adapter's card contract into the {title, url, content,
        score} shape the rest of the pipeline expects. Returns [] if Brave is
        unconfigured. Per-hit billing is handled by the caller (the run loop),
        not here, so this method stays a pure search + normalize step.
        """
        if not self.brave.configured:
            return []
        try:
            response = await self.brave.search(query, count=max_results, freshness="py")
        except httpx.HTTPError as exc:
            logger.info("Scholarship Hunt Brave search failed: %s", exc)
            return []
        items: list[dict[str, Any]] = []
        for card in response.get("results", []):
            link = card.get("link") or ""
            if not link:
                continue
            items.append(
                {
                    "title": card.get("title") or "Untitled source",
                    "url": canonicalize_url(link),
                    "content": (card.get("description") or "")[:5000],
                    "description": card.get("description") or "",
                    "score": card.get("_search_score"),
                }
            )
        return items
