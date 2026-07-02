from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from app.services.advisor_atlas.crawler import EMAIL_PATTERN, canonicalize_url


PUBLICATION_BLOCKLIST = re.compile(
    r"\b(fully funded|phd position|phd opening|studentship|applykite|faculty member|"
    r"faculty profile|assistant professor|associate professor|professor of|"
    r"department of|research group|personal website|linkedin|google scholar)\b",
    re.IGNORECASE,
)
SCHOLARLY_SIGNAL = re.compile(
    r"\b(doi|journal|conference|proceedings|transactions|letters|symposium|"
    r"workshop|arxiv|springer|elsevier|wiley|acm|ieee|publication)\b",
    re.IGNORECASE,
)
PROFILE_HOSTS = {
    "linkedin.com": "linkedin_url",
    "scholar.google": "google_scholar_url",
    "orcid.org": "orcid_url",
    "semanticscholar.org": "semantic_scholar_url",
    "researchgate.net": "researchgate_url",
}
PROFILE_PLATFORM_HOSTS = (
    "linkedin.com",
    "scholar.google.",
    "orcid.org",
    "semanticscholar.org",
    "researchgate.net",
    "github.com",
)
PROFILE_BLOCKED_HOSTS = (
    "instagram.com",
    "facebook.com",
    "applykite.com",
    "adscientificindex.com",
)
SOURCE_PRIORITY = {
    "identity": 34,
    "profiles": 30,
    "research": 28,
    "publications": 32,
    "scholar_metrics": 31,
    "funding": 31,
    "recruitment": 29,
    "news_activity": 18,
    "official_profile": 36,
    "vision": 12,
}


def normalize_professor_research_voice(summary: str, professor_name: str) -> str:
    clean = re.sub(r"\s+", " ", summary or "").strip()
    if not clean:
        return ""
    _, surname = _name_parts(professor_name)
    reference = surname.title() if surname else "The professor"
    possessive = f"{reference}'" if reference.endswith("s") else f"{reference}'s"
    replacements = (
        (r"\bmy research\b", f"{possessive} research"),
        (r"\bmy work\b", f"{possessive} work"),
        (r"\bI am\b", f"{reference} is"),
        (r"\bI'm\b", f"{reference} is"),
        (r"\bI have\b", f"{reference} has"),
        (r"\bI focus\b", f"{reference} focuses"),
        (r"\bI work\b", f"{reference} works"),
        (r"\bI study\b", f"{reference} studies"),
    )
    for pattern, replacement in replacements:
        clean = re.sub(pattern, replacement, clean, flags=re.IGNORECASE)
    return clean


def professor_query_plan(
    candidate: dict[str, Any],
    run: dict[str, Any],
) -> list[dict[str, Any]]:
    name = candidate["display_name"]
    institution = candidate.get("institution") or run.get("university_name") or ""
    department = candidate.get("department") or run.get("department") or ""
    return [
        {
            "kind": "identity",
            "query": (
                f'"{name}" "{institution}" {department} official faculty profile '
                "biography CV education appointment"
            ),
            "max_results": 10,
        },
        {
            "kind": "profiles",
            "query": (
                f'"{name}" "{institution}" personal website portfolio LinkedIn '
                '"Google Scholar" ORCID Semantic Scholar ResearchGate'
            ),
            "max_results": 10,
        },
        {
            "kind": "research",
            "query": (
                f'"{name}" "{institution}" research interests lab research group '
                "projects collaborators graduate students"
            ),
            "max_results": 10,
        },
        {
            "kind": "publications",
            "query": (
                f'"{name}" latest publications papers 2026 2025 2024 2023 '
                "journal conference DOI"
            ),
            "max_results": 12,
        },
        {
            "kind": "scholar_metrics",
            "query": (
                f'"{name}" "Google Scholar" OR DBLP OR OpenAlex OR '
                '"Semantic Scholar" citations author profile h-index'
            ),
            "max_results": 8,
        },
        {
            "kind": "funding",
            "query": (
                f'"{name}" "{institution}" grant award funding funded project '
                "NSF NIH DOE sponsor principal investigator"
            ),
            "max_results": 10,
        },
        {
            "kind": "recruitment",
            "query": (
                f'"{name}" "{institution}" accepting recruiting seeking PhD students '
                "graduate assistant opening join lab application"
            ),
            "max_results": 10,
        },
        {
            "kind": "news_activity",
            "query": (
                f'"{name}" "{institution}" news announcement award appointment '
                "keynote seminar talk 2025 2026"
            ),
            "max_results": 8,
        },
    ]


