"""Deep Hunt runs (Phase 5 of the Scholarship Hunt pipeline, SCHOLARDOCX-0125).

A Deep Hunt run takes one free-text funding goal (optionally scoped by
degree level / destinations / intake term) and runs a bounded, persisted,
resumable search -> crawl -> extract -> persist loop, producing several
evidence-backed `scholarship_opportunities` rows tagged with the run that
found them.

This composes existing pieces rather than a parallel subsystem:
- Crawling reuses `app.services.advisor_atlas.crawler.PublicCrawler`
  (politeness/robots handling already built for Advisor Atlas).
- Extraction reuses `scholarship_extraction_service` (Phase 1's "Analyze"
  extraction, same anti-hallucination contract: missing stays missing).
- Persistence reuses `upsert_scholarship_opportunity` (Phase 1/2's
  insert-or-update-by-normalized-URL logic).
- Run lifecycle (progress_json, cancellation, resume) mirrors
  `AdvisorAtlasRepository`/`AdvisorAtlasService`.

Cost model matches Advisor Atlas, not the plain Hunt tab: a boolean plan
gate + AI-token metering per extraction call. Tavily search calls are
recorded as zero-cost ledger rows via `AiService.record_external_search`,
not charged a flat fee.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings
from app.db.legacy_db import legacy_session
from app.services.advisor_atlas.crawler import PublicCrawler, canonicalize_url
from app.services.ai import AiService
from app.services.scholarship_extraction import scholarship_extraction_service
from app.services.store import Store

logger = logging.getLogger(__name__)

STAGES = ["planning", "searching", "crawling", "extracting", "completed"]

SEARCH_PASSES = 3
MAX_RESULTS_PER_PASS = 10
MAX_CRAWL_PAGES = 12
MAX_EXTRACTIONS = 12

JSON_FIELDS = {"destinations_json", "progress_json"}


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def _decode_row(row: Any) -> dict[str, Any]:
    item = dict(row)
    for field in JSON_FIELDS:
        if field in item and isinstance(item[field], str):
            try:
                item[field.removesuffix("_json")] = json.loads(item[field])
            except (TypeError, ValueError):
                item[field.removesuffix("_json")] = {} if item[field].startswith("{") else []
            del item[field]
    return item


class ScholarshipDeepHuntRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def create_run(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        with legacy_session(self.database_url) as db:
            cursor = db.execute(
                """
                INSERT INTO scholarship_deep_hunt_runs (
                    user_id, goal, degree_level, destinations_json, intake_term, progress_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    payload["goal"],
                    payload.get("degree_level"),
                    _json(payload.get("destinations", [])),
                    payload.get("intake_term"),
                    _json({"completed": 0, "total": None, "message": "Queued"}),
                ),
            )
            db.commit()
            return self.get_run(int(cursor.lastrowid or 0), user_id, include_opportunities=False)

    def list_runs(self, user_id: int) -> list[dict[str, Any]]:
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

    def get_run(self, run_id: int, user_id: int, include_opportunities: bool = True) -> dict[str, Any]:
        with legacy_session(self.database_url) as db:
            row = db.execute(
                "SELECT * FROM scholarship_deep_hunt_runs WHERE id = ? AND user_id = ?",
                (run_id, user_id),
            ).fetchone()
            if not row:
                raise LookupError("Deep Hunt run not found.")
            result = _decode_row(row)
            if include_opportunities:
                opportunities = db.execute(
                    """
                    SELECT * FROM scholarship_opportunities
                    WHERE deep_hunt_run_id = ? AND user_id = ?
                    ORDER BY updated_at DESC
                    """,
                    (run_id, user_id),
                ).fetchall()
                # Left as raw rows (JSON columns still encoded); the API layer
                # applies the same `_with_parsed_fields` helper the plain
                # Opportunity Library endpoints use, so parsing stays in one
                # place.
                result["opportunities"] = [dict(item) for item in opportunities]
            return result

    def update_run(self, run_id: int, **values: Any) -> None:
        if not values:
            return
        allowed = {
            "status", "current_stage", "progress_json", "result_count",
            "error_message", "started_at", "completed_at", "cancelled_at",
        }
        clean = {key: value for key, value in values.items() if key in allowed}
        if "progress_json" in clean and not isinstance(clean["progress_json"], str):
            clean["progress_json"] = _json(clean["progress_json"])
        assignments = [f"{key} = ?" for key in clean]
        assignments.append("updated_at = CURRENT_TIMESTAMP")
        params = [*clean.values(), run_id]
        with legacy_session(self.database_url) as db:
            db.execute(
                f"UPDATE scholarship_deep_hunt_runs SET {', '.join(assignments)} WHERE id = ?",
                params,
            )
            db.commit()

    def is_cancelled(self, run_id: int) -> bool:
        with legacy_session(self.database_url) as db:
            row = db.execute(
                "SELECT status FROM scholarship_deep_hunt_runs WHERE id = ?",
                (run_id,),
            ).fetchone()
            return not row or row["status"] == "cancelled"

    def cancel_run(self, run_id: int, user_id: int) -> dict[str, Any]:
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

    def prepare_resume(self, run_id: int, user_id: int) -> dict[str, Any]:
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

    def delete_run(self, run_id: int, user_id: int) -> bool:
        with legacy_session(self.database_url) as db:
            cursor = db.execute(
                "DELETE FROM scholarship_deep_hunt_runs WHERE id = ? AND user_id = ?",
                (run_id, user_id),
            )
            db.commit()
            return cursor.rowcount > 0


