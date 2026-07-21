from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
import re
import httpx
import os
import json
import logging
from collections import defaultdict
from typing import Any, Optional, Literal
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr

from app.auth.jwt import create_token
from app.auth.password import hash_password, validate_password_strength, verify_password
from app.auth.rate_limit import (
    client_ip_from_request,
    rate_limiter,
    user_identity,
)
from app.core.config import Settings, get_settings
from app.db.connection import initialize_database
from app.services.store import Store
from app.api.dependencies import get_store
from app.auth.dependencies import get_current_user, get_jwt_secret
from app.auth.limits import feature_plan_phrase, get_primary_user_role

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

# All rate-limit thresholds/windows now live in the central registry
# ``RATE_LIMIT_RULES`` in ``app/auth/rate_limit.py`` and are enforced through
# the shared ``rate_limiter`` singleton. The four auth endpoints below are
# addressed by their rule keys: ``auth_login``, ``auth_register``,
# ``auth_invite_request``, ``auth_forgot_password``.

# Generic response returned for every forgot-password attempt so the endpoint
# cannot be used to enumerate which emails are registered.
PASSWORD_RESET_GENERIC_MESSAGE = (
    "If an account exists for this email, your request has been submitted to "
    "the administrator. They will contact you shortly."
)


def _password_reset_generic_response() -> dict:
    return {"status": "success", "message": PASSWORD_RESET_GENERIC_MESSAGE}

class RegisterPayload(BaseModel):
    email: EmailStr
    password: str
    invite_code: str
    display_name: Optional[str] = "User"

class LoginPayload(BaseModel):
    email: str
    password: str

class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str

class PlanRequestPayload(BaseModel):
    requested_plan: str
    request_type: Literal["upgrade", "extension"] = "upgrade"
    billing_cycle: Literal["monthly", "quarterly"] = "monthly"
    message: Optional[str] = ""

