from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import re
import time
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import Settings
from app.services.advisor_atlas.analysis import (
    FUNDING_SIGNAL,
    RECRUIT_OPEN,
    analyze_professor_specialists,
    analyze_with_glm,
    deterministic_analysis,
)
from app.services.advisor_atlas.crawler import (
    PublicCrawler,
    canonicalize_url,
)
from app.services.advisor_atlas.repository import AdvisorAtlasRepository
from app.services.advisor_atlas.discovery import (
    DiscoveryResearcher,
    build_discovery_action_center,
)
from app.services.advisor_atlas.intelligence import opportunity_forecast, semantic_fallback
from app.services.advisor_atlas.professor_research import (
    discover_profile_links,
    extract_verified_professor_facts,
    is_scholarly_publication,
    publication_supported_by_sources,
    select_candidate_email,
    select_evidence_sources,
    source_score,
)
from app.services.advisor_atlas.research_pipeline import (
    crawl_linked_professor_pages,
    crawl_ranked_sources,
    gather_visual_evidence,
    run_professor_search_passes,
    select_deep_candidates,
)
from app.services.ai import AiService

logger = logging.getLogger(__name__)

STAGES = [
    "resolving",
    "mapping",
    "identity",
    "profiles",
    "publications",
    "opportunities",
    "verification",
    "matching",
    "deep_research",
    "actions",
]

# Bounded concurrency for candidate processing. Screening is light (one search
# plus analysis per candidate); deep research is heavy, so fewer run at once.
SCREENING_CONCURRENCY = 4
DEEP_CONCURRENCY = 2


