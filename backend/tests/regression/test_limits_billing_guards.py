"""Regression tests for SCHOLARDOCX-0111 role-limit and billing hardening."""
from pathlib import Path
import json

import pytest
from sqlalchemy import text

from app.core.config import Settings
from app.db.connection import connect, get_db, initialize_database
from app.services import ai_tokens
from app.services.ai_actions import AiActionService
from app.services.store import Store
from app.auth.limits import (
    UsageLimitExceeded,
    check_and_increment_limit,
    get_user_limit,
    invalidate_limits_cache,
    resync_usage_counts,
)


def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.media_path = tmp_path / "workspace" / "media"
    settings.glm_api_key = ""
    settings.gemini_api_key = ""
    settings.groq_api_key = ""
    settings.mistral_api_key = ""
    initialize_database(settings.database_target)
    invalidate_limits_cache()
    return settings


import uuid

def make_user(settings: Settings, roles: list, email: str | None = None) -> dict:
    user_email = email or f"{'-'.join(roles)}-{uuid.uuid4().hex[:8]}@test.local"
    with connect(settings.database_target) as db:
        # Pre-clean so the function is idempotent on repeated runs.
        from tests.helpers import cleanup_user_records
        cleanup_user_records(db, email=user_email)
        cur = db.execute(
            "INSERT INTO users (email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (?, 'x', 'Test', ?, 1, 0)",
            (user_email, json.dumps(roles)),
        )
        db.commit()
        uid = cur.lastrowid
    return {"id": uid, "email": user_email, "roles": roles}


def get_session(settings: Settings):
    return next(get_db(settings.database_target))


def usage_count(session, uid: str, feature: str) -> int:
    row = session.execute(
        text("SELECT current_count FROM user_usage_stats WHERE user_id = :uid AND feature = :f"),
        {"uid": uid, "f": feature},
    ).fetchone()
    return int(row[0]) if row else 0


# ── get_user_limit defaults ──────────────────────────────────────────────────

def test_get_user_limit_missing_feature_is_denied(tmp_path):
    """SCHOLARDOCX-0204 (L7): an unseeded feature is blocked, not uncapped.

    Previously this returned -1 (no cap), so any feature gated in code before
    its DEFAULT_ROLE_LIMITS row shipped was silently unlimited for every tier.
    """
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        assert get_user_limit(user, "feature_that_does_not_exist", session) == 0
    finally:
        session.close()


def test_check_and_increment_limit_denies_unseeded_feature(tmp_path):
    """The enforcement helper must deny too, or the two defaults disagree."""
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        with pytest.raises(UsageLimitExceeded):
            check_and_increment_limit(user, "feature_that_does_not_exist", 0, session)
    finally:
        session.close()


def test_every_enforced_feature_has_a_seed_row(tmp_path):
    """Guard for the L7 flip: deny-by-default is only safe while every feature
    the code gates actually exists in DEFAULT_ROLE_LIMITS. If someone adds a
    gate without a seed row, this fails instead of the feature 403-ing in
    production."""
    from app.services.admin import DEFAULT_ROLE_LIMITS

    seeded = {
        feature
        for features in DEFAULT_ROLE_LIMITS.values()
        for feature, _limit, _period in features
    }
    # Features reached through a variable or an f-string, which a grep-style
    # scan of call sites would miss.
    dynamic = {
        f"can_use_{provider}" for provider in ("glm", "gemini", "groq", "mistral")
    } | {
        "total_projects",
        "total_sheets",
        "total_records",
        "total_sticky_notes",
        "total_whiteboards",
        "total_documents_bytes",
        "sheets_per_project",
        "records_per_sheet",
        ai_tokens.PURCHASE_PACKS_FEATURE,
        ai_tokens.USE_PACKS_FEATURE,
    }
    assert dynamic <= seeded, f"unseeded but enforced: {sorted(dynamic - seeded)}"


