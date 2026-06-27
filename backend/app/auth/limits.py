from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

class UsageLimitExceeded(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=403, detail=detail)

def get_primary_user_role(user: dict) -> Optional[str]:
    roles = user.get("roles", [])
    if "max_user" in roles:
        return "max_user"
    if "pro_user" in roles:
        return "pro_user"
    if "general_user" in roles:
        return "general_user"
    if "free_user" in roles:
        return "free_user"
    return None

def should_reset(last_reset_at: str, reset_period: str) -> bool:
    if reset_period == 'never':
        return False
        
    last_reset_str = last_reset_at.replace("Z", "+00:00").split("+")[0]
    try:
        last_reset_utc_naive = datetime.fromisoformat(last_reset_str)
    except ValueError:
        return False
        
    last_reset_utc = last_reset_utc_naive.replace(tzinfo=timezone.utc)
    now_utc = datetime.now(timezone.utc)
    
    last_reset_local = last_reset_utc.astimezone()
    now_local = now_utc.astimezone()
    
    if reset_period == 'daily':
        return last_reset_local.date() < now_local.date()
    elif reset_period == 'monthly':
        return (last_reset_local.year, last_reset_local.month) < (now_local.year, now_local.month)
    elif reset_period == 'per_session':
        # Handled explicitly by the frontend or specific endpoints
        return False
        
    return False

_role_limits_cache = {}

def invalidate_limits_cache():
    global _role_limits_cache
    _role_limits_cache.clear()

def get_user_limit(user: dict, feature: str, session: Session) -> int:
    """Returns the limit_count for a given user and feature, or -1 if unlimited/not found."""
    primary_role = get_primary_user_role(user)
    if not primary_role:
        return 0
        
    cache_key = f"{primary_role}:{feature}"
    limit_record = _role_limits_cache.get(cache_key)
    
    if not limit_record:
        limit_record = session.execute(
            text("SELECT * FROM role_limits WHERE role = :role AND feature = :feature"),
            {"role": primary_role, "feature": feature}
        ).mappings().fetchone()
        
        if limit_record:
            limit_record = dict(limit_record)
            _role_limits_cache[cache_key] = limit_record
    return limit_record["limit_count"] if limit_record else 0

