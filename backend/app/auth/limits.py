from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException
from app.db.connection import connect

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
    return None

def should_reset(last_reset_at: str, reset_period: str) -> bool:
    if reset_period == 'never':
        return False
        
    last_reset = datetime.fromisoformat(last_reset_at)
    now = datetime.utcnow()
    
    if reset_period == 'daily':
        return last_reset.date() < now.date()
    elif reset_period == 'monthly':
        return last_reset.year < now.year or last_reset.month < now.month
    elif reset_period == 'per_session':
        # Handled explicitly by the frontend or specific endpoints
        return False
        
    return False

_role_limits_cache = {}

def invalidate_limits_cache():
    global _role_limits_cache
    _role_limits_cache.clear()

def get_user_limit(user: dict, feature: str, connection) -> int:
    """Returns the limit_count for a given user and feature, or -1 if unlimited/not found."""
    primary_role = get_primary_user_role(user)
    if not primary_role:
        return -1
        
    cache_key = f"{primary_role}:{feature}"
    limit_record = _role_limits_cache.get(cache_key)
    
    if not limit_record:
        limit_record = connection.execute(
            "SELECT * FROM role_limits WHERE role = ? AND feature = ?",
            (primary_role, feature)
        ).fetchone()
        
        if limit_record:
            limit_record = dict(limit_record)
            _role_limits_cache[cache_key] = limit_record
            
    return limit_record["limit_count"] if limit_record else -1

def check_and_increment_limit(user: dict, feature: str, increment: int = 1, connection=None):
    if connection is None:
        raise ValueError("Database connection required for limit checks")
        
    roles = user.get("roles", [])
    
    if feature.startswith("admin_"):
        if "super_admin" not in roles and "general_admin" not in roles:
            raise UsageLimitExceeded("Admin access required for this action.")
            
        admin_role = "super_admin" if "super_admin" in roles else "general_admin"
        cache_key = f"{admin_role}:{feature}"
        limit_record = _role_limits_cache.get(cache_key)
        
        if not limit_record:
            limit_record = connection.execute(
                "SELECT * FROM role_limits WHERE role = ? AND feature = ?",
                (admin_role, feature)
            ).fetchone()
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
    
    # Get role limit from cache or DB
    cache_key = f"{primary_role}:{feature}"
    limit_record = _role_limits_cache.get(cache_key)
    
    if not limit_record:
        limit_record = connection.execute(
            "SELECT * FROM role_limits WHERE role = ? AND feature = ?",
            (primary_role, feature)
        ).fetchone()
        
        if limit_record:
            limit_record = dict(limit_record)
            _role_limits_cache[cache_key] = limit_record
    
    if not limit_record:
        return True # Default to allow if no limit defined
        
    # Get user usage
    usage_record = connection.execute(
        "SELECT * FROM user_usage_stats WHERE user_id = ? AND feature = ?",
        (user["id"], feature)
    ).fetchone()
    
    if not usage_record:
        # Initialize usage stat
        connection.execute(
            """
            INSERT INTO user_usage_stats (user_id, feature, current_count, last_reset_at)
            VALUES (?, ?, 0, CURRENT_TIMESTAMP)
            """, (user["id"], feature)
        )
        current_count = 0
        last_reset_at = datetime.utcnow().isoformat()
    else:
        current_count = usage_record["current_count"]
        last_reset_at = usage_record["last_reset_at"]
        
    # Check for reset
    if should_reset(last_reset_at, limit_record["reset_period"]):
        current_count = 0
        connection.execute(
            "UPDATE user_usage_stats SET current_count = 0, last_reset_at = CURRENT_TIMESTAMP WHERE user_id = ? AND feature = ?",
            (user["id"], feature)
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
        connection.execute(
            "UPDATE user_usage_stats SET current_count = MAX(0, current_count + ?) WHERE user_id = ? AND feature = ?",
            (increment, user["id"], feature)
        )
        connection.commit()
        
    return True
