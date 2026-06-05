import json
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.auth.jwt import decode_token, verify_token_version
from app.db.connection import connect
from app.core.config import Settings, get_settings
from app.api.dependencies import get_store
from app.services.store import Store

security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    store: Store = Depends(get_store)
):
    token = credentials.credentials
    try:
        secret_key_row = store.connection.execute("SELECT value FROM app_settings WHERE key = 'jwt_secret_key'").fetchone()
        secret_key = secret_key_row["value"] if secret_key_row else "scholar-dock-local-first-secret-key-do-not-use-in-cloud"
        payload = decode_token(token, secret_key)
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
            detail="Account is deactivated"
        )
        
    user_dict = dict(user)
    if not verify_token_version(payload, user_dict):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    user_dict["roles"] = json.loads(user_dict["roles"])
    return user_dict

def require_role(allowed_roles: list[str]):
    def role_checker(current_user: dict = Depends(get_current_user)):
        user_roles = current_user.get("roles", [])
        if "super_admin" in user_roles:
            return current_user
        
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

