from datetime import datetime
from pathlib import Path
import json

import pytest
from sqlalchemy import text

from app.core.config import Settings
from app.db.connection import connect, get_db, initialize_database
from app.services import ai_tokens
from app.services.ai import AiService

# Shared helpers (make_settings, make_user, set_model_price, get_balance,
# ledger_rows) live in tests/helpers.py so any test in any subfolder can use
# them without a cross-file bare import.
from tests.helpers import (
    get_balance,
    ledger_rows,
    make_settings,
    make_user,
    set_model_price,
)


# ── Seeded defaults ──────────────────────────────────────────────────────────

def test_seed_defaults(tmp_path):
    settings = make_settings(tmp_path)
    with connect(settings.database_target) as db:
        rate = db.execute(
            "SELECT value FROM app_settings WHERE key='ai_token_rate_tokens_per_dollar'"
        ).fetchone()["value"]
        packs = db.execute(
            "SELECT code, token_amount, price_usd FROM ai_token_packs ORDER BY sort_order"
        ).fetchall()
        # SCHOLARDOCX-0140: monthly AI credit allowance moved from role_limits
        # (ai_tokens_per_month) to app_settings (plan_ai_credits_<tier>).
        credit_keys = {
            r["key"]
            for r in db.execute(
                "SELECT key FROM app_settings WHERE key LIKE 'plan_ai_credits_%'"
            ).fetchall()
        }
        # SCHOLARDOCX-0154: the legacy role_limits row is purged on init.
        legacy_count = db.execute(
            "SELECT COUNT(*) FROM role_limits WHERE feature='ai_tokens_per_month'"
        ).fetchone()[0]

    assert int(rate) == 10000
    assert [dict(p) for p in packs] == [
        {"code": "small", "token_amount": 100000, "price_usd": 10.0},
        {"code": "medium", "token_amount": 500000, "price_usd": 40.0},
        {"code": "large", "token_amount": 1500000, "price_usd": 100.0},
        {"code": "extra_large", "token_amount": 5000000, "price_usd": 300.0},
    ]
    # All four per-tier credit keys must exist (values are admin-editable, so we
    # only assert presence, not the specific seeded default).
    assert credit_keys == {
        "plan_ai_credits_free",
        "plan_ai_credits_general",
        "plan_ai_credits_pro",
        "plan_ai_credits_max",
    }
    assert legacy_count == 0


# ── compute_cost ─────────────────────────────────────────────────────────────

def test_compute_cost_math_and_ceil(tmp_path):
    settings = make_settings(tmp_path)
    set_model_price(settings, "GLM-4.7", input_price=1.0, output_price=2.0)
    session = next(get_db(settings.database_target))
    try:
        # cost = 1000*1/1e6 + 500*2/1e6 = 0.002 USD -> ceil(0.002*10000) = 20 tokens
        cost_usd, tokens = ai_tokens.compute_cost("GLM-4.7", 1000, 500, session)
        assert cost_usd == pytest.approx(0.002)
        assert tokens == 20

        # 1001 input -> 0.002001 USD -> ceil(20.01) = 21
        cost_usd2, tokens2 = ai_tokens.compute_cost("GLM-4.7", 1001, 500, session)
        assert tokens2 == 21
    finally:
        session.close()


