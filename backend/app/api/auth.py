from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
import re
import json
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
        
    if not user["is_active"]:
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
        "plan_ends_at": current_user.get("plan_ends_at")
    }

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
        "OR key ILIKE 'plan_price_%'"
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

    return {"status": "success", "plans": filtered_plans, "pricing": pricing}

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
