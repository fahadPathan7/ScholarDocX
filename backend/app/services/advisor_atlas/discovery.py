from __future__ import annotations

import re
from collections import Counter
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

import httpx

from app.services.advisor_atlas.crawler import PublicCrawler, clean_person_name
from app.services.advisor_atlas.intelligence import extract_related_units, normalize


Search = Callable[[str, int], Awaitable[list[dict[str, Any]]]]
DIRECTORY_HINTS = ("faculty", "people", "staff", "directory", "professor")


def university_map_queries(run: dict[str, Any]) -> list[str]:
    university = run.get("university_name", "")
    field = run.get("department", "")
    return [
        (
            f'"{university}" official academic departments schools institutes '
            f'centers programs related to "{field}"'
        ),
        (
            f'"{university}" "{field}" related departments interdisciplinary '
            "programs research centers official"
        ),
    ]


def unit_faculty_queries(run: dict[str, Any], unit_name: str) -> list[str]:
    university = run.get("university_name", "")
    site = urlparse(run.get("university_url") or "").netloc
    site_filter = f" site:{site}" if site else ""
    return [
        f'"{university}" "{unit_name}" official faculty directory professors{site_filter}',
        f'"{university}" "{unit_name}" faculty professor research profiles{site_filter}',
    ]


def directory_result_score(
    item: dict[str, Any],
    university_url: str | None = None,
) -> int:
    url = str(item.get("url") or "")
    title = str(item.get("title") or "")
    content = str(item.get("content") or "")
    haystack = f"{url} {title} {content}".lower()
    score = sum(18 for hint in DIRECTORY_HINTS if hint in haystack)
    if any(token in haystack for token in ("department", "school", "institute", "center")):
        score += 12
    expected_host = urlparse(university_url or "").netloc.lower()
    if expected_host and urlparse(url).netloc.lower().endswith(expected_host):
        score += 35
    if any(token in haystack for token in ("linkedin.com", "facebook.com", "instagram.com")):
        score -= 60
    return score


def select_directory_targets(
    results: list[dict[str, Any]],
    university_url: str | None = None,
    limit: int = 3,
) -> list[dict[str, Any]]:
    unique: dict[str, dict[str, Any]] = {}
    for item in results:
        url = str(item.get("url") or "")
        if not url:
            continue
        haystack = " ".join(
            str(item.get(field) or "") for field in ("url", "title", "content")
        ).lower()
        if not any(hint in haystack for hint in DIRECTORY_HINTS):
            continue
        score = directory_result_score(item, university_url)
        if score < 18:
            continue
        candidate = {**item, "directory_score": score}
        current = unique.get(url)
        if not current or score > current["directory_score"]:
            unique[url] = candidate
    return sorted(
        unique.values(),
        key=lambda item: (-int(item["directory_score"]), str(item.get("title") or "")),
    )[:limit]


def candidates_from_search(
    results: list[dict[str, Any]],
    run: dict[str, Any],
    unit: dict[str, Any],
) -> list[dict[str, Any]]:
    candidates = []
    for item in results:
        title = re.sub(r"\s+", " ", str(item.get("title") or "")).strip()
        segments = re.split(r"\s+[-|–—:]\s+", title)
        possible = segments[0].strip()
        # Shared with the crawler so search-derived and directory-derived names
        # obey identical rules: Unicode-aware, honorifics stripped,
        # "Last, First" flipped.
        name = clean_person_name(possible)
        if not name:
            continue
        if any(
            blocked in name.lower()
            for blocked in ("faculty directory", "research faculty", "department", "university")
        ):
            continue
        candidates.append(
            {
                "display_name": name,
                "institution": run.get("university_name"),
                "department": unit.get("name"),
                "department_relation": unit,
                "official_profile_url": item.get("url"),
                "source_title": title,
                "source_excerpt": str(item.get("content") or "")[:500],
            }
        )
    return candidates


UnitMapper = Callable[[str, str, list[str]], Awaitable[list[dict[str, Any]] | None]]


