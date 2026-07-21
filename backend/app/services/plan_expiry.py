"""Expired plan downgrade service (SCHOLARDOCX-0166).

Identifies users with expired plan dates (``plan_ends_at < NOW()``) and
transitions their user tier role to ``free_user``.

User tier roles: ``general_user``, ``pro_user``, ``max_user``, ``free_user``.
Admin roles: ``general_admin``, ``super_admin``.

STRICT CONSTRAINT:
Only user tier roles are modified. Admin roles are NEVER removed, demoted,
or altered when a user's plan expires.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.services.store import Store

logger = logging.getLogger(__name__)

PAID_USER_TIER_ROLES = {"general_user", "pro_user", "max_user"}
ALL_USER_TIER_ROLES = PAID_USER_TIER_ROLES | {"free_user"}


def downgrade_expired_user_plans(store: Store) -> int:
    """Downgrade users with expired plans to ``free_user``.

    Checks users where ``plan_ends_at`` is set and past current time.
    Replaces any paid tier role (``general_user``, ``pro_user``, ``max_user``)
    with ``free_user`` while preserving all admin roles (``general_admin``,
    ``super_admin``).

    Returns the total number of user records modified in the database.
    """
    conn = store.legacy_connection
    now_iso = datetime.now(timezone.utc).isoformat()

    rows = conn.execute(
        "SELECT id, roles, plan_ends_at FROM users "
        "WHERE plan_ends_at IS NOT NULL "
        "AND plan_ends_at < ?",
        (now_iso,),
    ).fetchall()

    if not rows:
        return 0

    downgraded_count = 0
    for r in rows:
        user_id = r["id"]
        roles_raw = r["roles"]

        try:
            roles_list = json.loads(roles_raw) if isinstance(roles_raw, str) else (roles_raw or [])
        except (json.JSONDecodeError, TypeError):
            roles_list = []

        has_paid_role = any(role in PAID_USER_TIER_ROLES for role in roles_list)
        if not has_paid_role:
            continue

        new_roles = [role for role in roles_list if role not in PAID_USER_TIER_ROLES]
        if "free_user" not in new_roles:
            new_roles.append("free_user")

        new_roles_json = json.dumps(new_roles)
        conn.execute(
            "UPDATE users SET roles = ? WHERE id = ?",
            (new_roles_json, user_id),
        )
        downgraded_count += 1

    if downgraded_count > 0:
        conn.commit()
        logger.info(f"downgrade_expired_user_plans: downgraded {downgraded_count} user(s) to free_user")

    return downgraded_count
