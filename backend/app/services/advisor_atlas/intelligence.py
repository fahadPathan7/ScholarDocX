from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any


# Offline fallback taxonomy ONLY (FR-9.25a).
#
# The primary related-unit mapping path is `analysis.map_related_units_with_glm`,
# which handles any discipline. This table exists purely so discovery still works
# when GLM is unavailable, so it is deliberately broad rather than exhaustive —
# a field being absent here must degrade the fallback, never zero out discovery.
#
# History: this used to be the *only* mapping mechanism and contained just the
# first five families. Every field outside them (chemistry, economics, public
# health, law, linguistics …) scored 0 against every unit and received no related
# departments at all. See SCHOLARDOCX-0181.
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
        "biology", "molecular biology", "genetics", "genomics", "microbiology",
        "biochemistry", "biotechnology", "immunology", "physiology", "ecology",
    },
    "quantitative": {
        "statistics", "mathematics", "applied mathematics", "operations research",
        "industrial engineering", "econometrics", "data analytics",
        "computational science", "scientific computing",
    },
    "chemistry": {
        "chemistry", "chemical engineering", "chemical biology",
        "materials science", "materials engineering", "polymer science",
        "catalysis", "analytical chemistry", "organic chemistry",
        "inorganic chemistry", "physical chemistry", "nanoscience",
    },
    "physical_science": {
        "physics", "applied physics", "astronomy", "astrophysics",
        "optics", "photonics", "quantum", "nuclear engineering",
        "geoscience", "geology", "earth science", "atmospheric science",
        "oceanography",
    },
    "mechanical": {
        "mechanical engineering", "aerospace engineering", "aeronautics",
        "astronautics", "manufacturing", "mechatronics", "thermodynamics",
        "fluid mechanics", "automotive engineering",
    },
    "civil_environment": {
        "civil engineering", "structural engineering", "environmental engineering",
        "environmental science", "sustainability", "urban planning",
        "transportation engineering", "geotechnical engineering",
        "water resources", "architecture",
    },
    "health": {
        "public health", "epidemiology", "medicine", "nursing", "pharmacy",
        "pharmacology", "global health", "health policy", "nutrition",
        "kinesiology", "dentistry", "veterinary",
    },
    "mind_behaviour": {
        "psychology", "cognitive science", "behavioural science",
        "behavioral science", "psychiatry", "linguistics", "philosophy of mind",
        "cognitive neuroscience",
    },
    "social_science": {
        "sociology", "anthropology", "political science", "international relations",
        "public policy", "geography", "criminology", "social work",
        "development studies", "gender studies",
    },
    "economics_business": {
        "economics", "finance", "accounting", "management", "business administration",
        "marketing", "entrepreneurship", "supply chain", "organisational behaviour",
        "organizational behaviour", "agricultural economics",
    },
    "humanities": {
        "history", "philosophy", "literature", "classics", "religious studies",
        "art history", "musicology", "cultural studies", "media studies",
        "archaeology", "languages",
    },
    "law_education": {
        "law", "legal studies", "jurisprudence", "criminal justice",
        "education", "pedagogy", "curriculum", "higher education",
    },
    "agriculture_food": {
        "agriculture", "agronomy", "food science", "horticulture",
        "soil science", "plant science", "animal science", "forestry",
        "fisheries",
    },
}

# Cross-family adjacencies. The families above are mutually exclusive sets, so
# without this a field can only ever relate to units inside its own family —
# which is why Computer Science → Electrical Engineering scored 0 (unrelated)
# even though the feature spec names EEE as an expected Computer Science match.
FAMILY_ADJACENCY: dict[str, set[str]] = {
    "computing": {"electrical", "human_technology", "quantitative", "life_science"},
    "electrical": {"computing", "physical_science", "mechanical", "quantitative"},
    "human_technology": {"computing", "mind_behaviour", "social_science"},
    "life_science": {"chemistry", "health", "computing", "agriculture_food"},
    "quantitative": {"computing", "economics_business", "physical_science"},
    "chemistry": {"life_science", "physical_science", "mechanical", "agriculture_food"},
    "physical_science": {"chemistry", "quantitative", "electrical", "mechanical"},
    "mechanical": {"electrical", "physical_science", "civil_environment", "chemistry"},
    "civil_environment": {"mechanical", "physical_science", "social_science"},
    "health": {"life_science", "mind_behaviour", "social_science", "quantitative"},
    "mind_behaviour": {"health", "human_technology", "social_science", "life_science"},
    "social_science": {"economics_business", "humanities", "mind_behaviour", "law_education"},
    "economics_business": {"quantitative", "social_science", "law_education"},
    "humanities": {"social_science", "law_education"},
    "law_education": {"social_science", "humanities", "economics_business"},
    "agriculture_food": {"life_science", "chemistry", "civil_environment"},
}

