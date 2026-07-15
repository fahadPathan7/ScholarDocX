"""Central AI token economy billing service.

Two-currency model:
- Real cost ($) computed from per-model pricing in `ai_models`.
- User tokens deducted at the configurable `ai_token_rate_tokens_per_dollar`
  rate (default 10000 → 1 token per $0.0001).

Two-bucket balance, consumed subscription-first then purchased:
- Subscription: monthly tier allowance, resets monthly, NO rollover.
- Purchased: bought via packs (request→approve), never expires.

Charging is wired through `AiService.chat()` (instance billing). Pack catalog
+ purchase request/approve flow is exposed via the `/ai-tokens` router.
"""
import json
import math
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

AI_TOKENS_FEATURE = "ai_tokens_per_month"
PURCHASE_PACKS_FEATURE = "can_purchase_token_packs"
USE_PACKS_FEATURE = "can_use_purchased_tokens"
RATE_SETTING = "ai_token_rate_tokens_per_dollar"
DEFAULT_TOKEN_RATE = 10000
TAVILY_COST_SETTING = "tavily_call_cost_usd"
DEFAULT_TAVILY_COST = 0.01


class OutOfTokens(HTTPException):
    """Raised when a user has no tokens left to spend. HTTP 402 Payment Required."""

    def __init__(self, detail: str):
        super().__init__(status_code=402, detail=detail)


def _has_role(user: dict, role: str) -> bool:
    return role in (user.get("roles") or [])


def allowance_role(user: dict) -> Optional[str]:
    """Resolve the role used to look up the monthly AI-token allowance.

    Priority: max_user → pro_user → general_user → general_admin.
    
    Admin roles (super_admin, general_admin) do NOT bypass or elevate token
    limits. Admins must have explicit user roles to access AI features.
    Returns None if the user has no qualifying role.
    """
    for role in ("max_user", "pro_user", "general_user"):
        if _has_role(user, role):
            return role
    if _has_role(user, "general_admin"):
        return "general_admin"
    return None


def load_user_dict(user_id: int, session: Session) -> dict:
    """Build a minimal user dict ({id, roles, plan_started_at}) for billing from the users table.

    Used by background tasks (e.g. Advisor Atlas runs) that only carry a
    user_id and need the role list to resolve the monthly allowance / unlimited
    status.
    """
    row = session.execute(
        text("SELECT roles, plan_started_at FROM users WHERE id = :id"), {"id": user_id}
    ).mappings().fetchone()
    if not row:
        return {"id": user_id, "roles": []}
    try:
        roles = json.loads(row["roles"]) if row["roles"] else []
    except (TypeError, ValueError):
        roles = []
    return {"id": user_id, "roles": roles, "plan_started_at": row.get("plan_started_at")}


def get_token_rate(session: Session) -> int:
    """Fetch the tokens-per-dollar conversion rate from settings."""
    row = session.execute(
        text("SELECT value FROM app_settings WHERE key = :k"),
        {"k": RATE_SETTING},
    ).scalar()
    if row is not None:
        try:
            return int(row)
        except ValueError:
            pass
    return DEFAULT_TOKEN_RATE


def get_tavily_call_cost_usd(session: Session) -> float:
    """Fetch the Tavily flat fee in USD from settings."""
    row = session.execute(
        text("SELECT value FROM app_settings WHERE key = :k"),
        {"k": TAVILY_COST_SETTING},
    ).scalar()
    if row is not None:
        try:
            return float(row)
        except ValueError:
            pass
    return DEFAULT_TAVILY_COST


def get_role_monthly_allowance(user: dict, session: Session) -> int:
    """Monthly AI-token allowance for the user's tier. -1 means unlimited."""
    role = allowance_role(user)
    if role is None:
        return 0
    row = session.execute(
        text("SELECT limit_count FROM role_limits WHERE role = :r AND feature = :f"),
        {"r": role, "f": AI_TOKENS_FEATURE},
    ).mappings().fetchone()
    return int(row["limit_count"]) if row else 0