class AdvisorAtlasService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repository = AdvisorAtlasRepository(settings.database_target)
        self.crawler = PublicCrawler()
        self.ai_service = AiService(settings)

    async def run(self, run_id: str, user_id: str) -> None:
        run = self.repository.get_run(run_id, user_id, include_candidates=False)
        billing_session = None
        try:
            from app.db.connection import get_engine
            from sqlalchemy.orm import sessionmaker
            from app.services.ai_tokens import load_user_dict
            billing_session = sessionmaker(
                autocommit=False, autoflush=False, bind=get_engine(self.settings.database_target)
            )()
            self.ai_service.set_billing(
                load_user_dict(user_id, billing_session), billing_session
            )
            self.repository.update_run(
                run_id,
                status="running",
                current_stage="resolving",
                started_at=datetime.now(timezone.utc).isoformat(),
                progress_json={"completed": 0, "total": None, "message": "Resolving the institution and search scope"},
            )
            discovery_usage = self._new_usage()
            candidates, discovery_sources = await self._discover_candidates(run, discovery_usage)
            if self.repository.is_cancelled(run_id):
                return
            if not candidates:
                raise ValueError(
                    "No professor candidates were discovered. Add an official department URL or use Focused Dossier with a professor name."
                )

            max_candidates = 80
            candidates = candidates[:max_candidates]
            self.repository.update_run(
                run_id,
                current_stage="profiles",
                progress_json={
                    "completed": 0,
                    "total": len(candidates),
                    "message": f"Building {len(candidates)} evidence-backed advisor dossiers",
                },
            )

            completed = 0
            semaphore = asyncio.Semaphore(SCREENING_CONCURRENCY)

            async def screen_one(candidate: dict[str, Any]) -> None:
                nonlocal completed
                async with semaphore:
                    if self.repository.is_cancelled(run_id):
                        return
                    try:
                        await self._process_candidate(
                            run,
                            user_id,
                            candidate,
                            discovery_sources,
                            deep=run["mode"] == "professor",
                        )
                    except Exception:
                        # One candidate must not sink a whole Discovery run; a
                        # Professor run has exactly one candidate, so its
                        # failure is the run's failure.
                        if run["mode"] == "professor":
                            raise
                        logger.exception(
                            "Candidate screening failed for %s",
                            candidate.get("display_name"),
                        )
                    completed += 1
                    self.repository.update_run(
                        run_id,
                        current_stage="matching",
                        progress_json={
                            "completed": completed,
                            "total": len(candidates),
                            "message": f"Completed {candidate['display_name']}",
                        },
                    )

            await asyncio.gather(
                *(asyncio.create_task(screen_one(candidate)) for candidate in candidates)
            )
            if self.repository.is_cancelled(run_id):
                return

            if run["mode"] != "professor":
                await self._deep_research_discovery(run, run_id, user_id, discovery_sources)
                if self.repository.is_cancelled(run_id):
                    return

            run_result = self.repository.get_run(run_id, user_id)
            action_center = build_discovery_action_center(
                run_result["candidates"],
                discovery_sources,
                run,
            )
            self.repository.update_run(
                run_id,
                status="completed",
                current_stage="completed",
                completed_at=datetime.now(timezone.utc).isoformat(),
                action_center_json=action_center,
                progress_json={
                    "completed": completed,
                    "total": len(candidates),
                    "message": "Advisor Atlas is ready",
                },
            )
        except Exception as exc:
            logger.exception("Advisor Atlas run %s failed", run_id)
            if not self.repository.is_cancelled(run_id):
                self.repository.update_run(
                    run_id,
                    status="failed",
                    current_stage="failed",
                    error_message=str(exc),
                    progress_json={
                        "completed": 0,
                        "total": None,
                        "message": "The run stopped before completion",
                    },
                )
        finally:
            if billing_session is not None:
                billing_session.close()

    async def refresh_candidate(self, candidate_id: str, user_id: str) -> dict[str, Any]:
        candidate = self.repository.get_candidate(candidate_id, user_id)
        run = self.repository.get_run(candidate["run_id"], user_id, include_candidates=False)
        # A refresh is an explicit, token-metered user action: always use the
        # full deep pipeline regardless of the run mode.
        await self._process_candidate(run, user_id, candidate, [], deep=True)
        return self.repository.get_candidate(candidate_id, user_id)

    async def _deep_research_discovery(
        self,
        run: dict[str, Any],
        run_id: str,
        user_id: str,
        discovery_sources: list[dict[str, Any]],
    ) -> None:
        stored = self.repository.get_run(run_id, user_id)
        targets = select_deep_candidates(stored.get("candidates", []))
        if not targets:
            return
        self.repository.update_run(
            run_id,
            current_stage="deep_research",
            progress_json={
                "completed": 0,
                "total": len(targets),
                "message": f"Deep researching the top {len(targets)} research-fit matches",
            },
        )
        completed = 0
        semaphore = asyncio.Semaphore(DEEP_CONCURRENCY)

        async def deep_one(candidate: dict[str, Any]) -> None:
            nonlocal completed
            async with semaphore:
                if self.repository.is_cancelled(run_id):
                    return
                try:
                    # Keep the screening-phase discovery sources in play so a
                    # deep pass whose searches come up empty can never produce
                    # a weaker dossier than the screening pass did.
                    await self._process_candidate(
                        run, user_id, candidate, discovery_sources, deep=True
                    )
                except Exception:
                    logger.exception(
                        "Deep research failed for %s; the screened result is kept",
                        candidate.get("display_name"),
                    )
                completed += 1
                self.repository.update_run(
                    run_id,
                    current_stage="deep_research",
                    progress_json={
                        "completed": completed,
                        "total": len(targets),
                        "message": f"Deep researched {candidate['display_name']}",
                    },
                )

        await asyncio.gather(
            *(asyncio.create_task(deep_one(candidate)) for candidate in targets)
        )

    async def _discover_candidates(
        self,
        run: dict[str, Any],
        usage: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        candidates: list[dict[str, Any]] = []
        sources: list[dict[str, Any]] = []
        if run["mode"] == "professor":
            candidates.append(
                {
                    "display_name": run["professor_name"],
                    "institution": run.get("university_name"),
                    "department": run.get("department"),
                    "official_profile_url": run.get("university_url"),
                }
            )

        if run.get("university_url"):
            try:
                page = await self.crawler.fetch(run["university_url"])
                sources.append(
                    {
                        "title": page["title"],
                        "url": page["url"],
                        "content": page["text"][:5000],
                        "page": page,
                        "source_kind": "official_profile",
                    }
                )
                usage["pages_crawled"] = int(usage.get("pages_crawled", 0)) + 1
                if run["mode"] != "professor":
                    candidates.extend(
                        self.crawler.faculty_candidates(
                            page,
                            run.get("university_name"),
                            run.get("department"),
                        )
                    )
            except (httpx.HTTPError, PermissionError, ValueError) as exc:
                logger.info("Official URL could not be fetched: %s", exc)

        if run["mode"] == "professor":
            search_results = await self._tavily_search(
                self._discovery_query(run),
                max_results=12,
                usage=usage,
            )
            for item in search_results:
                item["source_kind"] = "identity"
            sources.extend(search_results)
        else:
            async def discovery_search(query: str, max_results: int) -> list[dict[str, Any]]:
                return await self._tavily_search(query, max_results, usage=usage)

            candidates, sources = await DiscoveryResearcher(
                self.crawler,
                discovery_search,
                usage,
            ).collect(run, candidates, sources)
            search_results = sources

        if run["mode"] == "professor" and candidates:
            best_url = next(
                (
                    item["url"]
                    for item in search_results
                    if run["professor_name"].lower() in f"{item.get('title', '')} {item.get('content', '')}".lower()
                ),
                None,
            )
            if best_url and not candidates[0].get("official_profile_url"):
                candidates[0]["official_profile_url"] = best_url

        deduped: dict[str, dict[str, Any]] = {}
        for candidate in candidates:
            name = re.sub(r"\s+", " ", str(candidate.get("display_name", ""))).strip()
            if not name or len(name.split()) < 2:
                continue
            key = name.lower()
            existing = deduped.get(key, {})
            deduped[key] = {**existing, **{k: v for k, v in candidate.items() if v}}
        return list(deduped.values()), sources

    async def _process_candidate(
        self,
        run: dict[str, Any],
        user_id: str,
        candidate: dict[str, Any],
        discovery_sources: list[dict[str, Any]],
        deep: bool = False,
    ) -> int:
        usage = self._new_usage()
        candidate_sources = [
            item
            for item in discovery_sources
            if candidate["display_name"].lower() in f"{item.get('title', '')} {item.get('content', '')}".lower()
        ]
        profile_url = candidate.get("official_profile_url")
        if profile_url:
            try:
                page = await self.crawler.fetch(profile_url)
                candidate_sources.append(
                    {
                        "title": page["title"],
                        "url": page["url"],
                        "content": page["text"][:12000],
                        "page": page,
                        "source_kind": "official_profile",
                    }
                )
                usage["pages_crawled"] = int(usage.get("pages_crawled", 0)) + 1
                candidate["email"] = candidate.get("email") or select_candidate_email(
                    candidate_sources,
                    candidate["display_name"],
                )
            except (httpx.HTTPError, PermissionError, ValueError) as exc:
                logger.info("Candidate profile fetch skipped for %s: %s", candidate["display_name"], exc)

        if deep:
            async def deep_search(query: str, max_results: int) -> list[dict[str, Any]]:
                return await self._tavily_search(query, max_results, usage=usage)

            candidate_sources.extend(
                await run_professor_search_passes(deep_search, candidate, run)
            )
            candidate_sources = self._dedupe_sources(candidate_sources)
            candidate_sources.extend(
                await crawl_ranked_sources(self.crawler, candidate_sources, candidate, usage)
            )
            candidate_sources = self._dedupe_sources(candidate_sources)
            candidate_sources.extend(
                await crawl_linked_professor_pages(
                    self.crawler, candidate_sources, candidate, usage
                )
            )
        else:
            detail_query = self._candidate_query(candidate, run)
            candidate_sources.extend(
                await self._tavily_search(detail_query, max_results=12, usage=usage)
            )

        candidate_sources = self._dedupe_sources(candidate_sources)
        candidate_sources.extend(
            await gather_visual_evidence(
                self.crawler,
                self.ai_service,
                candidate_sources,
                candidate["display_name"],
                usage,
            )
        )
        candidate_sources = self._dedupe_sources(candidate_sources)
        if not candidate_sources:
            candidate_sources = [
                {
                    "title": f"{candidate['display_name']} discovery record",
                    "url": profile_url or run.get("university_url") or "https://example.invalid/",
                    "content": (
                        f"{candidate['display_name']} was supplied for investigation at "
                        f"{run.get('university_name') or 'the selected university'}."
                    ),
                }
            ]

        profile = dict(run.get("research_profile", {}))
        profile["degree_target"] = run.get("degree_target")
        profile["intake_term"] = run.get("intake_term")
        specialist_context = (
            await analyze_professor_specialists(
                self.ai_service,
                candidate,
                candidate_sources,
                profile,
                usage,
            )
            if deep
            else {}
        )
        analysis = await analyze_with_glm(
            self.ai_service,
            candidate,
            candidate_sources,
            profile,
            specialist_context,
            usage,
        )
        if not analysis:
            analysis = deterministic_analysis(candidate, candidate_sources, profile)
        analysis = self._validate_analysis(
            analysis,
            candidate_sources,
            candidate["display_name"],
        )
        verified_facts = extract_verified_professor_facts(candidate, candidate_sources)
        analysis = self._reconcile_verified_facts(
            analysis,
            verified_facts,
            candidate_sources,
            candidate,
        )

        normalized_candidate = {**candidate, **analysis.get("candidate", {})}
        normalized_candidate["display_name"] = candidate["display_name"]
        normalized_candidate["institution"] = normalized_candidate.get("institution") or run.get("university_name")
        normalized_candidate["department"] = normalized_candidate.get("department") or run.get("department")
        combined = " ".join(
            f"{item.get('title', '')} {item.get('content', '')} {item.get('text', '')}"
            for item in candidate_sources
        )
        intelligence = dict(normalized_candidate.get("intelligence") or {})
        detected_profiles = verified_facts.get("profiles") or discover_profile_links(
            candidate_sources, candidate["display_name"]
        )
        current_profiles = intelligence.get("academic_profiles")
        if not isinstance(current_profiles, dict):
            current_profiles = {}
        for key, value in detected_profiles.items():
            if value:
                current_profiles[key] = value
        intelligence["academic_profiles"] = current_profiles
        for field in (
            "official_profile_url",
            "linkedin_url",
            "google_scholar_url",
            "personal_url",
        ):
            if current_profiles.get(field):
                normalized_candidate[field] = current_profiles[field]
        semantic = semantic_fallback(profile.get("interests", []), combined)
        for key, value in semantic.items():
            intelligence.setdefault(key, value)
        intelligence["department_relation"] = (
            candidate.get("department_relation")
            or intelligence.get("department_relation")
            or {}
        )
        forecast = opportunity_forecast(
            combined,
            normalized_candidate.get("recruitment_state", "unknown"),
            int(normalized_candidate.get("evidence_confidence", 0)),
        )
        provided_forecast = intelligence.get("opportunity_outlook")
        if not isinstance(provided_forecast, dict):
            intelligence["opportunity_outlook"] = forecast
        else:
            p_conf_raw = provided_forecast.get("confidence")
            f_conf_raw = forecast.get("confidence", 0)
            p_conf = int(p_conf_raw) if p_conf_raw is not None else int(f_conf_raw)
            
            e_conf_raw = normalized_candidate.get("evidence_confidence", 0)
            e_conf = int(e_conf_raw) if e_conf_raw is not None else 0

            provided_forecast["confidence"] = min(p_conf, e_conf)
            provided_forecast.setdefault("likely_semesters", forecast["likely_semesters"])
            provided_forecast.setdefault("limitation", forecast["limitation"])
        usage["sources_inspected"] = len(candidate_sources)
        elapsed = max(0.0, time.perf_counter() - float(usage["started_at"]))
        intelligence["research_depth"] = "deep" if deep else "screened"
        intelligence["research_metrics"] = {
            "tavily_searches": int(usage.get("tavily_searches", 0)),
            "pages_crawled": int(usage.get("pages_crawled", 0)),
            "ai_calls": int(usage.get("ai_calls", 0)),
            "estimated_input_tokens": int(usage.get("estimated_input_tokens", 0)),
            "estimated_output_tokens": int(usage.get("estimated_output_tokens", 0)),
            "estimated_total_tokens": (
                int(usage.get("estimated_input_tokens", 0))
                + int(usage.get("estimated_output_tokens", 0))
            ),
            "sources_inspected": len(candidate_sources),
            "elapsed_seconds": round(elapsed, 1),
            "token_measurement": "estimated",
        }
        normalized_candidate["intelligence"] = intelligence
        evidence = self._evidence_from_sources(candidate_sources, normalized_candidate)
        return self.repository.replace_candidate_data(
            str(run["id"]),
            user_id,
            normalized_candidate,
            evidence,
            analysis.get("publications", []),
            analysis.get("dossier", {}),
        )

    def _validate_analysis(
        self,
        analysis: dict[str, Any],
        sources: list[dict[str, Any]],
        candidate_name: str,
    ) -> dict[str, Any]:
        allowed_urls = {
            canonicalize_url(item["url"])
            for item in sources
            if item.get("url") and "example.invalid" not in item["url"]
        }
        candidate = analysis.setdefault("candidate", {})
        candidate["match_score"] = max(0, min(100, int(candidate.get("match_score", 0))))
        candidate["evidence_confidence"] = max(
            0,
            min(100, int(candidate.get("evidence_confidence", 0))),
        )
        for field in (
            "official_profile_url",
            "personal_url",
            "lab_url",
            "linkedin_url",
            "google_scholar_url",
        ):
            value = candidate.get(field)
            if value:
                try:
                    if canonicalize_url(value) not in allowed_urls:
                        candidate[field] = None
                except (TypeError, ValueError):
                    candidate[field] = None
        intelligence = candidate.get("intelligence")
        if isinstance(intelligence, dict):
            profiles = intelligence.get("academic_profiles")
            if isinstance(profiles, dict):
                for field, value in list(profiles.items()):
                    if field == "other_profiles" or not field.endswith("_url") or not value:
                        continue
                    try:
                        if canonicalize_url(value) not in allowed_urls:
                            profiles[field] = None
                    except (TypeError, ValueError):
                        profiles[field] = None
                other_profiles = profiles.get("other_profiles")
                if isinstance(other_profiles, list):
                    profiles["other_profiles"] = [
                        item
                        for item in other_profiles
                        if isinstance(item, dict)
                        and self._is_allowed_source_url(item.get("url"), allowed_urls)
                    ][:5]
            funding = intelligence.get("funding")
            if isinstance(funding, dict) and isinstance(funding.get("items"), list):
                for item in funding["items"]:
                    if isinstance(item, dict) and item.get("source_url"):
                        if not self._is_allowed_source_url(item["source_url"], allowed_urls):
                            item["source_url"] = None

        combined = " ".join(
            f"{item.get('title', '')} {item.get('content', '')} {item.get('text', '')}"
            for item in sources
        )
        explicit_open = bool(RECRUIT_OPEN.search(combined))
        funding_signal = bool(FUNDING_SIGNAL.search(combined))
        state = candidate.get("recruitment_state", "unknown")
        if state in {"confirmed_open", "strong_signal"} and not explicit_open:
            candidate["recruitment_state"] = (
                "possible_opportunity" if funding_signal else "unknown"
            )
            candidate["recruitment_summary"] = (
                "The generated recruitment claim was downgraded because no explicit "
                "opening language was present in the inspected sources."
            )

        valid_publications = []
        for item in analysis.get("publications", [])[:8]:
            title = str(item.get("title", "")).strip()
            source_url = item.get("source_url")
            if not title or not source_url:
                continue
            try:
                if canonicalize_url(source_url) not in allowed_urls:
                    continue
            except (TypeError, ValueError):
                continue
            if not is_scholarly_publication(item):
                continue
            if not publication_supported_by_sources(item, candidate_name, sources):
                continue
            item["reading_priority"] = max(
                1,
                min(5, int(item.get("reading_priority", 1))),
            )
            valid_publications.append(item)
        analysis["publications"] = valid_publications
        return analysis

    def _reconcile_verified_facts(
        self,
        analysis: dict[str, Any],
        verified: dict[str, Any],
        sources: list[dict[str, Any]],
        original_candidate: dict[str, Any],
    ) -> dict[str, Any]:
        candidate = analysis.setdefault("candidate", {})
        candidate["display_name"] = original_candidate["display_name"]
        profiles = verified.get("profiles") or {}
        for field in (
            "official_profile_url",
            "personal_url",
            "linkedin_url",
            "google_scholar_url",
            "lab_url",
        ):
            if profiles.get(field):
                candidate[field] = profiles[field]
        if verified.get("email"):
            candidate["email"] = verified["email"]

        intelligence = candidate.setdefault("intelligence", {})
        current_profiles = intelligence.get("academic_profiles")
        if not isinstance(current_profiles, dict):
            current_profiles = {}
        current_profiles.update({key: value for key, value in profiles.items() if value})
        intelligence["academic_profiles"] = current_profiles

        background = verified.get("background") or {}
        if background.get("education") or background.get("positions"):
            intelligence["background"] = background
        research = verified.get("research_interests") or {}
        if research.get("summary") or research.get("themes"):
            intelligence["research_interests"] = research
            candidate["research_summary"] = research.get("summary") or (
                "Verified research areas: " + ", ".join(research.get("themes", [])) + "."
            )
        recent_activity = verified.get("recent_activity") or {}
        if recent_activity.get("items"):
            intelligence["recent_activity"] = recent_activity
        contact = intelligence.get("contact")
        if not isinstance(contact, dict):
            contact = {}
        if verified.get("email"):
            contact["email"] = verified["email"]
        contact.setdefault(
            "application_path",
            "Confirm current openings through the verified professor or university page.",
        )
        intelligence["contact"] = contact

        merged_publications = list(verified.get("publications") or [])
        merged_publications.extend(
            item
            for item in analysis.get("publications", [])
            if publication_supported_by_sources(
                item,
                original_candidate["display_name"],
                sources,
            )
        )
        deduped: dict[str, dict[str, Any]] = {}
        for item in merged_publications:
            key = re.sub(r"[^a-z0-9]", "", str(item.get("title") or "").lower())
            if key:
                deduped[key] = item
        publications = sorted(
            deduped.values(),
            key=lambda item: item.get("publication_year") or 0,
            reverse=True,
        )[:8]
        for index, publication in enumerate(publications):
            publication["reading_priority"] = max(1, 5 - index)
        analysis["publications"] = publications
        return analysis

    def _is_allowed_source_url(self, value: Any, allowed_urls: set[str]) -> bool:
        if not value:
            return False
        try:
            return canonicalize_url(str(value)) in allowed_urls
        except (TypeError, ValueError):
            return False

    async def _tavily_search(
        self,
        query: str,
        max_results: int,
        usage: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
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
        if usage is not None:
            usage["tavily_searches"] = int(usage.get("tavily_searches", 0)) + 1
        # Record this Tavily call as a non-billing counter (tokens_delta=0) so it
        # surfaces in the admin Tavily usage dashboard. Advisor Atlas uses the
        # web-search Tavily key but is NOT metered per search — cost stays 0.
        # Distinct source so it shows as its own card (vs. chat web-search).
        self.ai_service.record_external_search(source="advisor_atlas_search")
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

    def _discovery_query(self, run: dict[str, Any]) -> str:
        if run["mode"] == "professor":
            return (
                f'"{run["professor_name"]}" {run.get("university_name", "")} '
                f'{run.get("department", "")} official profile lab publications students funding recruiting'
            )
        interests = " ".join(run.get("research_profile", {}).get("interests", []))
        return (
            f'{run.get("university_name", "")} {run.get("department", "")} '
            f'professors faculty research {interests}'
        )

    def _candidate_query(self, candidate: dict[str, Any], run: dict[str, Any]) -> str:
        return (
            f'"{candidate["display_name"]}" {candidate.get("institution", "")} '
            f'LinkedIn "Google Scholar" lab students publications grants funding recruiting PhD accepting students'
        )

    def _evidence_from_sources(
        self,
        sources: list[dict[str, Any]],
        candidate: dict[str, Any],
    ) -> list[dict[str, Any]]:
        evidence = []
        institution_token = (candidate.get("institution") or "").lower().split()
        selected = select_evidence_sources(
            sources,
            candidate["display_name"],
            candidate.get("institution"),
            limit=16,
        )
        for item in selected:
            url = item.get("url")
            if not url or "example.invalid" in url:
                continue
            host = urlparse(url).netloc
            official = bool(institution_token and institution_token[0] in host.lower())
            content = item.get("content") or item.get("text") or ""
            evidence.append(
                {
                    "source_url": url,
                    "canonical_url": canonicalize_url(url),
                    "source_type": "official" if official else "web",
                    "page_title": item.get("title"),
                    "claim_type": item.get("source_kind", "profile"),
                    "claim_text": (
                        f"{str(item.get('source_kind') or 'Public').replace('_', ' ').title()} "
                        f"source inspected for {candidate['display_name']}."
                    ),
                    "evidence_excerpt": content[:700],
                    "confidence": 85 if official else 60,
                    "metadata": {
                        "provider_score": item.get("score"),
                        "source_kind": item.get("source_kind"),
                        "source_score": source_score(item, candidate.get("institution")),
                    },
                }
            )
        return evidence

    def _new_usage(self) -> dict[str, Any]:
        return {
            "started_at": time.perf_counter(),
            "tavily_searches": 0,
            "pages_crawled": 0,
            "ai_calls": 0,
            "estimated_input_tokens": 0,
            "estimated_output_tokens": 0,
            "sources_inspected": 0,
        }

    def _dedupe_sources(self, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
        unique: dict[str, dict[str, Any]] = {}
        for item in sources:
            url = item.get("url")
            if not url:
                continue
            key = canonicalize_url(url)
            existing = unique.get(key)
            if not existing:
                copy = dict(item)
                copy["source_kinds"] = [
                    str(item.get("source_kind") or "web")
                ]
                unique[key] = copy
                continue
            kinds = list(existing.get("source_kinds") or [])
            new_kind = str(item.get("source_kind") or "web")
            if new_kind not in kinds:
                kinds.append(new_kind)
            existing["source_kinds"] = kinds
            if source_score(item) > source_score(existing):
                existing["source_kind"] = item.get("source_kind")
            prefer_crawled_page = bool(item.get("page")) and not bool(existing.get("page"))
            if prefer_crawled_page or len(str(item.get("content") or "")) > len(
                str(existing.get("content") or "")
            ):
                existing["content"] = item.get("content")
                if item.get("page"):
                    existing["page"] = item["page"]
                if item.get("title"):
                    existing["title"] = item["title"]
            for field in ("score", "source_origin"):
                if item.get(field) is not None and existing.get(field) is None:
                    existing[field] = item[field]
        return list(unique.values())
