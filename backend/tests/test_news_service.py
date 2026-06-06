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


def test_generic_results_reject_non_academic_grants_and_deduplicate():
    service = NewsService(api_key="test-key")
    response = {
        "status": "success",
        "results": [
            {
                "article_id": "community",
                "title": "Arts centre receives a community grant",
                "description": "Funding will refurbish the building.",
                "link": "https://example.com/community",
            },
            {
                "article_id": "scholarship",
                "title": "University launches international student scholarship",
                "description": "The award covers tuition.",
                "link": "https://example.com/scholarship",
            },
            {
                "article_id": "research-grant",
                "title": "University doctoral research grant",
                "description": "Funding supports PhD study.",
                "link": "https://example.com/research",
            },
            {
                "article_id": "research-grant-copy",
                "title": "University doctoral research grant",
                "description": "Republished copy.",
                "link": "https://example.com/research",
            },
        ],
    }

    filtered = service.filter_results(response)

    assert [article["article_id"] for article in filtered["results"]] == [
        "scholarship",
        "research-grant",
    ]
    assert filtered["totalResults"] == 2
    assert "nextPage" not in filtered


def test_closed_past_deadline_and_stale_cycle_results_are_removed():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )
    response = {
        "status": "success",
        "results": [
            {
                "article_id": "past",
                "title": "Scholarship application deadline January 20, 2026",
                "description": "Funding is available for doctoral students.",
                "link": "https://example.edu/past",
            },
            {
                "article_id": "month-past",
                "title": "Best graduate scholarships for 2026 with February deadlines",
                "description": "Scholarship funding for graduate study.",
                "link": "https://example.com/february",
            },
            {
                "article_id": "season-past",
                "title": "External funding opportunities with Spring 2026 deadlines",
                "description": "Scholarship and fellowship funding.",
                "link": "https://example.edu/spring",
            },
            {
                "article_id": "closed",
                "title": "Research fellowship applications closed",
                "description": "This funded fellowship is no longer accepting applications.",
                "link": "https://example.edu/closed",
            },
            {
                "article_id": "stale",
                "title": "Top fully funded scholarships for 2025-26",
                "description": "A scholarship guide for graduate students.",
                "link": "https://example.com/stale",
            },
            {
                "article_id": "future",
                "title": "Doctoral scholarship applications open",
                "description": "The application deadline is September 30, 2026.",
                "link": "https://example.edu/future",
            },
        ],
    }

    filtered = service.filter_results(response)

    assert [article["article_id"] for article in filtered["results"]] == ["future"]


def test_future_active_and_official_results_are_ranked_first():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )
    response = {
        "status": "success",
        "results": [
            {
                "article_id": "editorial",
                "title": "Graduate scholarship funding guide",
                "description": "Scholarships and fellowships for students.",
                "link": "https://example.com/guide",
                "_search_score": 0.99,
            },
            {
                "article_id": "official",
                "title": "University doctoral scholarship",
                "description": "Funding and eligibility information.",
                "link": "https://graduate.example.edu/scholarship",
                "_search_score": 0.50,
            },
            {
                "article_id": "active",
                "title": "2027 scholarship applications are open",
                "description": "Apply now for funded postgraduate study.",
                "link": "https://example.org/open",
                "_search_score": 0.60,
            },
            {
                "article_id": "future",
                "title": "Doctoral fellowship deadline",
                "description": "Application deadline: August 15, 2026.",
                "link": "https://example.org/deadline",
                "_search_score": 0.40,
            },
        ],
    }

    filtered = service.filter_results(response)

    assert [article["article_id"] for article in filtered["results"]] == [
        "future",
        "active",
        "official",
        "editorial",
    ]
    assert all("_search_score" not in article for article in filtered["results"])


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


def test_phd_filter_removes_generic_and_postdoctoral_only_results():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )
    response = {
        "status": "success",
        "results": [
            {
                "article_id": "generic",
                "title": "Graduate funding portal",
                "description": "Scholarships and financial aid for graduate students.",
                "link": "https://example.edu/graduate-funding",
            },
            {
                "article_id": "postdoc",
                "title": "Postdoctoral scholarship applications open",
                "description": "Applicants must already hold a PhD.",
                "link": "https://example.edu/postdoc",
            },
            {
                "article_id": "doctoral",
                "title": "Doctoral scholarship applications open",
                "description": "Fully funded PhD study with a September 2026 deadline.",
                "link": "https://example.edu/doctoral",
            },
        ],
    }

    filtered = service.filter_results(response, levels=["PhD"])

    assert [article["article_id"] for article in filtered["results"]] == ["doctoral"]