# Unit words that can head ("Department of X") or trail ("X Department") a name.
UNIT_WORDS = (
    r"department|school|faculty|institute|centre|center|program|programme"
    r"|division|laboratory|lab|group|college"
)

# Leading form: "<unit word> of|for|in <Name>".
#
# `for` matters as much as `of`: interdisciplinary units — exactly where
# cross-field advisors sit — are overwhelmingly named "Center for …" or
# "Institute for …". Requiring `of` missed all of them (SCHOLARDOCX-0181).
UNIT_PATTERN = re.compile(
    rf"\b(?:{UNIT_WORDS})\s+(?:of|for|in)\s+"
    r"(?:the\s+)?"
    r"([A-Z][A-Za-z&,\-/ ]{2,80}?)"
    rf"(?=\s+(?:and\s+)?(?:{UNIT_WORDS})\s+(?:of|for|in)"
    r"|[|.;\n]|$)",
    re.IGNORECASE,
)

# Trailing form: "<Name> Department" / "<Name> Institute" / "<Name> Lab".
# Common in North American and UK sites ("Computer Science Department",
# "Robotics Institute") and invisible to the leading-form pattern.
UNIT_PATTERN_TRAILING = re.compile(
    rf"\b([A-Z][A-Za-z&,\-/ ]{{2,80}}?)\s+(?:{UNIT_WORDS})\b"
    r"(?=[\s|.;,\n]|$)",
    re.IGNORECASE,
)
YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


# Words that prove a captured phrase is NOT an academic unit. A unit is an
# organisation that employs faculty; these mark a job title, a degree, or a
# page heading that happened to sit next to a unit word.
#
# SCHOLARDOCX-0190: without this, one live run mapped and then searched units
# called "Associate Professor of Computer Science and Director AI-Cyb",
# "Master of Science in Computer Science" and "The Computer Science" — each one
# spending two searches and up to four directory crawls from the run budget.
NON_UNIT_TOKENS = {
    # job titles
    "professor", "professors", "lecturer", "instructor", "adjunct", "chair",
    "chairperson", "dean", "director", "provost", "chancellor", "president",
    "coordinator", "emeritus", "emerita", "fellow", "postdoc", "postdoctoral",
    # degrees and their programmes
    "bachelor", "bachelors", "master", "masters", "doctorate", "doctoral",
    "phd", "bsc", "msc", "beng", "meng", "mba", "beds", "minor", "certificate",
    "diploma", "thesis", "dissertation",
    # page furniture
    "message", "welcome", "overview", "contact", "apply", "admission",
    "admissions", "news", "event", "events", "brochure", "resume", "click",
    "here", "home", "login", "search", "sitemap",
}

# Articles a captured unit name may start with ("The Computer Science").
_LEADING_ARTICLES = {"the", "a", "an", "our", "this"}


def is_academic_unit_name(name: str) -> bool:
    """Reject job titles, degree programmes and page headings."""
    tokens = normalize(name).split()
    if not tokens:
        return False
    return not any(token in NON_UNIT_TOKENS for token in tokens)


def strip_unit_article(name: str) -> str:
    tokens = name.split()
    while tokens and tokens[0].lower().strip(" .,") in _LEADING_ARTICLES:
        tokens = tokens[1:]
    return " ".join(tokens).strip()


# Connectors allowed *inside* a unit name ("Information and Decision Systems",
# "School of Earth and Space Exploration") but never at either edge.
#
# "the" is deliberately excluded. Allowing it let a trailing match bridge across
# a sentence-initial verb — "Visit the Robotics Institute" produced the unit name
# "Visit the Robotics" instead of "Robotics". Unit names that genuinely contain
# "the" are rare enough that losing them costs less than the noise it admits.
_UNIT_CONNECTORS = {"and", "of", "for", "in", "&"}


