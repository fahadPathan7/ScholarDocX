"""Brave Search API adapter for Scholarship Hunt (SCHOLARDOCX-0175).

A thin HTTP + normalization layer. No domain logic, no filtering, no
extraction — those live in news_service.py (rules) and
scholarship_deep_hunt.py (pipeline). This module only:

1. Builds the Brave web-search request (GET, X-Subscription-Token header).
2. Normalizes the Brave response into the existing 9-key card contract
   (article_id, title, link, source_name, pubDate, image_url, description,
   country, _search_score) so downstream code is provider-agnostic.
3. Returns totalResults so the pipeline can bill per raw hit.

Modeled on the project's existing provider-adapter pattern (httpx.AsyncClient
+ client_factory injection for testing).
"""
import hashlib
import re
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from app.core.config import Settings, get_settings
from app.services.news_service import _refine_description


BRAVE_WEB_SEARCH_PATH = "/res/v1/web/search"
MAX_BRAVE_RESULTS = 20  # Brave count cap per request.

# Social/video domains excluded from Scholarship Hunt results. Brave has no
# exclude_domains param, so these are prefixed to the query as -site:
# operators (Brave's documented exclusion syntax).
EXCLUDED_DOMAINS = (
    "youtube.com",
    "youtu.be",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "tiktok.com",
    "threads.com",
    "twitter.com",
    "x.com",
)


def _exclusion_suffix() -> str:
    """Build the -site: exclusion fragment appended to every Brave query."""
    return " " + " ".join(f"-site:{domain}" for domain in EXCLUDED_DOMAINS)


def _stable_article_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]


def _source_name(url: str) -> str:
    hostname = urlparse(url).hostname or ""
    return re.sub(r"^www\.", "", hostname)


def _result_image(result: Dict[str, Any]) -> Optional[str]:
    thumbnail = result.get("thumbnail")
    if isinstance(thumbnail, dict):
        src = thumbnail.get("src") or thumbnail.get("url")
        if isinstance(src, str) and src:
            return src
    if isinstance(thumbnail, str) and thumbnail:
        return thumbnail
    return None


def _build_description(result: Dict[str, Any]) -> Optional[str]:
    """Compose a description from Brave's snippet + extra_snippets.

    extra_snippets gives up to 5 additional excerpts per result — useful
    context for downstream extraction. We join the primary description
    with the first two extras and run the combined text through the
    existing _refine_description (deadline-sentence front-loading).
    """
    parts: List[str] = []
    description = str(result.get("description") or "").strip()
    if description:
        parts.append(description)
    for snippet in (result.get("extra_snippets") or [])[:2]:
        if isinstance(snippet, str) and snippet.strip():
            parts.append(snippet.strip())
    if not parts:
        return None
    combined = " ".join(parts)
    refined = _refine_description(combined)
    return refined or None


class BraveSearchService:
    """Async Brave web-search adapter. Returns the card contract."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        client_factory: Optional[Callable[..., Any]] = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._client_factory = client_factory or httpx.AsyncClient

    @property
    def api_key(self) -> str:
        return self.settings.brave_api_key

    @property
    def configured(self) -> bool:
        return bool(self.settings.brave_api_key)

    def build_params(
        self,
        query: str,
        *,
        count: int = MAX_BRAVE_RESULTS,
        freshness: str = "py",
        country: Optional[str] = None,
        search_lang: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Construct Brave query parameters.

        - count is capped at Brave's 20-result maximum.
        - Domain exclusions are prefixed to q as -site: operators.
        - freshness defaults to 'py' (past year) to bias toward current
          application cycles.
        """
        effective_count = max(1, min(count, MAX_BRAVE_RESULTS))
        full_query = f"{query.strip()}{_exclusion_suffix()}"
        params: Dict[str, Any] = {
            "q": full_query,
            "count": effective_count,
            "freshness": freshness,
            "safesearch": "moderate",
            "extra_snippets": True,
            "text_decorations": False,
        }
        if country:
            params["country"] = country
        if search_lang:
            params["search_lang"] = search_lang
        return params

    def normalize(self, response_json: Dict[str, Any]) -> Dict[str, Any]:
        """Map Brave's web.results into the 9-key card contract."""
        web = response_json.get("web") or {}
        raw_results: List[Dict[str, Any]] = web.get("results") or []
        articles = []
        for rank, result in enumerate(raw_results):
            title = re.sub(r"\s+", " ", str(result.get("title") or "")).strip()
            link = str(result.get("url") or "").strip()
            if not title or not link:
                continue
            meta_url = result.get("meta_url") or {}
            hostname = (
                meta_url.get("hostname")
                if isinstance(meta_url, dict)
                else None
            )
            source_name = hostname or _source_name(link)
            source_name = re.sub(r"^www\.", "", source_name)
            articles.append(
                {
                    "article_id": _stable_article_id(link),
                    "title": title,
                    "link": link,
                    "source_name": source_name,
                    "pubDate": result.get("page_age") or result.get("age"),
                    "image_url": _result_image(result),
                    "description": _build_description(result),
                    "country": [],
                    # Brave returns no relevance score; derive a descending
                    # rank-based score so downstream ordering is preserved.
                    "_search_score": round(1.0 - (rank * 0.05), 4),
                }
            )
        return {
            "status": "success",
            "totalResults": len(articles),
            "results": articles,
        }

    async def search(
        self,
        query: str,
        *,
        count: int = MAX_BRAVE_RESULTS,
        freshness: str = "py",
        country: Optional[str] = None,
        search_lang: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Execute a Brave web search and return the normalized card contract.

        Raises HTTPException(502) on any Brave error (user-facing message
        contains no provider name per AGENTS.md copy rules).
        """
        if not self.configured:
            raise HTTPException(
                status_code=500,
                detail="Scholarship Hunt search is not configured.",
            )
        params = self.build_params(
            query,
            count=count,
            freshness=freshness,
            country=country,
            search_lang=search_lang,
        )
        base_url = self.settings.brave_base_url.rstrip("/")
        # If the configured base URL already includes the path, use it as-is;
        # otherwise append the standard Brave web-search path.
        url = base_url if base_url.endswith(BRAVE_WEB_SEARCH_PATH) else base_url + BRAVE_WEB_SEARCH_PATH
        try:
            async with self._client_factory(timeout=30.0) as client:
                response = await client.get(
                    url,
                    headers={
                        "X-Subscription-Token": self.api_key,
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip",
                    },
                    params=params,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError:
            raise HTTPException(
                status_code=502,
                detail="Scholarship Hunt search failed. Please try again.",
            )
        except httpx.RequestError:
            raise HTTPException(
                status_code=502,
                detail="Scholarship Hunt search failed. Please try again.",
            )

        return self.normalize(response.json())


brave_search_service = BraveSearchService()
