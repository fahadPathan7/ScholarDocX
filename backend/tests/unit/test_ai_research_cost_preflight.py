"""SCHOLARDOCX-0218: /ai/research worst-case pre-flight + honest mid-run 402.

The route used to pre-check `ensure_can_spend(min_tokens=1)`, so a user with
~1 credit passed, the Tavily search fee was charged, and then the answer call
failed with 402 — credits spent, no answer. The route now prices the worst
case (Tavily flat fee + a conservative answer ceiling) before any provider
work, and `AiService.research()` re-raises answer-side OutOfTokens with copy
that says the web-search fee was already deducted.

Pricing getters are monkeypatched (see CODE_RULES — never write
app_settings/ai_models rows for a test); no provider is contacted.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

import app.api.routes as routes_api
from app.api.routes import AiPayload, ai_research
from app.core.config import Settings
from app.services import ai_tokens
from app.services.ai import (
    RESEARCH_ANSWER_OUT_OF_CREDITS_MESSAGE,
    AiService,
)


class FakeAiService:
    """Stands in for routes.AiService: records construction + research()."""

    # The route's pre-flight prices the named model via the service's own
    # parser (a pure static) — delegate to the real implementation.
    _parse_model_choice = staticmethod(AiService._parse_model_choice)

    instances: list["FakeAiService"] = []

    def __init__(self, settings, *, user=None, session=None):
        self.settings = settings
        self.user = user
        self.session = session
        self.research_calls: list[dict] = []
        FakeAiService.instances.append(self)

    async def research(self, message, context="", model=None, background_model=None,
                       max_results=2, max_chars=300):
        self.research_calls.append(
            {
                "message": message,
                "model": model,
                "max_results": max_results,
                "max_chars": max_chars,
            }
        )
        return {"mode": "tavily+glm", "answer": "ok", "sources": []}


def _research_payload(**overrides) -> AiPayload:
    defaults = {
        "message": "What are the current MIT EECS deadlines?",
        "model": "glm:GLM-5.2",
        "web_search_max_results": 2,
        "web_search_max_chars": 300,
    }
    defaults.update(overrides)
    return AiPayload(**defaults)


class FakeStore:
    db = object()


def _install_route_gates(monkeypatch, ensure_behavior):
    """Neutralize everything between the route entry and the pre-flight.

    `ensure_behavior` is called with min_tokens; return True to allow or
    raise ai_tokens.OutOfTokens to refuse.
    """
    spend_calls: list[tuple[str, int]] = []

    def fake_ensure(user, session, min_tokens=1):
        spend_calls.append((user["id"], min_tokens))
        return ensure_behavior(min_tokens)

    monkeypatch.setattr(ai_tokens, "ensure_can_spend", fake_ensure)
    # Deterministic pricing: search fee 0.01 USD; the answer call prices at
    # 0.01 USD regardless of model. Ceiling = ceil((0.01 + 0.01) * 10000) = 200.
    monkeypatch.setattr(ai_tokens, "get_tavily_call_cost_usd", lambda session: 0.01)
    monkeypatch.setattr(ai_tokens, "get_token_rate", lambda session: 10000)
    monkeypatch.setattr(
        ai_tokens,
        "compute_cost",
        lambda model_id, input_tokens, output_tokens, session, provider=None: (0.01, 100),
    )
    monkeypatch.setattr(routes_api, "verify_model_permission", lambda *a, **k: None)
    import app.auth.limits as limits

    monkeypatch.setattr(limits, "check_and_increment_limit", lambda *a, **k: True)
    monkeypatch.setattr(limits, "get_user_limit", lambda *a, **k: -1)
    return spend_calls


@pytest.mark.asyncio
async def test_research_pre_flight_blocks_unaffordable_before_provider_work(monkeypatch):
    """A balance below the worst-case ceiling gets a plain 402 BEFORE the
    service (and therefore Tavily) is ever touched."""
    FakeAiService.instances = []
    monkeypatch.setattr(routes_api, "AiService", FakeAiService)

    def refuse(min_tokens):
        raise ai_tokens.OutOfTokens("out of credits")

    spend_calls = _install_route_gates(monkeypatch, refuse)

    with pytest.raises(HTTPException) as error:
        await ai_research(
            _research_payload(),
            settings=Settings(),
            store=FakeStore(),  # type: ignore
            current_user={"id": "user-1", "roles": ["pro_user"]},
        )

    assert error.value.status_code == 402
    assert error.value.detail == (
        "Not enough credits for this search. It reads the web and writes a full answer."
    )
    # The pre-flight ran with the worst-case ceiling, not the old min-1 check.
    assert spend_calls == [("user-1", 200)]
    # No service was constructed, so no routing call, search, or answer ran.
    assert FakeAiService.instances == []


@pytest.mark.asyncio
async def test_research_pre_flight_affordable_ceiling_proceeds_to_service(monkeypatch):
    """An affordable ceiling lets the request through to the service."""
    FakeAiService.instances = []
    monkeypatch.setattr(routes_api, "AiService", FakeAiService)

    spend_calls = _install_route_gates(monkeypatch, lambda min_tokens: True)

    result = await ai_research(
        _research_payload(),
        settings=Settings(),
        store=FakeStore(),  # type: ignore
        current_user={"id": "user-2", "roles": ["pro_user"]},
    )

    assert result["mode"] == "tavily+glm"
    assert len(FakeAiService.instances) == 1
    assert FakeAiService.instances[0].research_calls[0]["message"] == (
        "What are the current MIT EECS deadlines?"
    )
    assert spend_calls == [("user-2", 200)]


@pytest.mark.asyncio
async def test_research_without_web_search_skips_the_ceiling(monkeypatch):
    """web_search_max_results=0 never charges the search fee, so the route
    keeps leaving that path to chat()'s own billing guards."""
    FakeAiService.instances = []
    monkeypatch.setattr(routes_api, "AiService", FakeAiService)

    spend_calls = _install_route_gates(monkeypatch, lambda min_tokens: True)

    await ai_research(
        _research_payload(web_search_max_results=0),
        settings=Settings(),
        store=FakeStore(),  # type: ignore
        current_user={"id": "user-3", "roles": ["pro_user"]},
    )

    assert spend_calls == []
    assert len(FakeAiService.instances[0].research_calls) == 1