def test_masters_uae_rejects_china_uk_and_nationality_only_results():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )
    response = {
        "status": "success",
        "results": [
            {
                "article_id": "china",
                "title": "Chinese Government Master's Scholarship",
                "description": "Study in China with scholarship funding.",
                "link": "https://example.cn/scholarship",
            },
            {
                "article_id": "chevening",
                "title": "Chevening Scholarships",
                "description": "Pursue a one-year master's degree in the UK.",
                "link": "https://chevening.org/scholarships",
            },
            {
                "article_id": "nationality",
                "title": "Master's scholarships for United Arab Emirates students",
                "description": (
                    "Applicants from the UAE can compare UAE university "
                    "scholarships and study in the United Kingdom."
                ),
                "link": "https://example.org/uae-applicants",
            },
            {
                "article_id": "uae-source-only",
                "title": "Government master's scholarship request",
                "description": "UAE ministry funding for study in the United Kingdom.",
                "link": "https://mohesr.gov.ae/scholarship-request",
            },
            {
                "article_id": "uae",
                "title": "Khalifa University Master's Scholarship",
                "description": (
                    "Study in the United Arab Emirates with postgraduate "
                    "scholarship funding. Applications are open."
                ),
                "link": "https://www.ku.ac.ae/masters-scholarship",
            },
        ],
    }

    filtered = service.filter_results(
        response,
        levels=["Master's"],
        countries=["UAE"],
    )

    assert [article["article_id"] for article in filtered["results"]] == ["uae"]


def test_multiple_destinations_use_or_semantics():
    service = NewsService(api_key="test-key")
    response = {
        "status": "success",
        "results": [
            {
                "article_id": "canada",
                "title": "Canadian university undergraduate scholarship",
                "description": "Study in Canada with a tuition scholarship.",
                "link": "https://example.ca/scholarship",
            },
            {
                "article_id": "germany",
                "title": "German university undergraduate scholarship",
                "description": "Study in Germany with scholarship support.",
                "link": "https://example.de/scholarship",
            },
            {
                "article_id": "australia",
                "title": "Australian university undergraduate scholarship",
                "description": "Study in Australia with scholarship support.",
                "link": "https://example.au/scholarship",
            },
        ],
    }

    filtered = service.filter_results(
        response,
        levels=["Bachelor's"],
        countries=["Canada", "Germany"],
    )

    assert [article["article_id"] for article in filtered["results"]] == [
        "canada",
        "germany",
    ]


def test_all_selected_dimensions_use_and_semantics():
    service = NewsService(
        api_key="test-key",
        today_provider=lambda: date(2026, 6, 7),
    )
    base = {
        "title": "Master's public health scholarship in Dubai",
    }
    response = {
        "status": "success",
        "results": [
            {
                **base,
                "article_id": "match",
                "link": "https://example.ac.ae/public-health-match",
                "description": (
                    "A fully funded postgraduate public health scholarship for "
                    "Fall 2026 study in Dubai."
                ),
            },
            {
                **base,
                "article_id": "wrong-funding",
                "link": "https://example.ac.ae/public-health-partial",
                "description": (
                    "A partially funded postgraduate public health scholarship "
                    "for Fall 2026 study in Dubai."
                ),
            },
            {
                **base,
                "article_id": "wrong-field",
                "title": "Master's engineering scholarship in Dubai",
                "link": "https://example.ac.ae/engineering",
                "description": (
                    "A fully funded postgraduate engineering scholarship for "
                    "Fall 2026 study in Dubai."
                ),
            },
            {
                **base,
                "article_id": "wrong-season",
                "link": "https://example.ac.ae/public-health-spring",
                "description": (
                    "A fully funded postgraduate public health scholarship for "
                    "Spring 2027 study in Dubai."
                ),
            },
        ],
    }

    filtered = service.filter_results(
        response,
        levels=["Master's"],
        countries=["UAE"],
        fields_of_study=["Public Health"],
        funding_types=["Fully Funded"],
        seasons=["Fall"],
    )

    assert [article["article_id"] for article in filtered["results"]] == ["match"]


def test_named_scholarship_still_requires_selected_destination():
    service = NewsService(api_key="test-key")
    response = {
        "status": "success",
        "results": [
            {
                "article_id": "erasmus",
                "title": "Erasmus Mundus Joint Master's applications",
                "description": "Study at European universities with scholarship funding.",
                "link": "https://example.eu/erasmus",
            }
        ],
    }

    filtered = service.filter_results(
        response,
        popular_scholarships=["Erasmus Mundus (EU)"],
        levels=["Master's"],
        countries=["UAE"],
    )

    assert filtered["results"] == []


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
    )

    assert len(factory_calls) == 1
    assert len(calls) == 1
    assert calls[0]["url"] == "https://api.tavily.com/search"
    assert calls[0]["headers"]["Authorization"] == "Bearer test-tavily-key"
    assert calls[0]["json"]["search_depth"] == "basic"
    assert calls[0]["json"]["auto_parameters"] is False
    assert calls[0]["json"]["include_answer"] is False
    assert response["totalResults"] == 1
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

    def fake_limit(user, feature, increment, connection):
        limit_calls.append((feature, increment, connection))

    class FakeStore:
        connection = object()

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

    def fake_limit(user, feature, increment, connection):
        limit_calls.append((feature, increment))

    class FakeStore:
        connection = object()

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
