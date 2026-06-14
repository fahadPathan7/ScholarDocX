import calendar
import hashlib
import re
import unicodedata
from datetime import date
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.services.news_filter_rules import (
    destination_query_terms,
    field_query_terms,
    funding_query_terms,
    season_query_terms,
)


TAVILY_SEARCH_URL = "https://api.tavily.com/search"
MAX_TAVILY_RESULTS = 20
MAX_TAVILY_QUERY_LENGTH = 400

MONTH_NAMES = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}
MONTH_PATTERN = "|".join(MONTH_NAMES)
DEADLINE_CONTEXT_TERMS = (
    "application deadline",
    "applications due",
    "apply by",
    "closing date",
    "deadline",
    "submission deadline",
    "applications close",
    "application closes",
)
CLOSED_STATUS_TERMS = (
    "applications are closed",
    "applications closed",
    "application is closed",
    "application closed",
    "call is closed",
    "deadline has passed",
    "deadline passed",
    "no longer accepting applications",
    "now closed",
    "opportunity expired",
)
ACTIVE_STATUS_TERMS = (
    "accepting applications",
    "applications are open",
    "applications open",
    "apply now",
    "call for applications",
    "now accepting",
    "open for applications",
    "upcoming deadline",
)

SCHOLARSHIP_ALIASES = {
    "erasmus mundus (eu)": (
        "Erasmus Mundus",
        "Erasmus Mundus Joint Master",
        "Erasmus Mundus Joint Masters",
        "EMJM",
    ),
    "stipendium hungaricum (hungary)": ("Stipendium Hungaricum",),
    "chevening scholarship (uk)": ("Chevening Scholarship", "Chevening"),
    "daad scholarship (germany)": ("DAAD Scholarship", "DAAD"),
    "switzerland government excellence (switzerland)": (
        "Swiss Government Excellence Scholarship",
        "Swiss Government Excellence Scholarships",
    ),
    "holland scholarship (netherlands)": ("Holland Scholarship", "NL Scholarship"),
    "swedish institute scholarship (sweden)": (
        "Swedish Institute Scholarship",
        "Swedish Institute Scholarships for Global Professionals",
        "SISGP",
    ),
    "eiffel excellence scholarship (france)": (
        "Eiffel Excellence Scholarship",
        "Eiffel Scholarship",
    ),
    "romanian government scholarship": ("Romanian Government Scholarship",),
    "csc scholarship / chinese government scholarship (china)": (
        "Chinese Government Scholarship",
        "CSC Scholarship",
    ),
    "mext scholarship (japan)": ("MEXT Scholarship", "Monbukagakusho Scholarship"),
    "korean government scholarship - kgsp (south korea)": (
        "Global Korea Scholarship",
        "Korean Government Scholarship",
        "GKS",
        "KGSP",
    ),
    "taiwan icdf scholarship": ("TaiwanICDF Scholarship", "Taiwan ICDF Scholarship"),
    "turkish government scholarship - türkiye bursları": (
        "Türkiye Scholarships",
        "Türkiye Bursları",
        "Turkiye Scholarships",
        "Turkiye Burslari",
    ),
    "malaysian commonwealth scholarship": (
        "Malaysian Commonwealth Scholarship",
        "Malaysia International Scholarship",
    ),
    "singapore international graduate award (singa)": (
        "Singapore International Graduate Award",
        "SINGA",
    ),
    "mastercard foundation scholarship": (
        "Mastercard Foundation Scholars Program",
        "Mastercard Foundation Scholarship",
    ),
    "african union scholarship": ("African Union Scholarship",),
    "commonwealth scholarship (various)": (
        "Commonwealth Scholarship",
        "Commonwealth Scholarships",
    ),
    "fulbright scholarship (usa)": ("Fulbright Scholarship", "Fulbright"),
    "oas scholarship (organization of american states)": (
        "OAS Scholarship",
        "OAS Academic Scholarship",
    ),
    "canadian government scholarships (cgsp)": (
        "Canadian Government Scholarship",
        "Canada Graduate Scholarships",
        "CGS",
    ),
    "aga khan foundation scholarship": ("Aga Khan Foundation Scholarship",),
    "gates cambridge scholarship": ("Gates Cambridge Scholarship",),
    "rhodes scholarship (oxford)": ("Rhodes Scholarship",),
    "world bank scholarship (jj/wbgsp)": (
        "Joint Japan World Bank Graduate Scholarship",
        "JJ/WBGSP",
        "World Bank Scholarship",
    ),
    "opec fund scholarship": ("OPEC Fund Scholarship",),
}

