from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
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
        
    last_reset_utc = safe_parse_datetime(last_reset_at)
    if not last_reset_utc:
        return False
        
    now_utc = datetime.now(timezone.utc)
    
    if reset_period == 'daily':
        return last_reset_utc.date() < now_utc.date()
    elif reset_period == 'monthly':
        return (last_reset_utc.year, last_reset_utc.month) < (now_utc.year, now_utc.month)
    elif reset_period == 'per_session':
        # Handled explicitly by the frontend or specific endpoints
        return False
        
    return False

_role_limits_cache: dict[str, dict] = {}

def invalidate_limits_cache():
    global _role_limits_cache
    _role_limits_cache.clear()

def get_user_limit(user: dict, feature: str, session: Session) -> int:
    """Returns the limit_count for a given user and feature.

    Missing feature row → -1 (no cap), matching check_and_increment_limit's
    default-allow for undefined features. No user-tier role → 0 (blocked).
    """
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
    return limit_record["limit_count"] if limit_record else -1

def check_and_increment_limit(user: dict, feature: str, increment: int = 1, session: Optional[Session] = None):
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
            limit_row = session.execute(
                text("SELECT * FROM role_limits WHERE role = :role AND feature = :feature"),
                {"role": admin_role, "feature": feature}
            ).mappings().fetchone()
            if limit_row:
                limit_record = dict(limit_row)
                _role_limits_cache[cache_key] = limit_record
                
        if not limit_record or limit_record['limit_count'] == 0:
            raise UsageLimitExceeded(f"Permission denied for {feature}.")
        return True
        
    # Standard user-level limit check
    primary_role = get_primary_user_role(user)
    if not primary_role:
        raise UsageLimitExceeded("You must have a user-level role to use this feature.")

    # ── Plan date guard ─────────────────────────────────────────────────────
    # (Plan expiry is enforced by the auth-time role downgrade in
    # app/auth/dependencies.py; only the not-yet-started case is checked here.)
    now = datetime.now(timezone.utc)
    plan_started_at = user.get("plan_started_at")

    if plan_started_at:
        try:
            start_dt = safe_parse_datetime(plan_started_at)
            if start_dt is not None:
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
        limit_row = session.execute(
            text("SELECT * FROM role_limits WHERE role = :role AND feature = :feature"),
            {"role": primary_role, "feature": feature}
        ).mappings().fetchone()
        
        if limit_row:
            limit_record = dict(limit_row)
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
        last_reset_at = datetime.now(timezone.utc).isoformat()
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
            text("UPDATE user_usage_stats SET current_count = GREATEST(0, current_count + :inc) WHERE user_id = :uid AND feature = :feature"),
            {"inc": increment, "uid": user["id"], "feature": feature}
        )
    # Always commit, even for a permission-only check (increment=0): the
    # usage-row bootstrap INSERT and the reset UPDATE above are real writes
    # that must not stay open on the caller's session for the rest of the
    # request. Left open, they hold a transaction lock and can deadlock
    # against other connections writing concurrently.
    session.commit()

    return True


# Live-data queries for count-based usage features. total_records sums the
# rows inside each sheet page (rows_json arrays), matching the per-row
# increments applied by the create/update paths.
_USAGE_COUNT_QUERIES = {
    "total_projects": "SELECT COUNT(*) FROM projects WHERE user_id = :uid",
    "total_sheets": (
        "SELECT COUNT(ps.id) FROM project_sheets ps "
        "JOIN projects p ON ps.project_id = p.id WHERE p.user_id = :uid"
    ),
    "total_records": (
        # rows_json is TEXT holding a JSON array. Cast to jsonb so Postgres can
        # compute the array length. COALESCE handles NULL/empty values.
        "SELECT COALESCE(SUM(jsonb_array_length("
        "COALESCE(NULLIF(pp.rows_json, ''), '[]')::jsonb)), 0) "
        "FROM project_pages pp JOIN projects p ON pp.project_id = p.id "
        "WHERE p.user_id = :uid"
    ),
    "total_documents_bytes": (
        "SELECT COALESCE(SUM(size_bytes), 0) FROM static_files WHERE user_id = :uid"
    ),
    "total_sticky_notes": "SELECT COUNT(*) FROM sticky_notes WHERE user_id = :uid",
    "total_whiteboards": "SELECT COUNT(*) FROM whiteboards WHERE user_id = :uid",
}


def resync_usage_counts(user_id: str, session: Session, features=None) -> None:
    """Recompute count-based usage counters from live data.

    Deletes (and failed writes) would otherwise leave counters inflated until
    the next server restart, blocking users who freed up quota. Call after any
    operation that removes projects, sheets, rows, sticky notes, whiteboards,
    or files. Recounting is idempotent and self-healing, so it also corrects
    any historical drift.
    """
    for feature in (features or _USAGE_COUNT_QUERIES):
        query = _USAGE_COUNT_QUERIES.get(feature)
        if not query:
            continue
        try:
            count = session.execute(text(query), {"uid": user_id}).scalar() or 0
        except Exception:
            # A malformed rows_json must not break the delete that triggered
            # the resync; the stale counter is corrected on the next sync.
            continue
        session.execute(
            text(
                "INSERT INTO user_usage_stats (user_id, feature, current_count, last_reset_at) "
                "VALUES (:uid, :feature, :count, CURRENT_TIMESTAMP) "
                "ON CONFLICT(user_id, feature) "
                "DO UPDATE SET current_count = excluded.current_count"
            ),
            {"uid": user_id, "feature": feature, "count": int(count)},
        )
    session.commit()


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