def candidate_source_relevance(source: dict[str, Any], candidate_name: str) -> bool:
    haystack = f"{source.get('title', '')} {source.get('content', '')}".lower()
    name_parts = [
        part.lower()
        for part in re.findall(r"[A-Za-z][A-Za-z'-]+", candidate_name)
        if len(part) > 2
    ]
    if not name_parts:
        return True
    return sum(part in haystack for part in name_parts) >= min(2, len(name_parts))


def candidate_excerpt(text: str, candidate_name: str, limit: int = 1800) -> str:
    clean = re.sub(r"\s+", " ", text or "").strip()
    if not clean:
        return ""
    matches = list(re.finditer(re.escape(candidate_name), clean, re.IGNORECASE))
    if not matches:
        return clean[:limit]
    first_name, surname = _name_parts(candidate_name)
    best = max(
        matches,
        key=lambda match: _identity_window_score(
            clean[match.start() : match.start() + limit],
            first_name,
            surname,
        ),
    )
    excerpt = clean[best.start() : best.start() + limit]
    section_markers = (
        "Personnel Profile",
        "Profile picture",
    )
    boundaries = []
    for marker in section_markers:
        next_section = excerpt.lower().find(marker.lower(), 80)
        if next_section > 0:
            boundaries.append(next_section)
    return excerpt[: min(boundaries) if boundaries else len(excerpt)]


def source_score(source: dict[str, Any], institution: str | None = None) -> int:
    url = str(source.get("url") or "")
    host = urlparse(url).netloc.lower()
    kind = str(source.get("source_kind") or "")
    score = SOURCE_PRIORITY.get(kind, 10)
    if host.endswith(".edu") or ".edu." in host or host.endswith(".ac.uk"):
        score += 26
    if institution:
        tokens = [token for token in re.findall(r"[a-z0-9]+", institution.lower()) if len(token) > 3]
        if any(token in host for token in tokens):
            score += 18
    if any(value in host for value in ("doi.org", "ieee.org", "acm.org", "springer.com", "arxiv.org")):
        score += 18
    if any(value in host for value in ("applykite", "instagram.com", "facebook.com")):
        score -= 24
    provider_score = source.get("score")
    if isinstance(provider_score, (int, float)):
        score += round(provider_score * 12)
    return score