class DiscoveryResearcher:
    def __init__(
        self,
        crawler: PublicCrawler,
        search: Search,
        usage: dict[str, Any] | None = None,
        unit_mapper: UnitMapper | None = None,
    ) -> None:
        self.crawler = crawler
        self.search = search
        self.usage = usage
        # Optional AI mapper (analysis.map_related_units_with_glm). When absent
        # or when it returns nothing, collect() falls back to the deterministic
        # regex + taxonomy path, so discovery never regresses.
        self.unit_mapper = unit_mapper

    async def collect(
        self,
        run: dict[str, Any],
        seed_candidates: list[dict[str, Any]],
        seed_sources: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        candidates = list(seed_candidates)
        sources = list(seed_sources)
        for query in university_map_queries(run):
            results = await self.search(query, 14)
            for item in results:
                item["source_kind"] = "university_map_search"
            sources.extend(results)

        # Ask the AI mapper first (FR-9.25a). It sees the units already visible in
        # the search snippets so it can prefer names that actually exist at this
        # university rather than generic ones.
        ai_units: list[dict[str, Any]] | None = None
        if self.unit_mapper is not None:
            observed = [
                item["name"]
                for item in extract_related_units(run.get("department", ""), sources)
            ]
            try:
                ai_units = await self.unit_mapper(
                    run.get("university_name", "") or "",
                    run.get("department", "") or "",
                    observed,
                )
            except Exception:
                # Mapping is an enhancement; never fail a run because of it.
                ai_units = None
            if ai_units and self.usage is not None:
                self.usage["ai_mapped_units"] = len(ai_units)

        mapped_units = extract_related_units(
            run.get("department", ""), sources, mapped_units=ai_units
        )
        sources.append(
            {
                "title": "Advisor Atlas university map",
                "url": run.get("university_url") or "https://example.invalid/university-map",
                "content": "",
                "source_kind": "university_map",
                "mapped_units": mapped_units,
            }
        )

        for candidate in candidates:
            candidate.setdefault(
                "department_relation",
                self._relation_for_department(candidate.get("department"), mapped_units),
            )

        for unit in mapped_units[:10]:
            queries = unit_faculty_queries(run, unit["name"])
            primary_results = await self.search(queries[0], 14)
            self._tag_results(primary_results, unit, "faculty_directory_search")
            sources.extend(primary_results)
            candidates.extend(candidates_from_search(primary_results, run, unit))

            directory_targets = select_directory_targets(
                primary_results,
                run.get("university_url"),
                limit=4,
            )
            verified_for_unit = 0
            for target in directory_targets:
                directory_source = {
                    **target,
                    "source_kind": "faculty_directory",
                    "mapped_unit": unit["name"],
                    "unit_relation": unit.get("relation"),
                }
                try:
                    page = await self.crawler.fetch(target["url"])
                    if self.usage is not None:
                        self.usage["pages_crawled"] = int(
                            self.usage.get("pages_crawled", 0)
                        ) + 1
                    found = self.crawler.faculty_candidates(
                        page,
                        run.get("university_name"),
                        unit["name"],
                    )
                    for candidate in found:
                        candidate["department_relation"] = unit
                    candidates.extend(found)
                    verified_for_unit += len(found)
                    directory_source.update(
                        {
                            "title": page["title"],
                            "url": page["url"],
                            "content": page["text"][:7000],
                            "page": page,
                            "fetch_status": "accessible",
                            "faculty_candidates": len(found),
                        }
                    )
                except (httpx.HTTPError, PermissionError, ValueError) as exc:
                    directory_source.update(
                        {
                            "fetch_status": "inaccessible",
                            "faculty_candidates": 0,
                            "access_note": self._access_note(exc),
                        }
                    )
                sources.append(directory_source)

            if verified_for_unit + len(candidates_from_search(primary_results, run, unit)) < 2:
                fallback_results = await self.search(queries[1], 12)
                self._tag_results(fallback_results, unit, "faculty_profile_search")
                sources.extend(fallback_results)
                candidates.extend(candidates_from_search(fallback_results, run, unit))

        return candidates, sources

    @staticmethod
    def _tag_results(
        results: list[dict[str, Any]],
        unit: dict[str, Any],
        source_kind: str,
    ) -> None:
        for item in results:
            item["source_kind"] = source_kind
            item["mapped_unit"] = unit["name"]
            item["unit_relation"] = unit.get("relation")

    @staticmethod
    def _relation_for_department(
        department: str | None,
        mapped_units: list[dict[str, Any]],
    ) -> dict[str, Any]:
        department_key = normalize(department or "")
        return next(
            (
                unit
                for unit in mapped_units
                if normalize(str(unit.get("name") or "")) == department_key
            ),
            {},
        )

    @staticmethod
    def _access_note(exc: Exception) -> str:
        if isinstance(exc, PermissionError):
            return "Blocked by public access rules."
        if isinstance(exc, httpx.HTTPError):
            return "The public page could not be fetched."
        return str(exc)[:160] or "The directory could not be inspected."


def build_discovery_action_center(
    candidates: list[dict[str, Any]],
    discovery_sources: list[dict[str, Any]],
    run: dict[str, Any],
) -> dict[str, Any]:
    ranked = sorted(
        candidates,
        key=lambda item: (
            item.get("match_score", 0),
            item.get("evidence_confidence", 0),
        ),
        reverse=True,
    )
    mapped_units = next(
        (
            item.get("mapped_units", [])
            for item in discovery_sources
            if item.get("source_kind") == "university_map"
        ),
        [],
    )
    research_matches = [
        item
        for item in ranked
        if item.get("intelligence", {}).get(
            "is_research_match",
            item.get("match_score", 0) >= 60,
        )
    ]
    opportunity_matches = [
        item
        for item in research_matches
        if item.get("recruitment_state") == "confirmed_open"
        or item.get("intelligence", {}).get("opportunity_outlook", {}).get("status")
        in {"current_open", "high_likelihood"}
    ]
    source_urls = {
        item.get("url")
        for item in discovery_sources
        if item.get("url") and "example.invalid" not in item.get("url", "")
    }
    directories = [
        item
        for item in discovery_sources
        if item.get("source_kind") == "faculty_directory"
    ]
    accessible_directories = [
        item for item in directories if item.get("fetch_status") == "accessible"
    ]
    inaccessible_directories = [
        item for item in directories if item.get("fetch_status") == "inaccessible"
    ]
    relation_counts = Counter(
        str(unit.get("relation") or "related") for unit in mapped_units
    )
    unit_breakdown = []
    for unit in mapped_units:
        unit_name = str(unit.get("name") or "")
        faculty = [
            item
            for item in ranked
            if normalize(str(item.get("department") or "")) == normalize(unit_name)
        ]
        faculty_ids = {item["id"] for item in faculty}
        matched_ids = {
            item["id"] for item in research_matches if item["id"] in faculty_ids
        }
        opportunity_ids = {
            item["id"] for item in opportunity_matches if item["id"] in faculty_ids
        }
        unit_breakdown.append(
            {
                **unit,
                "faculty_count": len(faculty_ids),
                "research_match_count": len(matched_ids),
                "opportunity_count": len(opportunity_ids),
            }
        )

    units_without_faculty = [
        item["name"]
        for item in unit_breakdown
        if not item["faculty_count"]
    ]
    coverage_gaps = [
        f"{item.get('mapped_unit') or item.get('title')}: {item.get('access_note')}"
        for item in inaccessible_directories[:6]
    ]
    coverage_gaps.extend(
        f"No verified faculty were extracted for {name}."
        for name in units_without_faculty[:6]
    )
    summary = {
        "mode": run.get("mode"),
        "requested_field": run.get("department"),
        "department_map": unit_breakdown,
        "coverage": {
            "units_mapped": len(mapped_units),
            "direct_units": relation_counts["direct"],
            "adjacent_units": relation_counts["adjacent"],
            "interdisciplinary_units": relation_counts["interdisciplinary"],
            "sources_inspected": len(source_urls),
            "directories_inspected": len(directories),
            "directories_accessible": len(accessible_directories),
            "directories_inaccessible": len(inaccessible_directories),
            "verified_faculty": len(ranked),
            "research_matches": len(research_matches),
            "opportunity_matches": len(opportunity_matches),
            "completeness": "best_effort" if ranked else "insufficient_evidence",
            "completeness_note": (
                "Best-effort coverage from accessible public university sources. "
                "A complete faculty list cannot be guaranteed when directories are "
                "missing, blocked, dynamically rendered, or outdated."
            ),
            "coverage_gaps": coverage_gaps,
        },
        "faculty_ids": [item["id"] for item in ranked],
        "research_match_ids": [item["id"] for item in research_matches],
        "opportunity_match_ids": [item["id"] for item in opportunity_matches],
    }
    return {
        "discovery": summary,
        "matching_open": [
            {
                "candidate_id": item["id"],
                "name": item["display_name"],
                "state": item["recruitment_state"],
                "summary": item.get("recruitment_summary")
                or item.get("research_summary", "")[:180],
            }
            for item in opportunity_matches
        ],
        "matching_only": [
            {
                "candidate_id": item["id"],
                "name": item["display_name"],
                "match_score": item["match_score"],
                "reason": item.get("research_summary", "")[:180],
            }
            for item in research_matches
            if item["id"] not in summary["opportunity_match_ids"]
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
