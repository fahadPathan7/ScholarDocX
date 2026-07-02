from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

import httpx

from app.services.advisor_atlas.analysis import analyze_visual_source
from app.services.advisor_atlas.crawler import (
    PublicCrawler,
    canonicalize_url,
    is_visual_url,
)
from app.services.advisor_atlas.professor_research import (
    discover_profile_links,
    linked_professor_targets,
    professor_query_plan,
    select_candidate_email,
    select_crawl_targets,
)
from app.services.ai import AiService

logger = logging.getLogger(__name__)

Search = Callable[[str, int], Awaitable[list[dict[str, Any]]]]

# Deep-research budgets (SCHOLARDOCX-0109). Depth is always on: these bound a
# single candidate's research, not a per-run toggle.
RANKED_CRAWL_LIMIT = 16
LINKED_CRAWL_LIMIT = 12
LINKED_CRAWL_ROUNDS = 3
VISUAL_EVIDENCE_LIMIT = 3
CRAWL_TEXT_LIMIT = 16_000

# Discovery deep phase: how many screened candidates get the full professor
# pipeline, and the minimum fit score required to qualify.
DEEP_DISCOVERY_LIMIT = 15
DEEP_MATCH_FLOOR = 30


def select_deep_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        candidates,
        key=lambda item: (
            int(item.get("match_score") or 0),
            int(item.get("evidence_confidence") or 0),
        ),
        reverse=True,
    )
    return [
        item
        for item in ranked
        if int(item.get("match_score") or 0) >= DEEP_MATCH_FLOOR
    ][:DEEP_DISCOVERY_LIMIT]


async def run_professor_search_passes(
    search: Search,
    candidate: dict[str, Any],
    run: dict[str, Any],
) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for research_pass in professor_query_plan(candidate, run):
        results = await search(research_pass["query"], int(research_pass["max_results"]))
        for item in results:
            item["source_kind"] = research_pass["kind"]
        sources.extend(results)
    return sources


async def crawl_ranked_sources(
    crawler: PublicCrawler,
    sources: list[dict[str, Any]],
    candidate: dict[str, Any],
    usage: dict[str, Any],
) -> list[dict[str, Any]]:
    crawled: list[dict[str, Any]] = []
    targets = select_crawl_targets(
        sources,
        candidate["display_name"],
        candidate.get("institution"),
        limit=RANKED_CRAWL_LIMIT,
    )
    for source in targets:
        try:
            page = await crawler.fetch(source["url"])
            crawled.append(
                {
                    **source,
                    "title": page["title"] or source.get("title"),
                    "url": page["url"],
                    "content": page["text"][:CRAWL_TEXT_LIMIT],
                    "page": page,
                    "source_origin": "crawl",
                }
            )
            usage["pages_crawled"] = int(usage.get("pages_crawled", 0)) + 1
            candidate["email"] = candidate.get("email") or select_candidate_email(
                [crawled[-1]],
                candidate["display_name"],
            )
        except (httpx.HTTPError, PermissionError, ValueError) as exc:
            logger.info("Research source crawl skipped for %s: %s", candidate["display_name"], exc)
    return crawled


async def crawl_linked_professor_pages(
    crawler: PublicCrawler,
    sources: list[dict[str, Any]],
    candidate: dict[str, Any],
    usage: dict[str, Any],
) -> list[dict[str, Any]]:
    crawled: list[dict[str, Any]] = []
    accumulated = list(sources)
    profiles = discover_profile_links(accumulated, candidate["display_name"])
    seed_urls = [
        profiles.get("personal_url"),
        profiles.get("lab_url"),
    ]
    existing_pages = {
        canonicalize_url(item["url"])
        for item in accumulated
        if item.get("url") and isinstance(item.get("page"), dict)
    }
    for url in seed_urls:
        if not url or canonicalize_url(url) in existing_pages:
            continue
        try:
            page = await crawler.fetch(url)
            source = {
                "title": page["title"],
                "url": page["url"],
                "content": page["text"][:CRAWL_TEXT_LIMIT],
                "page": page,
                "source_kind": "profiles",
                "source_origin": "linked_seed",
            }
            crawled.append(source)
            accumulated.append(source)
            existing_pages.add(canonicalize_url(page["url"]))
            usage["pages_crawled"] = int(usage.get("pages_crawled", 0)) + 1
        except (httpx.HTTPError, PermissionError, ValueError) as exc:
            logger.info(
                "Professor-owned seed page skipped for %s: %s",
                candidate["display_name"],
                exc,
            )
    for _ in range(LINKED_CRAWL_ROUNDS):
        targets = linked_professor_targets(
            accumulated,
            candidate["display_name"],
            limit=max(0, LINKED_CRAWL_LIMIT - len(crawled)),
        )
        if not targets:
            break
        for target in targets:
            try:
                page = await crawler.fetch(target["url"])
                source = {
                    **target,
                    "title": page["title"] or target.get("title"),
                    "url": page["url"],
                    "content": page["text"][:CRAWL_TEXT_LIMIT],
                    "page": page,
                    "source_origin": "linked_crawl",
                }
                crawled.append(source)
                accumulated.append(source)
                usage["pages_crawled"] = int(usage.get("pages_crawled", 0)) + 1
            except (httpx.HTTPError, PermissionError, ValueError) as exc:
                logger.info(
                    "Linked professor page skipped for %s: %s",
                    candidate["display_name"],
                    exc,
                )
            if len(crawled) == LINKED_CRAWL_LIMIT:
                break
        if len(crawled) == LINKED_CRAWL_LIMIT:
            break
    candidate["email"] = candidate.get("email") or select_candidate_email(
        accumulated,
        candidate["display_name"],
    )
    return crawled


async def gather_visual_evidence(
    crawler: PublicCrawler,
    ai_service: AiService,
    sources: list[dict[str, Any]],
    candidate_name: str,
    usage: dict[str, Any],
) -> list[dict[str, Any]]:
    if not ai_service.settings.glm_api_key:
        return []
    enriched: list[dict[str, Any]] = []
    for source in (item for item in sources if is_visual_url(item.get("url", ""))):
        if len(enriched) == VISUAL_EVIDENCE_LIMIT:
            break
        try:
            visual = await crawler.inspect_visual(source["url"])
            result = await analyze_visual_source(
                ai_service,
                visual,
                candidate_name,
                usage,
            )
            if result:
                enriched.append(result)
        except (httpx.HTTPError, PermissionError, ValueError) as exc:
            logger.info("Visual source skipped for %s: %s", candidate_name, exc)
    return enriched