def select_crawl_targets(
    sources: list[dict[str, Any]],
    candidate_name: str,
    institution: str | None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    targets = []
    seen: set[str] = set()
    blocked_hosts = ("linkedin.com", "instagram.com", "facebook.com", "x.com")
    for source in sorted(
        sources,
        key=lambda item: source_score(item, institution),
        reverse=True,
    ):
        url = str(source.get("url") or "")
        if not url or any(host in urlparse(url).netloc.lower() for host in blocked_hosts):
            continue
        if not candidate_source_relevance(source, candidate_name):
            continue
        canonical = canonicalize_url(url)
        if canonical in seen:
            continue
        targets.append(source)
        seen.add(canonical)
        if len(targets) == limit:
            break
    return targets


def select_evidence_sources(
    sources: list[dict[str, Any]],
    candidate_name: str,
    institution: str | None,
    limit: int = 12,
) -> list[dict[str, Any]]:
    ranked = sorted(
        (
            item
            for item in sources
            if item.get("url")
            and "example.invalid" not in str(item.get("url"))
            and candidate_source_relevance(item, candidate_name)
        ),
        key=lambda item: source_score(item, institution),
        reverse=True,
    )
    selected: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    seen_kinds: set[str] = set()
    for prefer_new_kind in (True, False):
        for item in ranked:
            canonical = canonicalize_url(item["url"])
            kind = str(item.get("source_kind") or "web")
            if canonical in seen_urls or (prefer_new_kind and kind in seen_kinds):
                continue
            selected.append(item)
            seen_urls.add(canonical)
            seen_kinds.add(kind)
            if len(selected) == limit:
                return selected
    return selected


def discover_profile_links(
    sources: list[dict[str, Any]],
    candidate_name: str,
) -> dict[str, Any]:
    profiles: dict[str, Any] = {"other_profiles": []}
    seen: set[str] = set()
    candidates: list[dict[str, Any]] = []
    for source in sources:
        if not candidate_source_relevance(source, candidate_name):
            continue
        candidates.append(
            {
                "url": source.get("url"),
                "label": source.get("title"),
                "content": source.get("content") or source.get("text") or "",
                "source_kind": source.get("source_kind"),
                "parent_url": None,
            }
        )
        page = source.get("page")
        if isinstance(page, dict):
            for link in page.get("links", []):
                if isinstance(link, dict):
                    candidates.append(
                        {
                            "url": link.get("url"),
                            "label": link.get("text"),
                            "content": candidate_excerpt(
                                source.get("content") or source.get("text") or "",
                                candidate_name,
                                900,
                            ),
                            "source_kind": "linked_profile",
                            "parent_url": source.get("url"),
                        }
                    )

    for item in candidates:
        url = str(item.get("url") or "")
        if not url:
            continue
        host = urlparse(url).netloc.lower().removeprefix("www.")
        label = str(item.get("label") or "").lower()
        if any(blocked in host for blocked in PROFILE_BLOCKED_HOSTS):
            continue
        matched_field = _profile_field(url, label)
        if matched_field and not profiles.get(matched_field):
            profiles[matched_field] = url
            seen.add(canonicalize_url(url))
        elif _is_personal_profile(item, candidate_name) and not profiles.get("personal_url"):
            profiles["personal_url"] = url
            seen.add(canonicalize_url(url))
        elif (
            not item.get("parent_url")
            and item.get("source_kind") in {"identity", "profiles", "official_profile"}
        ):
            canonical = canonicalize_url(url)
            if canonical not in seen:
                profiles["other_profiles"].append(
                    {
                        "label": item.get("label") or host,
                        "url": url,
                        "type": "official" if host.endswith(".edu") or ".edu." in host else "web",
                    }
                )
                seen.add(canonical)
    profiles["other_profiles"] = profiles["other_profiles"][:5]
    return profiles


def linked_professor_targets(
    sources: list[dict[str, Any]],
    candidate_name: str,
    limit: int = 8,
) -> list[dict[str, Any]]:
    targets: list[dict[str, Any]] = []
    seen = {
        canonicalize_url(item["url"])
        for item in sources
        if item.get("url")
    }
    wanted = re.compile(
        r"\b(publications?|papers?|activities|experience|curriculum vitae|cv|"
        r"scholar|github|homepage|personal|research|lab)\b",
        re.IGNORECASE,
    )
    for source in sorted(sources, key=lambda item: source_score(item), reverse=True):
        if not candidate_source_relevance(source, candidate_name):
            continue
        page = source.get("page")
        if not isinstance(page, dict):
            continue
        parent_host = urlparse(str(source.get("url") or "")).netloc.lower()
        for link in page.get("links", []):
            if not isinstance(link, dict):
                continue
            url = str(link.get("url") or "")
            label = str(link.get("text") or "")
            if not url or not wanted.search(f"{label} {url}"):
                continue
            host = urlparse(url).netloc.lower()
            if any(blocked in host for blocked in PROFILE_BLOCKED_HOSTS):
                continue
            if host != parent_host and not any(platform in host for platform in PROFILE_PLATFORM_HOSTS):
                continue
            canonical = canonicalize_url(url)
            if canonical in seen:
                continue
            kind = (
                "publications"
                if re.search(r"publication|paper|scholar", f"{label} {url}", re.IGNORECASE)
                else "profiles"
                if any(platform in host for platform in PROFILE_PLATFORM_HOSTS)
                else "research"
            )
            targets.append({"url": url, "title": label or url, "source_kind": kind})
            seen.add(canonical)
            if len(targets) == limit:
                return targets
    return targets


def select_candidate_email(
    sources: list[dict[str, Any]],
    candidate_name: str,
) -> str | None:
    first_name, surname = _name_parts(candidate_name)
    scored: list[tuple[int, str]] = []
    for source in sources:
        if not candidate_source_relevance(source, candidate_name):
            continue
        page = source.get("page")
        emails = set(page.get("emails", [])) if isinstance(page, dict) else set()
        emails.update(EMAIL_PATTERN.findall(str(source.get("content") or "")))
        excerpt = candidate_excerpt(
            str(source.get("content") or ""),
            candidate_name,
            1300,
        ).lower()
        for email in emails:
            local = email.split("@", 1)[0].lower()
            score = 0
            if first_name and first_name in local:
                score += 5
            if surname and surname in local:
                score += 6
            if email.lower() in excerpt:
                score += 4
            if score >= 9:
                scored.append((score, email))
    return max(scored, default=(0, None))[1]


def extract_verified_professor_facts(
    candidate: dict[str, Any],
    sources: list[dict[str, Any]],
) -> dict[str, Any]:
    name = candidate["display_name"]
    profiles = discover_profile_links(sources, name)
    official = _best_official_profile(sources, name, candidate.get("institution"))
    if official:
        profiles["official_profile_url"] = official
    personal_host = urlparse(str(profiles.get("personal_url") or "")).netloc.lower()
    background = {"summary": "", "positions": [], "education": []}
    research = {"summary": "", "themes": [], "methods": [], "applications": []}
    recent_activity: list[str] = []
    publications: list[dict[str, Any]] = []

    for source in sources:
        if not candidate_source_relevance(source, name):
            continue
        text = str(source.get("content") or source.get("text") or "")
        excerpt = candidate_excerpt(text, name)
        lower = excerpt.lower()
        url = str(source.get("url") or "")
        host = urlparse(url).netloc.lower()
        trusted_identity_source = (
            host == personal_host
            or host.endswith(".edu")
            or ".edu." in host
            or source.get("source_kind") == "official_profile"
        )
        if trusted_identity_source and "key research areas:" in lower:
            areas = _extract_after_label(
                excerpt,
                "Key Research Areas:",
                (
                    "Key Research Areas:",
                    "Profile picture",
                    "Assistant Professor",
                    "Associate Professor",
                    "Professor ",
                    "STAFF",
                ),
            )
            research["themes"].extend(_split_topics(areas))
        if trusted_identity_source and "research interests" in lower:
            interest_summary = _extract_after_label(
                excerpt,
                "Research Interests",
                ("Recent Updates", "Education", "My Schedule"),
            )
            if interest_summary and len(interest_summary) > len(research["summary"]):
                research["summary"] = interest_summary
                research["themes"].extend(
                    _topic_phrases(
                        interest_summary,
                        (
                            "self-supervised learning",
                            "few-shot learning",
                            "transfer learning",
                            "deep learning",
                            "computer vision",
                            "machine learning",
                            "visual understanding",
                            "limited supervision",
                        ),
                    )
                )
        if trusted_identity_source:
            for degree in re.findall(
                r"(Ph\.?D\.? in [^.()]{3,100}?(?:19|20)\d{2}|"
                r"Ph\.?D\.? in [^(]{3,80}\([^)]{4,40}\)|"
                r"B\.?Tech in [^(]{3,80}\([^)]{4,40}\))",
                excerpt,
                re.IGNORECASE,
            ):
                background["education"].append(re.sub(r"\s+", " ", degree).strip())
            for position in re.findall(
                r"((?:Machine Learning|Data Science) Intern\b[^()]{0,40}"
                r"(?:\([^)]{2,30}\))?,[^()]{3,100}\([^)]{4,40}\)|"
                r"Graduate Research Assistant[^()]{3,150}\([^)]{4,40}\)|"
                r"Research Assistant[^()]{3,150}\([^)]{4,40}\)|"
                r"\bIntern\b,?[^()]{3,150}\([^)]{4,40}\))",
                excerpt,
                re.IGNORECASE,
            ):
                background["positions"].append(re.sub(r"\s+", " ", position).strip())
        if trusted_identity_source and "assistant professor" in lower:
            position = "Assistant Professor"
            institution = _institution_label(candidate, source)
            if institution:
                position += f", {institution}"
            background["positions"].append(position)
        new_faculty_evidence = (
            "incoming" in lower and "faculty" in lower
        ) or "new faculty" in f"{source.get('title', '')} {excerpt}".lower()
        if trusted_identity_source and new_faculty_evidence:
            years = re.findall(
                r"\b20\d{2}(?:-\d{2})?\b",
                f"{source.get('title', '')} {excerpt}",
            )
            if years:
                background["positions"].append(
                    f"Listed in the university's {years[0]} new-faculty cohort"
                )
        if trusted_identity_source and "recent updates" in lower:
            updates = _extract_after_label(
                excerpt,
                "Recent Updates",
                ("Education", "My Schedule"),
            )
            recent_activity.extend(
                part.strip()
                for part in re.split(r"(?=\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})", updates)
                if len(part.strip()) > 12
            )
        publications.extend(_publications_from_table(source, name))

    research["themes"] = _unique(research["themes"])[:10]
    research["methods"] = [
        value
        for value in research["themes"]
        if any(term in value.lower() for term in ("learning", "supervision", "vision"))
    ][:6]
    if not research["summary"] and research["themes"]:
        research["summary"] = "Verified research areas: " + ", ".join(research["themes"]) + "."
    research["summary"] = normalize_professor_research_voice(research["summary"], name)
    background["education"] = _dedupe_education(background["education"])[:8]
    background["positions"] = _dedupe_positions(background["positions"])[:8]
    if background["education"] or background["positions"]:
        background["summary"] = "Verified education and appointment evidence from professor-owned or official sources."

    return {
        "email": select_candidate_email(sources, name),
        "profiles": profiles,
        "background": background,
        "research_interests": research,
        "recent_activity": {
            "summary": "Recent dated activity from the professor's public site." if recent_activity else "",
            "items": _unique(recent_activity)[:8],
        },
        "publications": _dedupe_publications(publications)[:8],
    }


def is_scholarly_publication(item: dict[str, Any]) -> bool:
    title = re.sub(r"\s+", " ", str(item.get("title") or "")).strip()
    if len(title.split()) < 4 or PUBLICATION_BLOCKLIST.search(title):
        return False
    source_url = str(item.get("source_url") or "")
    host = urlparse(source_url).netloc.lower()
    context = " ".join(
        str(item.get(key) or "")
        for key in ("title", "venue", "doi", "relevance_reason")
    )
    scholarly_host = any(
        value in host
        for value in (
            "doi.org",
            "ieee.org",
            "acm.org",
            "springer.com",
            "sciencedirect.com",
            "arxiv.org",
            "semanticscholar.org",
            "scholar.google",
        )
    )
    return bool(item.get("doi") or item.get("venue") or scholarly_host or SCHOLARLY_SIGNAL.search(context))


def publication_authorship_matches(item: dict[str, Any], candidate_name: str) -> bool:
    authors = item.get("authors")
    if not isinstance(authors, list) or not authors:
        return False
    first_name, surname = _name_parts(candidate_name)
    for author in authors:
        normalized = re.sub(r"[^a-z ]", " ", str(author).lower())
        words = normalized.split()
        if surname and surname in words:
            if first_name in words or any(word == first_name[:1] for word in words):
                return True
    return False


def publication_supported_by_sources(
    item: dict[str, Any],
    candidate_name: str,
    sources: list[dict[str, Any]],
) -> bool:
    if not publication_authorship_matches(item, candidate_name):
        return False
    source_url = canonicalize_url(str(item.get("source_url") or ""))
    title_tokens = [
        token
        for token in re.findall(r"[a-z0-9]+", str(item.get("title") or "").lower())
        if len(token) > 4
    ][:5]
    _, surname = _name_parts(candidate_name)
    for source in sources:
        if not source.get("url") or canonicalize_url(source["url"]) != source_url:
            continue
        text = f"{source.get('title', '')} {source.get('content', '')}".lower()
        if surname in text and sum(token in text for token in title_tokens) >= min(3, len(title_tokens)):
            return True
        page = source.get("page")
        if isinstance(page, dict):
            for row in page.get("table_rows", []):
                row_text = " ".join(str(value) for value in row).lower()
                if surname in row_text and sum(token in row_text for token in title_tokens) >= min(3, len(title_tokens)):
                    return True
    return False


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text) / 4))


