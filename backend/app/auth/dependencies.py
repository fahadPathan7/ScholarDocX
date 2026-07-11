import json
from fastapi import Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.auth.jwt import decode_token, verify_token_version
from app.db.connection import connect, COMPROMISED_JWT_SECRET_PREFIX
from app.core.config import Settings, get_settings
from app.api.dependencies import get_store
from app.services.store import Store

security = HTTPBearer(auto_error=False)

def get_jwt_secret(connection) -> str:
    """Return the per-install JWT signing secret.

    Raises 500 if the secret is missing or still set to a known-compromised
    placeholder. The secret is always provisioned at startup by
    initialize_database(), so hitting this error indicates a misconfigured or
    not-yet-initialized database rather than a fallback path.
    """
    row = connection.execute(
        "SELECT value FROM app_settings WHERE key = 'jwt_secret_key'"
    ).fetchone()
    value = row["value"] if row else None
    if not value or str(value).startswith(COMPROMISED_JWT_SECRET_PREFIX):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT signing secret is not configured. Restart the server to initialize it.",
        )
    return value

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    token: str = Query(None),
    store: Store = Depends(get_store)
):
    token_str = None
    if credentials:
        token_str = credentials.credentials
    elif token:
        token_str = token

    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(token_str, get_jwt_secret(store.connection))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = store.connection.execute(
        "SELECT * FROM users WHERE id = ?", (payload["user_id"],)
    ).fetchone()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="user_suspended"
        )
        
    user_dict = dict(user)
    if not verify_token_version(payload, user_dict):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user_dict["roles"] = json.loads(user_dict["roles"])
    
    # Check plan expiration and fallback to free_user dynamically
    plan_ends_at = user_dict.get("plan_ends_at")
    if plan_ends_at:
        try:
            from datetime import datetime, timezone
            end_dt = datetime.fromisoformat(plan_ends_at.replace("Z", "+00:00").split("+")[0])
            if end_dt.date() < datetime.utcnow().date():
                user_roles = user_dict["roles"]
                user_roles = [r for r in user_roles if r not in ["max_user", "pro_user", "general_user"]]
                if "free_user" not in user_roles:
                    user_roles.append("free_user")
                user_dict["roles"] = user_roles
        except (ValueError, AttributeError):
            pass
            
    return user_dict

def require_role(allowed_roles: list[str]):
    def role_checker(current_user: dict = Depends(get_current_user)):
        user_roles = current_user.get("roles", [])
        has_role = any(role in user_roles for role in allowed_roles)
        if not has_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have the required role to perform this action."
            )
        return current_user
    return role_checker

def require_admin(current_user: dict = Depends(get_current_user)):
    user_roles = current_user.get("roles", [])
    if "super_admin" in user_roles or "general_admin" in user_roles:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Administrator access required."
    )

def require_super_admin(current_user: dict = Depends(get_current_user)):
    user_roles = current_user.get("roles", [])
    if "super_admin" in user_roles:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Super administrator access required."
    )

def get_user_store(
    store: Store = Depends(get_store),
    current_user: dict = Depends(get_current_user)
) -> Store:
    store.current_user_id = current_user["id"]
    return store

