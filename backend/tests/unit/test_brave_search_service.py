"""Unit tests for the Brave Search adapter (SCHOLARDOCX-0175).

Mirrors the FakeClient/FakeResponse pattern from test_news_service.py but
for Brave's GET-with-params contract. Covers: param construction (domain
exclusion via -site:, freshness, count cap), response normalization into
the 9-key card contract, _refine_description reuse via description +
extra_snippets, error → 502 mapping, empty-key guard, and client_factory
injection.
"""
import httpx
import pytest

from app.services.brave_search_service import (
    BraveSearchService,
    EXCLUDED_DOMAINS,
    MAX_BRAVE_RESULTS,
)


def _settings_with_brave_key(key: str = "test-brave-key"):
    from app.core.config import Settings

    settings = Settings()
    settings.brave_api_key = key
    settings.brave_base_url = "https://api.search.brave.com/res/v1/web/search"
    return settings


def test_build_params_appends_site_exclusions_and_defaults():
    service = BraveSearchService(settings=_settings_with_brave_key())
    params = service.build_params("fully funded CS PhD Germany Fall 2027")

    assert params["q"].startswith("fully funded CS PhD Germany Fall 2027 ")
    # Every excluded domain is present as a -site: operator.
    for domain in EXCLUDED_DOMAINS:
        assert f"-site:{domain}" in params["q"]
    assert params["count"] == MAX_BRAVE_RESULTS
    assert params["freshness"] == "py"
    assert params["safesearch"] == "moderate"
    assert params["extra_snippets"] is True
    assert params["text_decorations"] is False


def test_build_params_caps_count_at_brave_maximum():
    service = BraveSearchService(settings=_settings_with_brave_key())
    params = service.build_params("test query", count=50)
    assert params["count"] == MAX_BRAVE_RESULTS


def test_build_params_floors_count_at_one():
    service = BraveSearchService(settings=_settings_with_brave_key())
    params = service.build_params("test query", count=0)
    assert params["count"] == 1


def test_build_params_accepts_country_and_search_lang():
    service = BraveSearchService(settings=_settings_with_brave_key())
    params = service.build_params(
        "test query", country="de", search_lang="en"
    )
    assert params["country"] == "de"
    assert params["search_lang"] == "en"


def test_normalize_maps_brave_results_into_card_contract():
    service = BraveSearchService(settings=_settings_with_brave_key())
    response_json = {
        "web": {
            "results": [
                {
                    "title": "DAAD EPOS Scholarship 2027",
                    "url": "https://www.daad.de/epos/",
                    "description": "Fully funded PhD funding. Application deadline 15 October 2026.",
                    "extra_snippets": [
                        "Eligible fields: engineering, computer science.",
                        "Monthly stipend of 1,300 EUR.",
                    ],
                    "age": "2026-07-01T00:00:00Z",
                    "page_age": "2026-07-02T00:00:00Z",
                    "meta_url": {"hostname": "www.daad.de"},
                    "thumbnail": {"src": "https://www.daad.de/thumb.png"},
                },
                {
                    "title": "Chevening Scholarship",
                    "url": "https://www.chevening.org/scholarship/",
                    "description": "Open applications. Deadline 5 November 2026.",
                    "meta_url": {"hostname": "chevening.org"},
                },
                # Skipped: no title/url
                {"title": "", "url": ""},
            ]
        }
    }

    normalized = service.normalize(response_json)

    assert normalized["status"] == "success"
    assert normalized["totalResults"] == 2
    assert len(normalized["results"]) == 2

    first = normalized["results"][0]
    # 9-key contract
    assert set(first.keys()) == {
        "article_id",
        "title",
        "link",
        "source_name",
        "pubDate",
        "image_url",
        "description",
        "country",
        "_search_score",
    }
    assert first["title"] == "DAAD EPOS Scholarship 2027"
    assert first["link"] == "https://www.daad.de/epos/"
    assert first["source_name"] == "daad.de"  # www. stripped
    assert first["pubDate"] == "2026-07-02T00:00:00Z"  # page_age preferred
    assert first["image_url"] == "https://www.daad.de/thumb.png"
    assert first["country"] == []
    assert first["_search_score"] == 1.0  # rank 0
    # Description composes snippet + extras via _refine_description (deadline
    # sentence should be front-loaded).
    assert "deadline" in first["description"].casefold()
    assert "engineering" in first["description"].casefold()

    second = normalized["results"][1]
    assert second["source_name"] == "chevening.org"
    assert second["_search_score"] == round(1.0 - 0.05, 4)  # rank 1


def test_normalize_handles_empty_response():
    service = BraveSearchService(settings=_settings_with_brave_key())
    normalized = service.normalize({"web": {"results": []}})
    assert normalized["totalResults"] == 0
    assert normalized["results"] == []


def test_normalize_handles_missing_web_block():
    service = BraveSearchService(settings=_settings_with_brave_key())
    normalized = service.normalize({})
    assert normalized["totalResults"] == 0


@pytest.mark.asyncio
async def test_search_makes_one_get_request_with_subscription_token():
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "web": {
                    "results": [
                        {
                            "title": "Test scholarship",
                            "url": "https://example.edu/test",
                            "description": "Test description.",
                            "meta_url": {"hostname": "example.edu"},
                        }
                    ]
                }
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def get(self, url, headers, params):
            calls.append({"url": url, "headers": headers, "params": params})
            return FakeResponse()

    def client_factory(**kwargs):
        return FakeClient()

    service = BraveSearchService(
        settings=_settings_with_brave_key(),
        client_factory=client_factory,
    )

    result = await service.search("test query", count=5)

    assert len(calls) == 1
    assert calls[0]["url"] == "https://api.search.brave.com/res/v1/web/search"
    assert calls[0]["headers"]["X-Subscription-Token"] == "test-brave-key"
    assert calls[0]["headers"]["Accept"] == "application/json"
    assert calls[0]["params"]["count"] == 5
    assert result["totalResults"] == 1


@pytest.mark.asyncio
async def test_search_raises_502_on_http_status_error():
    from fastapi import HTTPException

    class FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def get(self, url, headers, params):
            request = httpx.Request("GET", url)
            response = httpx.Response(429, request=request)
            raise httpx.HTTPStatusError(
                "rate limited", request=request, response=response
            )

    service = BraveSearchService(
        settings=_settings_with_brave_key(),
        client_factory=lambda **kw: FailingClient(),
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.search("test query")
    assert exc_info.value.status_code == 502
    # User-facing message must not name the provider (AGENTS.md copy rule).
    assert "brave" not in exc_info.value.detail.casefold()


@pytest.mark.asyncio
async def test_search_raises_502_on_request_error():
    class FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def get(self, url, headers, params):
            raise httpx.RequestError("connection reset")

    from fastapi import HTTPException

    service = BraveSearchService(
        settings=_settings_with_brave_key(),
        client_factory=lambda **kw: FailingClient(),
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.search("test query")
    assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_search_raises_500_when_key_unconfigured():
    from fastapi import HTTPException

    settings = _settings_with_brave_key(key="")
    service = BraveSearchService(settings=settings)

    with pytest.raises(HTTPException) as exc_info:
        await service.search("test query")
    assert exc_info.value.status_code == 500


def test_configured_property_reflects_key_presence():
    configured = BraveSearchService(settings=_settings_with_brave_key("k"))
    unconfigured = BraveSearchService(settings=_settings_with_brave_key(""))
    assert configured.configured is True
    assert unconfigured.configured is False
