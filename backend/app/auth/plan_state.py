"""Effective plan state for a user — the single place plan expiry is applied.

SCHOLARDOCX-0204 (L6): this logic used to live only inside
``get_current_user``, which applies it to an in-memory dict and never persists
it. Background billing (``ai_tokens.load_user_dict``) read ``users.roles``
straight from the database, so an Advisor Atlas or Deep Hunt run resolved the
*expired* tier: it granted that tier's monthly allowance, and
``refresh_balance`` re-granted it on the next period rollover. A user whose plan
lapsed kept getting Pro credits for as long as they used background features.

Both paths now call ``apply_plan_expiry`` so they cannot drift again. The daily
cron (``scripts/downgrade_expired_users.py``, SCHOLARDOCX-0166) still persists
the downgrade; this is the guard for the window before it runs.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

USER_TIER_ROLES = ("max_user", "pro_user", "general_user", "free_user")


def _as_datetime(value) -> Optional[datetime]:
    """Parse the several shapes ``plan_ends_at`` arrives in.

    Postgres hands back a ``datetime``; the legacy SQLite path and JSON payloads
    hand back strings, with or without a ``Z``/offset suffix.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(
            str(value).replace("Z", "+00:00").split("+")[0]
        )
    except (ValueError, AttributeError, TypeError):
        return None


def plan_has_expired(plan_ends_at) -> bool:
    """True when ``plan_ends_at`` is in the past.

    Compared by date, not instant, so a plan is honoured through the whole of
    its final day. An unparseable or absent value is treated as not expired —
    the same lenient reading the auth path has always used, since a parse
    failure must not lock a paying user out of their plan.
    """
    end_dt = _as_datetime(plan_ends_at)
    if end_dt is None:
        return False
    return end_dt.date() < datetime.now(timezone.utc).date()


def apply_plan_expiry(roles: list, plan_ends_at) -> list:
    """Return ``roles`` with the paid tier replaced by ``free_user`` if expired.

    Admin roles are preserved — expiry downgrades the *plan*, not the account.
    Returns a new list; the input is not mutated.
    """
    if not plan_has_expired(plan_ends_at):
        return list(roles or [])
    remaining = [r for r in (roles or []) if r not in USER_TIER_ROLES]
    remaining.append("free_user")
    return remaining
