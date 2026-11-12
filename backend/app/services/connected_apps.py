"""Connected apps: access keys and suggestions (SCHOLARDOCX-0258).

Pure data/rules layer over a SQLAlchemy session. The MCP endpoint
(``mcp_server.py``) and the management API (``api/connected_apps.py``) both
call it. No provider call is made anywhere in this module, so there is nothing
to bill (see technical/billing-contract.md).
"""
from __future__ import annotations

import hashlib
import json
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text

from app.auth.limits import check_and_increment_limit
from app.auth.plan_state import apply_plan_expiry
from app.core.notifications import is_notification_enabled

logger = logging.getLogger(__name__)

NOTIFICATION_PREFERENCE_KEY = "connected_app_activity"
KEY_PREFIX = "sdx_"
MCP_LIMIT_FEATURE = "can_use_mcp"
# read: look only. read_suggest: also queue suggestions the user confirms.
# read_write: also apply the same allow-listed changes directly (user opted in).
SCOPES = ("read", "read_suggest", "read_write")
EXPIRY_CHOICES_DAYS = (30, 90, 365)
DEFAULT_EXPIRY_DAYS = 90

# Fixed caps (CODE_RULES capped-list rule): hardcoded, shown in the admin Info tab.
MAX_ACTIVE_APPS = 5                # curated collection: rejected at the cap, never evicted
MAX_PENDING_SUGGESTIONS = 20       # a queue the user must review: rejected at the cap
MAX_DECIDED_HISTORY = 50           # bounded history: newest evicts oldest
MAX_SUGGESTION_ACTIONS = 20
MAX_SUMMARY_CHARS = 200
SUGGESTION_TTL_DAYS = 7
LAST_USED_WRITE_INTERVAL = timedelta(seconds=60)

# Non-destructive workspace writes only. Every delete_*, clear_sheet,
# bulk_update_rows and all record-domain writes are intentionally absent.
ALLOWED_SUGGEST_ACTIONS = frozenset({
    "create_project", "create_sheet", "add_rows", "create_sticky_note",
    "update_project", "update_sheet", "update_row", "rename_project",
    "rename_sheet", "update_sticky_note",
    "add_column", "add_group", "pin_project", "pin_sheet", "unpin_project",
    "unpin_sheet", "add_to_dashboard", "remove_from_dashboard", "duplicate_sheet",
})