def _build_queries(run: dict[str, Any]) -> list[str]:
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


def _is_acceptable(extracted: dict[str, Any]) -> bool:
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

    async def run(self, run_id: int, user_id: int) -> None:
        run = self.repository.get_run(run_id, user_id, include_opportunities=False)
        billing_session = None
        try:
            from app.db.connection import get_engine
            from sqlalchemy.orm import sessionmaker
            from app.services.ai_tokens import load_user_dict

            billing_session = sessionmaker(
                autocommit=False, autoflush=False, bind=get_engine(self.settings.database_target)
            )()
            store = Store(billing_session, current_user_id=user_id)
            self.ai_service.set_billing(load_user_dict(user_id, billing_session), billing_session)
            # Deferred import: avoids a module-load-time cycle with
            # app.api.scholarship_opportunities (an API module importing a
            # service module).
            from app.api.scholarship_opportunities import upsert_scholarship_opportunity

            self.repository.update_run(
                run_id,
                status="running",
                current_stage="planning",
                started_at=datetime.now().astimezone().isoformat(),
                progress_json={"completed": 0, "total": None, "message": "Planning search passes"},
            )
            queries = _build_queries(run)

            if self.repository.is_cancelled(run_id):
                return

            self.repository.update_run(
                run_id,
                current_stage="searching",
                progress_json={"completed": 0, "total": len(queries), "message": "Searching for opportunities"},
            )
            results: dict[str, dict[str, Any]] = {}
            for index, query in enumerate(queries):
                if self.repository.is_cancelled(run_id):
                    return
                for item in await self._tavily_search(query, MAX_RESULTS_PER_PASS):
                    canon = canonicalize_url(item["url"])
                    if canon not in results:
                        results[canon] = item
                self.repository.update_run(
                    run_id,
                    progress_json={
                        "completed": index + 1,
                        "total": len(queries),
                        "message": f"Completed search pass {index + 1} of {len(queries)}",
                    },
                )
            ranked_results = sorted(
                results.values(), key=lambda item: item.get("score") or 0, reverse=True
            )
            if self.repository.is_cancelled(run_id):
                return
            if not ranked_results:
                raise ValueError(
                    "No search results were found for this goal. Try a broader or more specific goal."
                )

            crawl_targets = ranked_results[:MAX_CRAWL_PAGES]
            self.repository.update_run(
                run_id,
                current_stage="crawling",
                progress_json={
                    "completed": 0,
                    "total": len(crawl_targets),
                    "message": f"Inspecting {len(crawl_targets)} pages",
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
                    logger.info("Deep Hunt crawl skipped for %s: %s", item["url"], exc)
                self.repository.update_run(
                    run_id,
                    progress_json={
                        "completed": index + 1,
                        "total": len(crawl_targets),
                        "message": f"Inspected {index + 1} of {len(crawl_targets)} pages",
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
                },
            )
            accepted = 0
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
                if _is_acceptable(extracted):
                    upsert_scholarship_opportunity(
                        store,
                        source="deep_hunt",
                        extracted=extracted,
                        source_url=source_url,
                        fallback_title=source_title,
                        extra_fields={"deep_hunt_run_id": run_id},
                    )
                    accepted += 1
                self.repository.update_run(
                    run_id,
                    progress_json={
                        "completed": index + 1,
                        "total": len(extraction_targets),
                        "message": f"Extracted {index + 1} of {len(extraction_targets)} sources ({accepted} accepted)",
                    },
                )

            if self.repository.is_cancelled(run_id):
                return
            self.repository.update_run(
                run_id,
                status="completed",
                current_stage="completed",
                completed_at=datetime.now().astimezone().isoformat(),
                result_count=accepted,
                progress_json={
                    "completed": len(extraction_targets),
                    "total": len(extraction_targets),
                    "message": f"Deep Hunt found {accepted} opportunit{'y' if accepted == 1 else 'ies'}",
                },
            )
        except Exception as exc:
            logger.exception("Deep Hunt run %s failed", run_id)
            if not self.repository.is_cancelled(run_id):
                self.repository.update_run(
                    run_id,
                    status="failed",
                    current_stage="failed",
                    error_message=str(exc),
                    progress_json={"completed": 0, "total": None, "message": "The run stopped before completion"},
                )
        finally:
            if billing_session is not None:
                billing_session.close()

    async def _tavily_search(self, query: str, max_results: int) -> list[dict[str, Any]]:
        if not self.settings.tavily_api_key:
            return []
        payload = {
            "api_key": self.settings.tavily_api_key,
            "query": query[:1200],
            "search_depth": "advanced",
            "topic": "general",
            "max_results": max_results,
            "include_answer": False,
            "include_raw_content": False,
            "include_images": False,
        }
        async with httpx.AsyncClient(timeout=35) as client:
            response = await client.post("https://api.tavily.com/search", json=payload)
            response.raise_for_status()
        # Zero-cost ledger row, mirroring Advisor Atlas: Deep Hunt is gated by
        # the plan check + AI-token metering on extraction, not per-search fees.
        self.ai_service.record_external_search(source="scholarship_deep_hunt_search")
        return [
            {
                "title": item.get("title") or "Untitled source",
                "url": canonicalize_url(item.get("url") or ""),
                "content": (item.get("content") or "")[:5000],
                "score": item.get("score"),
            }
            for item in response.json().get("results", [])
            if item.get("url")
        ]
