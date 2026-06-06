from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
from app.auth.dependencies import get_current_user, require_admin, require_super_admin
from app.auth.password import hash_password, validate_password_strength
from app.auth.limits import check_and_increment_limit, UsageLimitExceeded
from app.services.admin import AdminService
from app.api.dependencies import get_store
from app.services.store import Store

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_user), Depends(require_admin)])

def get_admin_service(store: Store = Depends(get_store)) -> AdminService:
    return AdminService(store.connection)

class RoleUpdatePayload(BaseModel):
    roles: List[str]
    plan_duration_days: Optional[int] = None
    plan_start_date: Optional[str] = None
    plan_end_date: Optional[str] = None

class StatusUpdatePayload(BaseModel):
    is_active: bool

class BlockUpdatePayload(BaseModel):
    is_blocked: bool

class InviteCodePayload(BaseModel):
    max_uses: int
    expiration_hours: Optional[int] = 24

class UserCreatePayload(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = "User"
    roles: Optional[List[str]] = ["general_user"]
    plan_duration: Optional[str] = "1_month"

class LimitUpdatePayload(BaseModel):
    limit_count: int
    reset_period: Optional[str] = None

class PlanRequestReviewPayload(BaseModel):
    action: str

class InviteRequestReviewPayload(BaseModel):
    action: str

class SettingUpdatePayload(BaseModel):
    value: str

def require_feature(feature: str, user: dict, connection):
    try:
        check_and_increment_limit(user, feature, 0, connection)
    except UsageLimitExceeded as e:
        raise HTTPException(status_code=403, detail=str(e))

def can_use_feature(feature: str, user: dict, connection) -> bool:
    try:
        check_and_increment_limit(user, feature, 0, connection)
        return True
    except UsageLimitExceeded:
        return False

def check_admin_modification_clearance(user_id: int, admin_service: AdminService, current_user: dict):
    target_user = admin_service.get_user_details(user_id)
    target_is_admin = any(r in target_user.get("roles", []) for r in ["general_admin", "super_admin"])
    if target_is_admin:
        can_manage_admin = can_use_feature("admin_assign_admin_roles", current_user, admin_service.connection)
        if not can_manage_admin:
            raise HTTPException(status_code=403, detail="You don't have permission to modify administrators")
    return target_user

def validate_roles_assignment(requested_roles: List[str], can_manage_admin_roles: bool, existing_target_roles: List[str] = None):
    if not requested_roles:
        raise ValueError("User must have at least one role")
    if len(requested_roles) > 2:
        raise ValueError("User can have a maximum of 2 roles")
    
    user_roles_count = sum(1 for r in requested_roles if r in ["general_user", "pro_user", "max_user"])
    admin_roles_count = sum(1 for r in requested_roles if r in ["general_admin", "super_admin"])
    
    if user_roles_count > 1:
        raise ValueError("User can have a maximum of 1 user-level role")
    if admin_roles_count > 1:
        raise ValueError("User can have a maximum of 1 admin-level role")
    
    if not can_manage_admin_roles:
        existing_admin_roles = [r for r in (existing_target_roles or []) if r in ["general_admin", "super_admin"]]
        requested_admin_roles = [r for r in requested_roles if r in ["general_admin", "super_admin"]]
        if set(existing_admin_roles) != set(requested_admin_roles):
            raise ValueError("Only super_admin can assign or modify administrative roles")

@router.get("/dashboard")
def get_dashboard(admin_service: AdminService = Depends(get_admin_service)):
    return admin_service.get_dashboard_stats()

@router.get("/users")
def list_users(admin_service: AdminService = Depends(get_admin_service)):
    return admin_service.list_users()

@router.get("/users/{user_id}")
def get_user_details(user_id: int, admin_service: AdminService = Depends(get_admin_service)):
    try:
        return admin_service.get_user_details(user_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.patch("/users/{user_id}/roles")
def update_user_roles(user_id: int, payload: RoleUpdatePayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    # Check if user has any role assignment permission
    has_user_assign = can_use_feature("admin_assign_user_roles", current_user, admin_service.connection)
    has_admin_assign = can_use_feature("admin_assign_admin_roles", current_user, admin_service.connection)

    if not (has_user_assign or has_admin_assign):
        raise HTTPException(status_code=403, detail="You don't have permission to assign roles")

    try:
        target_user = check_admin_modification_clearance(user_id, admin_service, current_user)
        can_manage_admin = has_admin_assign
        validate_roles_assignment(payload.roles, can_manage_admin, target_user.get("roles", []))
        return admin_service.update_user_roles(
            current_user["id"],
            user_id,
            payload.roles,
            payload.plan_duration_days,
            payload.plan_start_date,
            payload.plan_end_date
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/users/{user_id}/toggle-status")
def toggle_user_status(user_id: int, payload: StatusUpdatePayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_suspend_user", current_user, admin_service.connection)
    try:
        check_admin_modification_clearance(user_id, admin_service, current_user)
        return admin_service.toggle_user_status(current_user["id"], user_id, payload.is_active)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/users/{user_id}/toggle-block")
def toggle_user_block(user_id: int, payload: BlockUpdatePayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_suspend_user", current_user, admin_service.connection) # Using same feature flag for now
    try:
        check_admin_modification_clearance(user_id, admin_service, current_user)
        return admin_service.toggle_user_block(current_user["id"], user_id, payload.is_blocked)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/users/{user_id}/revoke")
def revoke_tokens(user_id: int, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_revoke_user", current_user, admin_service.connection)
    try:
        check_admin_modification_clearance(user_id, admin_service, current_user)
        return admin_service.revoke_tokens(current_user["id"], user_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/invites")
def list_invite_codes(admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_invites", current_user, admin_service.connection)
    return admin_service.list_invite_codes()

@router.post("/invites")
def create_invite_code(payload: InviteCodePayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_invites", current_user, admin_service.connection)
    expires_at = None
    if payload.expiration_hours is not None:
        expires_at = (datetime.utcnow() + timedelta(hours=payload.expiration_hours)).isoformat()
    return admin_service.create_invite_code(current_user["id"], payload.max_uses, expires_at)

@router.delete("/invites/{code}")
def delete_invite_code(code: str, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_invites", current_user, admin_service.connection)
    try:
        admin_service.delete_invite_code(current_user["id"], code)
        return {"status": "success"}
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/invites/{code}/usages")
def get_invite_usages(code: str, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_invites", current_user, admin_service.connection)
    try:
        return admin_service.get_invite_usages(current_user["id"], code)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/users")
def create_user(payload: UserCreatePayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_create_user", current_user, admin_service.connection)

    # Validate password
    if not validate_password_strength(payload.password):
        raise HTTPException(
            status_code=400,
            detail="Password must be between 3 and 10 characters long."
        )

    requested_roles = payload.roles or ["general_user"]

    try:
        can_manage_admin = can_use_feature("admin_assign_admin_roles", current_user, admin_service.connection)
        validate_roles_assignment(requested_roles, can_manage_admin)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
                
    hashed_password = hash_password(payload.password)
    try:
        return admin_service.create_user(current_user["id"], payload.email, hashed_password, payload.display_name, requested_roles, payload.plan_duration)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/limits")
def list_role_limits(admin_service: AdminService = Depends(get_admin_service)):
    # All admins can view limits (read-only)
    return admin_service.list_role_limits()

@router.post("/limits/{role}/reset")
def reset_role_limits(role: str, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    if role.endswith('_admin'):
        require_feature("admin_manage_admin_roles", current_user, admin_service.connection)
    else:
        require_feature("admin_manage_user_roles", current_user, admin_service.connection)
    try:
        return admin_service.reset_role_limits(current_user["id"], role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/limits/{role}/{feature}")
def update_role_limit(role: str, feature: str, payload: LimitUpdatePayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    # Check appropriate permission based on role type
    if role.endswith('_admin'):
        require_feature("admin_manage_admin_roles", current_user, admin_service.connection)
    else:
        require_feature("admin_manage_user_roles", current_user, admin_service.connection)
    return admin_service.update_role_limit(current_user["id"], role, feature, payload.limit_count, payload.reset_period)

@router.get("/audit-logs")
def list_audit_logs(admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_view_audit_logs", current_user, admin_service.connection)
    return admin_service.list_audit_logs()

@router.get("/plan-requests")
def list_plan_requests(admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_plan_requests", current_user, admin_service.connection)
    return admin_service.list_plan_requests()

@router.post("/plan-requests/{request_id}/review")
def review_plan_request(request_id: int, payload: PlanRequestReviewPayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_plan_requests", current_user, admin_service.connection)
    try:
        return admin_service.resolve_plan_request(current_user["id"], request_id, payload.action)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/invite-requests")
def list_invite_requests(admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_invite_requests", current_user, admin_service.connection)
    return admin_service.list_invite_requests()

@router.post("/invite-requests/{request_id}/review")
def review_invite_request(request_id: int, payload: InviteRequestReviewPayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_invite_requests", current_user, admin_service.connection)
    try:
        return admin_service.resolve_invite_request(current_user["id"], request_id, payload.action)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

class SuspensionAppealReviewPayload(BaseModel):
    action: str

@router.get("/suspension-appeals")
def list_suspension_appeals(admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_suspension_appeals", current_user, admin_service.connection)
    return admin_service.list_suspension_appeals()

@router.post("/suspension-appeals/{appeal_id}/resolve")
def resolve_suspension_appeal(appeal_id: int, payload: SuspensionAppealReviewPayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_suspension_appeals", current_user, admin_service.connection)
    try:
        return admin_service.resolve_suspension_appeal(current_user["id"], appeal_id, payload.action)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/settings")
def list_app_settings(admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_settings", current_user, admin_service.connection)
    return admin_service.get_app_settings()

@router.patch("/settings/{key}")
def update_app_setting(key: str, payload: SettingUpdatePayload, admin_service: AdminService = Depends(get_admin_service), current_user: dict = Depends(get_current_user)):
    require_feature("admin_manage_settings", current_user, admin_service.connection)
    return admin_service.update_app_setting(current_user["id"], key, payload.value)
