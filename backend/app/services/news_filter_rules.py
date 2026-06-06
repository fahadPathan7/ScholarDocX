import re
import unicodedata
from datetime import date
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse


DESTINATION_RULES = {
    "usa": {
        "query": "United States (USA)",
        "aliases": ("united states", "united states of america", "usa", "u s a"),
        "domains": (".us",),
    },
    "canada": {
        "query": "Canada",
        "aliases": ("canada", "canadian"),
        "domains": (".ca",),
    },
    "australia": {
        "query": "Australia",
        "aliases": ("australia", "australian"),
        "domains": (".au",),
    },
    "new zealand": {
        "query": "New Zealand",
        "aliases": ("new zealand",),
        "domains": (".nz",),
    },
    "uk": {
        "query": "United Kingdom (UK)",
        "aliases": (
            "united kingdom",
            "uk",
            "u k",
            "england",
            "scotland",
            "wales",
            "northern ireland",
            "british",
        ),
        "domains": (".uk",),
    },
    "saudi arabia": {
        "query": "Saudi Arabia",
        "aliases": ("saudi arabia", "saudi"),
        "domains": (".sa",),
    },
    "qatar": {
        "query": "Qatar (Doha)",
        "aliases": ("qatar", "doha"),
        "domains": (".qa",),
    },
    "uae": {
        "query": "United Arab Emirates (UAE, Dubai, Abu Dhabi)",
        "aliases": (
            "united arab emirates",
            "uae",
            "u a e",
            "dubai",
            "abu dhabi",
            "sharjah",
            "ajman",
            "ras al khaimah",
            "fujairah",
            "umm al quwain",
        ),
        "domains": (".ae",),
    },
    "germany": {
        "query": "Germany",
        "aliases": ("germany", "german"),
        "domains": (".de",),
    },
    "africa": {
        "query": "Africa (African universities)",
        "aliases": (
            "africa",
            "african",
            "south africa",
            "egypt",
            "kenya",
            "nigeria",
            "ghana",
            "morocco",
            "ethiopia",
            "rwanda",
            "uganda",
            "tanzania",
        ),
        "domains": (".za", ".eg", ".ke", ".ng", ".gh", ".ma", ".et", ".rw", ".ug", ".tz"),
    },
    "south america": {
        "query": "South America (Latin American universities)",
        "aliases": (
            "south america",
            "latin america",
            "brazil",
            "argentina",
            "chile",
            "colombia",
            "peru",
            "ecuador",
            "uruguay",
        ),
        "domains": (".br", ".ar", ".cl", ".co", ".pe", ".ec", ".uy"),
    },
    "asia": {
        "query": "Asia (Asian universities)",
        "aliases": (
            "asia",
            "asian",
            "china",
            "japan",
            "south korea",
            "korea",
            "singapore",
            "malaysia",
            "india",
            "taiwan",
            "thailand",
            "indonesia",
            "vietnam",
            "united arab emirates",
            "saudi arabia",
            "qatar",
        ),
        "domains": (
            ".cn",
            ".jp",
            ".kr",
            ".sg",
            ".my",
            ".in",
            ".tw",
            ".th",
            ".id",
            ".vn",
            ".ae",
            ".sa",
            ".qa",
        ),
    },
    "north america": {
        "query": "North America (United States, Canada, or Mexico)",
        "aliases": (
            "north america",
            "united states",
            "usa",
            "u s a",
            "canada",
            "canadian",
            "mexico",
        ),
        "domains": (".us", ".ca", ".mx"),
    },
    "europe": {
        "query": "Europe (European universities)",
        "aliases": (
            "europe",
            "european",
            "european union",
            "united kingdom",
            "germany",
            "france",
            "italy",
            "spain",
            "netherlands",
            "sweden",
            "switzerland",
            "norway",
            "denmark",
            "finland",
            "ireland",
            "belgium",
            "austria",
            "poland",
            "hungary",
            "romania",
            "portugal",
        ),
        "domains": (
            ".uk",
            ".de",
            ".fr",
            ".it",
            ".es",
            ".nl",
            ".se",
            ".ch",
            ".no",
            ".dk",
            ".fi",
            ".ie",
            ".be",
            ".at",
            ".pl",
            ".hu",
            ".ro",
            ".pt",
            "europa.eu",
        ),
    },
    "australia (continent)": {
        "query": "Oceania (Australia, New Zealand, or Pacific universities)",
        "aliases": (
            "oceania",
            "australia",
            "australian",
            "new zealand",
            "pacific islands",
        ),
        "domains": (".au", ".nz", ".fj", ".pg"),
    },
}

