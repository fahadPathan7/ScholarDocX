from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any


ACADEMIC_FAMILIES = {
    "computing": {
        "computer science", "computer engineering", "computing", "informatics",
        "information science", "information technology", "software engineering",
        "data science", "artificial intelligence", "machine learning",
        "cybersecurity", "robotics", "cse", "swe", "ai",
    },
    "electrical": {
        "electrical engineering", "electronics", "electronic engineering",
        "communication engineering", "telecommunications", "eee",
        "embedded systems", "signal processing", "control systems",
    },
    "human_technology": {
        "human computer interaction", "hci", "information systems",
        "digital media", "learning sciences", "educational technology",
        "computational social science",
    },
    "life_science": {
        "bioinformatics", "computational biology", "biomedical engineering",
        "health informatics", "biostatistics", "neuroscience",
    },
    "quantitative": {
        "statistics", "mathematics", "applied mathematics", "operations research",
        "industrial engineering", "econometrics",
    },
}

UNIT_PATTERN = re.compile(
    r"\b(?:department|school|faculty|institute|center|centre|program)\s+of\s+"
    r"([A-Z][A-Za-z&,\-/ ]{2,80}?)"
    r"(?=\s+(?:and\s+)?(?:department|school|faculty|institute|center|centre|program)\s+of"
    r"|[|.;\n]|$)",
    re.IGNORECASE,
)
YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def concept_family(value: str) -> set[str]:
    normalized = normalize(value)
    return {
        family
        for family, terms in ACADEMIC_FAMILIES.items()
        if any(normalize(term) in normalized or normalized in normalize(term) for term in terms)
    }


def related_unit_score(requested_field: str, unit_name: str) -> tuple[int, str, str]:
    requested = normalize(requested_field)
    unit = normalize(unit_name)
    if not requested or not unit:
        return 0, "unrelated", "No usable field relationship was found."
    if requested == unit or requested in unit or unit in requested:
        return 100, "direct", "The academic unit directly names the requested field."
    shared = concept_family(requested) & concept_family(unit)
    if shared:
        score = 84 if len(shared) > 1 else 76
        relation = "direct" if "computing" in shared and len(concept_family(unit)) == 1 else "adjacent"
        label = ", ".join(sorted(shared)).replace("_", " ")
        return score, relation, f"Shared academic domain: {label}."
    if concept_family(requested) and concept_family(unit) & {
        "human_technology", "life_science", "quantitative",
    }:
        return 58, "interdisciplinary", (
            "The unit may contain interdisciplinary research relevant to the requested field."
        )
    return 0, "unrelated", "No supported academic relationship was identified."