def _name_parts(candidate_name: str) -> tuple[str, str]:
    parts = re.findall(r"[a-z]+", candidate_name.lower())
    return (parts[0], parts[-1]) if parts else ("", "")


def _identity_window_score(text: str, first_name: str, surname: str) -> int:
    lower = text.lower()
    return (
        (4 if "assistant professor" in lower or "associate professor" in lower else 0)
        + (4 if "phd" in lower else 0)
        + (4 if "research areas" in lower or "research interests" in lower else 0)
        + (5 if first_name and surname and re.search(rf"{first_name}[._-]?{surname}@", lower) else 0)
    )


def _profile_field(url: str, label: str) -> str | None:
    normalized_url = canonicalize_url(url)
    parsed = urlparse(normalized_url)
    host = parsed.netloc.lower().removeprefix("www.")
    if "linkedin.com" in host and "/in/" in parsed.path:
        return "linkedin_url"
    if "scholar.google." in host and "user=" in parsed.query:
        return "google_scholar_url"
    if "orcid.org" in host:
        return "orcid_url"
    if "semanticscholar.org" in host and "/author/" in parsed.path:
        return "semantic_scholar_url"
    if "researchgate.net" in host and "/profile/" in parsed.path:
        return "researchgate_url"
    if "github.com" in host and len(parsed.path.strip("/").split("/")) == 1:
        return "github_url"
    if "homepage" in label or "personal" in label:
        return "personal_url"
    return None


