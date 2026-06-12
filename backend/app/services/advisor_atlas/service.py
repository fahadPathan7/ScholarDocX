from __future__ import annotations

from datetime import datetime
import json
import logging
import re
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import Settings
from app.services.advisor_atlas.analysis import (
    FUNDING_SIGNAL,
    RECRUIT_OPEN,
    analyze_visual_source,
    analyze_with_glm,
    deterministic_analysis,
)
from app.services.advisor_atlas.crawler import (
    NAME_PATTERN,
    PublicCrawler,
    canonicalize_url,
    is_visual_url,
)
from app.services.advisor_atlas.repository import AdvisorAtlasRepository
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
    "actions",
]


class AdvisorAtlasService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.repository = AdvisorAtlasRepository(settings.database_path)
        self.crawler = PublicCrawler()
        self.ai_service = AiService(settings)

    async def run(self, run_id: int, user_id: int) -> None:
        run = self.repository.get_run(run_id, user_id, include_candidates=False)
        try:
            self.repository.update_run(
                run_id,
                status="running",
                current_stage="resolving",
                started_at=datetime.now().astimezone().isoformat(),
                progress_json={"completed": 0, "total": None, "message": "Resolving the institution and search scope"},
            )
            candidates, discovery_sources = await self._discover_candidates(run)
            if self.repository.is_cancelled(run_id):
                return
            if not candidates:
                raise ValueError(
                    "No professor candidates were discovered. Add an official department URL or use Focused Dossier with a professor name."
                )

            max_candidates = 20
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
            for candidate in candidates:
                if self.repository.is_cancelled(run_id):
                    return
                await self._process_candidate(run, user_id, candidate, discovery_sources)
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

            run_result = self.repository.get_run(run_id, user_id)
            action_center = self._build_action_center(run_result["candidates"])
            self.repository.update_run(
                run_id,
                status="completed",
                current_stage="completed",
                completed_at=datetime.now().astimezone().isoformat(),
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

    async def refresh_candidate(self, candidate_id: int, user_id: int) -> dict[str, Any]:
        candidate = self.repository.get_candidate(candidate_id, user_id)
        run = self.repository.get_run(candidate["run_id"], user_id, include_candidates=False)
        await self._process_candidate(run, user_id, candidate, [])
        return self.repository.get_candidate(candidate_id, user_id)

    async def _discover_candidates(
        self,
        run: dict[str, Any],
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
                    }
                )
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

        query = self._discovery_query(run)
        search_results = await self._tavily_search(query, max_results=12)
        sources.extend(search_results)
        if run["mode"] != "professor":
            candidates.extend(self._candidates_from_search(search_results, run))

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
        user_id: int,
        candidate: dict[str, Any],
        discovery_sources: list[dict[str, Any]],
    ) -> int:
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
                        "content": page["text"][:9000],
                        "page": page,
                    }
                )
                candidate["email"] = candidate.get("email") or (page["emails"][0] if page["emails"] else None)
            except (httpx.HTTPError, PermissionError, ValueError) as exc:
                logger.info("Candidate profile fetch skipped for %s: %s", candidate["display_name"], exc)

        detail_query = self._candidate_query(candidate, run)
        candidate_sources.extend(await self._tavily_search(detail_query, max_results=10))

        candidate_sources = self._dedupe_sources(candidate_sources)
        candidate_sources.extend(
            await self._visual_evidence(candidate_sources, candidate["display_name"])
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
        analysis = await analyze_with_glm(self.ai_service, candidate, candidate_sources, profile)
        if not analysis:
            analysis = deterministic_analysis(candidate, candidate_sources, profile)
        analysis = self._validate_analysis(analysis, candidate_sources)

        normalized_candidate = {**candidate, **analysis.get("candidate", {})}
        normalized_candidate["display_name"] = candidate["display_name"]
        normalized_candidate["institution"] = normalized_candidate.get("institution") or run.get("university_name")
        normalized_candidate["department"] = normalized_candidate.get("department") or run.get("department")
        normalized_candidate["official_profile_url"] = normalized_candidate.get("official_profile_url") or profile_url
        evidence = self._evidence_from_sources(candidate_sources, normalized_candidate)
        return self.repository.replace_candidate_data(
            int(run["id"]),
            user_id,
            normalized_candidate,
            evidence,
            analysis.get("publications", []),
            analysis.get("dossier", {}),
        )

    async def _visual_evidence(
        self,
        sources: list[dict[str, Any]],
        candidate_name: str,
    ) -> list[dict[str, Any]]:
        if not self.settings.glm_api_key:
            return []
        enriched = []
        for source in (item for item in sources if is_visual_url(item.get("url", ""))):
            if len(enriched) == 2:
                break
            try:
                visual = await self.crawler.inspect_visual(source["url"])
                result = await analyze_visual_source(
                    self.ai_service,
                    visual,
                    candidate_name,
                )
                if result:
                    enriched.append(result)
            except (httpx.HTTPError, PermissionError, ValueError) as exc:
                logger.info("Visual source skipped for %s: %s", candidate_name, exc)
        return enriched

    def _validate_analysis(
        self,
        analysis: dict[str, Any],
        sources: list[dict[str, Any]],
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
        for field in ("official_profile_url", "personal_url", "lab_url"):
            value = candidate.get(field)
            if value:
                try:
                    if canonicalize_url(value) not in allowed_urls:
                        candidate[field] = None
                except (TypeError, ValueError):
                    candidate[field] = None

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
        for item in analysis.get("publications", [])[:5]:
            title = str(item.get("title", "")).strip()
            source_url = item.get("source_url")
            if not title or not source_url:
                continue
            try:
                if canonicalize_url(source_url) not in allowed_urls:
                    continue
            except (TypeError, ValueError):
                continue
            item["reading_priority"] = max(
                1,
                min(5, int(item.get("reading_priority", 1))),
            )
            valid_publications.append(item)
        analysis["publications"] = valid_publications
        return analysis

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

    def _candidates_from_search(
        self,
        results: list[dict[str, Any]],
        run: dict[str, Any],
    ) -> list[dict[str, Any]]:
        candidates = []
        for item in results:
            title = re.sub(r"\s+", " ", item.get("title", "")).strip()
            segments = re.split(r"\s+[-|–—:]\s+", title)
            possible = segments[0].strip()
            match = NAME_PATTERN.match(possible)
            if not match:
                continue
            name = match.group(1)
            if any(
                blocked in name.lower()
                for blocked in ("faculty directory", "research faculty", "department", "university")
            ):
                continue
            candidates.append(
                {
                    "display_name": name,
                    "institution": run.get("university_name"),
                    "department": run.get("department"),
                    "official_profile_url": item.get("url"),
                    "source_title": title,
                    "source_excerpt": item.get("content", "")[:500],
                }
            )
        return candidates

    def _evidence_from_sources(
        self,
        sources: list[dict[str, Any]],
        candidate: dict[str, Any],
    ) -> list[dict[str, Any]]:
        evidence = []
        institution_token = (candidate.get("institution") or "").lower().split()
        for item in sources[:20]:
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
                    "claim_type": "profile",
                    "claim_text": f"Public source inspected for {candidate['display_name']}.",
                    "evidence_excerpt": content[:700],
                    "confidence": 85 if official else 60,
                    "metadata": {"provider_score": item.get("score")},
                }
            )
        return evidence

    def _dedupe_sources(self, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
        unique = {}
        for item in sources:
            url = item.get("url")
            if url:
                unique[canonicalize_url(url)] = item
        return list(unique.values())

    def _build_action_center(self, candidates: list[dict[str, Any]]) -> dict[str, Any]:
        ranked = sorted(
            candidates,
            key=lambda item: (item.get("match_score", 0), item.get("evidence_confidence", 0)),
            reverse=True,
        )
        return {
            "matching_open": [
                {
                    "candidate_id": item["id"],
                    "name": item["display_name"],
                    "state": item["recruitment_state"],
                    "summary": item.get("recruitment_summary") or item.get("research_summary", "")[:180],
                }
                for item in ranked
                if item.get("match_score", 0) >= 60 and item["recruitment_state"] in {"confirmed_open", "strong_signal"}
            ],
            "matching_only": [
                {
                    "candidate_id": item["id"],
                    "name": item["display_name"],
                    "match_score": item["match_score"],
                    "reason": item.get("research_summary", "")[:180],
                }
                for item in ranked
                if item.get("match_score", 0) >= 60 and item["recruitment_state"] not in {"confirmed_open", "strong_signal"}
            ],
            "reading_plan": [
                f"Open the Advisor Dossier for {item['display_name']} and read the highest-priority paper."
                for item in ranked[:3]
            ],
            "verification_plan": [
                f"Verify current recruitment and intake timing for {item['display_name']}."
                for item in ranked[:5]
                if item["recruitment_state"] in {"unknown", "possible_opportunity"}
            ],
            "preparation_plan": [
                "Prepare a concise research bridge linking your experience to the top professor's recent work.",
                "Document method gaps before drafting outreach.",
                "Prioritize candidates with both strong fit and strong evidence.",
            ],
        }
