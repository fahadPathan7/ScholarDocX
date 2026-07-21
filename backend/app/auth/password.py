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
    """Boolean wrapper around validate_password_with_reason.

    Kept for backward compatibility with code/tests that only need to know
    whether the password is acceptable. New callers should use
    validate_password_with_reason directly so they can surface the specific
    failure reason to the user.
    """
    ok, _ = validate_password_with_reason(password)
    return ok


def validate_password_with_reason(password: str) -> tuple[bool, str | None]:
    """Validate password complexity, returning (ok, reason).

    Reason is None on success, or a short human-readable string explaining
    the first failing rule on failure. Callers should surface this string
    verbatim in error messages — it is the single source of truth for what
    the password policy actually requires, so the rule and the message can
    never drift apart.

    Policy (checked in this order; first failure wins):
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character from !@#$%^&*
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not any(c.isupper() for c in password):
        return False, "Password must include at least one uppercase letter."
    if not any(c.islower() for c in password):
        return False, "Password must include at least one lowercase letter."
    if not any(c.isdigit() for c in password):
        return False, "Password must include at least one digit."
    if not any(c in "!@#$%^&*" for c in password):
        return False, "Password must include at least one special character (!@#$%^&*)."
    return True, None
