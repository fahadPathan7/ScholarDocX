import httpx
import pytest

from app.core.config import Settings
from app.services.ai import AiService


@pytest.mark.asyncio
async def test_chat_fallback_when_glm_key_missing():
    settings = Settings()
    settings.glm_api_key = ""
    settings.gemini_api_key = ""
    service = AiService(settings)

    response = await service.chat("Review this SOP", "SOP context")

    assert response["mode"] == "local-fallback"
    assert response["external_call_made"] is False
    assert "no private text was sent" in response["answer"]


@pytest.mark.asyncio
async def test_research_fallback_when_keys_missing():
    settings = Settings()
    settings.glm_api_key = ""
    settings.gemini_api_key = ""
    settings.tavily_api_key = ""
    service = AiService(settings)

    response = await service.research("Find publications")

    assert response["mode"] == "local-fallback"
    assert response["external_call_made"] is False


@pytest.mark.asyncio
async def test_summarize_memory_returns_empty_when_glm_key_missing():
    settings = Settings()
    settings.glm_api_key = ""
    settings.gemini_api_key = ""
    service = AiService(settings)

    response = await service.summarize_memory("User: shortlist MIT\nAssistant: noted", model="gemini:gemini-2.5-flash-lite")

    assert response["mode"] == "local-fallback"
    assert response["answer"] == ""
    assert response["external_call_made"] is False


@pytest.mark.asyncio
async def test_summarize_memory_drops_provider_error(monkeypatch):
    settings = Settings()
    settings.glm_api_key = "test-glm-key"
    settings.gemini_api_key = ""
    service = AiService(settings)

    async def fake_chat(message, context="", model=None, max_tokens=None, override_system_prompt=None, **kwargs):
        return {
            "mode": "provider-error",
            "answer": "GLM API error - Rate limit reached",
            "sources": [],
            "external_call_made": True,
        }

    monkeypatch.setattr(service, "chat", fake_chat)

    response = await service.summarize_memory("User: shortlist MIT\nAssistant: noted", model="gemini:gemini-2.5-flash-lite")

    assert response["mode"] == "provider-error"
    assert response["answer"] == ""
    assert response["external_call_made"] is True


@pytest.mark.asyncio
async def test_research_invalid_routing_defaults_to_search(monkeypatch):
    settings = Settings()
    settings.glm_api_key = "test-glm-key"
    settings.gemini_api_key = ""
    settings.tavily_api_key = "test-tavily-key"
    service = AiService(settings)
    tavily_queries = []

    async def fake_chat(message, context="", model=None, max_tokens=None, override_system_prompt=None, **kwargs):
        if override_system_prompt:
            return {
                "mode": "glm-GLM-4.7-Flash",
                "answer": "not json",
                "sources": [],
                "external_call_made": True,
            }
        return {
            "mode": "glm-GLM-5.1",
            "answer": "MIT EECS mentions a December deadline.",
            "sources": [],
            "external_call_made": True,
        }

    async def fake_tavily_search(query, max_results=2):
        tavily_queries.append(query)
        return [
            {
                "title": "MIT EECS Graduate Admissions",
                "url": "https://example.edu/admissions",
                "content": "Applications are due in December.",
            }
        ]

    monkeypatch.setattr(service, "chat", fake_chat)
    monkeypatch.setattr(service, "_tavily_search", fake_tavily_search)

    response = await service.research("Check MIT EECS admissions deadline", background_model="gemini:gemini-2.5-flash-lite")

    assert tavily_queries == ["Check MIT EECS admissions deadline"]
    assert response["mode"] == "tavily+glm"
    assert response["search_performed"] is True
    assert response["sources"] == [
        {"title": "MIT EECS Graduate Admissions", "url": "https://example.edu/admissions"}
    ]


@pytest.mark.asyncio
async def test_research_no_search_uses_direct_chat(monkeypatch):
    settings = Settings()
    settings.glm_api_key = "test-glm-key"
    settings.gemini_api_key = ""
    settings.tavily_api_key = "test-tavily-key"
    service = AiService(settings)

    async def fake_chat(message, context="", model=None, max_tokens=None, override_system_prompt=None, **kwargs):
        if override_system_prompt:
            return {
                "mode": "glm-GLM-4.7-Flash",
                "answer": '{"needs_search": false, "search_query": ""}',
                "sources": [],
                "external_call_made": True,
            }
        return {
            "mode": "glm-GLM-5.1",
            "answer": "Here is the summary from context.",
            "sources": [],
            "external_call_made": True,
        }

    async def fail_tavily_search(query):
        raise AssertionError("Tavily should not be called")

    monkeypatch.setattr(service, "chat", fake_chat)
    monkeypatch.setattr(service, "_tavily_search", fail_tavily_search)

    response = await service.research("Summarize the last answer", "[Last Turn]\nUser: ...", background_model="gemini:gemini-2.5-flash-lite")

    assert response["mode"] == "glm-direct"
    assert response["search_performed"] is False
    assert response["sources"] == []


