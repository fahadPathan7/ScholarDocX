import time
import uuid
from typing import Any, Dict

import jwt

JWT_ALGORITHM = "HS256"

def create_token(user: Dict[str, Any], secret_key: str, expiration_days: int) -> str:
    """Generate JWT token for a user"""
    now = int(time.time())
    payload = {
        "user_id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "roles": user.get("roles", ["general_user"]),
        "is_active": user.get("is_active", 1),
        "token_version": user.get("token_version", 1),
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + (expiration_days * 24 * 3600),
    }
    return jwt.encode(payload, secret_key, algorithm=JWT_ALGORITHM)


def decode_token(token: str, secret_key: str) -> Dict[str, Any]:
    """Decode and validate JWT token"""
    try:
        payload = jwt.decode(token, secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Invalid token: {str(e)}")

    try:
        payload["user_id"] = str(uuid.UUID(str(payload["user_id"])))
    except (KeyError, TypeError, ValueError):
        raise ValueError("Invalid token identity")
    return payload


def verify_token_version(token_payload: Dict[str, Any], user: Dict[str, Any]) -> bool:
    """Check if token version matches the user's current token version"""
    return token_payload.get("token_version") == user.get("token_version")


# SCHOLARDOCX-0222: short-lived, file-scoped download tokens. The frontend
# exchanges one for the actual file URL so the 30-day session token stops
# appearing in address bars, browser history, and server access logs.
DOWNLOAD_TOKEN_PURPOSE = "file_download"


def create_download_token(user_id: str, secret_key: str, file_id: str, ttl_minutes: int = 5) -> str:
    """Generate a short-lived token authorizing ONE file download for ONE user."""
    now = int(time.time())
    payload = {
        "purpose": DOWNLOAD_TOKEN_PURPOSE,
        "user_id": str(user_id),
        "file_id": str(file_id),
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + (ttl_minutes * 60),
    }
    return jwt.encode(payload, secret_key, algorithm=JWT_ALGORITHM)


def decode_download_token(token: str, secret_key: str) -> Dict[str, Any]:
    """Decode and validate a file-download token. Raises ValueError.

    Deliberately does NOT accept ordinary session tokens: the purpose claim
    must match, so a session token can never be replayed as a download token
    (and vice versa).
    """
    try:
        payload = jwt.decode(token, secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Invalid token: {str(e)}")

    if payload.get("purpose") != DOWNLOAD_TOKEN_PURPOSE or not payload.get("file_id"):
        raise ValueError("Invalid token")
    try:
        payload["user_id"] = str(uuid.UUID(str(payload["user_id"])))
    except (KeyError, TypeError, ValueError):
        raise ValueError("Invalid token identity")
    return payload
