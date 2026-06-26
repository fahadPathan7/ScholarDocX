import re
import json
import time
from typing import Any, Optional, Literal
from datetime import datetime, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr

from app.auth.jwt import create_token
from app.auth.password import hash_password, validate_password_strength, verify_password
from app.core.config import Settings, get_settings
from app.db.connection import connect, initialize_database
from app.services.store import Store
from app.api.dependencies import get_store
from app.auth.dependencies import get_current_user, get_jwt_secret
from app.auth.limits import get_primary_user_role

router = APIRouter(prefix="/auth", tags=["auth"])

# Rate limit dictionaries: ip -> list of timestamps
_login_attempts = defaultdict(list)
_register_attempts = defaultdict(list)
_invite_request_attempts = defaultdict(list)

MAX_LOGIN_ATTEMPTS = 5
LOGIN_RATE_LIMIT_WINDOW = 300 # 5 minutes

MAX_REGISTER_ATTEMPTS = 5
REGISTER_RATE_LIMIT_WINDOW = 300 # 5 minutes

INVITE_REQUEST_RATE_LIMIT_WINDOW = 1800 # 30 minutes

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
    billing_cycle: Literal["monthly", "yearly"] = "monthly"
    message: Optional[str] = ""

class InviteRequestPayload(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = ""
    description: str

class ContactAdminPayload(BaseModel):
    email: str
    message: str


@router.post("/register")
def register(payload: RegisterPayload, request: Request, store: Store = Depends(get_store)):
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    _register_attempts[client_ip] = [ts for ts in _register_attempts[client_ip] if now - ts < REGISTER_RATE_LIMIT_WINDOW]
    if len(_register_attempts[client_ip]) >= MAX_REGISTER_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many registration attempts. Please try again later.")

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
        
    if invite["expires_at"] and datetime.fromisoformat(invite["expires_at"]) < datetime.utcnow():
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
    
    plan_started_at = datetime.utcnow().isoformat()
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
    features = ['ai_messages_per_session', 'web_searches_per_day', 'web_searches_per_month', 'news_searches_per_day', 'news_searches_per_month', 'total_projects', 'total_sheets', 'total_records', 'sheets_per_project',
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
            "INSERT OR IGNORE INTO document_categories (slug, display_name, sort_order, user_id) VALUES (?, ?, ?, ?)",
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
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    _login_attempts[client_ip] = [ts for ts in _login_attempts[client_ip] if now - ts < LOGIN_RATE_LIMIT_WINDOW]
    if len(_login_attempts[client_ip]) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again later.")
        
    user = store.legacy_connection.execute(
        "SELECT * FROM users WHERE email = ?", (payload.email,)
    ).fetchone()
    
    if not user or not verify_password(payload.password, user["password_hash"]):
        _login_attempts[client_ip].append(now)
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="user_suspended")

    roles = json.loads(user["roles"])
    
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
    user = store.legacy_connection.execute(
        "SELECT * FROM users WHERE id = ?", (current_user["id"],)
    ).fetchone()
    
    if not user or not verify_password(payload.current_password, user["password_hash"]):
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
            "usage": zero_usage
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
        "usage": usage_dict
    }

@router.get("/plans")
def get_plans(store: Store = Depends(get_store), current_user: dict = Depends(get_current_user)):
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
        
    settings_rows = store.legacy_connection.execute(
        "SELECT key, value FROM app_settings WHERE key LIKE 'plan_price_%'"
    ).fetchall()
    
    pricing = {row["key"]: row["value"] for row in settings_rows}
    
    # Defaults in case not in DB yet
    pricing.setdefault("plan_price_general_monthly", "0")
    pricing.setdefault("plan_price_general_yearly", "0")
    pricing.setdefault("plan_price_pro_monthly", "50")
    pricing.setdefault("plan_price_pro_yearly", "500")
    pricing.setdefault("plan_price_max_monthly", "180")
    pricing.setdefault("plan_price_max_yearly", "1500")

    return {"status": "success", "plans": plans, "pricing": pricing}

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
    # Rate limiting: 1 per IP per 30 minutes
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    _invite_request_attempts[client_ip] = [ts for ts in _invite_request_attempts[client_ip] if now - ts < INVITE_REQUEST_RATE_LIMIT_WINDOW]
    if len(_invite_request_attempts[client_ip]) >= 1:
        raise HTTPException(status_code=429, detail="You can only request one invite code every 30 minutes. Please try again later.")

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
        
    _invite_request_attempts[client_ip].append(now)

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
    client_ip = request.client.host if request.client else "unknown"
    
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
def cancel_plan_request(request_id: int, store: Store = Depends(get_store), current_user: dict = Depends(get_current_user)):
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