LEVEL_SEARCH_TERMS = {
    "bachelor's": "undergraduate bachelor's",
    "master's": "postgraduate master's",
    "phd": "PhD doctoral",
    "postdoctoral": "postdoctoral",
    "short course": "short course certificate",
}

LEVEL_MATCH_TERMS = {
    "bachelor's": ("bachelor", "undergraduate"),
    "master's": ("master", "postgraduate"),
    "phd": ("phd", "doctoral", "doctorate"),
    "postdoctoral": ("postdoctoral", "postdoc"),
    "short course": ("short course", "certificate program"),
}

STRONG_FUNDING_TERMS = (
    "scholarship",
    "fellowship",
    "bursary",
    "studentship",
    "tuition waiver",
    "financial aid",
)

ACADEMIC_TERMS = (
    "academic",
    "admissions",
    "college",
    "doctoral",
    "education",
    "graduate",
    "phd",
    "postdoctoral",
    "research",
    "school",
    "student",
    "study",
    "tuition",
    "undergraduate",
    "university",
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


def _fallback_scholarship_aliases(label: str) -> List[str]:
    without_qualifiers = re.sub(r"\s*\([^)]*\)\s*", " ", label)
    parts = re.split(r"\s+/\s+|\s+-\s+", without_qualifiers)
    return _unique(parts)


def _scholarship_aliases(label: str) -> List[str]:
    configured = SCHOLARSHIP_ALIASES.get(label.strip().casefold())
    return list(configured) if configured else _fallback_scholarship_aliases(label)


def _compact_search_term(label: str) -> str:
    cleaned = re.sub(r"\s*\([^)]*\)\s*", " ", str(label or ""))
    cleaned = re.sub(r"[\\/]+", " ", cleaned)
    cleaned = re.sub(r"\s*&\s*", " and ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _normalized_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def _article_text(article: Dict[str, Any]) -> str:
    fields: List[Any] = [
        article.get("title"),
        article.get("description"),
        article.get("content"),
        article.get("link"),
    ]
    fields.extend(article.get("keywords") or [])
    return _normalized_text(" ".join(str(value or "") for value in fields))


def _raw_article_text(article: Dict[str, Any]) -> str:
    return " ".join(
        str(article.get(field) or "")
        for field in ("title", "description", "content")
    )


def _contains_term(text: str, term: str) -> bool:
    normalized_term = _normalized_text(term)
    return bool(normalized_term and normalized_term in text)


def _is_academic_funding_article(article: Dict[str, Any]) -> bool:
    text = _article_text(article)
    if any(_contains_term(text, term) for term in STRONG_FUNDING_TERMS):
        return True
    has_funding = any(
        _contains_term(text, term)
        for term in ("grant", "funding", "funded", "stipend", "award")
    )
    has_academic_context = any(_contains_term(text, term) for term in ACADEMIC_TERMS)
    return has_funding and has_academic_context


def _dedupe_key(value: Any) -> str:
    return _normalized_text(value)


def _append_query_section(
    query: str,
    prefix: str,
    terms: Iterable[str],
    max_length: int = MAX_TAVILY_QUERY_LENGTH,
) -> str:
    selected = _unique(terms)
    if not selected:
        return query

    accepted: List[str] = []
    for term in selected:
        candidate_terms = " or ".join([*accepted, term])
        candidate = f"{query} {prefix} {candidate_terms}"
        if len(candidate) > max_length:
            break
        accepted.append(term)
    return f"{query} {prefix} {' or '.join(accepted)}" if accepted else query


def _source_name(url: str) -> str:
    hostname = (urlparse(url).hostname or "").lower()
    return hostname[4:] if hostname.startswith("www.") else hostname


def _stable_article_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]


def _format_search_date(value: date) -> str:
    return f"{value.strftime('%B')} {value.day}, {value.year}"


def _safe_date(year: int, month: int, day: int) -> Optional[date]:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _has_deadline_context(text: str, start: int, end: int) -> bool:
    window = _normalized_text(text[max(0, start - 70):min(len(text), end + 70)])
    return any(_contains_term(window, term) for term in DEADLINE_CONTEXT_TERMS)


def _cycle_years(text: str) -> List[int]:
    years = [int(value) for value in re.findall(r"\b20\d{2}\b", text)]
    for match in re.finditer(r"\b(20\d{2})\s*[-/]\s*(\d{2})\b", text):
        start_year = int(match.group(1))
        end_year = (start_year // 100) * 100 + int(match.group(2))
        if end_year < start_year:
            end_year += 100
        years.append(end_year)
    return sorted(set(years))


def _extract_deadline_dates(article: Dict[str, Any]) -> List[date]:
    text = _raw_article_text(article)
    deadlines: List[date] = []
    full_date_patterns = (
        re.compile(
            rf"\b(?P<month>{MONTH_PATTERN})\.?\s+"
            r"(?P<day>\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)"
            r"(?P<year>20\d{2})\b",
            re.IGNORECASE,
        ),
        re.compile(
            rf"\b(?P<day>\d{{1,2}})(?:st|nd|rd|th)?\s+"
            rf"(?P<month>{MONTH_PATTERN})\.?,?\s+"
            r"(?P<year>20\d{2})\b",
            re.IGNORECASE,
        ),
    )

    for pattern in full_date_patterns:
        for match in pattern.finditer(text):
            if not _has_deadline_context(text, match.start(), match.end()):
                continue
            parsed = _safe_date(
                int(match.group("year")),
                MONTH_NAMES[match.group("month").casefold()],
                int(match.group("day")),
            )
            if parsed:
                deadlines.append(parsed)

    for match in re.finditer(r"\b(?P<year>20\d{2})-(?P<month>\d{2})-(?P<day>\d{2})\b", text):
        if not _has_deadline_context(text, match.start(), match.end()):
            continue
        parsed = _safe_date(
            int(match.group("year")),
            int(match.group("month")),
            int(match.group("day")),
        )
        if parsed:
            deadlines.append(parsed)

    for match in re.finditer(
        rf"\b(?P<month>{MONTH_PATTERN})\s+(?P<year>20\d{{2}})\b",
        text,
        re.IGNORECASE,
    ):
        if not _has_deadline_context(text, match.start(), match.end()):
            continue
        year = int(match.group("year"))
        month = MONTH_NAMES[match.group("month").casefold()]
        deadlines.append(date(year, month, calendar.monthrange(year, month)[1]))

    season_end_dates = {
        "winter": (2, 28),
        "spring": (5, 31),
        "summer": (8, 31),
        "fall": (11, 30),
    }
    for match in re.finditer(
        r"\b(?P<season>winter|spring|summer|fall)\s+(?P<year>20\d{2})\b",
        text,
        re.IGNORECASE,
    ):
        if not _has_deadline_context(text, match.start(), match.end()):
            continue
        month, day = season_end_dates[match.group("season").casefold()]
        parsed = _safe_date(int(match.group("year")), month, day)
        if parsed:
            deadlines.append(parsed)

    years = _cycle_years(text)
    if len(years) == 1:
        for match in re.finditer(
            rf"\b(?P<month>{MONTH_PATTERN})\s+(?:application\s+)?deadlines?\b"
            rf"|\b(?:application\s+)?deadlines?\s+(?:in\s+)?(?P<month_after>{MONTH_PATTERN})\b",
            text,
            re.IGNORECASE,
        ):
            month_name = match.group("month") or match.group("month_after")
            month = MONTH_NAMES[month_name.casefold()]
            deadlines.append(date(years[0], month, calendar.monthrange(years[0], month)[1]))

    return sorted(set(deadlines))


def _has_explicit_closed_status(article: Dict[str, Any]) -> bool:
    text = _article_text(article)
    if any(_contains_term(text, term) for term in CLOSED_STATUS_TERMS):
        return True
    return bool(
        re.search(
            r"\b(?:application|applications|call|fellowship|scholarship|"
            r"studentship|program|portal)\b.{0,55}\bclosed\b"
            r"|\bclosed\b.{0,55}\b(?:application|applications|call|"
            r"fellowship|scholarship|studentship|program|portal)\b",
            text,
        )
    )


def _has_active_status(article: Dict[str, Any]) -> bool:
    text = _article_text(article)
    return any(_contains_term(text, term) for term in ACTIVE_STATUS_TERMS)


def _is_stale_cycle(article: Dict[str, Any], today: date) -> bool:
    title = str(article.get("title") or "")
    years = _cycle_years(title)
    if not years:
        return False
    if max(years) < today.year:
        return True
    has_ending_current_cycle = bool(
        re.search(rf"\b{today.year - 1}\s*[-/]\s*{str(today.year)[-2:]}\b", title)
    )
    return has_ending_current_cycle and today.month >= 6


def _is_official_source(url: str) -> bool:
    hostname = _source_name(url)
    return (
        hostname.endswith(".gov")
        or ".gov." in hostname
        or hostname.endswith(".edu")
        or ".edu." in hostname
        or hostname.endswith(".ac.uk")
        or ".ac." in hostname
        or hostname.endswith("europa.eu")
    )


def _matches_selected_levels(
    article: Dict[str, Any],
    levels: Optional[List[str]],
) -> bool:
    if not levels:
        return True
    title = _normalized_text(article.get("title"))
    text = _article_text(article)
    for level in levels:
        normalized_level = level.strip().casefold()
        if normalized_level == "phd" and any(
            _contains_term(title, term)
            for term in ("postdoctoral", "postdoc")
        ):
            continue
        terms = LEVEL_MATCH_TERMS.get(
            normalized_level,
            (_compact_search_term(level),),
        )
        if any(_contains_term(text, term) for term in terms):
            return True
    return False


def _has_conflicting_level(
    article: Dict[str, Any],
    levels: Optional[List[str]],
) -> bool:
    if not levels or _matches_selected_levels(article, levels):
        return False

    text = _article_text(article)
    mentioned_levels = {
        level
        for level, terms in LEVEL_MATCH_TERMS.items()
        if any(_contains_term(text, term) for term in terms)
    }
    return bool(mentioned_levels)


def _refine_description(description: str) -> str:
    # Clean markdown hashes and asterisks
    clean_desc = re.sub(r'(?:^|\s)#+\s+', ' ', description)
    clean_desc = re.sub(r'\*{1,2}', '', clean_desc)
    
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", clean_desc)
        if sentence.strip()
    ]
    if not sentences:
        return description
    deadline_sentences = [
        sentence
        for sentence in sentences
        if any(
            _contains_term(_normalized_text(sentence), term)
            for term in (*DEADLINE_CONTEXT_TERMS, *ACTIVE_STATUS_TERMS)
        )
    ]
    ordered = _unique([*deadline_sentences, *sentences])
    return " ".join(ordered)[:420].strip()


def _result_image(result: Dict[str, Any]) -> Optional[str]:
    for image in result.get("images") or []:
        if isinstance(image, str) and image:
            return image
        if isinstance(image, dict) and image.get("url"):
            return str(image["url"])
    return None


class NewsService:
    def __init__(
        self,
        api_key: Optional[str] = None,
        client_factory=None,
        today_provider=None,
    ):
        settings = get_settings()
        self.api_key = (
            settings.tavily_api_key_scholarship_hunt if api_key is None else api_key
        )
        self.base_url = TAVILY_SEARCH_URL
        self._client_factory = client_factory or httpx.AsyncClient
        self._today_provider = today_provider or date.today

    def build_search_query(
        self,
        levels: Optional[List[str]] = None,
        countries: Optional[List[str]] = None,
        seasons: Optional[List[str]] = None,
        years: Optional[List[str]] = None,
        funding_types: Optional[List[str]] = None,
        fields_of_study: Optional[List[str]] = None,
        popular_scholarships: Optional[List[str]] = None,
        custom_prompt: Optional[str] = None,
        language: str = "en",
        sort_by: str = "latest",
    ) -> str:
        today = self._today_provider()
        cycle = f"{today.year}-{today.year + 1}"
        deadline_clause = (
            f", in the {cycle} cycle with deadlines on or after "
            f"{_format_search_date(today)}. Exclude closed, expired, archived, "
            "and past cycles."
        )
        content_limit = MAX_TAVILY_QUERY_LENGTH - len(deadline_clause)
        primary_names: List[str] = []
        extra_aliases: List[str] = []
        if popular_scholarships:
            primary_names = [
                aliases[0]
                for scholarship in popular_scholarships
                if (aliases := _scholarship_aliases(scholarship))
            ]
            extra_aliases = [
                alias
                for scholarship in popular_scholarships
                for alias in _scholarship_aliases(scholarship)[1:]
            ]

        degree_terms = [
            LEVEL_SEARCH_TERMS.get(
                level.strip().casefold(),
                _compact_search_term(level),
            )
            for level in levels or []
        ]
        opportunity_terms = primary_names or degree_terms
        if custom_prompt:
            query = custom_prompt.strip()
            destination_prefix = ""
        elif primary_names:
            query = f"Open {' or '.join(_unique(primary_names))} applications"
            query = _append_query_section(
                query,
                "for",
                [f"{term} study" for term in degree_terms],
                content_limit,
            )
            destination_prefix = "at universities in"
        elif opportunity_terms:
            query = f"Open {' or '.join(_unique(opportunity_terms))} scholarships"
            destination_prefix = "for study at universities in"
        else:
            query = "Open scholarships, fellowships, and academic funding"
            destination_prefix = "for study at universities in"

        if destination_prefix:
            query = _append_query_section(
                query,
                destination_prefix,
                destination_query_terms(countries),
                content_limit,
            )
        query = _append_query_section(
            query,
            "in the field of",
            field_query_terms(fields_of_study),
            content_limit,
        )
        query = _append_query_section(
            query,
            "that are",
            funding_query_terms(funding_types),
            content_limit,
        )
        query = _append_query_section(
            query,
            "for",
            season_query_terms(seasons, today),
            content_limit,
        )
        query = _append_query_section(
            query,
            "in",
            [_compact_search_term(year) for year in years or []],
            content_limit,
        )
        query = query[:content_limit].rstrip()
        query += deadline_clause
        if language and language.casefold() != "en":
            query = _append_query_section(query, "Use source language", [language])
        if sort_by == "popularity":
            query = _append_query_section(query, "Prefer", ["well-established programs."])
        if popular_scholarships:
            query = _append_query_section(query, "Also known as", extra_aliases)
        return query[:MAX_TAVILY_QUERY_LENGTH].rstrip()

    def build_search_payload(self, query: str) -> Dict[str, Any]:
        return {
            "query": query,
            "topic": "general",
            "search_depth": "basic",
            "max_results": MAX_TAVILY_RESULTS,
            "auto_parameters": False,
            "include_answer": False,
            "include_raw_content": False,
            "include_images": False,
            "exclude_domains": [
                "youtube.com",
                "youtu.be",
                "facebook.com",
                "instagram.com",
                "linkedin.com",
                "tiktok.com",
                "threads.com",
                "twitter.com",
                "x.com",
            ],
        }

    def normalize_results(self, response_data: Dict[str, Any]) -> Dict[str, Any]:
        articles = []
        for result in response_data.get("results") or []:
            title = re.sub(r"\s+", " ", str(result.get("title") or "")).strip()
            link = str(result.get("url") or "").strip()
            if not title or not link:
                continue
            description = re.sub(
                r"\s+",
                " ",
                str(result.get("content") or ""),
            ).strip()
            articles.append(
                {
                    "article_id": _stable_article_id(link),
                    "title": title,
                    "link": link,
                    "source_name": _source_name(link),
                    "pubDate": (
                        result.get("published_date")
                        or result.get("publishedDate")
                        or result.get("date")
                    ),
                    "image_url": _result_image(result),
                    "description": _refine_description(description) or None,
                    "country": [],
                    "_search_score": float(result.get("score") or 0),
                }
            )
        return {
            "status": "success",
            "totalResults": len(articles),
            "results": articles,
        }

    async def search_scholarships(
        self,
        levels: Optional[List[str]] = None,
        countries: Optional[List[str]] = None,
        seasons: Optional[List[str]] = None,
        years: Optional[List[str]] = None,
        funding_types: Optional[List[str]] = None,
        fields_of_study: Optional[List[str]] = None,
        popular_scholarships: Optional[List[str]] = None,
        custom_prompt: Optional[str] = None,
        language: str = "en",
        sort_by: str = "latest",
        page: Optional[str] = None,
        approved_query: Optional[str] = None,
    ) -> Dict[str, Any]:
        del page  # Tavily pagination is intentionally disabled: one request per search.
        query = approved_query or self.build_search_query(
            levels=levels,
            countries=countries,
            seasons=seasons,
            years=years,
            funding_types=funding_types,
            fields_of_study=fields_of_study,
            popular_scholarships=popular_scholarships,
            custom_prompt=custom_prompt,
            language=language,
            sort_by=sort_by,
        )
        payload = self.build_search_payload(query)

        try:
            async with self._client_factory(timeout=30.0) as client:
                response = await client.post(
                    self.base_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as error:
            raise HTTPException(
                status_code=502,
                detail=f"Tavily Search failed with status {error.response.status_code}.",
            )
        except httpx.RequestError:
            raise HTTPException(
                status_code=502,
                detail="Failed to connect to Tavily Search.",
            )

        normalized = self.normalize_results(response.json())
        return normalized


news_service = NewsService()
