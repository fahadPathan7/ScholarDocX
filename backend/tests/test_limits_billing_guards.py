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
    settings.database_path = settings.workspace_path / "db" / "app.db"
    settings.media_path = settings.workspace_path / "media"
    settings.glm_api_key = ""
    settings.gemini_api_key = ""
    settings.groq_api_key = ""
    settings.mistral_api_key = ""
    initialize_database(settings.database_path)
    invalidate_limits_cache()
    return settings


def make_user(settings: Settings, roles: list, email: str = None) -> dict:
    with connect(settings.database_path) as db:
        cur = db.execute(
            "INSERT INTO users (email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (?, 'x', 'Test', ?, 1, 0)",
            (email or f"{'-'.join(roles)}@test.local", json.dumps(roles)),
        )
        db.commit()
        uid = cur.lastrowid
    return {"id": uid, "roles": roles}


def get_session(settings: Settings):
    return next(get_db(settings.database_path))


def usage_count(session, uid: int, feature: str) -> int:
    row = session.execute(
        text("SELECT current_count FROM user_usage_stats WHERE user_id = :uid AND feature = :f"),
        {"uid": uid, "f": feature},
    ).fetchone()
    return int(row[0]) if row else 0


# ── get_user_limit defaults ──────────────────────────────────────────────────

def test_get_user_limit_missing_feature_is_uncapped(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        assert get_user_limit(user, "feature_that_does_not_exist", session) == -1
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
# deadlocks a background service's own raw sqlite3 connection writing to the
# same file (e.g. AdvisorAtlasRepository/ScholarshipDeepHuntRepository).

def test_permission_only_check_commits_bootstrap_row(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    session = get_session(settings)
    try:
        # First-ever check of a feature this user has no usage row for yet,
        # with increment=0 (a pure permission check, as every boolean plan
        # gate — can_use_advisor_atlas, can_use_scholarship_analyze,
        # can_use_scholarship_deep_hunt — performs).
        check_and_increment_limit(user, "can_use_scholarship_deep_hunt", 0, session)

        # The session must not be left holding an uncommitted write: a
        # separate raw sqlite3 connection (short busy_timeout, no retries to
        # wait out) must be able to write immediately without hitting
        # "database is locked".
        import sqlite3

        other_connection = sqlite3.connect(settings.database_path, timeout=0.2)
        try:
            other_connection.execute(
                "INSERT INTO scholarship_deep_hunt_runs (user_id, goal) VALUES (?, ?)",
                (user["id"], "regression test goal"),
            )
            other_connection.commit()
        finally:
            other_connection.close()

        assert usage_count(session, user["id"], "can_use_scholarship_deep_hunt") == 0
    finally:
        session.close()