# ── Billing coverage (SCHOLARDOCX-0204) ──────────────────────────────────────

def test_load_user_dict_applies_plan_expiry(tmp_path):
    """L6: background billing must see the same effective role a live request
    would. The expiry downgrade used to live only in get_current_user, so a
    background run billed an expired user at their old (higher) tier."""
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        session.execute(
            text("UPDATE users SET plan_ends_at = :d WHERE id = :id"),
            {"d": "2020-01-01", "id": user["id"]},
        )
        session.commit()
        loaded = ai_tokens.load_user_dict(str(user["id"]), session)
        assert "pro_user" not in loaded["roles"]
        assert "free_user" in loaded["roles"]
    finally:
        session.close()


def test_load_user_dict_keeps_unexpired_plan(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        session.execute(
            text("UPDATE users SET plan_ends_at = :d WHERE id = :id"),
            {"d": "2099-01-01", "id": user["id"]},
        )
        session.commit()
        loaded = ai_tokens.load_user_dict(str(user["id"]), session)
        assert "pro_user" in loaded["roles"]
    finally:
        session.close()


def test_load_user_dict_refuses_suspended_user(tmp_path):
    """A queued background run must not outlive the suspension meant to stop it."""
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        session.execute(
            text("UPDATE users SET is_active = false WHERE id = :id"),
            {"id": user["id"]},
        )
        session.commit()
        loaded = ai_tokens.load_user_dict(str(user["id"]), session)
        assert loaded["roles"] == []
        assert ai_tokens.get_role_monthly_allowance(loaded, session) == 0
    finally:
        session.close()


def test_pack_helpers_deny_when_role_limit_row_missing(tmp_path):
    """L7 applied to the pack gates: these mirror enforcement, so they must
    mirror its deny-by-default too."""
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        session.execute(
            text("DELETE FROM role_limits WHERE role = 'pro_user' AND feature IN (:a, :b)"),
            {"a": ai_tokens.PURCHASE_PACKS_FEATURE, "b": ai_tokens.USE_PACKS_FEATURE},
        )
        session.commit()
        invalidate_limits_cache()
        assert ai_tokens.can_purchase_packs(user, session) is False
        assert ai_tokens.can_use_purchased_tokens_feature(user, session) is False
    finally:
        session.close()


def test_extraction_openrouter_fallback_charges_the_user(tmp_path, monkeypatch):
    """L3: the fallback is a real provider call and must be billed.

    Drives the worst case — no chat provider configured at all — where chat()
    short-circuits to local-fallback without billing and OpenRouter becomes the
    only extraction path. That path used to be free forever.
    """
    import asyncio

    from app.services.ai import AiService
    from app.services.scholarship_extraction import ScholarshipExtractionService

    settings = make_settings(tmp_path)
    settings.openrouter_api_key = "test-key"
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        ai_service = AiService(settings, user=user, session=session)
        ai_tokens.grant_purchased(
            str(user["id"]), 100_000, session=session, source="test_grant"
        )

        class _FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "choices": [
                        {"message": {"content": '{"canonical_name": "Test Award"}'}}
                    ],
                    "usage": {"prompt_tokens": 5000, "completion_tokens": 2000},
                }

        class _FakeClient:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, *a, **k):
                return _FakeResponse()

        service = ScholarshipExtractionService(settings, client_factory=_FakeClient)
        before = session.execute(
            text(
                "SELECT COUNT(*) FROM ai_token_ledger "
                "WHERE user_id = :u AND tokens_delta < 0"
            ),
            {"u": user["id"]},
        ).scalar()

        asyncio.new_event_loop().run_until_complete(
            service.extract(
                ai_service,
                source_url="https://example.edu/award",
                source_title="Test Award",
                source_snippet="A funded award with a deadline.",
            )
        )

        after = session.execute(
            text(
                "SELECT COUNT(*) FROM ai_token_ledger "
                "WHERE user_id = :u AND tokens_delta < 0"
            ),
            {"u": user["id"]},
        ).scalar()
        assert after > before, "OpenRouter fallback made a provider call for free"
    finally:
        session.close()