def can_purchase_packs(user: dict, session: Session) -> bool:
    """Whether the user's plan allows purchasing extra AI token packs.

    Read-only mirror of the ``can_purchase_token_packs`` guard used by
    ``POST /ai-tokens/purchase-requests`` (which calls
    ``check_and_increment_limit(..., 0, session)``). Resolved via the user's
    primary role so it matches what the endpoint will allow/block.

    Intentionally read-only — the enforcement helper writes a
    ``user_usage_stats`` row, which we must not do on every balance read.
    """
    from app.auth.limits import get_primary_user_role

    role = get_primary_user_role(user)
    if not role:
        return False
    row = session.execute(
        text("SELECT limit_count FROM role_limits WHERE role = :r AND feature = :f"),
        {"r": role, "f": PURCHASE_PACKS_FEATURE},
    ).mappings().fetchone()
    # Mirror enforcement: blocked only when the row is explicitly 0.
    # (Unseeded → enforcement defaults to allow; -1/unlimited → allow.)
    if not row:
        return True
    return int(row["limit_count"]) != 0


def can_use_purchased_tokens_feature(user: dict, session: Session) -> bool:
    """Whether the user's plan allows consuming purchased extra AI tokens.
    
    If False, the user's purchased balance is treated as locked (0) during
    billing deduction and pre-flight checks.
    """
    from app.auth.limits import get_primary_user_role

    role = get_primary_user_role(user)
    if not role:
        return False
    row = session.execute(
        text("SELECT limit_count FROM role_limits WHERE role = :r AND feature = :f"),
        {"r": role, "f": USE_PACKS_FEATURE},
    ).mappings().fetchone()
    # Mirror enforcement: blocked only when explicitly 0
    if not row:
        return True
    return int(row["limit_count"]) != 0


def is_unlimited(user: dict) -> bool:
    """Check if user has unlimited AI tokens.
    
    Admin roles (super_admin, general_admin) do NOT grant unlimited tokens.
    Admins must have explicit user roles (max_user, pro_user, general_user)
    to use AI features, and their token limits follow their user role tier.
    
    Currently, no role grants unlimited tokens. This function is kept for
    future extensibility (e.g., a theoretical "unlimited_ai" role).
    """
    return False


def _current_period(user: dict) -> str:
    plan_started_at_str = user.get("plan_started_at")
    if plan_started_at_str:
        try:
            start_dt = datetime.fromisoformat(plan_started_at_str.replace("Z", "+00:00").split("+")[0])
            now_dt = datetime.utcnow()
            if now_dt >= start_dt:
                delta = now_dt - start_dt
                cycle_index = delta.days // 30
                start_date_str = start_dt.strftime("%Y-%m-%d")
                return f"{start_date_str}-cycle-{cycle_index}"
        except (ValueError, AttributeError):
            pass
            
    return datetime.utcnow().strftime("%Y-%m")


def refresh_balance(user: dict, session: Session) -> dict:
    """Ensure the user has a balance row and reset the subscription bucket
    at month boundaries (no rollover). Returns the current balance as a dict.
    """
    uid = user["id"]
    row = session.execute(
        text("SELECT * FROM ai_token_balances WHERE user_id = :uid"),
        {"uid": uid},
    ).mappings().fetchone()

    current_period = _current_period(user)

    if row is None:
        allowance = get_role_monthly_allowance(user, session)
        sub = 0 if allowance == -1 else allowance
        session.execute(
            text(
                "INSERT INTO ai_token_balances "
                "(user_id, subscription_remaining, subscription_period, "
                "purchased_remaining, last_reset_at, total_spent_tokens, "
                "total_spent_usd) VALUES (:uid, :sub, :period, 0, "
                "CURRENT_TIMESTAMP, 0, 0)"
            ),
            {"uid": uid, "sub": sub, "period": current_period},
        )
        session.commit()
        row = session.execute(
            text("SELECT * FROM ai_token_balances WHERE user_id = :uid"),
            {"uid": uid},
        ).mappings().fetchone()
        return dict(row)

    if row["subscription_period"] != current_period:
        allowance = get_role_monthly_allowance(user, session)
        sub = 0 if allowance == -1 else allowance
        session.execute(
            text(
                "UPDATE ai_token_balances SET subscription_remaining = :sub, "
                "subscription_period = :period, "
                "subscription_used_this_period = 0, "
                "last_reset_at = CURRENT_TIMESTAMP "
                "WHERE user_id = :uid"
            ),
            {"sub": sub, "period": current_period, "uid": uid},
        )
        session.commit()
        row = session.execute(
            text("SELECT * FROM ai_token_balances WHERE user_id = :uid"),
            {"uid": uid},
        ).mappings().fetchone()

    return dict(row)


