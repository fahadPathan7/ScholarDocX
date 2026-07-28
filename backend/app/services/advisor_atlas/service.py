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
    map_related_units_with_glm,
)
from app.services.advisor_atlas.crawler import (
    PublicCrawler,
    canonicalize_url,
)
from app.services.advisor_atlas.candidate_quality import (
    advising_eligibility,
    calibrate_evidence_confidence,
    merge_duplicate_candidates,
)
from app.services.advisor_atlas.repository import AdvisorAtlasRepository
from app.services.advisor_atlas.discovery import (
    DiscoveryResearcher,
    build_discovery_action_center,
)
from app.services.advisor_atlas.intelligence import opportunity_forecast, semantic_fallback
from app.services.advisor_atlas.openalex import (
    METERED_CALL_COST_RATIO,
    METERED_CALL_SOURCE,
    OpenAlexClient,
    summarise_activity,
)
from app.services.advisor_atlas.professor_research import (
    candidate_excerpt,
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
from app.services import ai_tokens
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

            async def map_units(
                university: str,
                field: str,
                observed: list[str],
            ) -> list[dict[str, Any]] | None:
                return await map_related_units_with_glm(
                    self.ai_service,
                    university,
                    field,
                    observed_units=observed,
                    usage=usage,
                )

            candidates, sources = await DiscoveryResearcher(
                self.crawler,
                discovery_search,
                usage,
                unit_mapper=map_units,
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
        # Exact-name de-duplication above cannot see that "A. Goyal",
        # "Ayush Goyal" and a third entry pointing at the same profile URL are
        # one person — a live run screened and billed the same professor three
        # times under three labels (SCHOLARDOCX-0190).
        return merge_duplicate_candidates(list(deduped.values())), sources

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
        # SCHOLARDOCX-0183: structured scholarly record. Deep runs only — this
        # spends a metered OpenAlex search, and a Discovery run screening 80
        # candidates would burn the daily budget on names it may never surface.
        if deep:
            await self._attach_scholarly_record(analysis, candidate, usage)

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
        # Both of these are deterministic and must run BEFORE the recruitment
        # forecast, which caps its own confidence at the candidate's evidence
        # confidence — feeding it an uncalibrated number would launder an
        # unsupported figure into the opportunity outlook.
        eligibility = advising_eligibility(normalized_candidate, candidate_sources)
        intelligence["advising_eligibility"] = eligibility
        if not eligibility["can_supervise"]:
            # Someone who cannot take a doctoral student is not a research
            # match, however well their topics line up.
            intelligence["is_research_match"] = False
            risk_flags = list(normalized_candidate.get("risk_flags") or [])
            if eligibility["reason"] not in risk_flags:
                risk_flags.insert(0, eligibility["reason"])
            normalized_candidate["risk_flags"] = risk_flags
        calibrated, evidence_basis = calibrate_evidence_confidence(
            int(normalized_candidate.get("evidence_confidence", 0) or 0),
            normalized_candidate,
            candidate_sources,
        )
        normalized_candidate["evidence_confidence"] = calibrated
        intelligence["evidence_basis"] = evidence_basis
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
        failed_ai_calls = int(usage.get("failed_ai_calls", 0))
        succeeded_ai_calls = int(usage.get("ai_calls", 0))
        intelligence["research_metrics"] = {
            "tavily_searches": int(usage.get("tavily_searches", 0)),
            "openalex_lookups": int(usage.get("openalex_lookups", 0)),
            "pages_crawled": int(usage.get("pages_crawled", 0)),
            "ai_calls": succeeded_ai_calls,
            # SCHOLARDOCX-0191: a provider failure used to be indistinguishable
            # from a free call — both rendered as "0 credits used" beside a
            # non-zero call count, with no hint that the dossier had fallen
            # back to the deterministic analyser.
            "failed_ai_calls": failed_ai_calls,
            "analysis_degraded": bool(failed_ai_calls) and not succeeded_ai_calls,
            # Real credits actually deducted from the user's balance across every
            # billed call this run made (GLM chat/vision + OpenAlex). Tavily
            # searches are deliberately billed at $0 (see record_external_search)
            # so they contribute nothing here — this is the true amount cut, not
            # a token estimate.
            "credits_used": int(usage.get("credits_charged", 0)),
            "sources_inspected": len(candidate_sources),
            "elapsed_seconds": round(elapsed, 1),
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

    async def _attach_scholarly_record(
        self,
        analysis: dict[str, Any],
        candidate: dict[str, Any],
        usage: dict[str, Any] | None = None,
    ) -> None:
        """Attach the OpenAlex scholarly record to a candidate, if resolvable.

        Only the professor's name and institution leave the machine — public
        facts already sent to Tavily on every run. The applicant's interests,
        documents and profile are never included (FR-9.31 privacy posture).

        Silent on every failure: no key, exhausted daily budget, rate limit,
        outage, or an ambiguous name all leave the dossier exactly as good as it
        would have been without OpenAlex (FR-9.33).
        """
        name = str(candidate.get("display_name") or "").strip()
        if not name:
            return
        institution = str(
            analysis.get("candidate", {}).get("institution")
            or candidate.get("institution")
            or ""
        )

        # Pre-flight: never make a billable call the user cannot pay for.
        if not self.ai_service.can_spend_external():
            logger.info("Skipping OpenAlex enrichment for %s: no credits.", name)
            return

        try:
            client = OpenAlexClient(
                api_key=self.settings.openalex_api_key,
                base_url=self.settings.openalex_base_url,
            )
            record = await client.resolve_author(name, institution)
        except Exception as exc:  # pragma: no cover - defensive
            logger.info("OpenAlex enrichment skipped for %s: %s", name, exc)
            return

        # SCHOLARDOCX-0191: publications used to depend on crawling a scholarly
        # profile, and the two best sources cannot be crawled at all — Google
        # Scholar disallows /citations in robots.txt, ORCID and Semantic
        # Scholar return JavaScript shells. OpenAlex publishes the same works
        # as structured data. Fetched here, before the charge block, so the
        # call it makes is billed with the rest.
        works: list[dict[str, Any]] = []
        # Re-check funding: the author resolution above is itself billable, so
        # the balance that covered one call may no longer cover a second.
        if record and self.ai_service.can_spend_external():
            try:
                works = await client.recent_works(record["author_id"])
            except Exception as exc:  # pragma: no cover - defensive
                logger.info("OpenAlex works lookup skipped for %s: %s", name, exc)

        # Charge for the metered search that was actually issued, whether or not
        # it resolved to a confident match — the API call was made and billed by
        # OpenAlex either way. `resolve_author` declines to call at all when the
        # name is blank or the budget guard is tripped, and in those cases
        # `spent_usd` stays 0 so nothing is charged.
        #
        # Exactly one charge per metered call — no more, no fewer — each at its
        # own class's price. A professor now costs up to two calls (an author
        # search, then a works list), and OpenAlex prices those 10:1, so
        # billing both at the configured search price would overcharge. See
        # SCHOLARDOCX-0180 for what happens when a wrapper adds an extra
        # charge, and AGENTS.md for why an unbilled provider call is never
        # acceptable.
        search_price = self.ai_service.external_billing_cost(
            ai_tokens.get_openalex_call_cost_usd
        )
        for call_kind in client.metered_calls:
            charge_result = self.ai_service.charge_external_call(
                cost_usd=search_price * METERED_CALL_COST_RATIO.get(call_kind, 1.0),
                source=METERED_CALL_SOURCE.get(call_kind, "openalex_author_lookup"),
            )
            if usage is not None:
                usage["openalex_lookups"] = int(usage.get("openalex_lookups", 0)) + 1
                if charge_result is not None:
                    usage["credits_charged"] = int(usage.get("credits_charged", 0)) + int(
                        charge_result.get("charged", 0)
                    )
        if client.metered_calls and usage is not None:
            usage["openalex_cost_usd"] = round(
                float(usage.get("openalex_cost_usd", 0.0)) + client.spent_usd, 6
            )

        if not record:
            return

        activity = summarise_activity(record)
        if activity:
            record["activity_summary"] = activity

        # Indexed works are NOT model output and deliberately bypass the
        # generated-publication validation in `_validate_analysis`: they carry
        # DOIs from the same API that resolved the author, and that validation
        # exists to catch a model inventing a paper — which cannot happen here.
        if works:
            self._merge_scholarly_publications(analysis, works)
            record["works_retrieved"] = len(works)

        candidate_block = analysis.setdefault("candidate", {})
        intelligence = candidate_block.setdefault("intelligence", {})
        intelligence["scholarly_record"] = record

        # OpenAlex topics are publication-derived, so they corroborate rather
        # than replace the page-derived themes. Merge keeps both.
        if record.get("topics"):
            intelligence["research_interests"] = self._merge_fact_section(
                intelligence.get("research_interests"),
                {"themes": [topic["name"] for topic in record["topics"][:8]]},
                list_keys=("themes",),
                text_keys=(),
            )
        # affiliations[].years is a structured career timeline with real years —
        # strictly better evidence than the prose parsing in SCHOLARDOCX-0182.
        history = [
            f"{entry['institution']}"
            + (
                f" ({entry['start_year']}–{entry['end_year']})"
                if entry.get("start_year")
                else ""
            )
            for entry in record.get("affiliation_history") or []
        ]
        if history:
            intelligence["background"] = self._merge_fact_section(
                intelligence.get("background"),
                {"career_history": history},
                list_keys=("career_history",),
                text_keys=(),
            )

    @staticmethod
    def _merge_scholarly_publications(
        analysis: dict[str, Any],
        works: list[dict[str, Any]],
    ) -> None:
        """Union indexed works with whatever the page-derived pass verified.

        Indexed works lead: they are the only publication evidence that carries
        a DOI and a machine-verified author link. Page-derived entries for the
        same paper are dropped by title, and anything the pages found that
        OpenAlex has not indexed is kept behind them.
        """
        def key(item: dict[str, Any]) -> str:
            return re.sub(r"[^a-z0-9]", "", str(item.get("title") or "").lower())

        merged: dict[str, dict[str, Any]] = {}
        for item in works:
            marker = key(item)
            if marker:
                merged[marker] = item
        for item in analysis.get("publications", []) or []:
            marker = key(item)
            if marker and marker not in merged:
                merged[marker] = item
        publications = sorted(
            merged.values(),
            key=lambda item: item.get("publication_year") or 0,
            reverse=True,
        )[:8]
        for index, publication in enumerate(publications):
            publication["reading_priority"] = max(1, 5 - index)
        analysis["publications"] = publications

    @staticmethod
    def _merge_fact_section(
        existing: Any,
        verified: dict[str, Any],
        list_keys: tuple[str, ...],
        text_keys: tuple[str, ...],
    ) -> dict[str, Any]:
        """Union two fact dicts without either side discarding the other.

        Deterministic extraction and the GLM specialist passes each see things
        the other misses, so the dossier should hold the union. List fields are
        concatenated with order-preserving de-duplication (deterministic values
        first, since they are traceable to a specific page); text fields keep the
        longer, more informative value.
        """
        merged: dict[str, Any] = dict(existing) if isinstance(existing, dict) else {}
        for key, value in verified.items():
            if key in list_keys:
                combined = list(value or []) + list(merged.get(key) or [])
                seen: set[str] = set()
                unique: list[Any] = []
                for item in combined:
                    marker = str(item).strip().lower()
                    if not marker or marker in seen:
                        continue
                    seen.add(marker)
                    unique.append(item)
                merged[key] = unique
            elif key in text_keys:
                incoming = str(value or "").strip()
                current = str(merged.get(key) or "").strip()
                merged[key] = incoming if len(incoming) > len(current) else current
            elif value:
                merged[key] = value
        return merged

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

        # Merge, never replace (FR-9.29b). These blocks used to assign
        # `intelligence["background"] = background` outright, so a deterministic
        # extraction holding a single position discarded everything GLM had
        # correctly found — including a correct rank, replaced by a wrong one.
        background = verified.get("background") or {}
        if background.get("education") or background.get("positions") or background.get("career_history"):
            intelligence["background"] = self._merge_fact_section(
                intelligence.get("background"),
                background,
                list_keys=("education", "positions", "career_history"),
                text_keys=("summary",),
            )
        research = verified.get("research_interests") or {}
        if research.get("summary") or research.get("themes"):
            intelligence["research_interests"] = self._merge_fact_section(
                intelligence.get("research_interests"),
                research,
                list_keys=("themes", "methods", "applications"),
                text_keys=("summary",),
            )
            merged_research = intelligence["research_interests"]
            candidate["research_summary"] = merged_research.get("summary") or (
                "Verified research areas: " + ", ".join(merged_research.get("themes", [])) + "."
            )
        recent_activity = verified.get("recent_activity") or {}
        if recent_activity.get("items"):
            intelligence["recent_activity"] = self._merge_fact_section(
                intelligence.get("recent_activity"),
                recent_activity,
                list_keys=("items",),
                text_keys=("summary",),
            )
        # New enrichment dimensions (FR-9.29e). Omitted entirely when unsupported
        # so the dossier never renders an empty promise.
        lab = verified.get("lab_and_advisees") or {}
        if lab.get("current_members") or lab.get("recent_graduates"):
            intelligence["lab_and_advisees"] = self._merge_fact_section(
                intelligence.get("lab_and_advisees"),
                lab,
                list_keys=("current_members", "recent_graduates"),
                text_keys=(),
            )
        teaching = verified.get("teaching_and_service") or {}
        if teaching.get("courses") or teaching.get("service_summary"):
            intelligence["teaching_and_service"] = self._merge_fact_section(
                intelligence.get("teaching_and_service"),
                teaching,
                list_keys=("courses",),
                text_keys=("service_summary",),
            )
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
                    # Anchor the quote on the professor, not on wherever the page
                    # happens to start. A shared department page opens with the
                    # same grant boilerplate for everyone on it, so `content[:700]`
                    # showed one professor's funding paragraph as the supporting
                    # evidence for a dozen unrelated colleagues (SCHOLARDOCX-0190).
                    "evidence_excerpt": candidate_excerpt(
                        content,
                        candidate["display_name"],
                        700,
                    ),
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
            "openalex_lookups": 0,
            "pages_crawled": 0,
            "ai_calls": 0,
            "estimated_input_tokens": 0,
            "estimated_output_tokens": 0,
            "sources_inspected": 0,
            "credits_charged": 0,
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
