import re
import secrets
import string

import bcrypt


def hash_password(password: str) -> str:
    """Hash password with bcrypt (cost factor 12)"""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash"""
    return bcrypt.checkpw(
        password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def generate_random_password(length: int = 16) -> str:
    """Generate secure random password meeting complexity rules"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
            and any(c in "!@#$%^&*" for c in password)
        ):
            return password


def validate_password_strength(password: str) -> bool:
    """
    Check password complexity:
    - Minimum 3 characters
    - Maximum 10 characters
    """
    if len(password) < 3 or len(password) > 10:
        return False
    return True