def ensure_can_spend(user: dict, session: Session, min_tokens: int = 1) -> bool:
    """Hard-stop guard. Raises OutOfTokens (402) if the user cannot cover
    min_tokens. Unlimited users always pass.
    """
    if is_unlimited(user):
        return True
    balance = refresh_balance(user, session)
    available = int(balance["subscription_remaining"])
    
    if can_use_purchased_tokens_feature(user, session):
        available += int(balance["purchased_remaining"])

    if available < min_tokens:
        raise OutOfTokens(
            "You're out of AI credits for this period. Purchase an AI Extra "
            "Credit pack or wait for your monthly allowance to reset."
        )
    return True


def compute_cost(
    model_id: Optional[str],
    input_tokens: int,
    output_tokens: int,
    session: Session,
) -> tuple:
    """Return (cost_usd, tokens) for a model call.

    Unknown/unpriced models resolve to $0 cost → 0 tokens (free). Admins set
    real per-model pricing via the admin panel (Phase 4).
    """
    input_price = 0.0
    output_price = 0.0
    if model_id:
        # Pricing applies regardless of is_active: deactivation blocks new
        # selection at the route level, but internal/background calls that
        # still hit the model must not become free.
        row = session.execute(
            text(
                "SELECT input_price_per_1m, output_price_per_1m FROM ai_models "
                "WHERE model_id = :m"
            ),
            {"m": model_id},
        ).mappings().fetchone()
        if row:
            input_price = float(row["input_price_per_1m"] or 0)
            output_price = float(row["output_price_per_1m"] or 0)

    cost_usd = (input_tokens * input_price / 1_000_000) + (
        output_tokens * output_price / 1_000_000
    )
    tokens = math.ceil(cost_usd * get_token_rate(session))
    return cost_usd, tokens


def _ledger(
    session: Session,
    *,
    user_id: int,
    model_id: Optional[str],
    provider: Optional[str],
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
    tokens_delta: int,
    source: str,
    balance_bucket: Optional[str],
    ref_id: Optional[int] = None,
    note: Optional[str] = None,
) -> None:
    session.execute(
        text(
            "INSERT INTO ai_token_ledger "
            "(user_id, model_id, provider, input_tokens, output_tokens, "
            "cost_usd, tokens_delta, source, balance_bucket, ref_id, note) "
            "VALUES (:uid, :model, :provider, :in, :out, :cost, :delta, "
            ":source, :bucket, :ref, :note)"
        ),
        {
            "uid": user_id,
            "model": model_id,
            "provider": provider,
            "in": input_tokens,
            "out": output_tokens,
            "cost": cost_usd,
            "delta": tokens_delta,
            "source": source,
            "bucket": balance_bucket,
            "ref": ref_id,
            "note": note,
        },
    )


def charge(
    user: dict,
    *,
    model_id: Optional[str],
    provider: Optional[str],
    input_tokens: int,
    output_tokens: int,
    source: str,
    session: Session,
    ref_id: Optional[int] = None,
) -> dict:
    """Charge a model call to the user's balance. Atomic per call.

    Subscription bucket is consumed first, then purchased. The final call that
    empties the balance may overshoot; the next call is hard-stopped by
    ensure_can_spend. Unlimited users log usage but deduct 0.
    """
    uid = user["id"]
    cost_usd, tokens = compute_cost(model_id, input_tokens, output_tokens, session)
    balance = refresh_balance(user, session)

    if is_unlimited(user):
        _ledger(
            session,
            user_id=uid,
            model_id=model_id,
            provider=provider,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            tokens_delta=0,
            source=source,
            balance_bucket="unlimited",
            ref_id=ref_id,
        )
        session.execute(
            text(
                "UPDATE ai_token_balances SET total_spent_tokens = "
                "total_spent_tokens + :t, total_spent_usd = total_spent_usd + "
                ":c WHERE user_id = :uid"
            ),
            {"t": tokens, "c": cost_usd, "uid": uid},
        )
        session.commit()
        return {
            "cost_usd": cost_usd,
            "tokens": tokens,
            "charged": 0,
            "remaining_subscription": -1,
            "remaining_purchased": -1,
            "unlimited": True,
        }

    sub_remaining = int(balance["subscription_remaining"])
    purch_remaining = int(balance["purchased_remaining"]) if can_use_purchased_tokens_feature(user, session) else 0

    sub_used = min(tokens, sub_remaining)
    purch_used = min(tokens - sub_used, purch_remaining)
    charged = sub_used + purch_used

    if sub_used and purch_used:
        bucket = "mixed"
    elif sub_used:
        bucket = "subscription"
    elif purch_used:
        bucket = "purchased"
    else:
        bucket = "free"

    _ledger(
        session,
        user_id=uid,
        model_id=model_id,
        provider=provider,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost_usd,
        tokens_delta=-charged,
        source=source,
        balance_bucket=bucket,
        ref_id=ref_id,
    )
    session.execute(
        text(
            "UPDATE ai_token_balances SET "
            "subscription_remaining = MAX(0, subscription_remaining - :sub), "
            "subscription_used_this_period = subscription_used_this_period + :sub, "
            "purchased_remaining = MAX(0, purchased_remaining - :purch), "
            "total_spent_tokens = total_spent_tokens + :t, "
            "total_spent_usd = total_spent_usd + :c "
            "WHERE user_id = :uid"
        ),
        {
            "sub": sub_used,
            "purch": purch_used,
            "t": charged,
            "c": cost_usd,
            "uid": uid,
        },
    )
    session.commit()

    return {
        "cost_usd": cost_usd,
        "tokens": tokens,
        "charged": charged,
        "remaining_subscription": max(0, sub_remaining - sub_used),
        "remaining_purchased": max(0, purch_remaining - purch_used),
        "unlimited": False,
    }