def clean_unit_name(raw: str, from_end: bool = False) -> str:
    """Trim a regex-captured unit name down to the actual proper noun.

    The capture groups run until a sentence boundary, so on flowing prose they
    swallow surrounding words — "Department of Chemistry and the Department of
    Chemical Engineering collaborate closely" yielded names like
    ``'of Chemistry and the'`` and ``'Chemical Engineering collaborate closely'``.

    Walk the tokens from the appropriate edge (start for "Department of X",
    end for "X Department") keeping capitalised words, plus connectors that are
    flanked by capitalised words. Stop at the first lowercase non-connector,
    which is reliably where the unit name ends and prose resumes.
    """
    tokens = [token.strip(" ,.;:/-") for token in raw.split()]
    tokens = [token for token in tokens if token]
    if not tokens:
        return ""
    if from_end:
        tokens = tokens[::-1]

    kept: list[str] = []
    for index, token in enumerate(tokens):
        # An article is a phrase boundary, not part of a unit name. Walking
        # backwards from "…and Computer Science The Computer Science Department"
        # it is the only thing that stops the capture bleeding into the
        # preceding sentence, because "The" is capitalised like a name word.
        if token.lower() in _LEADING_ARTICLES:
            break
        if token[:1].isupper():
            kept.append(token)
            continue
        if token.lower() in _UNIT_CONNECTORS:
            following = tokens[index + 1] if index + 1 < len(tokens) else ""
            if kept and following[:1].isupper():
                kept.append(token)
                continue
        break

    while kept and kept[-1].lower() in _UNIT_CONNECTORS:
        kept.pop()
    if from_end:
        kept = kept[::-1]
    return " ".join(kept).strip()


def _contains_phrase(haystack: str, needle: str) -> bool:
    """Whole-word containment on already-normalized text.

    Plain ``in`` was used here and silently invented relationships: the family
    term ``"ai"`` is a substring of ch**ai**r, cert**ai**n, dom**ai**n,
    m**ai**ntenance and tr**ai**ning, so "Chair of Marine Biology" resolved to
    the computing family and a medieval-poetry professor was reported to the user
    as a 72% artificial-intelligence match. Anchoring on word boundaries is what
    keeps short terms like ``ai``/``cse``/``eee`` usable at all.
    """
    if not haystack or not needle:
        return False
    return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack) is not None


def concept_family(value: str) -> set[str]:
    normalized = normalize(value)
    if not normalized:
        return set()
    return {
        family
        for family, terms in ACADEMIC_FAMILIES.items()
        if any(
            _contains_phrase(normalized, normalize(term))
            or _contains_phrase(normalize(term), normalized)
            for term in terms
        )
    }


def _family_label(families: set[str]) -> str:
    return ", ".join(sorted(families)).replace("_", " ")


def related_unit_score(requested_field: str, unit_name: str) -> tuple[int, str, str]:
    """Deterministic offline relation score between a field and an academic unit.

    This is the FALLBACK path (FR-9.25a). `map_related_units_with_glm` is the
    primary mapper and handles disciplines this table has never heard of.
    """
    requested = normalize(requested_field)
    unit = normalize(unit_name)
    if not requested or not unit:
        return 0, "unrelated", "No usable field relationship was found."
    if requested == unit or _contains_phrase(unit, requested) or _contains_phrase(requested, unit):
        return 100, "direct", "The academic unit directly names the requested field."

    requested_families = concept_family(requested)
    unit_families = concept_family(unit)

    shared = requested_families & unit_families
    if shared:
        # "direct" is reserved for a unit whose name actually contains the
        # requested field (handled above, score 100). Chemistry and Chemical
        # Engineering share a family but are genuinely different departments, so
        # calling that "direct" would overstate the relationship to the user.
        score = 84 if len(shared) > 1 else 76
        return score, "adjacent", f"Shared academic domain: {_family_label(shared)}."

    # Cross-family adjacency. Without this the mutually-exclusive family sets
    # made every cross-domain pair "unrelated" — including Computer Science vs
    # Electrical Engineering, which the feature spec names as an expected match.
    bridged = {
        family
        for family in requested_families
        if FAMILY_ADJACENCY.get(family, set()) & unit_families
    }
    if bridged:
        neighbours = set()
        for family in bridged:
            neighbours |= FAMILY_ADJACENCY.get(family, set()) & unit_families
        # Scored below same-family and shared-term matches, and labelled
        # "interdisciplinary" rather than "adjacent", because family-level
        # adjacency is coarse: computing↔life_science genuinely describes
        # bioinformatics but fires for any life-science unit. Ranking matters
        # more than filtering here — collect() only pursues the top units — so
        # weak bridges stay reachable while never crowding out strong matches.
        return 58, "interdisciplinary", (
            f"Neighbouring academic domains: {_family_label(bridged)} "
            f"and {_family_label(neighbours)}."
        )

    # Token overlap catches real relationships the taxonomy has no entry for,
    # e.g. "Mechanical Engineering" vs "Aerospace Engineering". Generic academic
    # words are excluded so "Department of X" doesn't bridge to everything.
    generic = {
        "engineering", "science", "sciences", "studies", "department", "school",
        "institute", "center", "centre", "research", "applied", "advanced",
        "faculty", "program", "programme", "division", "laboratory", "and", "of",
        "for", "the",
    }
    shared_tokens = (set(requested.split()) & set(unit.split())) - generic
    if shared_tokens:
        return 66, "adjacent", (
            f"Shared subject terms: {', '.join(sorted(shared_tokens))}."
        )

    # NOTE: a blanket "any unit in human_technology/life_science/quantitative is
    # interdisciplinary for any field with a family" rule used to live here. It
    # was harmless when only five families existed and most fields resolved to
    # no family at all. Now that most disciplines resolve, it fired constantly —
    # an Economics applicant was offered "Chemical Biology" as a related unit,
    # spending searches and directory crawls from their run budget on it. The
    # explicit FAMILY_ADJACENCY bridge above covers the real cases.
    return 0, "unrelated", "No supported academic relationship was identified."