def test_advisor_atlas_tavily_search_is_charged(tmp_path):
    """L5: the largest unbilled surface. Advisor Atlas searches used to be
    recorded at $0 via record_external_search."""
    import asyncio

    from app.services.ai import AiService

    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        ai_service = AiService(settings, user=user, session=session)
        ai_tokens.grant_purchased(
            str(user["id"]), 100_000, session=session, source="test_grant"
        )
        before = session.execute(
            text(
                "SELECT COALESCE(SUM(-tokens_delta), 0) FROM ai_token_ledger "
                "WHERE user_id = :u AND source = 'advisor_atlas_search'"
            ),
            {"u": user["id"]},
        ).scalar()

        result = ai_service.charge_external_call(
            cost_usd=ai_service.external_billing_cost(
                ai_tokens.get_tavily_call_cost_usd
            ),
            source="advisor_atlas_search",
        )
        assert result is not None and result["charged"] > 0

        after = session.execute(
            text(
                "SELECT COALESCE(SUM(-tokens_delta), 0) FROM ai_token_ledger "
                "WHERE user_id = :u AND source = 'advisor_atlas_search'"
            ),
            {"u": user["id"]},
        ).scalar()
        assert after > before
    finally:
        session.close()


def test_record_external_search_helper_is_gone():
    """The '$0 ledger row' helper existed only to skip a charge. Its removal is
    the structural half of the L5 fix — keep it removed (BD-011)."""
    from app.services.ai import AiService

    assert not hasattr(AiService, "record_external_search")


def test_billing_context_is_required_on_deep_hunt_ai_calls():
    """L1/L2: the leak was an optional ai_service that defaulted to None, so a
    call site could omit it and silently skip the charge. Keep it required."""
    import inspect

    from app.services.deep_hunt_query_planner import (
        DeepHuntQueryPlanner,
        DeepHuntRelevanceFilter,
    )

    for fn in (DeepHuntQueryPlanner.plan, DeepHuntRelevanceFilter.score):
        param = inspect.signature(fn).parameters["ai_service"]
        assert param.default is inspect.Parameter.empty, (
            f"{fn.__qualname__} made ai_service optional again — that is exactly "
            "how SCHOLARDOCX-0204 L1/L2 happened"
        )


def test_jina_fee_scales_with_token_count(tmp_path):
    """L8: a 60-page paper must not cost the same as a one-page abstract, while
    still raising exactly one charge (the SCHOLARDOCX-0180 invariant)."""
    from app.services.research_paper_service import EMBEDDING_MODEL

    settings = make_settings(tmp_path)
    session = get_session(settings)
    try:
        base = ai_tokens.get_jina_call_cost_usd(session)
        small, _ = ai_tokens.compute_cost(EMBEDDING_MODEL, 1_000, 0, session,
                                          provider="jina")
        large, _ = ai_tokens.compute_cost(EMBEDDING_MODEL, 5_000_000, 0, session,
                                          provider="jina")
        assert base + large > base + small
    finally:
        session.close()