def charge_flat_fee(
    user: dict,
    session: Session,
    cost_usd: float,
    source: str,
    ref_id: Optional[int] = None,
) -> dict:
    """Charge a flat USD fee (e.g., Tavily searches) to the user's token balance.
    Converts USD to tokens based on the current conversion rate.
    """
    uid = user["id"]
    token_rate = get_token_rate(session)
    tokens = math.ceil(cost_usd * token_rate)
    
    balance = refresh_balance(user, session)

    if is_unlimited(user):
        _ledger(
            session,
            user_id=uid,
            model_id=None,
            provider=None,
            input_tokens=0,
            output_tokens=0,
            cost_usd=cost_usd,
            tokens_delta=0,
            source=source,
            balance_bucket="unlimited",
            ref_id=ref_id,
        )
        session.execute(
            text(
                "UPDATE ai_token_balances SET total_spent_tokens = "
                "total_spent_tokens + :t, total_spent_usd = total_spent_usd + "
                ":c WHERE user_id = :uid"
            ),
            {"t": tokens, "c": cost_usd, "uid": uid},
        )
        session.commit()
        return {
            "cost_usd": cost_usd,
            "tokens": tokens,
            "charged": 0,
            "remaining_subscription": -1,
            "remaining_purchased": -1,
            "unlimited": True,
        }

    sub_remaining = int(balance["subscription_remaining"])
    # Same gate as charge(): plans without can_use_purchased_tokens must not
    # spend the purchased bucket on flat fees either.
    purch_remaining = (
        int(balance["purchased_remaining"])
        if can_use_purchased_tokens_feature(user, session)
        else 0
    )

    sub_used = min(tokens, sub_remaining)
    purch_used = min(tokens - sub_used, purch_remaining)
    charged = sub_used + purch_used

    if sub_used and purch_used:
        bucket = "mixed"
    elif sub_used:
        bucket = "subscription"
    elif purch_used:
        bucket = "purchased"
    else:
        bucket = "free"

    _ledger(
        session,
        user_id=uid,
        model_id=None,
        provider=None,
        input_tokens=0,
        output_tokens=0,
        cost_usd=cost_usd,
        tokens_delta=-charged,
        source=source,
        balance_bucket=bucket,
        ref_id=ref_id,
    )
    session.execute(
        text(
            "UPDATE ai_token_balances SET "
            "subscription_remaining = MAX(0, subscription_remaining - :sub), "
            "subscription_used_this_period = subscription_used_this_period + :sub, "
            "purchased_remaining = MAX(0, purchased_remaining - :purch), "
            "total_spent_tokens = total_spent_tokens + :t, "
            "total_spent_usd = total_spent_usd + :c "
            "WHERE user_id = :uid"
        ),
        {
            "sub": sub_used,
            "purch": purch_used,
            "t": charged,
            "c": cost_usd,
            "uid": uid,
        },
    )
    session.commit()

    return {
        "cost_usd": cost_usd,
        "tokens": tokens,
        "charged": charged,
        "remaining_subscription": max(0, sub_remaining - sub_used),
        "remaining_purchased": max(0, purch_remaining - purch_used),
        "unlimited": False,
    }


