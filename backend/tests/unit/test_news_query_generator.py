import json
from datetime import date
from types import SimpleNamespace

import httpx
import pytest

from app.services.news_query_generator import ScholarshipQueryGenerator


class FakeFallbackService:
    def __init__(self, query="local fallback scholarship query"):
        self.query = query
        self.calls = []

    def build_search_query(self, **filters):
        self.calls.append(filters)
        return self.query


class FakeResponse:
    def __init__(self, data, status_code=200):
        self._data = data
        self.status_code = status_code
        self.request = httpx.Request("POST", "https://openrouter.ai")

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "provider error",
                request=self.request,
                response=httpx.Response(self.status_code, request=self.request),
            )

    def json(self):
        return self._data


class FakeClient:
    def __init__(self, response, calls, **kwargs):
        self.response = response
        self.calls = calls
        self.timeout = kwargs.get("timeout")

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs, "timeout": self.timeout})
        return self.response


def _settings(api_key="test-key"):
    return SimpleNamespace(
        openrouter_api_key=api_key,
        openrouter_base_url="https://openrouter.ai/api/v1/chat/completions",
        openrouter_free_model="openrouter/free",
    )


def _client_factory(response, calls):
    return lambda **kwargs: FakeClient(response, calls, **kwargs)


@pytest.mark.asyncio
async def test_generates_structured_query_with_one_openrouter_call():
    calls = []
    query = (
        "Open Master's scholarships for study in UAE in Computer Science, "
        "2026-2027 applications and future deadlines; exclude closed expired past opportunities"
    )
    response = FakeResponse(
        {
            "model": "qwen/free-test",
            "choices": [{"message": {"content": json.dumps({"query": query})}}],
            "usage": {"prompt_tokens": 42, "completion_tokens": 7},
        }
    )
    fallback = FakeFallbackService()
    generator = ScholarshipQueryGenerator(
        settings=_settings(),
        fallback_service=fallback,
        client_factory=_client_factory(response, calls),
        today_provider=lambda: date(2026, 6, 7),
    )

    result = await generator.generate(
        {
            "levels": ["Master's"],
            "countries": ["UAE"],
            "fields_of_study": ["Computer Science"],
        }
    )

    assert result == {
        "query": query,
        "source": "openrouter",
        "model": "qwen/free-test",
        "notice": "",
        "usage": {"input_tokens": 42, "output_tokens": 7},
    }
    assert len(calls) == 1
    payload = calls[0]["json"]
    assert payload["model"] == "openrouter/free"
    assert payload["stream"] is False
    assert payload["reasoning"] == {"effort": "none", "exclude": True}
    assert payload["response_format"] == {"type": "json_object"}
    assert "2026-06-07" in payload["messages"][1]["content"]
    assert '"countries": ["UAE"]' in payload["messages"][1]["content"]
    assert calls[0]["headers"]["Authorization"] == "Bearer test-key"


@pytest.mark.asyncio
async def test_missing_key_uses_fallback_without_provider_call():
    calls = []
    fallback = FakeFallbackService("safe generated query")
    generator = ScholarshipQueryGenerator(
        settings=_settings(api_key=""),
        fallback_service=fallback,
        client_factory=_client_factory(FakeResponse({}), calls),
    )

    result = await generator.generate({"levels": ["PhD"]})

    assert result["source"] == "fallback"
    assert result["query"] == "safe generated query"
    assert calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        FakeResponse({}, status_code=429),
        FakeResponse({"choices": [{"message": {"content": "not json"}}]}),
    ],
)
async def test_provider_failure_uses_one_call_fallback(response):
    calls = []
    generator = ScholarshipQueryGenerator(
        settings=_settings(),
        fallback_service=FakeFallbackService("safe UAE fallback query"),
        client_factory=_client_factory(response, calls),
        today_provider=lambda: date(2026, 6, 7),
    )

    result = await generator.generate({"countries": ["UAE"]})

    assert result["source"] == "fallback"
    assert result["query"] == "safe UAE fallback query"
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_missing_selected_constraints_are_sealed_into_ai_query():
    calls = []
    query = (
        "Find scholarships with upcoming application deadlines in the 2026-2027 cycle"
    )
    response = FakeResponse(
        {"choices": [{"message": {"content": json.dumps({"query": query})}}]}
    )
    generator = ScholarshipQueryGenerator(
        settings=_settings(),
        fallback_service=FakeFallbackService("safe fallback"),
        client_factory=_client_factory(response, calls),
        today_provider=lambda: date(2026, 6, 7),
    )

    result = await generator.generate(
        {
            "levels": ["Master's"],
            "countries": ["UAE"],
            "fields_of_study": ["Computer Science"],
            "funding_types": ["Fully Funded"],
            "seasons": ["Fall"],
            "popular_scholarships": ["Erasmus Mundus (EU)"],
        }
    )

    assert result["source"] == "openrouter"
    assert "degree: Master's" in result["query"]
    assert "study destination: UAE" in result["query"]
    assert "study field: Computer Science" in result["query"]
    assert "funding: Fully Funded" in result["query"]
    assert "intake: Fall" in result["query"]
    assert "scholarship: Erasmus Mundus" in result["query"]
    assert "exclude closed, expired, and past opportunities" in result["query"]
    assert len(calls) == 1