FIELD_ALIASES = {
    "computer science & engineering": (
        "computer science",
        "computer engineering",
        "computing",
    ),
    "artificial intelligence & data science": (
        "artificial intelligence",
        "data science",
        "machine learning",
    ),
    "electrical & electronics engineering (eee)": (
        "electrical engineering",
        "electronics engineering",
        "electrical and electronics engineering",
    ),
    "business administration (bba/mba)": (
        "business administration",
        "master of business administration",
        "mba",
        "bba",
    ),
    "economics & finance": ("economics", "finance"),
    "public health": ("public health", "global health", "health policy"),
    "political science & international relations": (
        "political science",
        "international relations",
    ),
    "biology & life sciences": ("biology", "life sciences", "biological sciences"),
    "mathematics & statistics": ("mathematics", "statistics"),
    "climate & sustainability": ("climate", "sustainability", "sustainable development"),
}

FUNDING_ALIASES = {
    "fully funded": (
        "fully funded",
        "full funding",
        "full scholarship",
        "tuition and stipend",
        "tuition fees and stipend",
        "covers tuition and living",
    ),
    "partially funded": (
        "partially funded",
        "partial funding",
        "partial scholarship",
        "tuition discount",
        "tuition reduction",
    ),
    "tuition waiver": ("tuition waiver", "tuition fee waiver", "fee waiver"),
    "stipend": ("stipend", "living allowance", "monthly allowance"),
    "travel grant": ("travel grant", "travel funding", "travel allowance", "airfare"),
}

SEASON_ALIASES = {
    "fall": ("fall", "autumn"),
    "spring": ("spring",),
    "summer": ("summer",),
    "winter": ("winter",),
}

SEASON_MONTHS = {
    "fall": ("august", "september", "october"),
    "spring": ("january", "february", "march"),
    "summer": ("may", "june", "july"),
    "winter": ("november", "december", "january"),
}


def _normalized_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def _article_text(article: Dict[str, Any]) -> str:
    return _normalized_text(
        " ".join(
            str(article.get(field) or "")
            for field in ("title", "description", "content", "link")
        )
    )


def _contains_phrase(text: str, phrase: str) -> bool:
    normalized_phrase = _normalized_text(phrase)
    return bool(
        normalized_phrase
        and f" {normalized_phrase} " in f" {text} "
    )


def _unique(values: Iterable[str]) -> List[str]:
    seen = set()
    result = []
    for value in values:
        cleaned = re.sub(r"\s+", " ", str(value)).strip()
        key = cleaned.casefold()
        if cleaned and key not in seen:
            seen.add(key)
            result.append(cleaned)
    return result


def destination_query_terms(destinations: Optional[List[str]]) -> List[str]:
    return [
        DESTINATION_RULES.get(destination.strip().casefold(), {}).get(
            "query",
            destination,
        )
        for destination in destinations or []
    ]


def _has_destination_context(text: str, alias: str) -> bool:
    normalized_alias = _normalized_text(alias)
    patterns = (
        f"study in {normalized_alias}",
        f"studying in {normalized_alias}",
        f"to study in {normalized_alias}",
        f"degree in {normalized_alias}",
        f"program in {normalized_alias}",
        f"programme in {normalized_alias}",
        f"university in {normalized_alias}",
        f"universities in {normalized_alias}",
        f"institution in {normalized_alias}",
        f"institutions in {normalized_alias}",
        f"campus in {normalized_alias}",
        f"located in {normalized_alias}",
        f"based in {normalized_alias}",
        f"scholarship in {normalized_alias}",
        f"scholarships in {normalized_alias}",
        f"{normalized_alias} university",
        f"{normalized_alias} universities",
        f"{normalized_alias} campus",
        f"{normalized_alias} institution",
    )
    return any(_contains_phrase(text, pattern) for pattern in patterns)


def _targets_nationality_audience(text: str, alias: str) -> bool:
    normalized_alias = _normalized_text(alias)
    patterns = (
        f"for {normalized_alias} students",
        f"for {normalized_alias} applicants",
        f"for {normalized_alias} citizens",
        f"for {normalized_alias} nationals",
        f"students from {normalized_alias}",
        f"applicants from {normalized_alias}",
        f"citizens of {normalized_alias}",
        f"nationals of {normalized_alias}",
    )
    return any(_contains_phrase(text, pattern) for pattern in patterns)