def grant_purchased(
    user_id: int,
    tokens: int,
    *,
    session: Session,
    source: str,
    note: Optional[str] = None,
    ref_id: Optional[int] = None,
) -> int:
    """Grant purchased tokens to a user (pack approval / admin grant).

    Creates the balance row if needed. Returns the new purchased balance.
    """
    row = session.execute(
        text("SELECT user_id FROM ai_token_balances WHERE user_id = :uid"),
        {"uid": user_id},
    ).mappings().fetchone()
    if row is None:
        # Minimal row; subscription bucket is filled by refresh_balance on use.
        session.execute(
            text(
                "INSERT INTO ai_token_balances (user_id, purchased_remaining, "
                "total_spent_tokens, total_spent_usd) VALUES (:uid, 0, 0, 0)"
            ),
            {"uid": user_id},
        )

    _ledger(
        session,
        user_id=user_id,
        model_id=None,
        provider=None,
        input_tokens=0,
        output_tokens=0,
        cost_usd=0.0,
        tokens_delta=tokens,
        source=source,
        balance_bucket="purchased",
        ref_id=ref_id,
        note=note,
    )
    session.execute(
        text(
            "UPDATE ai_token_balances SET purchased_remaining = "
            "purchased_remaining + :t, purchased_total = "
            "purchased_total + :t WHERE user_id = :uid"
        ),
        {"t": tokens, "uid": user_id},
    )
    session.commit()

    row = session.execute(
        text("SELECT purchased_remaining FROM ai_token_balances WHERE user_id = :uid"),
        {"uid": user_id},
    ).mappings().fetchone()
    return int(row["purchased_remaining"]) if row else 0


# ── Pack catalog + purchase requests ─────────────────────────────────────────
#
# Packs are configured by a super_admin (price + token grant amount). Users buy
# via a request→approve flow: they submit a request, an admin approves it, and
# approval grants the pack's tokens to the user's purchased bucket.

_PACK_SELECT = (
    "SELECT id, code, display_name, token_amount, price_usd, is_active, sort_order "
    "FROM ai_token_packs"
)


def _pack_row(row) -> dict:
    return {
        "id": int(row["id"]),
        "code": row["code"],
        "display_name": row["display_name"],
        "token_amount": int(row["token_amount"]),
        "price_usd": float(row["price_usd"]),
        "is_active": bool(int(row["is_active"])),
        "sort_order": int(row["sort_order"]),
    }


def list_packs(session: Session, *, include_inactive: bool = False) -> list[dict]:
    """Active packs for the buy UI, or all packs for admin management."""
    sql = _PACK_SELECT + (" ORDER BY sort_order, token_amount")
    rows = session.execute(text(sql)).mappings().all()
    out = [_pack_row(r) for r in rows]
    return out if include_inactive else [p for p in out if p["is_active"]]


def get_pack(
    code: str, session: Session, *, include_inactive: bool = False
) -> Optional[dict]:
    """Fetch a pack by its stable code. Returns None if missing or (by default)
    inactive."""
    row = session.execute(
        text(_PACK_SELECT + " WHERE code = :code"), {"code": code}
    ).mappings().fetchone()
    if row is None:
        return None
    pack = _pack_row(row)
    if not include_inactive and not pack["is_active"]:
        return None
    return pack


def update_pack(
    code: str,
    *,
    session: Session,
    display_name: Optional[str] = None,
    token_amount: Optional[int] = None,
    price_usd: Optional[float] = None,
    is_active: Optional[bool] = None,
) -> Optional[dict]:
    """Super-admin pack config. Only provided fields are updated. Validates
    token_amount > 0 and price_usd >= 0. Returns the updated pack or None if the
    code does not exist.
    """
    if get_pack(code, session, include_inactive=True) is None:
        return None

    fields: list[str] = []
    params: dict = {"code": code}
    if display_name is not None and str(display_name).strip():
        fields.append("display_name = :display_name")
        params["display_name"] = str(display_name).strip()
    if token_amount is not None:
        if int(token_amount) <= 0:
            raise ValueError("token_amount must be a positive integer")
        fields.append("token_amount = :token_amount")
        params["token_amount"] = int(token_amount)
    if price_usd is not None:
        if float(price_usd) < 0:
            raise ValueError("price_usd cannot be negative")
        fields.append("price_usd = :price_usd")
        params["price_usd"] = float(price_usd)
    if is_active is not None:
        fields.append("is_active = :is_active")
        params["is_active"] = 1 if is_active else 0

    if fields:
        session.execute(
            text(f"UPDATE ai_token_packs SET {', '.join(fields)} WHERE code = :code"),
            params,
        )
        session.commit()
    return get_pack(code, session, include_inactive=True)


