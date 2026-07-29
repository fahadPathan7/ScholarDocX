"""SCHOLARDOCX-0189: the Advisor dossier's Research Metrics panel showed
"Est. tokens" — a word ("tokens") this app never shows users, who only know
"credits" — and the figure itself was a raw token *estimate*, not the real
amount actually deducted from the user's balance.

Fix: `AiService.charge_tokens()` / `charge_external_call()` now return the
underlying `ai_tokens.charge()` / `charge_flat_fee()` result dict (whose
`charged` field is the real credits deducted) instead of discarding it.
Advisor Atlas accumulates that real figure into `usage["credits_charged"]`
across every billed call a run makes (GLM chat/vision + OpenAlex; Tavily is
deliberately billed at $0 and contributes nothing), and `research_metrics`
now exposes it as `credits_used` instead of a token estimate.
"""
from unittest.mock import AsyncMock

from app.core.config import Settings
from app.services.advisor_atlas import analysis as an
from app.services.advisor_atlas.service import AdvisorAtlasService
from app.services.ai import AiService


def test_charge_tokens_returns_none_without_billing_context():
    settings = Settings()
    svc = AiService(settings)
    assert svc.charge_tokens(
        model_id="m", provider="glm", input_tokens=10, output_tokens=5, source="x"
    ) is None


def test_charge_external_call_returns_none_without_billing_context():
    settings = Settings()
    svc = AiService(settings)
    assert svc.charge_external_call(cost_usd=0.01, source="x") is None


def test_charge_external_call_returns_none_for_zero_cost():
    settings = Settings()
    svc = AiService(settings)
    svc._billing_user = {"id": "not-a-real-user"}
    svc._billing_session = object()
    assert svc.charge_external_call(cost_usd=0.0, source="x") is None


def test_record_ai_usage_accumulates_real_credits_from_response_usage():
    usage: dict = {"ai_calls": 0, "credits_charged": 0}
    an._record_ai_usage(usage, "sys", "prompt", "answer", {"credits_charged": 17})
    an._record_ai_usage(usage, "sys", "prompt", "answer", {"credits_charged": 5})
    assert usage["credits_charged"] == 22
    assert usage["ai_calls"] == 2


def test_record_ai_usage_tolerates_missing_response_usage():
    usage: dict = {}
    an._record_ai_usage(usage, "sys", "prompt", "answer")
    assert usage.get("credits_charged", 0) == 0


async def _fake_specialists_run():
    ai_service = AsyncMock()
    ai_service.settings.glm_api_key = "x"
    ai_service.settings.advisor_atlas_glm_model = "glm"
    ai_service.chat.return_value = {
        "mode": "glm-glm",
        "answer": "{}",
        "usage": {"input_tokens": 10, "output_tokens": 5, "credits_charged": 42},
    }
    usage: dict = {"ai_calls": 0, "credits_charged": 0}
    sources = [
        {"source_kind": "identity", "title": "t", "url": "https://x", "content": "c"}
    ]
    await an.analyze_professor_specialists(
        ai_service, {"display_name": "Jane Doe"}, sources, {}, usage
    )
    return usage


def test_analyze_professor_specialists_accumulates_real_credits_across_passes():
    import asyncio

    usage = asyncio.run(_fake_specialists_run())
    # "identity" source_kind matches two passes (identity_research,
    # career_teaching), so the mocked 42-credit charge is counted twice.
    assert usage["credits_charged"] == 84
    assert usage["ai_calls"] == 2


def test_new_usage_initializes_credits_charged():
    service = AdvisorAtlasService(Settings())
    usage = service._new_usage()
    assert usage["credits_charged"] == 0
