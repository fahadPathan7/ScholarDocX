"""Phase 3: pack catalog + purchase request/approve flow.

Covers the service layer (packs CRUD, purchase submit/list, approve→grant,
reject, double-review guard) and the router's authorization gating
(super_admin-only pack config; admin_manage_token_requests for review), plus the
permission-hygiene fixes (ai_tokens_per_month moved to app_settings and purged
from role_limits per SCHOLARDOCX-0140/0154; admin_manage_token_requests is
seeded).
"""
import json
from pathlib import Path
import uuid

import pytest
from fastapi import HTTPException

from app.api import ai_tokens as ai_tokens_api
from app.api.ai_tokens import PackUpdatePayload, PurchaseRequestPayload, PurchaseReviewPayload
from app.auth.limits import invalidate_limits_cache
from app.core.config import Settings
from app.db.connection import connect, get_db, initialize_database
from app.services import ai_tokens
from app.services.admin import AdminService
from app.services.store import Store
from tests.helpers import cleanup_user_records


# ── helpers ───────────────────────────────────────────────────────────────────

def make_settings(tmp_path: Path) -> Settings:
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.media_path = tmp_path / "workspace" / "media"
    initialize_database(settings.database_target)
    with connect(settings.database_target) as db:
        db.execute(
            """
            UPDATE ai_token_packs
            SET is_active = 1, token_amount = CASE code
              WHEN 'small' THEN 100000
              WHEN 'medium' THEN 500000
              WHEN 'large' THEN 1500000
              WHEN 'extra_large' THEN 5000000
              ELSE token_amount
            END,
            price_usd = CASE code
              WHEN 'small' THEN 10
              WHEN 'medium' THEN 40
              WHEN 'large' THEN 100
              WHEN 'extra_large' THEN 300
              ELSE price_usd
            END
            """
        )
        db.commit()
    invalidate_limits_cache()
    return settings


def make_user(settings: Settings, roles: list, email: str = None) -> dict:
    user_email = email or f"{roles[0]}-{roles[-1]}-{uuid.uuid4().hex[:8]}@test.local"
    with connect(settings.database_target) as db:
        cleanup_user_records(db, email=user_email)
        cur = db.execute(
            "INSERT INTO users (email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (?, 'x', 'Test', ?, 1, 0)",
            (user_email, json.dumps(roles)),
        )
        db.commit()
        uid = cur.lastrowid
    return {"id": uid, "roles": roles}


def get_balance(settings: Settings, uid: str) -> dict:
    with connect(settings.database_target) as db:
        return dict(db.execute(
            "SELECT * FROM ai_token_balances WHERE user_id = ?", (uid,)
        ).fetchone())


def ledger_grants(settings: Settings, uid: str) -> list:
    with connect(settings.database_target) as db:
        return [dict(r) for r in db.execute(
            "SELECT * FROM ai_token_ledger WHERE user_id = ? AND tokens_delta > 0 ORDER BY id",
            (uid,),
        ).fetchall()]


def make_store(settings: Settings) -> Store:
    session = next(get_db(settings.database_target))
    return Store(session)


# ── pack catalog ──────────────────────────────────────────────────────────────