def _request_select(alias_user: bool = False) -> str:
    user_cols = (
        "u.email AS user_email, u.display_name AS user_display_name, " if alias_user else ""
    )
    return (
        "SELECT r.id, r.user_id, r.pack_id, r.status, r.requested_at, "
        "r.reviewed_at, r.reviewed_by, r.admin_notes, "
        + user_cols
        + "p.code AS pack_code, p.display_name AS pack_name, "
        "p.token_amount, p.price_usd "
        "FROM ai_token_purchase_requests r "
        + ("LEFT JOIN users u ON u.id = r.user_id " if alias_user else "")
        + "LEFT JOIN ai_token_packs p ON p.id = r.pack_id"
    )


def submit_purchase_request(
    user_id: int, pack_code: str, session: Session
) -> dict:
    """Create a Pending purchase request for an active pack.

    Raises LookupError if the pack is missing or inactive (users cannot buy
    inactive packs). pack_id stores the pack's integer id (FK to ai_token_packs).
    """
    pack = get_pack(pack_code, session)
    if pack is None:
        raise LookupError("Selected AI credit pack is not available.")
    duplicate = session.execute(
        text(
            "SELECT id FROM ai_token_purchase_requests "
            "WHERE user_id = :uid AND pack_id = :pack_id "
            "AND LOWER(status) = 'pending'"
        ),
        {"uid": user_id, "pack_id": pack["id"]},
    ).fetchone()
    if duplicate:
        raise ValueError(
            "You already have a pending request for this pack. "
            "Wait for review or cancel it first."
        )
    cur = session.execute(
        text(
            "INSERT INTO ai_token_purchase_requests "
            "(user_id, pack_id, status, requested_at) "
            "VALUES (:uid, :pack_id, 'Pending', CURRENT_TIMESTAMP) "
            "RETURNING id"
        ),
        {"uid": user_id, "pack_id": pack["id"]},
    )
    new_id = cur.first()[0]
    session.commit()
    row = session.execute(
        text(_request_select() + " WHERE r.id = :id"), {"id": new_id}
    ).mappings().fetchone()
    return dict(row)


def list_my_purchase_requests(user_id: int, session: Session) -> list[dict]:
    rows = session.execute(
        text(_request_select() + " WHERE r.user_id = :uid ORDER BY r.requested_at DESC"),
        {"uid": user_id},
    ).mappings().all()
    return [dict(r) for r in rows]


def list_purchase_requests(
    session: Session, *, status: Optional[str] = None
) -> list[dict]:
    """All purchase requests for the admin queue, newest first. Optional status
    filter ('pending'/'approved'/'rejected', case-insensitive; 'all' = no
    filter)."""
    sql = _request_select(alias_user=True)
    params: dict = {}
    norm = str(status).lower().strip() if status else ""
    if norm and norm != "all":
        sql += " WHERE LOWER(r.status) = :status"
        params["status"] = norm
    sql += " ORDER BY r.requested_at DESC"
    rows = session.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


def resolve_purchase_request(
    request_id: int,
    admin_id: int,
    action: str,
    *,
    session: Session,
    admin_notes: Optional[str] = None,
) -> dict:
    """Approve or reject a Pending purchase request.

    Approve → grant the pack's token_amount to the requester's purchased bucket
    (source `pack_purchase`, ref the request id) and mark Approved. Reject → mark
    Rejected, no grant. The Pending-status guard makes approval idempotent: a
    second review raises ValueError instead of granting tokens twice.

    Raises LookupError if the request does not exist; ValueError if it is not
    Pending or the action is unsupported.
    """
    action = (action or "").lower().strip()
    if action not in ("approve", "reject"):
        raise ValueError("action must be 'approve' or 'reject'")

    row = session.execute(
        text(
            _request_select()
            + " WHERE r.id = :id"
        ),
        {"id": request_id},
    ).mappings().fetchone()
    if row is None:
        raise LookupError("Purchase request not found")

    current = str(row["status"]).lower()
    if current != "pending":
        raise ValueError(f"Request is already {current.capitalize()}")

    new_status = "Approved" if action == "approve" else "Rejected"
    session.execute(
        text(
            "UPDATE ai_token_purchase_requests SET status = :status, "
            "reviewed_at = CURRENT_TIMESTAMP, reviewed_by = :admin, "
            "admin_notes = :notes WHERE id = :id"
        ),
        {
            "status": new_status,
            "admin": admin_id,
            "notes": admin_notes,
            "id": request_id,
        },
    )

    if action == "approve":
        grant_purchased(
            int(row["user_id"]),
            int(row["token_amount"] or 0),
            session=session,
            source="pack_purchase",
            ref_id=request_id,
            note=row["pack_code"],
        )

    session.commit()
    updated = session.execute(
        text(_request_select(alias_user=True) + " WHERE r.id = :id"),
        {"id": request_id},
    ).mappings().fetchone()
    return dict(updated)