class InviteRequestPayload(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = ""
    description: str

class ContactAdminPayload(BaseModel):
    email: str
    message: str

class ForgotPasswordPayload(BaseModel):
    email: EmailStr


@router.post("/register")
def register(payload: RegisterPayload, request: Request, store: Store = Depends(get_store)):
    # Rate limiting — counts every attempt (previously this checked the bucket
    # but never recorded into it, so the limit could never trigger; now fixed
    # via the shared check_and_record helper).
    client_ip = client_ip_from_request(request)
    rate_limiter.check_and_record("auth_register", client_ip)

    # Validate password
    if not validate_password_strength(payload.password):
        raise HTTPException(
            status_code=400, 
            detail="Password must be between 3 and 10 characters long."
        )

    # Validate invite code
    invite = store.legacy_connection.execute(
        "SELECT * FROM invite_codes WHERE code = ?", (payload.invite_code,)
    ).fetchone()
    
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid invite code.")
        
    expires_dt = safe_parse_datetime(invite["expires_at"])
    if expires_dt and expires_dt < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invite code has expired.")
    if invite["max_uses"] != 0 and invite["used_count"] >= invite["max_uses"]:
        raise HTTPException(status_code=400, detail="Invite code usage limit reached.")

    # Check if email already exists
    existing_user = store.legacy_connection.execute(
        "SELECT id FROM users WHERE email = ?", (payload.email,)
    ).fetchone()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered.")

    # Hash password and create user
    hashed_password = hash_password(payload.password)
    default_roles = json.dumps(["free_user"])
    
    plan_started_at = datetime.now(timezone.utc).isoformat()
    plan_ends_at = None
    
    cursor = store.legacy_connection.execute(
        """
        INSERT INTO users (email, password_hash, display_name, roles, is_active, is_blocked, plan_started_at, plan_ends_at, registered_with_invite_id)
        VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?)
        """,
        (payload.email, hashed_password, payload.display_name, default_roles, plan_started_at, plan_ends_at, invite["id"])
    )
    user_id = cursor.lastrowid
    
    # Initialize local_profile
    store.legacy_connection.execute(
        """
        INSERT INTO local_profiles (user_id, display_name, email)
        VALUES (?, ?, ?)
        """,
        (user_id, payload.display_name, payload.email)
    )
    
    # Initialize usage stats
    features = ['ai_messages_per_session', 'total_projects', 'total_sheets', 'total_records', 'sheets_per_project',
                'records_per_sheet', 'total_documents_bytes', 'total_sticky_notes', 'total_whiteboards']
    for feature in features:
        store.legacy_connection.execute(
            """
            INSERT INTO user_usage_stats (user_id, feature, current_count, last_reset_at)
            VALUES (?, ?, 0, CURRENT_TIMESTAMP)
            """, (user_id, feature)
        )

    # Seed default document categories for the new user
    from app.core.categories import DEFAULT_MEDIA_CATEGORIES
    for index, (slug, label) in enumerate(DEFAULT_MEDIA_CATEGORIES):
        store.legacy_connection.execute(
            "INSERT INTO document_categories (slug, display_name, sort_order, user_id) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
            (slug, label, index, user_id)
        )

    # Increment invite code usage
    store.legacy_connection.execute(
        "UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?", (invite["id"],)
    )
    store.legacy_connection.commit()
    
    return {"status": "success", "message": "User registered successfully."}


# ---------------------------------------------------------------------------
# Paid self-registration (no invite code) — SCHOLARDOCX-0162
#
# A user without an invite code can register by purchasing a Basic/Pro/Max plan
# at signup. The account is created in an inert state (is_active=0,
# pending_payment_since=now) and CANNOT log in. Activation happens in the Polar
# webhook (handle_subscription_updated sets is_active=1 and clears
# pending_payment_since). If payment never arrives within 2h the account is
# deleted by the pending-account cleanup (GitHub Actions cron + lazy net).
# No email verification is sent — the paid checkout session is the trust anchor.
# ---------------------------------------------------------------------------

# Maps the public plan slug (as used in the payload) to (tier_setting_suffix,
# plan_role). tier_setting_suffix is appended to plan_is_active_<suffix> and
# polar_product_id_<suffix>_<cycle>. Mirrors the mapping in
# _assemble_public_plans / active_by_role.
_PAID_PLAN_BY_SLUG = {
    "basic": ("general", "general_user"),
    "pro": ("pro", "pro_user"),
    "max": ("max", "max_user"),
}


class RegisterPaidPayload(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = "User"
    plan: Literal["basic", "pro", "max"]
    billing_cycle: Literal["monthly", "quarterly"]
    success_url: Optional[str] = None


def _get_registration_mode(store: Store) -> str:
    """Read the registration_mode app setting (default invite_or_paid)."""
    row = store.legacy_connection.execute(
        "SELECT value FROM app_settings WHERE key = 'registration_mode'"
    ).fetchone()
    return (row["value"] if row else "invite_or_paid")


@router.post("/register-paid")
async def register_paid(
    payload: RegisterPaidPayload, request: Request, store: Store = Depends(get_store)
):
    """Register a new account by purchasing a paid plan (no invite code).

    Creates an inert user, starts a hosted checkout session, and returns its
    URL. The account becomes usable only when the Polar webhook confirms
    payment. See SCHOLARDOCX-0162.
    """
    # Rate limit first (1 / 24h / IP). check_and_record counts every hit, so a
    # failed attempt still consumes the daily slot — same posture as
    # auth_invite_request (anti-abuse on an open registration path).
    client_ip = client_ip_from_request(request)
    rate_limiter.check_and_record("auth_register_paid", client_ip)

    # Gate by registration_mode. invite_only → this path is closed.
    mode = _get_registration_mode(store)
    if mode == "invite_only":
        raise HTTPException(
            status_code=403,
            detail="Paid registration is not available. An invite code is required.",
        )

    # Password strength — same rule as invite-code register.
    if not validate_password_strength(payload.password):
        raise HTTPException(
            status_code=400,
            detail="Password must be 8 or more characters and include upper, "
                   "lowercase, a digit, and a special character.",
        )

    # Reject if the email is already registered OR is already in the
    # pending-payment window (give the user a clear path: finish checkout or
    # wait for the 2h expiry).
    existing = store.legacy_connection.execute(
        "SELECT id, is_active, pending_payment_since FROM users WHERE email = ?",
        (payload.email,),
    ).fetchone()
    if existing:
        if existing["pending_payment_since"] is not None and not existing["is_active"]:
            raise HTTPException(
                status_code=409,
                detail="An account for this email is awaiting payment. Please "
                       "complete checkout, or retry in a few hours.",
            )
        raise HTTPException(status_code=400, detail="Email already registered.")

    # Plan validation: tier must be active and have a configured Polar product
    # UUID for the requested cycle.
    plan_slug = payload.plan
    tier_suffix, _plan_role = _PAID_PLAN_BY_SLUG[plan_slug]
    settings_rows = store.legacy_connection.execute(
        "SELECT key, value FROM app_settings WHERE key IN (?, ?)",
        (f"plan_is_active_{tier_suffix}", f"polar_product_id_{tier_suffix}_{payload.billing_cycle}"),
    ).fetchall()
    settings_map = {row["key"]: row["value"] for row in settings_rows}
    is_active = settings_map.get(f"plan_is_active_{tier_suffix}", "1") == "1"
    product_id = settings_map.get(f"polar_product_id_{tier_suffix}_{payload.billing_cycle}", "")
    if not is_active or not _is_uuid_shape(product_id):
        logger.warning(
            f"register-paid rejected: plan={plan_slug} cycle={payload.billing_cycle} "
            f"active={is_active} product_id={product_id!r}"
        )
        raise HTTPException(
            status_code=400, detail="Selected plan is not available for checkout."
        )

    # Create the inert user. is_active=0 blocks login until the webhook flips
    # it; pending_payment_since anchors the 2h cleanup window. roles start as
    # free_user — the webhook swaps in the paid plan role on activation.
    hashed_password = hash_password(payload.password)
    default_roles = json.dumps(["free_user"])
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = store.legacy_connection.execute(
        """
        INSERT INTO users
            (email, password_hash, display_name, roles, is_active, is_blocked,
             plan_started_at, plan_ends_at, pending_payment_since)
        VALUES (?, ?, ?, ?, 0, 0, ?, NULL, ?)
        """,
        (payload.email, hashed_password, payload.display_name, default_roles, now_iso, now_iso),
    )
    user_id = cursor.lastrowid

    # Seed the same dependents as invite-code register / admin create_user so
    # the account is fully ready the moment it is activated.
    _seed_new_user_dependents(store, user_id, payload.display_name, payload.email)
    store.legacy_connection.commit()

    # Build the hosted checkout URL. success_url is validated inside the helper
    # against the CORS allowlist; default to the registration-complete route.
    settings = get_settings()
    success_url = payload.success_url or _default_success_url(request)
    try:
        result = await _create_polar_checkout_session(
            user={"id": str(user_id), "email": payload.email, "polar_customer_id": None},
            product_id=product_id,
            success_url=success_url,
            settings=settings,
        )
    except HTTPException:
        # Checkout failed (provider down, bad config, …). Roll back the inert
        # user + its just-seeded dependents so the email is immediately free to
        # retry, and surface a generic message.
        _delete_user_cascade(store, user_id)
        store.legacy_connection.commit()
        logger.warning(f"register-paid checkout failed; rolled back user {user_id}")
        raise
    return {"status": "success", "checkout_url": result["url"]}


def _default_success_url(request: Request) -> str:
    """Best-effort default success_url derived from the inbound request origin.

    Falls back to localhost dev origin if the request has no host. The value is
    still re-validated against the CORS allowlist inside the checkout helper, so
    an unparseable/proxied host can never produce an open redirect.
    """
    host = request.headers.get("origin") or request.headers.get("host")
    if host:
        scheme = "https" if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" else "http"
        if "://" not in host:
            host = f"{scheme}://{host}"
        return f"{host.rstrip('/')}/registration-complete"
    return "http://localhost:5173/registration-complete"


def _seed_new_user_dependents(store: Store, user_id: str, display_name: str, email: str) -> None:
    """Seed local_profiles, user_usage_stats, and document_categories.

    Shared shape with ``register`` (invite) and ``AdminService.create_user``.
    Kept as a module helper so the paid path doesn't grow a third copy.
    """
    conn = store.legacy_connection
    conn.execute(
        "INSERT INTO local_profiles (user_id, display_name, email) VALUES (?, ?, ?)",
        (user_id, display_name, email),
    )
    features = [
        "ai_messages_per_session", "total_projects", "total_sheets", "total_records",
        "sheets_per_project", "records_per_sheet", "total_documents_bytes",
        "total_sticky_notes", "total_whiteboards",
    ]
    for feature in features:
        conn.execute(
            "INSERT INTO user_usage_stats (user_id, feature, current_count, last_reset_at) "
            "VALUES (?, ?, 0, CURRENT_TIMESTAMP)",
            (user_id, feature),
        )
    from app.core.categories import DEFAULT_MEDIA_CATEGORIES
    for index, (slug, label) in enumerate(DEFAULT_MEDIA_CATEGORIES):
        conn.execute(
            "INSERT INTO document_categories (slug, display_name, sort_order, user_id) "
            "VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
            (slug, label, index, user_id),
        )


def _delete_user_cascade(store: Store, user_id: str) -> None:
    """Delete a not-yet-activated user and its seeded dependents.

    Used by register-paid rollback and by the 2h pending-account cleanup. A
    pending-payment user has only local_profiles / user_usage_stats /
    document_categories rows (never logged in), so this is a bounded set.
    user_usage_stats.user_id is NOT NULL (must precede the user delete); the
    other two are nullable but we remove them for tidiness.
    """
    conn = store.legacy_connection
    conn.execute("DELETE FROM user_usage_stats WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM local_profiles WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM document_categories WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))

@router.post("/login")
def login(payload: LoginPayload, request: Request, store: Store = Depends(get_store)):
    # Rate limiting — check first; only record on a *failed* credential check,
    # so successful logins do not consume the budget.
    client_ip = client_ip_from_request(request)
    rate_limiter.check("auth_login", client_ip)

    user = store.legacy_connection.execute(
        "SELECT * FROM users WHERE email = ?", (payload.email,)
    ).fetchone()

    if not user or not verify_password(payload.password, user["password_hash"]):
        rate_limiter.record("auth_login", client_ip)
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # SCHOLARDOCX-0162: lazy safety net. Reap unpaid pending-payment accounts
    # every ~2h on this cheap, frequent path. No-op when the last run is fresh.
    # The codebase already does all time-based cleanup lazily on read (invite
    # codes, usage-stat resets, rate-limit pruning), so this matches the pattern
    # and survives free-tier sleep without a background loop.
    from app.services.registration_cleanup import maybe_run_lazy_cleanup
    maybe_run_lazy_cleanup(store)

    if not user["is_active"]:
        # SCHOLARDOCX-0162: distinguish an account awaiting payment from one an
        # admin deactivated/suspended. The pending state is expected to clear
        # within seconds-minutes of checkout; the suspended state needs admin
        # action. Frontend maps these details to different copy.
        if user.get("pending_payment_since") is not None:
            raise HTTPException(
                status_code=403,
                detail="Your account is being activated after payment. Please "
                       "wait a moment and try again.",
            )
        raise HTTPException(status_code=403, detail="user_suspended")

    roles = safe_json_loads(user["roles"], default=[])
    
    # Update last login
    store.legacy_connection.execute(
        "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", (user["id"],)
    )
    store.legacy_connection.commit()

    # Fetch JWT settings
    secret_key = get_jwt_secret(store.legacy_connection)
    expiration_row = store.legacy_connection.execute("SELECT value FROM app_settings WHERE key = 'jwt_expiration_days'").fetchone()
    expiration_days = int(expiration_row["value"]) if expiration_row else 30

    # Generate token
    user_dict = dict(user)
    user_dict["roles"] = roles
    token = create_token(user_dict, secret_key, expiration_days)
    
    return {
        "status": "success",
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "roles": roles,
            "is_active": user["is_active"] == 1,
            "is_blocked": user["is_blocked"] == 1
        }
    }
@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "display_name": current_user["display_name"],
        "roles": current_user.get("roles", []),
        "plan_started_at": current_user.get("plan_started_at"),
        "plan_ends_at": current_user.get("plan_ends_at"),
        "plan_renews_at": current_user.get("plan_renews_at"),
        "polar_customer_id": current_user.get("polar_customer_id"),
        "polar_subscription_id": current_user.get("polar_subscription_id"),
        "polar_cancel_at_period_end": bool(current_user.get("polar_cancel_at_period_end")),
        "polar_pending_plan": current_user.get("polar_pending_plan"),
    }


@router.post("/plans/portal")
def create_customer_portal_session(store: Store = Depends(get_store), current_user: dict = Depends(get_current_user)):
    settings = get_settings()
    is_sandbox = "sandbox" in (settings.polar_env or "").lower() or "sandbox" in os.getenv("VITE_POLAR_URL", "").lower()
    fallback_url = "https://sandbox.polar.sh" if is_sandbox else "https://polar.sh"

    customer_id = current_user.get("polar_customer_id")
    access_token = settings.polar_access_token
    if not customer_id or not access_token:
        return {"url": fallback_url}

    import urllib.request
    import json as _json

    api_url = "https://sandbox-api.polar.sh/v1/customer-sessions/" if is_sandbox else "https://api.polar.sh/v1/customer-sessions/"
    req = urllib.request.Request(
        api_url,
        data=_json.dumps({"customer_id": customer_id}).encode(),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "User-Agent": "ScholarDocX/1.0",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res_data = _json.loads(resp.read().decode())
            portal_url = res_data.get("customer_portal_url") or res_data.get("url")
            if portal_url:
                return {"url": portal_url}
    except Exception as e:
        logger.warning(f"Could not create Polar customer session: {e}")

    return {"url": fallback_url}

@router.post("/me/password")
def change_my_password(payload: ChangePasswordPayload, store: Store = Depends(get_store), current_user: dict = Depends(get_current_user)):
    # Rate limit against current-password brute-force: check first, record only
    # on a failed credential check (mirrors /auth/login). A legit password
    # change never consumes the budget.
    identity = user_identity(current_user)
    rate_limiter.check("auth_password_change", identity)

    user = store.legacy_connection.execute(
        "SELECT * FROM users WHERE id = ?", (current_user["id"],)
    ).fetchone()

    if not user or not verify_password(payload.current_password, user["password_hash"]):
        rate_limiter.record("auth_password_change", identity)
        raise HTTPException(status_code=400, detail="Incorrect current password.")
        
    if not validate_password_strength(payload.new_password):
        raise HTTPException(
            status_code=400,
            detail="Password must be between 3 and 10 characters long."
        )
        
    new_hash = hash_password(payload.new_password)
    
    # Update password and increment token_version to invalidate all existing sessions
    store.legacy_connection.execute(
        "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (new_hash, current_user["id"])
    )
    store.legacy_connection.commit()
    return {"status": "success", "message": "Password updated successfully. All other sessions have been logged out."}

@router.post("/logout")
def logout():
    # Client handles removing the token
    return {"status": "success", "message": "Logged out."}

@router.get("/usage")
def get_usage(store: Store = Depends(get_store), current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    primary_role = get_primary_user_role(current_user)

    if not primary_role:
        # Admin-only users have no user-tier entitlement; report zeroed user features.
        user_features = store.legacy_connection.execute(
            "SELECT feature FROM role_limits WHERE role = ? ORDER BY feature",
            ("general_user",)
        ).fetchall()
        zero_limits = {row["feature"]: 0 for row in user_features}
        zero_usage = {row["feature"]: 0 for row in user_features}
        return {
            "limits": zero_limits,
            "usage": zero_usage,
            "advisor_atlas_plan_phrase": feature_plan_phrase("can_use_advisor_atlas", store.db),
            "token_packs_plan_phrase": feature_plan_phrase("can_purchase_token_packs", store.db),
        }

    limits = store.legacy_connection.execute(
        "SELECT feature, limit_count FROM role_limits WHERE role = ?", (primary_role,)
    ).fetchall()
    
    usage = store.legacy_connection.execute(
        "SELECT feature, current_count FROM user_usage_stats WHERE user_id = ?", (user_id,)
    ).fetchall()
    
    limits_dict = {row["feature"]: row["limit_count"] for row in limits}
    usage_dict = {row["feature"]: row["current_count"] for row in usage}
    
    return {
        "limits": limits_dict,
        "usage": usage_dict,
        "advisor_atlas_plan_phrase": feature_plan_phrase("can_use_advisor_atlas", store.db),
        "token_packs_plan_phrase": feature_plan_phrase("can_purchase_token_packs", store.db),
    }

@router.get("/plans")
def get_plans(store: Store = Depends(get_store), current_user: dict = Depends(get_current_user)):
    # Auth-gated variant for logged-in users (e.g. PlanComparisonView). The
    # payload is identical to the public endpoint — both go through the same
    # assembly helper so there is a single source of truth.
    return _assemble_public_plans(store)


@router.get("/plans/public")
def get_public_plans(store: Store = Depends(get_store)):
    # Anonymous-safe variant for the public landing page. No auth dependency.
    # Returns only marketing-safe data: plan limits + prices + active flags.
    # No per-user or private configuration is exposed.
    return _assemble_public_plans(store)


def _assemble_public_plans(store: Store) -> dict:
    """Build the {plans, pricing} payload shared by /plans and /plans/public.

    Joins role_limits (per-tier feature quotas) with app_settings (prices,
    monthly AI credits, and active flags) into a single marketing-safe shape
    consumed by PlanComparisonView (authed) and the landing PricingSection.
    """
    # Returns the limits for all tiers
    limits = store.legacy_connection.execute(
        "SELECT role, feature, limit_count, reset_period FROM role_limits ORDER BY role, feature"
    ).fetchall()

    plans = defaultdict(dict)
    for row in limits:
        plans[row["role"]][row["feature"]] = {
            "limit_count": row["limit_count"],
            "reset_period": row["reset_period"]
        }

    # SCHOLARDOCX-0140: monthly AI credits moved from role_limits (feature
    # ai_tokens_per_month) to app_settings (plan_ai_credits_<tier>). Inject it
    # back into each tier's feature map so the response shape is unchanged for
    # PlanComparisonView and other existing consumers.
    credit_defaults = {
        "plan_ai_credits_free": "0",
        "plan_ai_credits_general": "500000",
        "plan_ai_credits_pro": "2000000",
        "plan_ai_credits_max": "5000000",
    }
    credit_by_role = {
        "free_user": "plan_ai_credits_free",
        "general_user": "plan_ai_credits_general",
        "pro_user": "plan_ai_credits_pro",
        "max_user": "plan_ai_credits_max",
    }
    active_by_role = {
        "free_user": "plan_is_active_free",
        "general_user": "plan_is_active_general",
        "pro_user": "plan_is_active_pro",
        "max_user": "plan_is_active_max",
    }

    # SCHOLARDOCX-0147: fetch all three plan_* setting families in ONE query
    # instead of three separate round-trips. The ILIKE prefixes are mutually
    # exclusive so the buckets never overlap. This cut the plans endpoint from
    # 4 queries (~244ms) to 2 (~150ms) on Supabase's pooled Postgres, where each
    # round-trip is tens of ms.
    settings_rows = store.legacy_connection.execute(
        "SELECT key, value FROM app_settings "
        "WHERE key ILIKE 'plan_ai_credits_%' "
        "OR key ILIKE 'plan_is_active_%' "
        "OR key ILIKE 'plan_price_%' "
        "OR key ILIKE 'polar_product_id_%' "
        "OR key ILIKE 'polar_extra_credits_id_%'"
    ).fetchall()
    credits: dict[str, str] = {}
    active_flags: dict[str, str] = {}
    pricing: dict[str, str] = {}
    for row in settings_rows:
        key, value = row["key"], row["value"]
        if key.startswith("plan_ai_credits_"):
            credits[key] = value
        elif key.startswith("plan_is_active_"):
            active_flags[key] = value
        elif key.startswith("plan_price_"):
            pricing[key] = value
        elif key.startswith("polar_product_id_") or key.startswith("polar_extra_credits_id_"):
            # SCHOLARDOCX-0158: only surface a buyable product id when it is a
            # real Polar UUID. A placeholder or unset value (e.g. the test
            # sentinel `polar_prod_pro_monthly`, or an empty string) is omitted
            # so the frontend never renders a checkout button it cannot
            # fulfill. The plan/price is still shown; only the buy CTA is gated.
            if _is_uuid_shape(value):
                pricing[key] = value

    for role, setting_key in credit_by_role.items():
        value = credits.get(setting_key, credit_defaults[setting_key])
        plans[role]["ai_tokens_per_month"] = {
            "limit_count": int(value),
            "reset_period": "monthly",
        }

    # Remove inactive plans from the response (default to active if not set)
    filtered_plans = {}
    for role, setting_key in active_by_role.items():
        is_active = active_flags.get(setting_key, "1") == "1"
        if is_active and role in plans:
            filtered_plans[role] = plans[role]

    # Defaults in case not in DB yet
    pricing.setdefault("plan_price_general_monthly", "0")
    pricing.setdefault("plan_price_general_quarterly", "0")
    pricing.setdefault("plan_price_pro_monthly", "50")
    pricing.setdefault("plan_price_pro_quarterly", "500")
    pricing.setdefault("plan_price_max_monthly", "180")
    pricing.setdefault("plan_price_max_quarterly", "1500")

    # SCHOLARDOCX-0162: surface registration_mode so the public RegisterPage can
    # decide which tabs to show (invite-only hides the paid tab; paid-only hides
    # the invite tab). Read from app_settings; default to invite_or_paid.
    reg_mode_row = store.legacy_connection.execute(
        "SELECT value FROM app_settings WHERE key = 'registration_mode'"
    ).fetchone()
    registration_mode = reg_mode_row["value"] if reg_mode_row else "invite_or_paid"

    return {
        "status": "success",
        "plans": filtered_plans,
        "pricing": pricing,
        "registration_mode": registration_mode,
    }

class PolarCheckoutPayload(BaseModel):
    product_id: str
    customer_email: Optional[str] = None  # ignored — see SCHOLARDOCX-0156; kept for backward compat
    success_url: str


# Canonical UUID (8-4-4-4-12 hex). Polar product ids are always UUIDs in this
# form. Used to reject placeholders / setting-key names / empty strings before
# they are forwarded to the provider, which would otherwise return a cryptic
# 422. (SCHOLARDOCX-0158)
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _is_uuid_shape(value: Any) -> bool:
    """True if `value` is a canonical Polar-style product UUID.

    Strict on dash placement and hex length so obviously-wrong values like the
    test sentinel `polar_prod_pro_monthly` or an empty string are caught at the
    API boundary instead of surfacing as a provider-side validation error.
    (SCHOLARDOCX-0158)
    """
    return isinstance(value, str) and bool(_UUID_RE.match(value))


def _is_allowlisted_success_url(url: str, settings: Settings) -> bool:
    """True if `url`'s origin is a known app origin (CORS allowlist or regex).

    Prevents open-redirect abuse where an authenticated client forwards an
    arbitrary `success_url` to the payment provider, which then redirects the
    buyer there post-payment. Matches the CORS origin semantics so the same
    set of allowed origins governs both CORS and the checkout return URL.
    (SCHOLARDOCX-0157)
    """
    from urllib.parse import urlparse

    try:
        parsed = urlparse(url)
    except (ValueError, AttributeError):
        return False
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if not origin or not parsed.scheme:
        return False
    if origin in settings.cors_origins:
        return True
    if settings.cors_origin_regex and re.match(settings.cors_origin_regex, origin):
        return True
    return False


@router.post("/plans/checkout")
async def create_polar_checkout(payload: PolarCheckoutPayload, current_user: dict = Depends(get_current_user)):
    # SCHOLARDOCX-0162: the checkout-call logic now lives in the shared
    # ``_create_polar_checkout_session`` helper so the paid-registration path
    # can reuse it for a not-yet-active user. This route remains the thin
    # auth-gated entry point for an already-logged-in user.
    return await _create_polar_checkout_session(
        user=current_user,
        product_id=payload.product_id,
        success_url=payload.success_url,
        settings=get_settings(),
    )


async def _create_polar_checkout_session(
    user: dict, product_id: str, success_url: str, settings: Settings
) -> dict:
    """Create a hosted checkout session and return ``{status, url}``.

    Shared by the auth-gated ``/auth/plans/checkout`` route (logged-in user
    upgrading) and the anonymous ``/auth/register-paid`` route (inert user
    buying a plan at signup). The customer identifier sent to the provider is
    derived from ``user`` — never from a client-supplied email (SCHOLARDOCX-0156).
    Validation (provider configured, allowlisted success_url, canonical UUID
    product_id) runs here so both callers are protected identically.
    """
    polar_token = settings.polar_access_token
    if not polar_token:
        # Generic message — never surface the provider name to the user.
        raise HTTPException(status_code=500, detail="Checkout is not configured.")

    # SCHOLARDOCX-0157: validate success_url against the app's known origins so
    # an authenticated client can't redirect a post-payment buyer to an
    # arbitrary external host. Matches CORS allowlist + regex semantics.
    if not _is_allowlisted_success_url(success_url, settings):
        raise HTTPException(status_code=400, detail="Return URL is not allowed.")

    # SCHOLARDOCX-0158: product_id must be a canonical Polar UUID. Catches
    # placeholder / setting-key-name values (e.g. `polar_prod_pro_monthly`)
    # that would otherwise be forwarded to the provider and surface as a
    # cryptic 422. Generic user message; value logged server-side only.
    if not _is_uuid_shape(product_id):
        logger.warning(
            f"Checkout rejected: invalid product_id shape "
            f"user={user.get('id')} value={product_id!r}"
        )
        raise HTTPException(
            status_code=400,
            detail="Selected plan is not configured for checkout.",
        )

    # Single source of truth for sandbox vs production. Previously there were
    # two if/else blocks that disagreed on the unset default; the dead first
    # block is removed. Default is production when POLAR_ENV/VITE_POLAR_URL do
    # not explicitly opt into sandbox. (SCHOLARDOCX-0157)
    polar_env = (settings.polar_env or os.environ.get("VITE_POLAR_URL", "")).lower()
    polar_api_url = "https://sandbox-api.polar.sh/v1" if "sandbox" in polar_env else "https://api.polar.sh/v1"

    # SCHOLARDOCX-0156: pass Polar a customer identifier derived from the
    # user so the hosted checkout treats the customer as "known" and renders
    # the email field pre-filled AND disabled. The authoritative source is
    # ``user`` — never a client-supplied email, which is spoofable. Returning
    # customers (with a stored polar_customer_id) reuse their Polar customer
    # via `customer_id`; new customers get one created with our user UUID as
    # `external_customer_id` plus their account email. See
    # AI-Context/technical/api-boundaries.md (Polar billing) and webhooks.py
    # for the matching reconciliation contract.
    polar_customer_id = user.get("polar_customer_id")
    req_body: dict = {
        "product_id": product_id,
        "success_url": success_url,
    }
    if polar_customer_id:
        req_body["customer_id"] = polar_customer_id
    else:
        req_body["external_customer_id"] = user["id"]
        req_body["customer_email"] = user["email"]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{polar_api_url}/checkouts/",
            json=req_body,
            headers={
                "Authorization": f"Bearer {polar_token}",
                "Content-Type": "application/json"
            }
        )

        if response.status_code not in (200, 201):
            # Log the upstream body server-side for diagnosis; return a generic
            # user-facing message. Never echo the provider name or upstream
            # response to the client (AGENTS.md: no infrastructure exposure).
            # (SCHOLARDOCX-0157)
            logger.warning(
                f"Checkout session creation failed: status={response.status_code} "
                f"user={user.get('id')} body={response.text}"
            )
            raise HTTPException(status_code=400, detail="Checkout session could not be created.")

        data = response.json()
        if "url" not in data:
            logger.warning(
                f"Checkout response missing URL: user={user.get('id')} keys={list(data.keys())}"
            )
            raise HTTPException(status_code=400, detail="Checkout session could not be created.")

        return {"status": "success", "url": data["url"]}


@router.get("/plans/requests")
def list_my_plan_requests(store: Store = Depends(get_store), current_user: dict = Depends(get_current_user)):
    rows = store.legacy_connection.execute(
        """
        SELECT id, request_type, requested_plan, billing_cycle, message, status, reviewed_at, created_at
        FROM plan_upgrade_requests
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (current_user["id"],)
    ).fetchall()
    return {"status": "success", "requests": [dict(row) for row in rows]}

@router.post("/invite-request")
def request_invite(payload: InviteRequestPayload, request: Request, store: Store = Depends(get_store)):
    # Rate limiting: 1 per IP per 24 hours. Check first; only record once the
    # request is actually accepted (validation failures below do not consume
    # the budget).
    client_ip = client_ip_from_request(request)
    rate_limiter.check("auth_invite_request", client_ip)

    # Check if email is already registered
    existing_user = store.legacy_connection.execute(
        "SELECT id FROM users WHERE email = ?", (payload.email,)
    ).fetchone()
    if existing_user:
        raise HTTPException(status_code=400, detail="This email is already registered.")
        
    # Check if an invite request is already pending or approved for this email
    existing_request = store.legacy_connection.execute(
        "SELECT id, status FROM invite_requests WHERE email = ? AND status IN ('Pending', 'Approved')", (payload.email,)
    ).fetchone()
    if existing_request:
        if existing_request["status"] == "Pending":
            raise HTTPException(status_code=400, detail="An invite request for this email is already pending.")
        else:
            raise HTTPException(status_code=400, detail="An invite request for this email has already been approved. Please check your email for the invite code.")
        
    rate_limiter.record("auth_invite_request", client_ip)

    store.legacy_connection.execute(
        """
        INSERT INTO invite_requests (name, email, phone, description, ip_address, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        (payload.name, payload.email, payload.phone, payload.description, client_ip)
    )
    store.legacy_connection.commit()
    
    return {"status": "success", "message": "Your request has been submitted successfully. We will review it shortly."}

@router.post("/contact-admin")
def contact_admin(payload: ContactAdminPayload, request: Request, store: Store = Depends(get_store)):
    # Rate limiting: 3 messages per IP per 30 minutes (anti-spam).
    client_ip = client_ip_from_request(request)
    rate_limiter.check_and_record("auth_contact_admin", client_ip)

    # Check if there is already a pending appeal
    existing = store.legacy_connection.execute(
        "SELECT id FROM suspension_appeals WHERE email = ? AND status = 'Pending'",
        (payload.email,)
    ).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending suspension appeal.")

    # Store it in suspension_appeals table so the admin can review it in the dedicated dashboard
    store.legacy_connection.execute(
        """
        INSERT INTO suspension_appeals (email, message, ip_address, status, created_at, updated_at)
        VALUES (?, ?, ?, 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        (payload.email, payload.message, client_ip)
    )
    store.legacy_connection.commit()

    return {"status": "success", "message": "Your message has been sent to the administrator."}

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordPayload, request: Request, store: Store = Depends(get_store)):
    # Security note: this endpoint MUST return the identical generic response in
    # every branch so it cannot be used to enumerate registered emails. Rate
    # limits and the "one pending request per user" rule are enforced silently
    # by simply not creating a row.
    client_ip = client_ip_from_request(request)

    # Per-IP limit: one request per hour. The budget is consumed before the
    # email lookup so the limit cannot act as a timing/enumeration oracle. We
    # deliberately do NOT raise 429 here — returning the generic 200 keeps the
    # endpoint indistinguishable across all branches.
    try:
        rate_limiter.check_and_record("auth_forgot_password", client_ip)
    except HTTPException as exc:  # pragma: no cover - defensive
        if exc.status_code == 429:
            return _password_reset_generic_response()
        raise

    # Look up the account. Unknown emails get the same generic response.
    user = store.legacy_connection.execute(
        "SELECT id FROM users WHERE email = ?", (payload.email,)
    ).fetchone()
    if not user:
        return _password_reset_generic_response()

    # Max one pending request per user.
    existing = store.legacy_connection.execute(
        "SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'Pending'",
        (user["id"],)
    ).fetchone()
    if existing:
        return _password_reset_generic_response()

    store.legacy_connection.execute(
        """
        INSERT INTO password_reset_requests (email, user_id, ip_address, status, created_at, updated_at)
        VALUES (?, ?, ?, 'Pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        (payload.email, user["id"], client_ip)
    )
    store.legacy_connection.commit()

    return _password_reset_generic_response()

@router.post("/plans/request")
def request_plan_upgrade(payload: PlanRequestPayload, store: Store = Depends(get_store), current_user: dict = Depends(get_current_user)):
    existing_request = store.legacy_connection.execute(
        "SELECT id FROM plan_upgrade_requests WHERE user_id = ? AND status = 'Pending'",
        (current_user["id"],)
    ).fetchone()
    
    if existing_request:
        raise HTTPException(status_code=400, detail="You already have a pending plan request. Please wait for it to be reviewed before submitting another.")

    try:
        store.legacy_connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message)
            VALUES (?, ?, ?, ?, ?)
            """,
            (current_user["id"], payload.request_type, payload.requested_plan, payload.billing_cycle, payload.message)
        )
        store.legacy_connection.commit()
        message = "Plan extension request submitted successfully." if payload.request_type == "extension" else "Plan upgrade request submitted successfully."
        return {"status": "success", "message": message}
    except Exception as e:
        store.legacy_connection.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/plans/requests/{request_id}/cancel")
def cancel_plan_request(request_id: str, store: Store = Depends(get_store), current_user: dict = Depends(get_current_user)):
    request = store.legacy_connection.execute(
        "SELECT id, status FROM plan_upgrade_requests WHERE id = ? AND user_id = ?",
        (request_id, current_user["id"])
    ).fetchone()
    
    if not request:
        raise HTTPException(status_code=404, detail="Request not found.")
        
    if request["status"] != "Pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be cancelled.")
        
    store.legacy_connection.execute(
        "UPDATE plan_upgrade_requests SET status = 'Cancelled' WHERE id = ?",
        (request_id,)
    )
    store.legacy_connection.commit()
    return {"status": "success", "message": "Plan request cancelled successfully."}