def _is_personal_profile(item: dict[str, Any], candidate_name: str) -> bool:
    url = str(item.get("url") or "")
    host = urlparse(url).netloc.lower()
    if not host or any(value in host for value in (*PROFILE_PLATFORM_HOSTS, *PROFILE_BLOCKED_HOSTS)):
        return False
    if host.endswith(".edu") or ".edu." in host:
        return False
    parent_url = str(item.get("parent_url") or "")
    if parent_url:
        parent_host = urlparse(parent_url).netloc.lower().removeprefix("www.")
        label = str(item.get("label") or "").lower()
        if host.removeprefix("www.") != parent_host and not re.search(
            r"\b(personal|homepage|portfolio)\b",
            label,
        ):
            return False
    label_content = f"{item.get('label', '')} {item.get('content', '')}"
    return candidate_name.lower() in label_content.lower()


def _best_official_profile(
    sources: list[dict[str, Any]],
    candidate_name: str,
    institution: str | None,
) -> str | None:
    eligible = []
    for source in sources:
        url = str(source.get("url") or "")
        host = urlparse(url).netloc.lower()
        if not url or not (host.endswith(".edu") or ".edu." in host):
            continue
        if not candidate_source_relevance(source, candidate_name):
            continue
        score = source_score(source, institution)
        content = str(source.get("content") or "")
        if candidate_name.lower() in str(source.get("title") or "").lower():
            score += 25
        if select_candidate_email([source], candidate_name):
            score += 18
        if "faculty" in url or "people" in url:
            score += 8
        eligible.append((score, url))
    return max(eligible, default=(0, None))[1]