# --- Honest 402: the answer stage running dry after a charged search --------


def _configured_service() -> AiService:
    settings = Settings()
    settings.glm_api_key = "test-glm-key"
    settings.gemini_api_key = ""
    settings.tavily_api_key = "test-tavily-key"
    return AiService(settings)


@pytest.mark.asyncio
async def test_research_answer_out_of_tokens_says_search_fee_was_deducted(monkeypatch):
    """OutOfTokens from the answer call — after the search fee was charged —
    surfaces the honest copy instead of the generic out-of-credits text."""
    service = _configured_service()
    charges: list[str] = []

    async def fake_chat(message, context="", model=None, max_tokens=None,
                        override_system_prompt=None, **kwargs):
        if override_system_prompt:
            # Routing decision: search needed (also what a parse failure does).
            return {"mode": "glm-GLM-4.7-Flash", "answer": "not json"}
        # The answer-side charge runs dry.
        raise ai_tokens.OutOfTokens("You're out of AI credits for this period.")

    async def fake_tavily_search(query, max_results=2):
        return [{"title": "MIT EECS", "url": "https://example.edu", "content": "Due in December."}]

    monkeypatch.setattr(service, "chat", fake_chat)
    monkeypatch.setattr(service, "_tavily_search", fake_tavily_search)
    monkeypatch.setattr(
        service,
        "charge_external_call",
        lambda *, cost_usd, source: charges.append(source) or {"charged": 100},
    )

    with pytest.raises(ai_tokens.OutOfTokens) as error:
        await service.research("Check MIT EECS admissions deadline")

    assert error.value.detail == RESEARCH_ANSWER_OUT_OF_CREDITS_MESSAGE
    assert "already deducted" in error.value.detail
    # The search fee was charged before the answer stage raised.
    assert charges == ["web_search"]


@pytest.mark.asyncio
async def test_research_no_search_out_of_tokens_keeps_generic_copy(monkeypatch):
    """Without a search there is no deducted fee to disclose, so the original
    OutOfTokens detail passes through untouched."""
    service = _configured_service()

    async def fake_chat(message, context="", model=None, max_tokens=None,
                        override_system_prompt=None, **kwargs):
        if override_system_prompt:
            return {
                "mode": "glm-GLM-4.7-Flash",
                "answer": '{"needs_search": false, "search_query": ""}',
            }
        raise ai_tokens.OutOfTokens("You're out of AI credits for this period.")

    async def fail_tavily_search(query, max_results=2):
        raise AssertionError("Tavily must not be called when routing says no search")

    monkeypatch.setattr(service, "chat", fake_chat)
    monkeypatch.setattr(service, "_tavily_search", fail_tavily_search)

    with pytest.raises(ai_tokens.OutOfTokens) as error:
        await service.research("Summarize the last answer")

    assert error.value.detail == "You're out of AI credits for this period."