def test_get_user_limit_without_user_role_is_blocked(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_admin"])
    session = get_session(settings)
    try:
        assert get_user_limit(user, "sheets_per_project", session) == 0
    finally:
        session.close()


# ── resync_usage_counts ──────────────────────────────────────────────────────

def test_resync_counts_rows_not_pages(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        store = Store(session, current_user_id=user["id"])
        project = store.create_record("projects", {"name": "P1", "degree_type": "phd"})
        result = store.create_sheet_with_defaults(project["id"], "S1")
        store.update_record(
            "project_pages",
            result["page"]["id"],
            {"rows_json": [{"A": "1"}, {"A": "2"}, {"A": "3"}]},
        )

        resync_usage_counts(user["id"], session)

        assert usage_count(session, user["id"], "total_projects") == 1
        assert usage_count(session, user["id"], "total_sheets") == 1
        # 3 rows inside 1 page: the page count (1) would be wrong here.
        assert usage_count(session, user["id"], "total_records") == 3
    finally:
        session.close()


def test_delete_then_resync_frees_quota(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["free_user"])  # total_projects limit = 1
    session = get_session(settings)
    try:
        store = Store(session, current_user_id=user["id"])
        check_and_increment_limit(user, "total_projects", 1, session)
        project = store.create_record("projects", {"name": "Only", "degree_type": "phd"})

        with pytest.raises(UsageLimitExceeded):
            check_and_increment_limit(user, "total_projects", 1, session)

        store.delete_record("projects", project["id"])
        resync_usage_counts(user["id"], session, ("total_projects",))

        # Quota is free again without a server restart.
        check_and_increment_limit(user, "total_projects", 1, session)
    finally:
        session.close()


def test_agent_delete_frees_quota_for_next_create(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["free_user"])  # total_projects limit = 1
    session = get_session(settings)
    try:
        store = Store(session, current_user_id=user["id"])
        service = AiActionService(settings, store)

        def plan_for(action):
            return {"status": "needs_confirmation", "actions": [action]}

        service.execute(
            plan_for({"type": "create_project", "project": {"name": "First", "degree_type": "phd"}}),
            user=user, session=session,
        )
        with pytest.raises(UsageLimitExceeded):
            service.execute(
                plan_for({"type": "create_project", "project": {"name": "Second", "degree_type": "phd"}}),
                user=user, session=session,
            )

        service.execute(
            plan_for({"type": "delete_project", "project_name": "First"}),
            user=user, session=session,
        )
        # The post-plan resync freed the quota; creating again succeeds.
        response = service.execute(
            plan_for({"type": "create_project", "project": {"name": "Second", "degree_type": "phd"}}),
            user=user, session=session,
        )
        assert response["status"] == "done"
    finally:
        session.close()


# ── billing guards ───────────────────────────────────────────────────────────

def test_flat_fee_does_not_spend_locked_purchased_tokens(tmp_path):
    settings = make_settings(tmp_path)
    # general_user: can_use_purchased_tokens = 0
    user = make_user(settings, ["general_user"])
    session = get_session(settings)
    try:
        ai_tokens.grant_purchased(user["id"], 50_000, session=session, source="test")
        # Drain the subscription bucket so only purchased tokens remain.
        session.execute(
            text(
                "UPDATE ai_token_balances SET subscription_remaining = 0, "
                "subscription_period = :period WHERE user_id = :uid"
            ),
            {"uid": user["id"], "period": ai_tokens._current_period(user)},
        )
        session.commit()

        result = ai_tokens.charge_flat_fee(user, session, 0.01, source="web_search")

        # The purchased bucket is locked for this plan: nothing was deducted.
        assert result["charged"] == 0
        balance = ai_tokens.refresh_balance(user, session)
        assert int(balance["purchased_remaining"]) == 50_000
    finally:
        session.close()


def test_flat_fee_spends_purchased_when_plan_allows(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])  # can_use_purchased_tokens = 1
    session = get_session(settings)
    try:
        ai_tokens.grant_purchased(user["id"], 50_000, session=session, source="test")
        session.execute(
            text(
                "UPDATE ai_token_balances SET subscription_remaining = 0, "
                "subscription_period = :period WHERE user_id = :uid"
            ),
            {"uid": user["id"], "period": ai_tokens._current_period(user)},
        )
        session.commit()

        result = ai_tokens.charge_flat_fee(user, session, 0.01, source="web_search")

        assert result["charged"] > 0
        balance = ai_tokens.refresh_balance(user, session)
        assert int(balance["purchased_remaining"]) < 50_000
    finally:
        session.close()


def test_compute_cost_prices_inactive_models(tmp_path):
    settings = make_settings(tmp_path)
    session = get_session(settings)
    try:
        session.execute(
            text(
                "UPDATE ai_models SET input_price_per_1m = 1.0, "
                "output_price_per_1m = 2.0, is_active = 0 WHERE model_id = 'GLM-4.7'"
            )
        )
        session.commit()
        cost_usd, tokens = ai_tokens.compute_cost("GLM-4.7", 1_000_000, 0, session)
        assert cost_usd == pytest.approx(1.0)
        assert tokens > 0
    finally:
        session.execute(
            text("UPDATE ai_models SET is_active = 1 WHERE model_id = 'GLM-4.7'")
        )
        session.commit()
        session.close()


def test_duplicate_pending_purchase_request_rejected(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        pack = ai_tokens.list_packs(session)[0]
        ai_tokens.submit_purchase_request(user["id"], pack["code"], session)
        with pytest.raises(ValueError, match="pending request"):
            ai_tokens.submit_purchase_request(user["id"], pack["code"], session)
    finally:
        session.close()


# ── default-model provider permission ────────────────────────────────────────

def test_default_model_provider_permission_enforced(tmp_path):
    from app.api.routes import verify_model_permission

    settings = make_settings(tmp_path)
    settings.groq_api_key = "test-key"  # default provider resolves to groq
    user = make_user(settings, ["free_user"])  # can_use_groq = 0
    session = get_session(settings)
    try:
        with pytest.raises(UsageLimitExceeded):
            verify_model_permission(None, user, session, settings)
    finally:
        session.close()


def test_default_model_allowed_provider_passes(tmp_path):
    from app.api.routes import verify_model_permission

    settings = make_settings(tmp_path)
    settings.gemini_api_key = "test-key"  # default provider resolves to gemini
    user = make_user(settings, ["free_user"])  # can_use_gemini = 1
    session = get_session(settings)
    try:
        verify_model_permission(None, user, session, settings)
    finally:
        session.close()


# ── failed create gives quota back ───────────────────────────────────────────

def test_failed_create_compensation_restores_quota(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["free_user"])  # total_projects limit = 1
    session = get_session(settings)
    try:
        # Simulate the route flow: increment, storage write fails, compensate.
        check_and_increment_limit(user, "total_projects", 1, session)
        check_and_increment_limit(user, "total_projects", -1, session)
        # Quota was returned, so the next real create still fits the limit.
        check_and_increment_limit(user, "total_projects", 1, session)
        assert usage_count(session, user["id"], "total_projects") == 1
    finally:
        session.close()


# ── permission-only check commits its own bookkeeping writes ───────────────
# Found via SCHOLARDOCX-0125 (Deep Hunt) live verification: a brand-new
# plan-gate feature has no `user_usage_stats` row yet for any given user, so
# the first-ever `increment=0` permission check bootstraps one via INSERT.
# That INSERT must be committed even though increment is 0 — otherwise it
# sits open on the caller's session for the rest of the request and
# deadlocks a background service's own raw database connection writing to the
# same file (e.g. AdvisorAtlasRepository/ScholarshipDeepHuntRepository).

def test_permission_only_check_commits_bootstrap_row(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        # First-ever check of a feature this user has no usage row for yet,
        # with increment=0 (a pure permission check, as every boolean plan
        # gate — can_use_advisor_atlas, can_use_scholarship_hunt — performs).
        check_and_increment_limit(user, "can_use_scholarship_hunt", 0, session)

        # The session must not be left holding an uncommitted write: a
        # separate connection must be able to write immediately. Postgres uses
        # MVCC so a committed row is visible to a new connection; the guard
        # here is that check_and_increment_limit committed (rather than
        # leaving the bootstrap INSERT open on the caller's session).
        with connect(settings.database_target) as other_connection:
            other_connection.execute(
                "INSERT INTO scholarship_deep_hunt_runs (user_id, goal) VALUES (?, ?)",
                (user["id"], "regression test goal"),
            )
            other_connection.commit()

        assert usage_count(session, user["id"], "can_use_scholarship_hunt") == 0
    finally:
        session.close()


# ── SCHOLARDOCX-0175: Scholarship Hunt per-hit billing guards ────────────────

# STRICT RULE (SCHOLARDOCX-0178 incident): app_settings is GLOBAL, shared,
# admin-configured state — not per-test or per-user data. This test suite
# runs against a real shared database (see tests/conftest.py's load_dotenv),
# so a test that mutates a row here and never restores it corrupts the real
# admin configuration for everyone, indefinitely (this exact bug left
# brave_call_cost_per_hit_usd stuck at a test-inserted 0.025 and
# jina_call_cost_usd stuck at 0.02 until caught and fixed). Any test that
# needs to change an app_settings row MUST snapshot the value that was
# actually there beforehand (not assume "the default") and restore exactly
# that value in a finally block — see _snapshot_app_setting/_restore_app_setting.


def _snapshot_app_setting(session, key: str) -> str | None:
    """Read the current value of an app_settings key, or None if unset."""
    row = session.execute(
        text("SELECT value FROM app_settings WHERE key = :key"), {"key": key}
    ).mappings().fetchone()
    return row["value"] if row else None


def _restore_app_setting(session, key: str, value: str | None) -> None:
    """Put an app_settings key back exactly as `_snapshot_app_setting` found
    it — deleted if it was unset, or its prior value if it existed. Never
    hardcode a "default" here: whatever was actually configured before the
    test ran (by a real admin, by seeding, or by nothing at all) is the only
    correct thing to restore."""
    if value is None:
        session.execute(text("DELETE FROM app_settings WHERE key = :key"), {"key": key})
    else:
        session.execute(
            text(
                "INSERT INTO app_settings (key, value) VALUES (:key, :value) "
                "ON CONFLICT (key) DO UPDATE SET value = excluded.value"
            ),
            {"key": key, "value": value},
        )
    session.commit()


def test_brave_per_hit_price_default_when_unset(tmp_path):
    """get_brave_call_cost_per_hit_usd returns the $0.015 default if no row."""
    settings = make_settings(tmp_path)
    session = get_session(settings)
    key = "brave_call_cost_per_hit_usd"
    before = _snapshot_app_setting(session, key)
    try:
        # Delete any seeded row so the default path is exercised.
        session.execute(text("DELETE FROM app_settings WHERE key = :key"), {"key": key})
        session.commit()
        price = ai_tokens.get_brave_call_cost_per_hit_usd(session)
        assert price == 0.015
    finally:
        _restore_app_setting(session, key, before)
        session.close()


def test_brave_per_hit_price_admin_overridable(tmp_path):
    """The admin-configured price is respected when set."""
    settings = make_settings(tmp_path)
    session = get_session(settings)
    key = "brave_call_cost_per_hit_usd"
    before = _snapshot_app_setting(session, key)
    try:
        session.execute(
            text(
                "INSERT INTO app_settings (key, value) VALUES (:key, '0.025') "
                "ON CONFLICT (key) DO UPDATE SET value = excluded.value"
            ),
            {"key": key},
        )
        session.commit()
        assert ai_tokens.get_brave_call_cost_per_hit_usd(session) == 0.025
    finally:
        _restore_app_setting(session, key, before)
        session.close()


def test_deep_hunt_pre_flight_rejects_insufficient_balance(tmp_path, monkeypatch):
    """create_run rejects with 402 when the user can't afford the worst case."""
    import asyncio
    from fastapi import HTTPException, BackgroundTasks
    from app.api import scholarship_deep_hunt as deep_hunt_api
    from app.api import routes as routes_api

    settings = make_settings(tmp_path)
    session = get_session(settings)
    _seed_brave_pricing(session)
    session.close()

    user = make_user(settings, ["max_user"])

    class FakeRepo:
        def create_run(self, *a, **k):
            raise AssertionError("must not create the run when balance is insufficient")

    class FakeService:
        repository = FakeRepo()

    class FakeStore:
        db = object()

    # Plan gate passes; verify_model_permission passes.
    monkeypatch.setattr(deep_hunt_api, "check_and_increment_limit", lambda *a, **k: True)
    monkeypatch.setattr(routes_api, "verify_model_permission", lambda *a, **k: None)
    # Per-hit price lookups must not touch the fake session.
    monkeypatch.setattr(
        ai_tokens, "get_brave_call_cost_per_hit_usd", lambda session: 0.015
    )
    monkeypatch.setattr(ai_tokens, "get_token_rate", lambda session: 10000)

    def fail_ensure(user, session, min_tokens=1):
        raise ai_tokens.OutOfTokens("not enough credits")

    monkeypatch.setattr(ai_tokens, "ensure_can_spend", fail_ensure)

    payload = deep_hunt_api.CreateDeepHuntRunRequest(goal="fully funded CS PhD Germany")
    with pytest.raises(HTTPException) as exc_info:
        asyncio.new_event_loop().run_until_complete(
            deep_hunt_api.create_run(
                payload,
                BackgroundTasks(),
                user=user,
                service=FakeService(),  # type: ignore
                store=FakeStore(),  # type: ignore
                settings=settings,
            )
        )
    assert exc_info.value.status_code == 402
    # No provider/algorithm jargon in the user-facing message (AGENTS.md).
    detail = str(exc_info.value.detail).casefold()
    assert "brave" not in detail
    assert "hit" not in detail
    assert "scan" in detail  # plain-language word


def test_deep_hunt_denied_when_plan_lacks_scholarship_hunt(tmp_path, monkeypatch):
    """A user without can_use_scholarship_hunt gets 403 before any spend."""
    import asyncio
    from fastapi import HTTPException, BackgroundTasks
    from app.api import scholarship_deep_hunt as deep_hunt_api

    settings = make_settings(tmp_path)
    user = make_user(settings, ["free_user"])  # free_user has no Scholarship Hunt

    class FakeRepo:
        def create_run(self, *a, **k):
            raise AssertionError("must not create the run when plan denies access")

    class FakeService:
        repository = FakeRepo()

    class FakeStore:
        db = object()

    # Stub the plan gate so it denies access (the real check would need a real
    # session; here we exercise the 403 branch directly).
    def deny(user, feature, increment=0, session=None):
        raise UsageLimitExceeded("Permission denied.")

    monkeypatch.setattr(deep_hunt_api, "check_and_increment_limit", deny)
    monkeypatch.setattr(deep_hunt_api, "feature_plan_phrase", lambda *a, **k: "the Pro and Max plans")

    payload = deep_hunt_api.CreateDeepHuntRunRequest(goal="fully funded CS PhD Germany")
    with pytest.raises(HTTPException) as exc_info:
        asyncio.new_event_loop().run_until_complete(
            deep_hunt_api.create_run(
                payload,
                BackgroundTasks(),
                user=user,
                service=FakeService(),  # type: ignore
                store=FakeStore(),  # type: ignore
                settings=settings,
            )
        )
    assert exc_info.value.status_code == 403


def _seed_brave_pricing(session) -> None:
    """Ensure the per-hit Brave pricing row exists (fresh-install seed path).

    DO NOTHING on conflict — this only fills in a missing row for a fresh
    test database. It must never overwrite a value that's already there
    (which could be a real admin-configured price), unlike the old
    DO UPDATE version that caused the SCHOLARDOCX-0178 app_settings
    corruption incident.
    """
    session.execute(
        text(
            "INSERT INTO app_settings (key, value) VALUES ('brave_call_cost_per_hit_usd', '0.015') "
            "ON CONFLICT (key) DO NOTHING"
        )
    )
    session.commit()