@pytest.mark.asyncio
async def test_research_provider_error_mode_is_preserved(monkeypatch):
    settings = Settings()
    settings.glm_api_key = "test-glm-key"
    settings.gemini_api_key = ""
    settings.tavily_api_key = "test-tavily-key"
    service = AiService(settings)

    async def fake_chat(message, context="", model=None, max_tokens=None, override_system_prompt=None, **kwargs):
        if override_system_prompt:
            return {
                "mode": "glm-GLM-4.7-Flash",
                "answer": '{"needs_search": false, "search_query": ""}',
                "sources": [],
                "external_call_made": True,
            }
        return {
            "mode": "provider-error",
            "answer": "GLM API error - Rate limit reached",
            "sources": [],
            "external_call_made": True,
        }

    monkeypatch.setattr(service, "chat", fake_chat)

    response = await service.research("Summarize the last answer", "[Last Turn]\nUser: ...", background_model="gemini:gemini-2.5-flash-lite")

    assert response["mode"] == "provider-error"
    assert response["search_performed"] is False
    assert response["sources"] == []


@pytest.mark.asyncio
async def test_chat_uses_gemini_when_only_gemini_key_configured(monkeypatch):
    settings = Settings()
    settings.glm_api_key = ""
    settings.gemini_api_key = "test-gemini-key"
    settings.groq_api_key = ""
    settings.mistral_api_key = ""
    service = AiService(settings)
    calls = []

    async def fake_gemini(model_name, system_prompt, message, max_tokens=None):
        calls.append((model_name, system_prompt, message, max_tokens))
        return "Gemini answer"

    monkeypatch.setattr(service, "_chat_with_gemini", fake_gemini)

    response = await service.chat("Review this SOP", model="gemini:gemini-2.5-flash-lite", max_tokens=64)

    assert response["mode"] == "gemini-gemini-2.5-flash-lite"
    assert response["answer"] == "Gemini answer"
    assert response["external_call_made"] is True
    assert calls[0][0] == "gemini-2.5-flash-lite"
    assert calls[0][3] == 64





@pytest.mark.asyncio
async def test_auto_chat_falls_back_to_gemini_after_glm_rate_limit(monkeypatch):
    settings = Settings()
    settings.glm_api_key = "test-glm-key"
    settings.gemini_api_key = "test-gemini-key"
    settings.groq_api_key = ""
    settings.mistral_api_key = ""
    service = AiService(settings)

    async def fake_glm(model_name, system_prompt, message, max_tokens=None):
        request = httpx.Request("POST", "https://glm.example.test")
        response = httpx.Response(
            429,
            json={"error": {"message": "Rate limit reached", "code": "1302"}},
            request=request,
        )
        raise httpx.HTTPStatusError("Rate limit", request=request, response=response)

    async def fake_gemini(model_name, system_prompt, message, max_tokens=None):
        return f"Fallback via {model_name}"

    monkeypatch.setattr(service, "_chat_with_glm", fake_glm)
    monkeypatch.setattr(service, "_chat_with_gemini", fake_gemini)

    response = await service.chat("Reply briefly")

    assert response["mode"] == "gemini-gemini-2.5-flash-lite"
    assert response["answer"] == "Fallback via gemini-2.5-flash-lite"


@pytest.mark.asyncio
async def test_explicit_gemini_model_without_key_returns_local_fallback():
    settings = Settings()
    settings.glm_api_key = "test-glm-key"
    settings.gemini_api_key = ""
    settings.groq_api_key = ""
    settings.mistral_api_key = ""
    service = AiService(settings)

    response = await service.chat("Review this SOP", model="gemini:gemini-2.5-flash-lite")

    assert response["mode"] == "local-fallback"
    assert response["external_call_made"] is False
    assert "GEMINI_API_KEY" in response["answer"]
    assert "select a model with a configured provider" in response["answer"]





@pytest.mark.asyncio
async def test_gemini_provider_error_is_clear(monkeypatch):
    settings = Settings()
    settings.glm_api_key = ""
    settings.gemini_api_key = "test-gemini-key"
    service = AiService(settings)

    async def fake_gemini(model_name, system_prompt, message, max_tokens=None):
        request = httpx.Request("POST", "https://gemini.example.test")
        response = httpx.Response(
            400,
            json={"error": {"message": "API key not valid", "code": 400}},
            request=request,
        )
        raise httpx.HTTPStatusError("Bad request", request=request, response=response)

    monkeypatch.setattr(service, "_chat_with_gemini", fake_gemini)

    response = await service.chat("Review this SOP", model="gemini:gemini-2.5-flash-lite")

    assert response["mode"] == "provider-error"
    assert response["external_call_made"] is True
    assert "GEMINI API error" in response["answer"]
    assert "API key not valid" in response["answer"]
