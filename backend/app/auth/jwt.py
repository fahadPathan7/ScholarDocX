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
