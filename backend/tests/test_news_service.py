import httpx
import pytest
from datetime import date

from app.api import news as news_api
from app.services.news_service import (
    MAX_TAVILY_QUERY_LENGTH,
    MAX_TAVILY_RESULTS,
    NewsService,
)


def test_erasmus_mundus_query_uses_canonical_names_and_aliases():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )

    query = service.build_search_query(
        popular_scholarships=["Erasmus Mundus (EU)"],
    )

    assert "Erasmus Mundus" in query
    assert "Erasmus Mundus Joint Master" in query
    assert "EMJM" in query
    assert "(EU)" not in query
    assert "deadlines on or after June 7, 2026" in query
    assert "2026-2027 cycle" in query
    assert "Exclude closed, expired, archived, and past cycles" in query
    assert len(query) <= MAX_TAVILY_QUERY_LENGTH


def test_query_preserves_selected_filter_types():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )

    query = service.build_search_query(
        levels=["Master's"],
        countries=["Europe"],
        fields_of_study=["Computer Science & Engineering"],
        funding_types=["Fully Funded"],
        seasons=["Fall"],
    )

    assert "postgraduate master's" in query
    assert "for study at universities in Europe" in query
    assert "in the field of computer science" in query
    assert "that are fully funded" in query
    assert "for Fall 2026 intake" in query
    assert len(query) <= MAX_TAVILY_QUERY_LENGTH


def test_search_date_and_cycle_refresh_for_each_query():
    current_date = [date(2026, 12, 31)]
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: current_date[0],
    )

    first_query = service.build_search_query(levels=["Master's"])
    current_date[0] = date(2027, 1, 1)
    second_query = service.build_search_query(levels=["Master's"])

    assert "December 31, 2026" in first_query
    assert "2026-2027 cycle" in first_query
    assert "January 1, 2027" in second_query
    assert "2027-2028 cycle" in second_query


def test_payload_is_fixed_to_one_credit_search_settings():
    service = NewsService(api_key="test-key")

    payload = service.build_search_payload("master's scholarships")

    assert payload == {
        "query": "master's scholarships",
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
    assert "api_key" not in payload


def test_tavily_results_are_normalized_for_existing_news_cards():
    service = NewsService(api_key="test-key")

    normalized = service.normalize_results(
        {
            "results": [
                {
                    "title": "Erasmus Mundus Joint Masters scholarships",
                    "url": "https://www.eacea.ec.europa.eu/scholarships/emjm",
                    "content": "Official application and funding information.",
                    "published_date": "2026-06-01",
                }
            ]
        }
    )

    article = normalized["results"][0]
    assert len(article["article_id"]) == 24
    assert article["link"] == "https://www.eacea.ec.europa.eu/scholarships/emjm"
    assert article["source_name"] == "eacea.ec.europa.eu"
    assert article["pubDate"] == "2026-06-01"
    assert article["description"] == "Official application and funding information."
    assert normalized["totalResults"] == 1
    assert "nextPage" not in normalized


def test_snippet_prioritizes_application_deadline_text():
    service = NewsService(api_key="test-key")

    normalized = service.normalize_results(
        {
            "results": [
                {
                    "title": "International scholarship",
                    "url": "https://example.edu/scholarship",
                    "content": (
                        "The program supports graduate study. "
                        "Applications are open until September 30, 2026. "
                        "Review the eligibility requirements before applying."
                    ),
                }
            ]
        }
    )

    assert normalized["results"][0]["description"].startswith(
        "Applications are open until September 30, 2026."
    )


def test_season_query_targets_the_next_available_intake_year():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )

    query = service.build_search_query(seasons=["Spring", "Fall"])

    assert "Spring 2027 intake" in query
    assert "Fall 2026 intake" in query


def test_realistic_full_query_keeps_every_required_dimension():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )

    query = service.build_search_query(
        levels=["Master's"],
        countries=["UAE"],
        fields_of_study=["Public Health"],
        funding_types=["Fully Funded"],
        seasons=["Fall"],
    )

    assert "postgraduate master's scholarships" in query
    assert "for study at universities in" in query
    assert "United Arab Emirates" in query
    assert "in the field of public health" in query
    assert "that are fully funded" in query
    assert "for Fall 2026 intake" in query
    assert len(query) <= MAX_TAVILY_QUERY_LENGTH


def test_large_query_never_truncates_dynamic_deadline_clause():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )

    query = service.build_search_query(
        levels=["Bachelor's", "Master's", "PhD", "Postdoctoral"],
        countries=["UAE", "Canada", "Germany", "Europe"],
        fields_of_study=[
            "Computer Science & Engineering",
            "Artificial Intelligence & Data Science",
            "Biomedical Engineering",
        ],
        funding_types=["Fully Funded", "Tuition Waiver", "Stipend"],
        seasons=["Fall", "Spring"],
    )

    assert "in the 2026-2027 cycle with deadlines on or after June 7, 2026" in query
    assert query.endswith("Exclude closed, expired, archived, and past cycles.")
    assert len(query) <= MAX_TAVILY_QUERY_LENGTH