def _extract_after_label(text: str, label: str, stop_labels: tuple[str, ...]) -> str:
    match = re.search(re.escape(label), text, re.IGNORECASE)
    if not match:
        return ""
    remainder = text[match.end() :]
    stops = [
        found.start()
        for stop in stop_labels
        if (found := re.search(re.escape(stop), remainder, re.IGNORECASE))
    ]
    return remainder[: min(stops) if stops else 700].strip(" :-")


def _split_topics(value: str) -> list[str]:
    return [
        re.sub(r"\s+", " ", item).strip(" .")
        for item in re.split(r",|;|\band\b", value)
        if 2 < len(item.strip()) < 90
    ]


def _topic_phrases(text: str, phrases: tuple[str, ...]) -> list[str]:
    lower = text.lower()
    return [phrase.title() for phrase in phrases if phrase in lower]


def _publications_from_table(
    source: dict[str, Any],
    candidate_name: str,
) -> list[dict[str, Any]]:
    page = source.get("page")
    if not isinstance(page, dict):
        return []
    rows = page.get("table_rows")
    if not isinstance(rows, list):
        return []
    publications = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 3:
            continue
        values = [re.sub(r"\s+", " ", str(value)).strip() for value in row]
        row_text = " ".join(values)
        years = re.findall(r"\b(19\d{2}|20\d{2})\b", row_text)
        if not years:
            continue
        authors_index = next(
            (index for index, value in enumerate(values[1:], 1) if _author_text_matches(value, candidate_name)),
            None,
        )
        if authors_index is None:
            continue
        title = values[0]
        if title.lower() in {"title", "publications"} or len(title.split()) < 4:
            continue
        authors = [
            value.strip()
            for value in re.split(r",|\band\b", values[authors_index])
            if value.strip()
        ]
        venue_parts = [
            value
            for index, value in enumerate(values[1:], 1)
            if index != authors_index and not re.fullmatch(r"\d+", value)
        ]
        publication = {
            "title": title,
            "authors": authors,
            "publication_year": int(years[-1]),
            "venue": venue_parts[0] if venue_parts else None,
            "doi": None,
            "source_url": source.get("url"),
            "relevance_reason": "Verified on a professor-owned publication table.",
            "reading_priority": 1,
        }
        if publication_authorship_matches(publication, candidate_name):
            publications.append(publication)
    publications.sort(key=lambda item: item.get("publication_year") or 0, reverse=True)
    for index, publication in enumerate(publications[:8]):
        publication["reading_priority"] = max(1, 5 - index)
    return publications