def check_and_increment_limit(user: dict, feature: str, increment: int = 1, session: Session = None):
    if session is None:
        raise ValueError("Database session required for limit checks")
        
    roles = user.get("roles", [])
    
    if feature.startswith("admin_"):
        if "super_admin" not in roles and "general_admin" not in roles:
            raise UsageLimitExceeded("Admin access required for this action.")
            
        admin_role = "super_admin" if "super_admin" in roles else "general_admin"
        cache_key = f"{admin_role}:{feature}"
        limit_record = _role_limits_cache.get(cache_key)
        
        if not limit_record:
            limit_record = session.execute(
                text("SELECT * FROM role_limits WHERE role = :role AND feature = :feature"),
                {"role": admin_role, "feature": feature}
            ).mappings().fetchone()
            if limit_record:
                limit_record = dict(limit_record)
                _role_limits_cache[cache_key] = limit_record
                
        if not limit_record or limit_record['limit_count'] == 0:
            raise UsageLimitExceeded(f"Permission denied for {feature}.")
        return True
        
    # Standard user-level limit check
    primary_role = get_primary_user_role(user)
    if not primary_role:
        raise UsageLimitExceeded("You must have a user-level role to use this feature.")

    # ── Plan date guard ─────────────────────────────────────────────────────
    now = datetime.utcnow()
    plan_started_at = user.get("plan_started_at")
    plan_ends_at = user.get("plan_ends_at")


    if plan_started_at:
        try:
            start_dt = datetime.fromisoformat(plan_started_at.replace("Z", "+00:00").split("+")[0])
            if start_dt.date() > now.date():
                raise UsageLimitExceeded(
                    "Your plan has not started yet. Access will be available from "
                    + start_dt.strftime("%d %b %Y") + "."
                )
        except (ValueError, AttributeError):
            pass
    # ────────────────────────────────────────────────────────────────────────

    
    # Get role limit from cache or DB
    cache_key = f"{primary_role}:{feature}"
    limit_record = _role_limits_cache.get(cache_key)
    
    if not limit_record:
        limit_record = session.execute(
            text("SELECT * FROM role_limits WHERE role = :role AND feature = :feature"),
            {"role": primary_role, "feature": feature}
        ).mappings().fetchone()
        
        if limit_record:
            limit_record = dict(limit_record)
            _role_limits_cache[cache_key] = limit_record
    
    if not limit_record:
        return True # Default to allow if no limit defined
        
    # Get user usage
    usage_record = session.execute(
        text("SELECT * FROM user_usage_stats WHERE user_id = :uid AND feature = :feature"),
        {"uid": user["id"], "feature": feature}
    ).mappings().fetchone()
    
    if not usage_record:
        # Initialize usage stat
        session.execute(
            text("""
            INSERT INTO user_usage_stats (user_id, feature, current_count, last_reset_at)
            VALUES (:uid, :feature, 0, CURRENT_TIMESTAMP)
            """), {"uid": user["id"], "feature": feature}
        )
        current_count = 0
        last_reset_at = datetime.utcnow().isoformat()
    else:
        current_count = usage_record["current_count"]
        last_reset_at = usage_record["last_reset_at"]
        
    # Check for reset
    if should_reset(last_reset_at, limit_record["reset_period"]):
        current_count = 0
        session.execute(
            text("UPDATE user_usage_stats SET current_count = 0, last_reset_at = CURRENT_TIMESTAMP WHERE user_id = :uid AND feature = :feature"),
            {"uid": user["id"], "feature": feature}
        )
        
    # Check limit
    limit_count = limit_record["limit_count"]
    if limit_count != -1:
        if limit_count == 0 and increment >= 0:
            raise UsageLimitExceeded(f"Permission denied. Your user role does not have access to {feature.replace('can_use_', '').upper()} models.")
        elif (current_count + increment) > limit_count:
            raise UsageLimitExceeded(f"Limit exceeded for {feature}. Your plan allows {limit_count}.")
        
    # Increment usage
    if increment != 0:
        session.execute(
            text("UPDATE user_usage_stats SET current_count = MAX(0, current_count + :inc) WHERE user_id = :uid AND feature = :feature"),
            {"inc": increment, "uid": user["id"], "feature": feature}
        )
        session.commit()

    return True


# User-tier plan metadata. Used to describe which plans include an
# admin-configurable capability, so dynamic upgrade messaging never hardcodes
# plan names that an admin can change from the Role Limits editor.
PLAN_TIER_ORDER = ("free_user", "general_user", "pro_user", "max_user")
PLAN_DISPLAY_NAMES = {
    "free_user": "Free",
    "general_user": "General",
    "pro_user": "Pro",
    "max_user": "Max",
}


def plans_with_feature_enabled(feature: str, session) -> list:
    """Display names of user-tier plans where ``feature`` is enabled
    (limit_count != 0), in tier order. Powers dynamic upgrade messaging."""
    rows = session.execute(
        text("SELECT role FROM role_limits WHERE feature = :feature AND limit_count != 0"),
        {"feature": feature},
    ).fetchall()
    enabled = {row[0] for row in rows}
    return [PLAN_DISPLAY_NAMES[role] for role in PLAN_TIER_ORDER if role in enabled]


def feature_plan_phrase(feature: str, session) -> str:
    """A ready-to-render phrase such as 'the Pro and Max plans' for the plans
    that have ``feature`` enabled, or 'a higher plan' when none do."""
    eligible = plans_with_feature_enabled(feature, session)
    if not eligible:
        return "a higher plan"
    if len(eligible) == 1:
        return f"the {eligible[0]} plan"
    if len(eligible) == 2:
        return f"the {eligible[0]} and {eligible[1]} plans"
    return f"the {', '.join(eligible[:-1])}, and {eligible[-1]} plans"