def extract_related_units(
    requested_field: str,
    sources: list[dict[str, Any]],
    mapped_units: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Build the related-unit list that drives the whole discovery funnel.

    ``mapped_units`` carries units proposed by the AI mapper
    (``analysis.map_related_units_with_glm``). They are merged with units found by
    regex over the search snippets and de-duplicated by normalised name, keeping
    the higher relevance score. When the mapper is unavailable the regex +
    taxonomy path runs exactly as before, so discovery never regresses below the
    deterministic baseline.

    This function is a hard multiplier on everything downstream:
    ``DiscoveryResearcher.collect()`` runs up to two searches and four directory
    crawls *per unit returned here*. Under-returning silently shrinks the whole
    run (SCHOLARDOCX-0181).
    """
    discovered: dict[str, dict[str, Any]] = {}

    def consider(name: str, source_url: str | None, ai_hint: dict[str, Any] | None = None) -> None:
        name = strip_unit_article(name.strip(" .,:;-")).strip(" .,:;-")
        if len(name) < 3 or len(name) > 100:
            return
        if not is_academic_unit_name(name):
            return
        score, relation, reason = related_unit_score(requested_field, name)
        if ai_hint:
            # Trust the mapper's judgement on relation/reason, but floor the score
            # so an AI-proposed unit is never filtered out by a taxonomy that has
            # never heard of the discipline.
            score = max(score, int(ai_hint.get("relevance_score") or 70))
            relation = str(ai_hint.get("relation") or relation or "adjacent")
            reason = str(ai_hint.get("reason") or reason)
        if score < 50:
            return
        key = normalize(name)
        if not key:
            return
        item = {
            "name": name,
            "relation": relation,
            "relevance_score": score,
            "reason": reason,
            "source_url": source_url,
            "confidence": min(92, 55 + score // 3),
            "discovery_method": "ai_mapping" if ai_hint else "text_extraction",
        }
        current = discovered.get(key)
        if not current or item["relevance_score"] > current["relevance_score"]:
            discovered[key] = item

    for unit in mapped_units or []:
        name = str(unit.get("name") or "").strip()
        if name:
            consider(name, unit.get("source_url"), ai_hint=unit)

    for source in sources:
        text = f"{source.get('title', '')} {source.get('content', '')}"
        names = [clean_unit_name(match.group(1)) for match in UNIT_PATTERN.finditer(text)]
        names.extend(
            clean_unit_name(match.group(1), from_end=True)
            for match in UNIT_PATTERN_TRAILING.finditer(text)
        )
        title = str(source.get("title", "")).split("|")[0].strip()
        if any(token in title.lower() for token in (
            "department", "school", "institute", "center", "centre",
            "division", "laboratory", "college", "program",
        )):
            names.append(title)
        for name in names:
            consider(name, source.get("url"))

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
            "discovery_method": "requested_field",
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
        # SCHOLARDOCX-0188: plain `in` is a substring check, exactly the bug
        # `_contains_phrase` (below) was built to fix elsewhere in this file —
        # a short interest like "ai" or "llm" would silently "match" as a
        # supported research phrase just because it's a substring of an
        # unrelated word (chair, maintain, llm inside some longer token,
        # etc.), reported to the user as a 92-point "supported research
        # phrase" hit — the single highest-confidence match tier here.
        phrase_match = bool(normalized_interest) and _contains_phrase(research, normalized_interest)
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
    # SCHOLARDOCX-0188: clamp to the current year — see analysis.py's
    # latest_year for why (a Scholar citation count like "2094" would
    # otherwise read as a real year and force recent_activity permanently true).
    current_year = datetime.now(timezone.utc).year
    years = [int(year) for year in YEAR_PATTERN.findall(text) if int(year) <= current_year]
    recent_activity = bool(years and max(years) >= current_year - 1)
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