@pytest.mark.asyncio
async def test_search_makes_exactly_one_tavily_request():
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "usage": {"credits": 1},
                "results": [
                    {
                        "title": "Arts centre receives a community grant",
                        "url": "https://example.com/community",
                        "content": "Funding will refurbish a building.",
                    },
                    {
                        "title": "Postgraduate scholarships",
                        "url": "https://example.edu/postgraduate-scholarships",
                        "content": "Scholarship funding for master's students.",
                    }
                ],
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, headers, json):
            calls.append({"url": url, "headers": headers, "json": json})
            return FakeResponse()

    factory_calls = []

    def client_factory(**kwargs):
        factory_calls.append(kwargs)
        return FakeClient()

    service = NewsService(api_key="test-tavily-key", client_factory=client_factory)

    response = await service.search_scholarships(
        levels=["Master's"],
        page="ignored-provider-page",
        approved_query="User refined master's scholarship query",
    )

    assert len(factory_calls) == 1
    assert len(calls) == 1
    assert calls[0]["url"] == "https://api.tavily.com/search"
    assert calls[0]["headers"]["Authorization"] == "Bearer test-tavily-key"
    assert calls[0]["json"]["search_depth"] == "basic"
    assert calls[0]["json"]["auto_parameters"] is False
    assert calls[0]["json"]["include_answer"] is False
    assert calls[0]["json"]["query"] == "User refined master's scholarship query"
    assert response["totalResults"] == 2
    assert [article["source_name"] for article in response["results"]] == [
        "example.com",
        "example.edu",
    ]
    assert "nextPage" not in response


@pytest.mark.asyncio
async def test_provider_error_does_not_retry():
    calls = []

    class FailingClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, headers, json):
            calls.append(url)
            request = httpx.Request("POST", url)
            response = httpx.Response(429, request=request)
            raise httpx.HTTPStatusError(
                "rate limited",
                request=request,
                response=response,
            )

    service = NewsService(
        api_key="test-tavily-key",
        client_factory=lambda **kwargs: FailingClient(),
    )

    with pytest.raises(news_api.HTTPException) as error:
        await service.search_scholarships(levels=["Master's"])

    assert getattr(error.value, "status_code", None) == 502
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_news_route_keeps_separate_news_usage_limits(monkeypatch):
    limit_calls = []
    search_calls = []

    async def fake_search(**kwargs):
        search_calls.append(kwargs)
        return {"status": "success", "totalResults": 0, "results": []}

    def fake_limit(user, feature, increment, session):
        limit_calls.append((feature, increment, session))

    class FakeStore:
        db = object()
        def connection(self):
            return object()

    monkeypatch.setattr(news_api.news_service, "api_key", "test-tavily-key")
    monkeypatch.setattr(news_api.news_service, "search_scholarships", fake_search)
    monkeypatch.setattr(news_api, "check_and_increment_limit", fake_limit)

    response = await news_api.search_news(
        levels=["Master's"],
        countries=None,
        seasons=None,
        years=None,
        funding_types=None,
        fields_of_study=None,
        popular_scholarships=None,
        language="en",
        sort_by="latest",
        page=None,
        user={"id": "user-1"},
        store=FakeStore(),
    )

    assert response["status"] == "success"
    assert len(search_calls) == 1
    assert [(feature, increment) for feature, increment, _ in limit_calls] == [
        ("news_searches_per_month", 0),
        ("news_searches_per_day", 0),
        ("news_searches_per_month", 1),
        ("news_searches_per_day", 1),
    ]
    assert not any("web_searches" in feature for feature, _, _ in limit_calls)


@pytest.mark.asyncio
async def test_news_route_does_not_consume_usage_after_provider_failure(monkeypatch):
    limit_calls = []

    async def fail_search(**kwargs):
        raise news_api.HTTPException(status_code=502, detail="Provider failed.")

    def fake_limit(user, feature, increment, session):
        limit_calls.append((feature, increment))

    class FakeStore:
        db = object()
        def connection(self):
            return object()

    monkeypatch.setattr(news_api.news_service, "api_key", "test-tavily-key")
    monkeypatch.setattr(news_api.news_service, "search_scholarships", fail_search)
    monkeypatch.setattr(news_api, "check_and_increment_limit", fake_limit)

    with pytest.raises(news_api.HTTPException):
        await news_api.search_news(
            levels=["Master's"],
            countries=None,
            seasons=None,
            years=None,
            funding_types=None,
            fields_of_study=None,
            popular_scholarships=None,
            language="en",
            sort_by="latest",
            page=None,
            user={"id": "user-1"},
            store=FakeStore(),
        )

    assert limit_calls == [
        ("news_searches_per_month", 0),
        ("news_searches_per_day", 0),
    ]