# ── Model pricing catalog (super_admin) ──────────────────────────────────────
#
# Per-model $/1M-token pricing drives compute_cost(). Models ship seeded at $0;
# a super_admin sets real input/output prices here so usage is metered at cost.

def _model_row(row) -> dict:
    return {
        "id": int(row["id"]),
        "provider": row["provider"],
        "model_id": row["model_id"],
        "display_name": row["display_name"],
        "input_price_per_1m": float(row["input_price_per_1m"] or 0),
        "output_price_per_1m": float(row["output_price_per_1m"] or 0),
        "is_active": bool(int(row["is_active"])),
        "sort_order": int(row["sort_order"]),
    }


def list_models(session: Session) -> list[dict]:
    rows = session.execute(
        text(
            "SELECT id, provider, model_id, display_name, input_price_per_1m, "
            "output_price_per_1m, is_active, sort_order FROM ai_models "
            "ORDER BY provider, sort_order, model_id"
        )
    ).mappings().all()
    return [_model_row(r) for r in rows]


def update_model(
    model_pk: int,
    *,
    session: Session,
    input_price_per_1m: Optional[float] = None,
    output_price_per_1m: Optional[float] = None,
    display_name: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> Optional[dict]:
    """Super-admin model pricing config. Partial update; validates prices ≥ 0.
    Returns the updated model or None if the id does not exist."""
    existing = session.execute(
        text("SELECT id FROM ai_models WHERE id = :pk"), {"pk": model_pk}
    ).mappings().fetchone()
    if existing is None:
        return None

    fields: list[str] = []
    params: dict = {"pk": model_pk}
    if input_price_per_1m is not None:
        if float(input_price_per_1m) < 0:
            raise ValueError("input_price_per_1m cannot be negative")
        fields.append("input_price_per_1m = :ip")
        params["ip"] = float(input_price_per_1m)
    if output_price_per_1m is not None:
        if float(output_price_per_1m) < 0:
            raise ValueError("output_price_per_1m cannot be negative")
        fields.append("output_price_per_1m = :op")
        params["op"] = float(output_price_per_1m)
    if display_name is not None and str(display_name).strip():
        fields.append("display_name = :dn")
        params["dn"] = str(display_name).strip()
    if is_active is not None:
        fields.append("is_active = :ia")
        params["ia"] = 1 if is_active else 0

    if fields:
        session.execute(
            text(f"UPDATE ai_models SET {', '.join(fields)} WHERE id = :pk"),
            params,
        )
        session.commit()
    row = session.execute(
        text(
            "SELECT id, provider, model_id, display_name, input_price_per_1m, "
            "output_price_per_1m, is_active, sort_order FROM ai_models WHERE id = :pk"
        ),
        {"pk": model_pk},
    ).mappings().fetchone()
    return _model_row(row) if row else None

def cancel_purchase_request(request_id: int, user_id: int, session: Session) -> None:
    """Cancel a pending purchase request by the user who created it."""
    row = session.execute(
        text("SELECT status FROM ai_token_purchase_requests WHERE id = :id AND user_id = :uid"),
        {"id": request_id, "uid": user_id},
    ).mappings().fetchone()
    
    if row is None:
        raise LookupError("Request not found.")
    if str(row["status"]).lower() != "pending":
        raise ValueError("Only pending requests can be cancelled.")
        
    session.execute(
        text("UPDATE ai_token_purchase_requests SET status = 'Cancelled' WHERE id = :id"),
        {"id": request_id},
    )
    session.commit()