def extract_related_units(
    requested_field: str,
    sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    discovered: dict[str, dict[str, Any]] = {}
    for source in sources:
        text = f"{source.get('title', '')} {source.get('content', '')}"
        names = [match.group(1).strip(" .,:;-") for match in UNIT_PATTERN.finditer(text)]
        title = str(source.get("title", "")).split("|")[0].strip()
        if any(token in title.lower() for token in (
            "department", "school", "institute", "center", "centre",
        )):
            names.append(title)
        for name in names:
            if len(name) < 3 or len(name) > 100:
                continue
            score, relation, reason = related_unit_score(requested_field, name)
            if score < 50:
                continue
            key = normalize(name)
            item = {
                "name": name,
                "relation": relation,
                "relevance_score": score,
                "reason": reason,
                "source_url": source.get("url"),
                "confidence": min(92, 55 + score // 3),
            }
            current = discovered.get(key)
            if not current or item["relevance_score"] > current["relevance_score"]:
                discovered[key] = item

    score, relation, reason = related_unit_score(requested_field, requested_field)
    discovered.setdefault(
        normalize(requested_field),
        {
            "name": requested_field,
            "relation": relation,
            "relevance_score": score,
            "reason": reason,
            "source_url": None,
            "confidence": 55,
        },
    )
    return sorted(
        discovered.values(),
        key=lambda item: (-item["relevance_score"], item["name"].lower()),
    )[:12]


def semantic_fallback(interests: list[str], research_text: str) -> dict[str, Any]:
    if not interests:
        return {
            "is_research_match": True,
            "semantic_score": 55,
            "matched_interests": [],
            "match_reasons": ["No personal research interests were supplied for comparison."],
            "matching_method": "not_requested",
            "matching_limitation": "Research fit requires user interests.",
        }
    research = normalize(research_text)
    research_tokens = set(research.split())
    matched: list[str] = []
    reasons: list[str] = []
    score_parts: list[int] = []
    for interest in interests:
        normalized_interest = normalize(interest)
        interest_tokens = set(normalized_interest.split())
        token_overlap = interest_tokens & research_tokens
        family_overlap = concept_family(normalized_interest) & concept_family(research)
        phrase_match = normalized_interest and normalized_interest in research
        score = 0
        if phrase_match:
            score = 92
            reasons.append(f'"{interest}" appears as a supported research phrase.')
        elif family_overlap:
            score = 72 + min(12, len(token_overlap) * 4)
            label = ", ".join(sorted(family_overlap)).replace("_", " ")
            reasons.append(f'"{interest}" shares the {label} research domain.')
        elif token_overlap:
            score = 48 + min(18, len(token_overlap) * 6)
            reasons.append(
                f'"{interest}" shares research concepts: {", ".join(sorted(token_overlap))}.'
            )
        if score:
            matched.append(interest)
            score_parts.append(score)
    score = max(score_parts, default=20)
    if len(score_parts) > 1:
        score = min(96, score + min(10, (len(score_parts) - 1) * 4))
    return {
        "is_research_match": score >= 60,
        "semantic_score": score,
        "matched_interests": matched,
        "match_reasons": reasons or [
            "No strong concept bridge was verified in accessible source text."
        ],
        "matching_method": "weighted_concept_fallback",
        "matching_limitation": (
            "GLM semantic analysis was unavailable; concept-family and phrase evidence were used."
        ),
    }


def upcoming_semesters(count: int = 3, now: datetime | None = None) -> list[str]:
    current = now or datetime.now(timezone.utc)
    options = []
    for year in range(current.year, current.year + 3):
        for month, season in ((1, "Spring"), (8, "Fall")):
            if (year, month) >= (current.year, current.month):
                options.append(f"{season} {year}")
    return options[:count]


def opportunity_forecast(
    combined_text: str,
    recruitment_state: str,
    evidence_confidence: int,
) -> dict[str, Any]:
    text = combined_text.lower()
    years = [int(year) for year in YEAR_PATTERN.findall(text)]
    recent_activity = bool(years and max(years) >= datetime.now(timezone.utc).year - 1)
    signals = []
    counter_signals = []
    if recruitment_state == "confirmed_open":
        signals.append("An explicit current PhD recruitment statement was verified.")
    if any(term in text for term in ("grant", "funded", "funding", "award", "studentship")):
        signals.append("Recent funding or project-support language is visible.")
    if any(term in text for term in ("new project", "lab expansion", "growing team", "join our lab")):
        signals.append("Expansion or team-growth language is visible.")
    if recent_activity:
        signals.append("Recent dated research activity is visible.")
    if any(term in text for term in (
        "not accepting", "not recruiting", "no openings", "positions filled",
    )):
        counter_signals.append("A public no-opening signal was found.")

    if recruitment_state == "confirmed_open":
        status, likelihood = "current_open", 96
    elif counter_signals:
        status, likelihood = "low_likelihood", 18
    elif len(signals) >= 3:
        status, likelihood = "high_likelihood", 78
    elif signals:
        status, likelihood = "possible", 56
    else:
        status, likelihood = "unknown", 30
    return {
        "status": status,
        "likelihood": likelihood,
        "confidence": min(max(20, evidence_confidence), 92),
        "likely_semesters": upcoming_semesters(3),
        "signals": signals,
        "counter_signals": counter_signals,
        "limitation": (
            "This is an evidence-based outlook, not a promise of future recruitment. "
            "Confirm directly with the professor or official lab page."
        ),
    }