class ConnectedAppError(Exception):
    """A rule violation with the HTTP status the API should answer with."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@dataclass
class Principal:
    user: dict
    app_id: str
    app_name: str
    scope: str


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_key() -> tuple[str, str, str]:
    """Return (raw key, display prefix, SHA-256 hash). The raw key is never stored."""
    raw = KEY_PREFIX + secrets.token_urlsafe(32)
    return raw, raw[:12], hash_key(raw)


def _iso(value: Any) -> str | None:
    value = _aware(value)
    return value.isoformat() if value else None


def _app_view(row: Any) -> dict[str, Any]:
    expires_at = _aware(row["expires_at"])
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "scope": row["scope"],
        "key_prefix": row["key_prefix"],
        "created_at": _iso(row["created_at"]),
        "expires_at": _iso(expires_at),
        "last_used_at": _iso(row["last_used_at"]),
        "expired": bool(expires_at and expires_at <= utcnow()),
    }


# --------------------------------------------------------------------------
# Access keys
# --------------------------------------------------------------------------

def create_app(session, user: dict, name: str, scope: str, expires_in_days: int) -> tuple[dict, str]:
    name = (name or "").strip()
    if not 1 <= len(name) <= 60:
        raise ConnectedAppError(400, "Give the app a name of up to 60 characters.")
    if scope not in SCOPES:
        raise ConnectedAppError(400, "Choose what the app may do.")
    if expires_in_days not in EXPIRY_CHOICES_DAYS:
        raise ConnectedAppError(400, "Choose 30, 90 or 365 days.")
    now = utcnow()
    active = session.execute(
        text("SELECT count(*) FROM connected_apps WHERE user_id = :u AND expires_at > :now"),
        {"u": user["id"], "now": now},
    ).scalar_one()
    if active >= MAX_ACTIVE_APPS:
        raise ConnectedAppError(409, f"You can connect up to {MAX_ACTIVE_APPS} apps. Remove one first.")
    raw, prefix, key_hash = generate_key()
    app_id = str(uuid.uuid4())
    session.execute(
        text(
            "INSERT INTO connected_apps (id, user_id, name, key_prefix, key_hash, scope, token_version, expires_at) "
            "VALUES (:id, :u, :name, :prefix, :hash, :scope, :tv, :exp)"
        ),
        {
            "id": app_id, "u": user["id"], "name": name, "prefix": prefix, "hash": key_hash,
            "scope": scope, "tv": user.get("token_version") or 1,
            "exp": now + timedelta(days=expires_in_days),
        },
    )
    session.commit()
    row = session.execute(text("SELECT * FROM connected_apps WHERE id = :id"), {"id": app_id}).mappings().one()
    return _app_view(row), raw


def list_apps(session, user_id: str) -> list[dict]:
    rows = session.execute(
        text("SELECT * FROM connected_apps WHERE user_id = :u ORDER BY created_at DESC"), {"u": user_id}
    ).mappings().all()
    return [_app_view(r) for r in rows]


def delete_app(session, user_id: str, app_id: str) -> bool:
    """Revoke = delete. The key stops working on the very next request."""
    result = session.execute(
        text("DELETE FROM connected_apps WHERE id = :id AND user_id = :u"), {"id": app_id, "u": user_id}
    )
    session.commit()
    return result.rowcount > 0


class AuthFailure(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def authenticate_key(session, raw_key: str) -> Principal:
    """Resolve an access key to its owner, applying the same rules as a session.

    401 for unknown/expired/revoked keys, 403 for a suspended user or a role
    without ``can_use_mcp`` (mirrors ``get_current_user``).
    """
    if not raw_key.startswith(KEY_PREFIX):
        raise AuthFailure(401, "Invalid access key.")
    row = session.execute(
        text("SELECT * FROM connected_apps WHERE key_hash = :h"), {"h": hash_key(raw_key)}
    ).mappings().fetchone()
    if not row:
        raise AuthFailure(401, "Invalid access key.")
    now = utcnow()
    if _aware(row["expires_at"]) <= now:
        raise AuthFailure(401, "Access key has expired.")
    urow = session.execute(text("SELECT * FROM users WHERE id = :id"), {"id": row["user_id"]}).mappings().fetchone()
    if not urow:
        raise AuthFailure(401, "Invalid access key.")
    if not urow["is_active"]:
        raise AuthFailure(403, "user_suspended")
    user = dict(urow)
    if user.get("token_version") != row["token_version"]:
        raise AuthFailure(401, "Access key has been revoked.")
    user["roles"] = apply_plan_expiry(json.loads(user["roles"]), user.get("plan_ends_at"))
    try:
        check_and_increment_limit(user, MCP_LIMIT_FEATURE, 0, session)
    except HTTPException:
        raise AuthFailure(403, "Connected apps are not included in your plan.")
    last = _aware(row["last_used_at"])
    if last is None or now - last > LAST_USED_WRITE_INTERVAL:
        session.execute(
            text("UPDATE connected_apps SET last_used_at = :now WHERE id = :id"), {"now": now, "id": row["id"]}
        )
        session.commit()
    return Principal(user=user, app_id=str(row["id"]), app_name=row["name"], scope=row["scope"])


# --------------------------------------------------------------------------
# Suggestions
# --------------------------------------------------------------------------

def _expire_stale(session, user_id: str) -> None:
    session.execute(
        text(
            "UPDATE connected_app_suggestions SET status = 'expired', decided_at = :now "
            "WHERE user_id = :u AND status = 'pending' AND expires_at <= :now"
        ),
        {"u": user_id, "now": utcnow()},
    )


def create_suggestion(session, principal: Principal, summary: str, plan: dict, *, enforce_pending_cap: bool = True) -> dict:
    user_id = principal.user["id"]
    _expire_stale(session, user_id)
    pending = session.execute(
        text("SELECT count(*) FROM connected_app_suggestions WHERE user_id = :u AND status = 'pending'"),
        {"u": user_id},
    ).scalar_one()
    if enforce_pending_cap and pending >= MAX_PENDING_SUGGESTIONS:
        raise ConnectedAppError(
            409, f"{MAX_PENDING_SUGGESTIONS} suggestions are already waiting for the user. Ask them to review those first."
        )
    now = utcnow()
    sid = str(uuid.uuid4())
    session.execute(
        text(
            "INSERT INTO connected_app_suggestions (id, user_id, connected_app_id, summary, plan_json, status, expires_at) "
            "VALUES (:id, :u, :app, :summary, :plan, 'pending', :exp)"
        ),
        {
            "id": sid, "u": user_id, "app": principal.app_id, "summary": summary[:MAX_SUMMARY_CHARS],
            "plan": json.dumps(plan), "exp": now + timedelta(days=SUGGESTION_TTL_DAYS),
        },
    )
    # Bounded history: newest evicts oldest among decided suggestions.
    session.execute(
        text(
            "DELETE FROM connected_app_suggestions WHERE id IN ("
            "SELECT id FROM connected_app_suggestions WHERE user_id = :u AND status <> 'pending' "
            "ORDER BY created_at DESC OFFSET :keep)"
        ),
        {"u": user_id, "keep": MAX_DECIDED_HISTORY},
    )
    session.commit()
    if not plan.get("auto_applied"):
        _notify_user(
            session, user_id,
            f"{principal.app_name} suggested a change",
            f"{summary[:MAX_SUMMARY_CHARS] or 'Review the suggested change.'} Open Profile, then Review suggested changes, to approve or dismiss it.",
        )
    return {"id": sid, "expires_at": _iso(now + timedelta(days=SUGGESTION_TTL_DAYS))}


def apply_directly(session, service, principal: Principal, summary: str, plan: dict) -> dict:
    """``read_write`` keys: run an allow-listed plan now, without a human click.

    Same executor, same allow-list, same role limits as a confirmed suggestion.
    The change is still recorded as a suggestion (marked ``auto_applied``) so it
    is traceable, and a failure is recorded as ``failed`` like a confirmed one.
    """
    created = create_suggestion(
        session, principal, summary, {**plan, "auto_applied": True}, enforce_pending_cap=False
    )
    result = confirm_suggestion(session, service, principal.user, created["id"])
    _notify_user(
        session, principal.user["id"],
        f"{principal.app_name} made a change",
        f"{summary[:MAX_SUMMARY_CHARS] or 'A connected app changed your workspace.'} It was applied directly, as you allowed for this app.",
    )
    return result


def _notify_user(session, user_id: str, title: str, body: str) -> None:
    """Add a notification unless the user switched this category off (default on).

    Best-effort: a notification problem must never fail the suggestion or the
    direct change that triggered it.
    """
    try:
        row = session.execute(
            text("SELECT notification_settings FROM local_profiles WHERE user_id = :u"), {"u": user_id}
        ).fetchone()
        if not is_notification_enabled(row[0] if row else None, NOTIFICATION_PREFERENCE_KEY):
            return
        session.execute(
            text(
                "INSERT INTO notifications (user_id, title, body, notification_type, preference_key) "
                "VALUES (:u, :t, :b, 'general', :k)"
            ),
            {"u": user_id, "t": title[:200], "b": body[:500], "k": NOTIFICATION_PREFERENCE_KEY},
        )
        session.commit()
    except Exception:  # noqa: BLE001 - best effort by design
        session.rollback()
        logger.warning("connected-app notification could not be created")


def _suggestion_view(row: Any) -> dict[str, Any]:
    plan = json.loads(row["plan_json"])
    return {
        "id": str(row["id"]),
        "app_name": row["app_name"] or "Removed app",
        "summary": row["summary"],
        "actions": plan.get("summary") or [],
        "status": row["status"],
        "created_at": _iso(row["created_at"]),
        "expires_at": _iso(row["expires_at"]),
        "result_message": row["result_message"],
    }


def list_suggestions(session, user_id: str, status: str | None = None) -> list[dict]:
    _expire_stale(session, user_id)
    session.commit()
    sql = (
        "SELECT s.*, a.name AS app_name FROM connected_app_suggestions s "
        "LEFT JOIN connected_apps a ON a.id = s.connected_app_id WHERE s.user_id = :u"
    )
    params: dict[str, Any] = {"u": user_id}
    if status:
        sql += " AND s.status = :status"
        params["status"] = status
    rows = session.execute(text(sql + " ORDER BY s.created_at DESC LIMIT 100"), params).mappings().all()
    return [_suggestion_view(r) for r in rows]


def dismiss_suggestion(session, user_id: str, suggestion_id: str) -> None:
    result = session.execute(
        text(
            "UPDATE connected_app_suggestions SET status = 'dismissed', decided_at = :now "
            "WHERE id = :id AND user_id = :u AND status = 'pending'"
        ),
        {"id": suggestion_id, "u": user_id, "now": utcnow()},
    )
    session.commit()
    if result.rowcount == 0:
        raise ConnectedAppError(409, "This suggestion was already handled or has expired.")


def confirm_suggestion(session, service, user: dict, suggestion_id: str) -> dict:
    """Run a stored suggestion with the signed-in user's own role limits.

    ``service`` is an ``AiActionService`` for this user/session. The status
    change is one atomic UPDATE, so a double click executes the plan once.
    """
    now = utcnow()
    claimed = session.execute(
        text(
            "UPDATE connected_app_suggestions SET status = 'running' "
            "WHERE id = :id AND user_id = :u AND status = 'pending' AND expires_at > :now "
            "RETURNING plan_json"
        ),
        {"id": suggestion_id, "u": user["id"], "now": now},
    ).fetchone()
    session.commit()
    if claimed is None:
        raise ConnectedAppError(409, "This suggestion was already handled or has expired.")
    plan = json.loads(claimed[0])
    try:
        result = service.execute(plan, user=user, session=session)
    except (LookupError, ValueError, HTTPException) as exc:
        message = exc.detail if isinstance(exc, HTTPException) else str(exc)
        session.rollback()
        _finish(session, suggestion_id, "failed", str(message))
        raise ConnectedAppError(400, str(message) or "Those changes could not be made.")
    message = str(result.get("message") or "Done.")
    _finish(session, suggestion_id, "confirmed", message)
    return {"status": "confirmed", "message": message}


def _finish(session, suggestion_id: str, status: str, message: str) -> None:
    session.execute(
        text(
            "UPDATE connected_app_suggestions SET status = :status, decided_at = :now, result_message = :msg "
            "WHERE id = :id"
        ),
        {"status": status, "now": utcnow(), "msg": message[:500], "id": suggestion_id},
    )
    session.commit()