def test_list_packs_active_only_by_default(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        packs = ai_tokens.list_packs(session)
        assert [p["code"] for p in packs] == ["small", "medium", "large", "extra_large"]
        assert all(p["is_active"] for p in packs)
        # is_active normalised to bool; token_amount/price_usd typed.
        small = packs[0]
        assert small["token_amount"] == 100000
        assert small["price_usd"] == 10.0
    finally:
        session.close()


def test_list_packs_include_inactive(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        ai_tokens.update_pack("small", session=session, is_active=False)
        active = ai_tokens.list_packs(session)
        all_packs = ai_tokens.list_packs(session, include_inactive=True)
        assert [p["code"] for p in active] == ["medium", "large", "extra_large"]
        assert [p["code"] for p in all_packs] == ["small", "medium", "large", "extra_large"]
        assert next(p for p in all_packs if p["code"] == "small")["is_active"] is False
    finally:
        session.close()


def test_get_pack_excludes_inactive_by_default(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        assert ai_tokens.get_pack("small", session) is not None
        ai_tokens.update_pack("small", session=session, is_active=False)
        assert ai_tokens.get_pack("small", session) is None
        assert ai_tokens.get_pack("small", session, include_inactive=True) is not None
    finally:
        session.close()


def test_update_pack_partial_fields(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        updated = ai_tokens.update_pack(
            "medium", session=session, token_amount=750000, price_usd=55.0,
            display_name="Medium Plus",
        )
        assert updated["token_amount"] == 750000
        assert updated["price_usd"] == 55.0
        assert updated["display_name"] == "Medium Plus"
        # Unprovided fields are untouched.
        assert updated["is_active"] is True
        assert updated["code"] == "medium"
    finally:
        session.close()


def test_update_pack_validates_inputs(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        with pytest.raises(ValueError):
            ai_tokens.update_pack("small", session=session, token_amount=0)
        with pytest.raises(ValueError):
            ai_tokens.update_pack("small", session=session, token_amount=-5)
        with pytest.raises(ValueError):
            ai_tokens.update_pack("small", session=session, price_usd=-1.0)
        # Unknown code -> None (no raise).
        assert ai_tokens.update_pack("nope", session=session, token_amount=1) is None
    finally:
        session.close()


# ── purchase submit / list ────────────────────────────────────────────────────

def test_submit_purchase_request_creates_pending(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    session = next(get_db(settings.database_target))
    try:
        req = ai_tokens.submit_purchase_request(user["id"], "medium", session)
        assert req["status"] == "Pending"
        assert req["user_id"] == user["id"]
        assert req["pack_code"] == "medium"
        assert req["token_amount"] == 500000
        assert req["price_usd"] == 40.0
        assert req["id"] is not None
    finally:
        session.close()


def test_submit_purchase_request_rejects_inactive_or_unknown(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    session = next(get_db(settings.database_target))
    try:
        ai_tokens.update_pack("large", session=session, is_active=False)
        with pytest.raises(LookupError):
            ai_tokens.submit_purchase_request(user["id"], "large", session)
        with pytest.raises(LookupError):
            ai_tokens.submit_purchase_request(user["id"], "ghost", session)
    finally:
        session.close()


def test_list_my_purchase_requests_scoped(tmp_path):
    settings = make_settings(tmp_path)
    a = make_user(settings, ["general_user"], email="a@test.local")
    b = make_user(settings, ["general_user"], email="b@test.local")
    session = next(get_db(settings.database_target))
    try:
        ai_tokens.submit_purchase_request(a["id"], "small", session)
        ai_tokens.submit_purchase_request(b["id"], "medium", session)
        ai_tokens.submit_purchase_request(a["id"], "large", session)
        mine = ai_tokens.list_my_purchase_requests(a["id"], session)
        assert {r["pack_code"] for r in mine} == {"small", "large"}
        assert all(r["user_id"] == a["id"] for r in mine)
    finally:
        session.close()


def test_list_purchase_requests_admin_view_joins_user(tmp_path):
    settings = make_settings(tmp_path)
    a = make_user(settings, ["general_user"], email="alice@test.local")
    admin = make_user(settings, ["general_admin"], email="admin@test.local")
    session = next(get_db(settings.database_target))
    try:
        req = ai_tokens.submit_purchase_request(a["id"], "small", session)
        rows = [
            row for row in ai_tokens.list_purchase_requests(session)
            if row["id"] == req["id"]
        ]
        assert len(rows) == 1
        assert rows[0]["user_email"] == "alice@test.local"
        assert rows[0]["pack_code"] == "small"

        # Status filter.
        ai_tokens.resolve_purchase_request(rows[0]["id"], admin["id"], "approve", session=session)
        pending = [
            row for row in ai_tokens.list_purchase_requests(session, status="pending")
            if row["id"] == req["id"]
        ]
        approved = [
            row for row in ai_tokens.list_purchase_requests(session, status="approved")
            if row["id"] == req["id"]
        ]
        assert pending == []
        assert len(approved) == 1
    finally:
        session.close()


# ── resolve: approve / reject / guards ────────────────────────────────────────

def test_resolve_approve_grants_tokens(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    admin = make_user(settings, ["general_admin"], email="admin@test.local")
    session = next(get_db(settings.database_target))
    try:
        req = ai_tokens.submit_purchase_request(user["id"], "medium", session)  # 500000 tokens
        result = ai_tokens.resolve_purchase_request(req["id"], admin["id"], "approve", session=session)
        assert result["status"] == "Approved"
        assert result["reviewed_by"] == admin["id"]
        assert result["reviewed_at"] is not None

        b = get_balance(settings, user["id"])
        assert b["purchased_remaining"] == 500000
        grants = ledger_grants(settings, user["id"])
        assert len(grants) == 1
        assert grants[0]["tokens_delta"] == 500000
        assert grants[0]["source"] == "pack_purchase"
        assert grants[0]["ref_id"] == req["id"]
        assert grants[0]["balance_bucket"] == "purchased"
    finally:
        session.close()


def test_resolve_reject_grants_nothing(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    admin = make_user(settings, ["general_admin"], email="admin@test.local")
    session = next(get_db(settings.database_target))
    try:
        req = ai_tokens.submit_purchase_request(user["id"], "large", session)
        result = ai_tokens.resolve_purchase_request(
            req["id"], admin["id"], "reject", session=session, admin_notes="no funds",
        )
        assert result["status"] == "Rejected"
        assert result["admin_notes"] == "no funds"
        # No balance row created, no grant ledgered.
        with connect(settings.database_target) as db:
            assert db.execute(
                "SELECT COUNT(*) FROM ai_token_balances WHERE user_id = ?", (user["id"],)
            ).fetchone()[0] == 0
        assert ledger_grants(settings, user["id"]) == []
    finally:
        session.close()


def test_resolve_double_review_is_guarded(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    admin = make_user(settings, ["general_admin"], email="admin@test.local")
    session = next(get_db(settings.database_target))
    try:
        req = ai_tokens.submit_purchase_request(user["id"], "small", session)
        ai_tokens.resolve_purchase_request(req["id"], admin["id"], "approve", session=session)
        with pytest.raises(ValueError):
            ai_tokens.resolve_purchase_request(req["id"], admin["id"], "approve", session=session)
        # Tokens granted exactly once.
        assert get_balance(settings, user["id"])["purchased_remaining"] == 100000
        assert len(ledger_grants(settings, user["id"])) == 1
    finally:
        session.close()


def test_resolve_unknown_and_bad_action(tmp_path):
    settings = make_settings(tmp_path)
    admin = make_user(settings, ["general_admin"], email="admin@test.local")
    session = next(get_db(settings.database_target))
    try:
        with pytest.raises(LookupError):
            ai_tokens.resolve_purchase_request(
                "00000000-0000-0000-0000-000000009999",
                admin["id"],
                "approve",
                session=session,
            )
        user = make_user(settings, ["general_user"])
        req = ai_tokens.submit_purchase_request(user["id"], "small", session)
        with pytest.raises(ValueError):
            ai_tokens.resolve_purchase_request(req["id"], admin["id"], "maybe", session=session)
        # Unaffected request stays Pending.
        again = ai_tokens.list_my_purchase_requests(user["id"], session)
        assert again[0]["status"] == "Pending"
    finally:
        session.close()


# ── router authorization gating ───────────────────────────────────────────────

def test_admin_update_pack_requires_settings_permission(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    admin = make_user(settings, ["super_admin"], email="admin@test.local")
    store = make_store(settings)
    try:
        payload = PackUpdatePayload(token_amount=123456)
        # Non-admin user without admin_manage_settings permission is blocked.
        with pytest.raises(HTTPException) as exc:
            ai_tokens_api.admin_update_pack(
                "small", payload, current_user=user, store=store,
            )
        assert exc.value.status_code == 403

        # Admin with admin_manage_settings permission can update packs.
        updated = ai_tokens_api.admin_update_pack(
            "small", payload, current_user=admin, store=store,
        )
        assert updated["token_amount"] == 123456
    finally:
        store.db.close()


def test_admin_review_requires_permission_and_grants(tmp_path):
    settings = make_settings(tmp_path)
    invalidate_limits_cache()
    owner = make_user(settings, ["pro_user"], email="owner@test.local")
    pleb = make_user(settings, ["general_user"], email="pleb@test.local")
    admin = make_user(settings, ["general_admin"], email="admin@test.local")
    store = make_store(settings)
    try:
        submit = ai_tokens_api.submit_purchase_request(
            PurchaseRequestPayload(pack_code="medium"), current_user=owner, store=store,
        )
        rid = submit["id"]

        # A plain user must not be able to review (no admin permission).
        with pytest.raises(HTTPException) as exc:
            ai_tokens_api.admin_review_purchase_request(
                rid, PurchaseReviewPayload(action="approve"),
                current_user=pleb, store=store,
            )
        assert exc.value.status_code == 403

        # A general_admin (admin_manage_token_requests=1) approves and grants.
        result = ai_tokens_api.admin_review_purchase_request(
            rid, PurchaseReviewPayload(action="approve"),
            current_user=admin, store=store,
        )
        assert result["status"] == "Approved"
        assert get_balance(settings, owner["id"])["purchased_remaining"] == 500000
    finally:
        store.db.close()
        invalidate_limits_cache()


def test_balance_endpoint_shape(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    store = make_store(settings)
    try:
        view = ai_tokens_api.get_balance(current_user=user, store=store)
        assert view["subscription_remaining"] == 500000
        assert view["purchased_remaining"] == 0
        assert view["monthly_allowance"] == 500000
        assert view["is_unlimited"] is False
        assert view["tokens_per_dollar"] == 10000
        assert view["total_spent_tokens"] == 0
        assert view["can_purchase_packs"] is False  # general_user cannot buy packs
    finally:
        store.db.close()


# ── per-plan purchase gating (can_purchase_token_packs) ───────────────────────

def test_can_purchase_token_packs_seeded(tmp_path):
    """All four user tiers are seeded with the default purchasability matrix
    (free/general off; pro/max on) and survive migrate_database."""
    settings = make_settings(tmp_path)
    initialize_database(settings.database_target)  # re-run migrate -> applies seed
    with connect(settings.database_target) as db:
        rows = {
            r["role"]: r["limit_count"]
            for r in db.execute(
                "SELECT role, limit_count FROM role_limits "
                "WHERE feature = 'can_purchase_token_packs'"
            ).fetchall()
        }
    assert rows == {
        "free_user": 0,
        "general_user": 0,
        "pro_user": 1,
        "max_user": 1,
    }


def test_purchase_request_endpoint_gated_by_plan(tmp_path):
    """Endpoint rejects purchase requests from plans that can't buy packs (403)
    and accepts them from eligible plans."""
    settings = make_settings(tmp_path)
    invalidate_limits_cache()
    ineligible = make_user(settings, ["general_user"], email="gen@test.local")
    eligible = make_user(settings, ["pro_user"], email="pro@test.local")
    store = make_store(settings)
    try:
        with pytest.raises(HTTPException) as exc:
            ai_tokens_api.submit_purchase_request(
                PurchaseRequestPayload(pack_code="small"),
                current_user=ineligible, store=store,
            )
        assert exc.value.status_code == 403

        req = ai_tokens_api.submit_purchase_request(
            PurchaseRequestPayload(pack_code="small"),
            current_user=eligible, store=store,
        )
        assert req["status"] == "Pending"
        assert req["user_id"] == eligible["id"]
    finally:
        store.db.close()
        invalidate_limits_cache()


def test_balance_can_purchase_packs_reflects_role(tmp_path):
    """The balance response reports purchasability for the caller's role."""
    settings = make_settings(tmp_path)
    invalidate_limits_cache()
    ineligible = make_user(settings, ["free_user"], email="free@test.local")
    eligible = make_user(settings, ["max_user"], email="max@test.local")
    store = make_store(settings)
    try:
        assert ai_tokens_api.get_balance(
            current_user=ineligible, store=store,
        )["can_purchase_packs"] is False
        assert ai_tokens_api.get_balance(
            current_user=eligible, store=store,
        )["can_purchase_packs"] is True
    finally:
        store.db.close()
        invalidate_limits_cache()


# ── permission hygiene ────────────────────────────────────────────────────────

def test_admin_manage_token_requests_seeded(tmp_path):
    settings = make_settings(tmp_path)
    with connect(settings.database_target) as db:
        rows = {
            (r["role"], r["limit_count"])
            for r in db.execute(
                "SELECT role, limit_count FROM role_limits "
                "WHERE feature = 'admin_manage_token_requests'"
            ).fetchall()
        }
    assert ("general_admin", 1) in rows
    assert ("super_admin", 1) in rows


def test_ai_tokens_per_month_purged_from_role_limits(tmp_path):
    """SCHOLARDOCX-0140/0154: the monthly AI credit allowance moved from
    role_limits (ai_tokens_per_month) to app_settings (plan_ai_credits_<tier>).
    initialize_database must purge any legacy ai_tokens_per_month rows so they
    do not resurface in the Role Limits admin panel."""
    settings = make_settings(tmp_path)
    # Seed a legacy row directly, then re-run initialize_database and confirm
    # the cleanup migration deletes it.
    with connect(settings.database_target) as db:
        db.execute(
            "INSERT INTO role_limits (role, feature, limit_count, reset_period) "
            "VALUES ('general_user', 'ai_tokens_per_month', 500000, 'monthly')"
        )
        db.commit()
    initialize_database(settings.database_target)
    with connect(settings.database_target) as db:
        count = db.execute(
            "SELECT COUNT(*) FROM role_limits WHERE feature = 'ai_tokens_per_month'"
        ).fetchone()[0]
        assert count == 0


def test_reset_role_limits_drops_ai_tokens_allowance(tmp_path):
    """SCHOLARDOCX-0140: DEFAULT_ROLE_LIMITS no longer includes
    ai_tokens_per_month, so reset_role_limits (which re-seeds from it) drops the
    feature. The monthly allowance is now managed in Settings -> Plan Pricing
    via the plan_ai_credits_<tier> app_settings keys, not in Role Limits."""
    settings = make_settings(tmp_path)
    admin = make_user(settings, ["super_admin"], email="admin@test.local")
    store = make_store(settings)
    try:
        AdminService(store.db).reset_role_limits(admin["id"], "general_user")
        with connect(settings.database_target) as db:
            row = db.execute(
                "SELECT limit_count FROM role_limits "
                "WHERE role = 'general_user' AND feature = 'ai_tokens_per_month'"
            ).fetchone()
        assert row is None
    finally:
        store.db.close()
        invalidate_limits_cache()


# ── model pricing catalog ─────────────────────────────────────────────────────

def _model_pk(settings: Settings, model_id: str) -> str:
    with connect(settings.database_target) as db:
        return str(db.execute(
            "SELECT id FROM ai_models WHERE model_id = ?", (model_id,)
        ).fetchone()[0])


def test_list_models_seeded(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        models = ai_tokens.list_models(session)
        assert len(models) > 0
        first = models[0]
        assert {"id", "provider", "model_id", "input_price_per_1m",
                "output_price_per_1m", "is_active"} <= set(first)
        assert first["input_price_per_1m"] > 0.0
        assert first["is_active"] is True
    finally:
        session.close()


def test_update_model_pricing(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        pk = _model_pk(settings, "GLM-4.7")
        updated = ai_tokens.update_model(
            pk, session=session, input_price_per_1m=1.5, output_price_per_1m=4.0,
        )
        assert updated["input_price_per_1m"] == 1.5
        assert updated["output_price_per_1m"] == 4.0

        # Pricing now flows through compute_cost.
        cost_usd, tokens = ai_tokens.compute_cost("GLM-4.7", 1_000_000, 1_000_000, session)
        assert cost_usd == pytest.approx(5.5)  # 1.5 + 4.0 per 1M each
        assert tokens == 5.5 * 10000  # ceil at rate 10000
    finally:
        session.close()


def test_update_model_validates_and_unknown(tmp_path):
    settings = make_settings(tmp_path)
    session = next(get_db(settings.database_target))
    try:
        pk = _model_pk(settings, "GLM-4.7")
        with pytest.raises(ValueError):
            ai_tokens.update_model(pk, session=session, input_price_per_1m=-1)
        with pytest.raises(ValueError):
            ai_tokens.update_model(pk, session=session, output_price_per_1m=-0.1)
        assert ai_tokens.update_model("00000000-0000-0000-0000-000000009999", session=session, input_price_per_1m=1) is None
    finally:
        session.close()


def test_admin_model_endpoints_gated_to_settings_admin(tmp_path):
    settings = make_settings(tmp_path)
    super_admin = make_user(settings, ["super_admin"], email="sa@test.local")
    pleb = make_user(settings, ["general_user"], email="u@test.local")
    store = make_store(settings)
    try:
        # Non-admin user without admin_manage_settings is blocked from listing models.
        with pytest.raises(HTTPException) as exc:
            ai_tokens_api.admin_list_models(current_user=pleb, store=store)
        assert exc.value.status_code == 403

        # Super_admin with admin_manage_settings permission can access.
        models = ai_tokens_api.admin_list_models(current_user=super_admin, store=store)
        assert len(models) > 0
        pk = models[0]["id"]
        updated = ai_tokens_api.admin_update_model(
            pk,
            ai_tokens_api.ModelUpdatePayload(input_price_per_1m=2.0),
            current_user=super_admin,
            store=store,
        )
        assert updated["input_price_per_1m"] == 2.0
    finally:
        store.db.close()