def _is_academic_destination_domain(hostname: str, domains: Tuple[str, ...]) -> bool:
    if not any(hostname.endswith(domain) for domain in domains):
        return False
    academic_markers = (
        ".ac.",
        ".edu.",
        "university",
        "college",
        "hochschule",
        "universitaet",
    )
    return (
        hostname.endswith(".edu")
        or hostname.startswith("uni-")
        or ".uni-" in hostname
        or any(marker in hostname for marker in academic_markers)
    )


def matches_destinations(
    article: Dict[str, Any],
    destinations: Optional[List[str]],
) -> bool:
    if not destinations:
        return True

    text = _article_text(article)
    title = _normalized_text(article.get("title"))
    hostname = (urlparse(str(article.get("link") or "")).hostname or "").casefold()

    for destination in destinations:
        rule = DESTINATION_RULES.get(destination.strip().casefold())
        if not rule:
            if _has_destination_context(text, destination):
                return True
            continue
        nationality_only_title = any(
            _targets_nationality_audience(title, alias)
            for alias in rule["aliases"]
        ) and not any(
            _has_destination_context(title, alias)
            for alias in rule["aliases"]
        )
        if nationality_only_title:
            continue
        if _is_academic_destination_domain(hostname, rule["domains"]):
            return True
        for alias in rule["aliases"]:
            if _has_destination_context(text, alias):
                return True
    return False


def _fallback_field_aliases(label: str) -> Tuple[str, ...]:
    without_qualifiers = re.sub(r"\s*\(([^)]*)\)", r" \1 ", label)
    full = re.sub(r"\s+", " ", without_qualifiers.replace("&", " and ")).strip()
    parts = [
        part.strip()
        for part in re.split(r"\s+(?:and|/)\s+|/", full, flags=re.IGNORECASE)
        if len(part.strip()) >= 3 and part.strip().casefold() != "other"
    ]
    return tuple(_unique([full, *parts]))


def field_query_terms(fields: Optional[List[str]]) -> List[str]:
    return [
        FIELD_ALIASES.get(field.strip().casefold(), (_fallback_field_aliases(field)[0],))[0]
        for field in fields or []
    ]


def matches_fields(article: Dict[str, Any], fields: Optional[List[str]]) -> bool:
    if not fields:
        return True
    text = _article_text(article)
    return any(
        any(_contains_phrase(text, alias) for alias in FIELD_ALIASES.get(
            field.strip().casefold(),
            _fallback_field_aliases(field),
        ))
        for field in fields
    )


def funding_query_terms(funding_types: Optional[List[str]]) -> List[str]:
    return [
        FUNDING_ALIASES.get(funding.strip().casefold(), (funding,))[0]
        for funding in funding_types or []
    ]


def matches_funding(
    article: Dict[str, Any],
    funding_types: Optional[List[str]],
) -> bool:
    if not funding_types:
        return True
    text = _article_text(article)
    return any(
        any(
            _contains_phrase(text, alias)
            for alias in FUNDING_ALIASES.get(
                funding.strip().casefold(),
                (funding,),
            )
        )
        for funding in funding_types
    )


def season_query_terms(
    seasons: Optional[List[str]],
    today: date,
) -> List[str]:
    terms = []
    for season in seasons or []:
        normalized_season = season.strip().casefold()
        season_month = {
            "winter": 1,
            "spring": 3,
            "summer": 6,
            "fall": 9,
        }.get(normalized_season)
        if season_month is None:
            terms.append(season)
            continue
        target_year = today.year if season_month >= today.month else today.year + 1
        terms.append(f"{season.strip()} {target_year} intake")
    return terms


def matches_seasons(
    article: Dict[str, Any],
    seasons: Optional[List[str]],
) -> bool:
    if not seasons:
        return True
    text = _article_text(article)
    for season in seasons:
        normalized_season = season.strip().casefold()
        if any(
            _contains_phrase(text, alias)
            for alias in SEASON_ALIASES.get(normalized_season, (season,))
        ):
            return True
        for month in SEASON_MONTHS.get(normalized_season, ()):
            if any(
                _contains_phrase(text, pattern)
                for pattern in (
                    f"{month} intake",
                    f"intake in {month}",
                    f"semester starts in {month}",
                    f"program starts in {month}",
                    f"programme starts in {month}",
                )
            ):
                return True
    return False