def test_compute_cost_unknown_model_is_free(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        cost_usd, tokens = ai_tokens.compute_cost("does-not-exist", 1000, 500, session)
        assert cost_usd == 0.0
        assert tokens == 0
    finally:
        session.close()


def test_compute_cost_falls_back_to_provider_price(tmp_path):
    """SCHOLARDOCX-0204 (L4): an uncatalogued model still bills at the
    provider's house rate rather than silently costing the user nothing."""
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        cost_usd, tokens = ai_tokens.compute_cost(
            "some-model-nobody-seeded", 1_000_000, 0, session, provider="openrouter"
        )
        assert cost_usd > 0.0
        assert tokens > 0
    finally:
        session.close()


def test_configured_openrouter_model_is_priced(tmp_path):
    """The exact id OPENROUTER_FREE_MODEL resolves to must be priced.

    This is the regression guard for L4: the settings default
    ("openrouter/free") did not match the seeded row ("openrouter"), so every
    OpenRouter charge computed $0 while still writing a ledger row.
    """
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        assert ai_tokens.validate_model_pricing(session, settings) == []
        cost_usd, tokens = ai_tokens.compute_cost(
            settings.openrouter_free_model, 1_000_000, 0, session
        )
        assert cost_usd > 0.0
        assert tokens > 0
    finally:
        session.close()


# ── monthly reset ────────────────────────────────────────────────────────────

def test_refresh_balance_grants_monthly_allowance(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    session = next(get_db(settings.database_target))
    try:
        balance = ai_tokens.refresh_balance(user, session)
        assert balance["subscription_remaining"] == 500000
        assert balance["purchased_remaining"] == 0
        assert balance["subscription_period"] == datetime.utcnow().strftime("%Y-%m")
    finally:
        session.close()


def test_refresh_balance_resets_at_month_boundary_no_rollover(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    now = datetime.utcnow()
    last_period = f"{now.year - 1}-12" if now.month == 1 else f"{now.year}-{now.month - 1:02d}"

    session = next(get_db(settings.database_target))
    try:
        ai_tokens.refresh_balance(user, session)
        # Spend down to 1000 left, stamp a prior period.
        with connect(settings.database_target) as db:
            db.execute(
                "UPDATE ai_token_balances SET subscription_remaining = 1000, "
                "subscription_period = ? WHERE user_id = ?",
                (last_period, user["id"]),
            )
            db.commit()
        # New period -> full allowance restored, leftover discarded.
        balance = ai_tokens.refresh_balance(user, session)
        assert balance["subscription_remaining"] == 500000
        assert balance["subscription_period"] == datetime.utcnow().strftime("%Y-%m")
    finally:
        session.close()


# ── bucket order ─────────────────────────────────────────────────────────────

def test_charge_consumes_subscription_before_purchased(tmp_path):
    settings = make_settings(tmp_path)
    set_model_price(settings, "GLM-4.7", input_price=1.0, output_price=2.0)  # 1000/500 -> 20 tokens
    user = make_user(settings, ["pro_user"])
    session = next(get_db(settings.database_target))
    try:
        ai_tokens.grant_purchased(user["id"], 100000, session=session, source="test")
        # Sub has 2000000 -> first charge eats from sub only.
        res1 = ai_tokens.charge(
            user, model_id="GLM-4.7", provider="glm", input_tokens=1000,
            output_tokens=500, source="chat", session=session,
        )
        assert res1["charged"] == 20
        b = get_balance(settings, user["id"])
        assert b["subscription_remaining"] == 2000000 - 20
        assert b["purchased_remaining"] == 100000

        # Exhaust sub, charge again -> spills into purchased.
        with connect(settings.database_target) as db:
            db.execute(
                "UPDATE ai_token_balances SET subscription_remaining = 0 WHERE user_id = ?",
                (user["id"],),
            )
            db.commit()
        res2 = ai_tokens.charge(
            user, model_id="GLM-4.7", provider="glm", input_tokens=1000,
            output_tokens=500, source="chat", session=session,
        )
        assert res2["charged"] == 20
        b2 = get_balance(settings, user["id"])
        assert b2["subscription_remaining"] == 0
        assert b2["purchased_remaining"] == 100000 - 20

        rows = ledger_rows(settings, user["id"])
        # consumption rows have negative delta; first bucket=subscription, second bucket=purchased
        consumptions = [r for r in rows if r["tokens_delta"] < 0]
        assert consumptions[0]["balance_bucket"] == "subscription"
        assert consumptions[1]["balance_bucket"] == "purchased"
        assert consumptions[1]["cost_usd"] == pytest.approx(0.002)
    finally:
        session.close()


# ── out of tokens hard stop ──────────────────────────────────────────────────

def test_ensure_can_spend_hard_stops_at_zero(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    session = next(get_db(settings.database_target))
    try:
        ai_tokens.refresh_balance(user, session)
        with connect(settings.database_target) as db:
            db.execute(
                "UPDATE ai_token_balances SET subscription_remaining = 0, "
                "purchased_remaining = 0 WHERE user_id = ?",
                (user["id"],),
            )
            db.commit()
        with pytest.raises(ai_tokens.OutOfTokens) as exc:
            ai_tokens.ensure_can_spend(user, session, min_tokens=1)
        assert exc.value.status_code == 402
    finally:
        session.close()


def test_charge_at_zero_charges_nothing(tmp_path):
    settings = make_settings(tmp_path)
    set_model_price(settings, "GLM-4.7", input_price=1.0, output_price=2.0)
    user = make_user(settings, ["pro_user"])
    session = next(get_db(settings.database_target))
    try:
        # Never grant sub/purchased beyond a tiny amount.
        ai_tokens.refresh_balance(user, session)
        with connect(settings.database_target) as db:
            db.execute(
                "UPDATE ai_token_balances SET subscription_remaining = 0, "
                "purchased_remaining = 5 WHERE user_id = ?",
                (user["id"],),
            )
            db.commit()
        # Call costs 20 tokens but only 5 available -> charged clamped to 5.
        res = ai_tokens.charge(
            user, model_id="GLM-4.7", provider="glm", input_tokens=1000,
            output_tokens=500, source="chat", session=session,
        )
        assert res["charged"] == 5
        b = get_balance(settings, user["id"])
        assert b["subscription_remaining"] == 0
        assert b["purchased_remaining"] == 0
    finally:
        session.close()


# ── grant purchased ──────────────────────────────────────────────────────────

def test_grant_purchased_accumulates(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    session = next(get_db(settings.database_target))
    try:
        first = ai_tokens.grant_purchased(
            user["id"], 100000, session=session, source="pack", ref_id=3, note="small"
        )
        assert first == 100000
        second = ai_tokens.grant_purchased(
            user["id"], 50000, session=session, source="pack"
        )
        assert second == 150000
        rows = ledger_rows(settings, user["id"])
        grants = [r for r in rows if r["tokens_delta"] > 0]
        assert [g["tokens_delta"] for g in grants] == [100000, 50000]
        assert grants[0]["balance_bucket"] == "purchased"
        assert grants[0]["ref_id"] == 3
    finally:
        session.close()


def test_out_of_tokens_user_recovers_after_grant(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = next(get_db(settings.database_target))
    try:
        ai_tokens.refresh_balance(user, session)
        with connect(settings.database_target) as db:
            db.execute(
                "UPDATE ai_token_balances SET subscription_remaining = 0, "
                "purchased_remaining = 0 WHERE user_id = ?",
                (user["id"],),
            )
            db.commit()
        with pytest.raises(ai_tokens.OutOfTokens):
            ai_tokens.ensure_can_spend(user, session)
        ai_tokens.grant_purchased(user["id"], 1000, session=session, source="pack")
        # Recovers after grant.
        assert ai_tokens.ensure_can_spend(user, session) is True
    finally:
        session.close()


# ── usage extraction helpers ─────────────────────────────────────────────────

def test_extract_openai_usage():
    svc = AiService(Settings())
    assert svc._extract_openai_usage({"usage": {"prompt_tokens": 12, "completion_tokens": 34}}) == {
        "input_tokens": 12,
        "output_tokens": 34,
    }
    assert svc._extract_openai_usage({}) == {"input_tokens": 0, "output_tokens": 0}


def test_extract_gemini_usage():
    svc = AiService(Settings())
    assert svc._extract_gemini_usage(
        {"usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 7}}
    ) == {"input_tokens": 5, "output_tokens": 7}
    assert svc._extract_gemini_usage({}) == {"input_tokens": 0, "output_tokens": 0}


# ── integration: billing flows through AiService.chat() ──────────────────────

@pytest.mark.asyncio
async def test_chat_charges_via_instance_billing(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    settings.glm_api_key = "test-glm"
    set_model_price(settings, "GLM-4.7", input_price=1.0, output_price=2.0)  # 1000/500 -> 20 tokens
    user = make_user(settings, ["general_user"])
    session = next(get_db(settings.database_target))
    try:
        svc = AiService(settings, user=user, session=session)

        async def fake_glm(model_name, system_prompt, message, max_tokens=None):
            return "hello", {"input_tokens": 1000, "output_tokens": 500}

        monkeypatch.setattr(svc, "_chat_with_glm", fake_glm)

        result = await svc.chat("hi", model="glm:GLM-4.7")
        assert result["answer"] == "hello"
        assert result["usage"] == {"input_tokens": 1000, "output_tokens": 500}

        # Billing context charged 20 tokens off the subscription bucket.
        b = get_balance(settings, user["id"])
        assert b["subscription_remaining"] == 500000 - 20
        rows = ledger_rows(settings, user["id"])
        assert any(r["tokens_delta"] == -20 and r["source"] == "ai_chat" for r in rows)
    finally:
        session.close()


@pytest.mark.asyncio
async def test_chat_hard_stops_when_out_of_tokens(tmp_path, monkeypatch):
    settings = make_settings(tmp_path)
    settings.glm_api_key = "test-glm"
    user = make_user(settings, ["general_user"])
    session = next(get_db(settings.database_target))
    try:
        ai_tokens.refresh_balance(user, session)
        with connect(settings.database_target) as db:
            db.execute(
                "UPDATE ai_token_balances SET subscription_remaining = 0, "
                "purchased_remaining = 0 WHERE user_id = ?",
                (user["id"],),
            )
            db.commit()

        svc = AiService(settings, user=user, session=session)
        with pytest.raises(ai_tokens.OutOfTokens):
            await svc.chat("hi", model="glm:GLM-4.7")
    finally:
        session.close()


# ── AiService.charge_tokens / can_spend helpers (vision + external calls) ─────

def test_charge_tokens_helper_charges_when_billed(tmp_path):
    settings = make_settings(tmp_path)
    set_model_price(settings, "GLM-4.7", input_price=1.0, output_price=2.0)  # 1000/500 -> 20 tokens
    user = make_user(settings, ["general_user"])
    session = next(get_db(settings.database_target))
    try:
        svc = AiService(settings, user=user, session=session)
        svc.charge_tokens(
            model_id="GLM-4.7", provider="glm",
            input_tokens=1000, output_tokens=500, source="advisor_atlas_vision",
        )
        b = get_balance(settings, user["id"])
        assert b["subscription_remaining"] == 500000 - 20
        rows = ledger_rows(settings, user["id"])
        assert any(r["source"] == "advisor_atlas_vision" and r["tokens_delta"] == -20 for r in rows)
    finally:
        session.close()


def test_charge_tokens_helper_noop_without_billing(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    session = next(get_db(settings.database_target))
    try:
        svc = AiService(settings)  # no billing context
        svc.charge_tokens(
            model_id="GLM-4.7", provider="glm",
            input_tokens=1000, output_tokens=500, source="anything",
        )
        # No balance row, no ledger — internal/system call is unmetered.
        with connect(settings.database_target) as db:
            assert db.execute(
                "SELECT COUNT(*) FROM ai_token_ledger WHERE user_id = ?", (user["id"],)
            ).fetchone()[0] == 0
        assert ai_tokens.is_unlimited(user) is False
        assert svc.can_spend() is True  # no billing context -> allowed
    finally:
        session.close()
