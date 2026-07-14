import json
from types import SimpleNamespace

import httpx
import pytest

from app.services.scholarship_extraction import ScholarshipExtractionService


class FakeAiService:
    def __init__(self, response):
        self._response = response
        self.calls = []

    async def chat(self, message, **kwargs):
        self.calls.append({"message": message, **kwargs})
        return self._response


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


def _openrouter_response(payload: dict) -> FakeResponse:
    return FakeResponse(
        {
            "model": "openrouter/free",
            "choices": [{"message": {"content": json.dumps(payload)}}],
        }
    )


@pytest.mark.asyncio
async def test_configured_provider_success_extracts_all_fields():
    ai_service = FakeAiService(
        {
            "mode": "success",
            "answer": json.dumps(
                {
                    "name": "Chevening Scholarship",
                    "sponsor": "UK Government",
                    "degree_levels": ["master's"],
                    "destination_countries": ["United Kingdom"],
                    "eligible_nationalities": ["Any"],
                    "funding": {"coverage": "full", "notes": "Tuition and stipend"},
                    "deadlines": [{"date": "2026-11-01", "label": "Application deadline"}],
                    "requirements": ["Bachelor's degree", "Two references"],
                    "application_url": "https://www.chevening.org/apply",
                    "field_confidence": {"name": 0.95, "deadlines": 0.8},
                }
            ),
        }
    )
    service = ScholarshipExtractionService(settings=_settings())

    result = await service.extract(
        ai_service,
        source_url="https://www.chevening.org/scholarships",
        source_title="Chevening Scholarship 2027",
        source_snippet="Apply by 1 November for the fully-funded UK master's scholarship.",
    )

    assert result["extraction_source"] == "configured_provider"
    assert result["canonical_name"] == "Chevening Scholarship"
    assert result["sponsor"] == "UK Government"
    assert result["funding"] == {"coverage": "full", "notes": "Tuition and stipend"}
    assert result["deadlines"] == [{"date": "2026-11-01", "label": "Application deadline"}]
    assert result["field_confidence"] == {"name": 0.95, "deadlines": 0.8}


@pytest.mark.asyncio
async def test_unsupported_fields_stay_null_never_invented():
    ai_service = FakeAiService(
        {
            "mode": "success",
            "answer": json.dumps(
                {
                    "name": "Example Scholarship",
                    "sponsor": None,
                    "degree_levels": [],
                    "destination_countries": [],
                    "eligible_nationalities": [],
                    "funding": {},
                    "deadlines": [],
                    "requirements": [],
                    "application_url": None,
                    "field_confidence": {"name": 0.6},
                }
            ),
        }
    )
    service = ScholarshipExtractionService(settings=_settings())

    result = await service.extract(
        ai_service,
        source_url="https://example.edu/scholarship",
        source_title="Example Scholarship",
        source_snippet="A scholarship page with no stated deadline or funding amount.",
    )

    assert result["sponsor"] is None
    assert result["funding"] == {}
    assert result["deadlines"] == []
    assert result["application_url"] is None


@pytest.mark.asyncio
async def test_configured_provider_failure_falls_back_to_openrouter():
    ai_service = FakeAiService({"mode": "provider-error", "answer": ""})
    calls: list = []
    response = _openrouter_response(
        {
            "name": "Fallback Scholarship",
            "sponsor": "Fallback Sponsor",
            "degree_levels": ["phd"],
            "destination_countries": ["Canada"],
            "eligible_nationalities": [],
            "funding": {"coverage": "partial", "notes": None},
            "deadlines": [],
            "requirements": [],
            "application_url": None,
            "field_confidence": {},
        }
    )
    service = ScholarshipExtractionService(
        settings=_settings(),
        client_factory=lambda **kwargs: FakeClient(response, calls, **kwargs),
    )

    result = await service.extract(
        ai_service,
        source_url="https://example.org/fallback",
        source_title="Fallback Scholarship",
        source_snippet="text",
    )

    assert len(calls) == 1
    assert result["extraction_source"] == "openrouter_fallback"
    assert result["canonical_name"] == "Fallback Scholarship"


@pytest.mark.asyncio
async def test_no_provider_available_returns_empty_result_never_fabricated():
    ai_service = FakeAiService({"mode": "local-fallback", "answer": ""})
    service = ScholarshipExtractionService(settings=_settings(api_key=None))

    result = await service.extract(
        ai_service,
        source_url="https://example.org/none",
        source_title="No Provider",
        source_snippet="text",
    )

    assert result["extraction_source"] == "none"
    assert result["canonical_name"] is None
    assert result["degree_levels"] == []
    assert result["funding"] == {}


@pytest.mark.asyncio
async def test_malformed_openrouter_json_falls_back_to_empty_result():
    ai_service = FakeAiService({"mode": "provider-error", "answer": ""})
    calls: list = []
    response = FakeResponse(
        {"model": "openrouter/free", "choices": [{"message": {"content": "not json"}}]}
    )
    service = ScholarshipExtractionService(
        settings=_settings(),
        client_factory=lambda **kwargs: FakeClient(response, calls, **kwargs),
    )

    result = await service.extract(
        ai_service,
        source_url="https://example.org/bad",
        source_title="Bad",
        source_snippet="text",
    )

    assert result["extraction_source"] == "none"