def _author_text_matches(value: str, candidate_name: str) -> bool:
    first_name, surname = _name_parts(candidate_name)
    normalized = re.sub(r"[^a-z ]", " ", value.lower())
    return surname in normalized.split() and (
        first_name in normalized.split() or re.search(rf"\b{first_name[:1]}\b", normalized)
    )


def _dedupe_publications(publications: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[str, dict[str, Any]] = {}
    for item in publications:
        key = re.sub(r"[^a-z0-9]", "", str(item.get("title") or "").lower())
        if key:
            unique[key] = item
    return sorted(
        unique.values(),
        key=lambda item: item.get("publication_year") or 0,
        reverse=True,
    )


def _institution_label(
    candidate: dict[str, Any],
    source: dict[str, Any],
) -> str:
    institution = str(candidate.get("institution") or "").strip()
    if institution and not institution.lower().startswith(("http://", "https://")):
        return institution
    title_parts = [
        part.strip()
        for part in re.split(r"\s*[|–—]\s*", str(source.get("title") or ""))
        if part.strip()
    ]
    return title_parts[-1] if len(title_parts) > 1 else ""


def _dedupe_education(values: list[str]) -> list[str]:
    selected: dict[str, str] = {}
    for value in values:
        clean = re.sub(r"\s+", " ", str(value)).strip(" .")
        degree = re.search(r"\b(ph\.?d\.?|b\.?tech)\b", clean, re.IGNORECASE)
        institution = re.search(
            r"(?:Baylor University|Institute of Engineering and Management|\bIEM\b)",
            clean,
            re.IGNORECASE,
        )
        key = (
            f"{degree.group(0).lower() if degree else clean.lower()}|"
            f"{institution.group(0).lower() if institution else ''}"
        )
        current = selected.get(key)
        if not current or len(clean) > len(current):
            selected[key] = clean
    return list(selected.values())


def _dedupe_positions(values: list[str]) -> list[str]:
    selected: dict[str, str] = {}
    for value in _unique(values):
        lower = value.lower()
        key = "assistant professor" if lower.startswith("assistant professor") else lower
        current = selected.get(key)
        if not current or len(value) > len(current):
            selected[key] = value
    return list(selected.values())


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result = []
    for value in values:
        clean = re.sub(r"\s+", " ", str(value)).strip(" .")
        key = clean.lower()
        if clean and key not in seen:
            result.append(clean)
            seen.add(key)
    return result
