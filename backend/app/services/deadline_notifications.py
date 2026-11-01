"""Deadline notification scan for saved scholarship opportunities (SCHOLARDOCX-0219).

Server-side companion to the client-side "deadline radar" in
``OpportunityLibrary.tsx``: the client scan only runs when the user opens the
Opportunity Library tab, so users who never open the tab never hear about an
approaching deadline. This scan covers them — from the cron endpoint
(``/api/internal/deadline-notifications``) and as a lazy per-user pass at
login.

Semantics deliberately mirror the client radar exactly, so the two cannot
produce divergent behaviour:

- Only tracker-linked opportunities (``linked_sheet_id`` is set), matching the
  client's ``if (!opportunity.linked_sheet_id) continue``.
- Nearest upcoming deadline within ``DEADLINE_RADAR_THRESHOLD_DAYS`` (7) days;
  today counts, past dates do not.
- Deduped by ``last_deadline_notified_at`` at day granularity — the client
  checks ``last_deadline_notified_at?.slice(0, 10) === today``; the server
  claims the row with a conditional UPDATE instead (``NULL or < start of
  today UTC``), which also makes concurrent scans/cron workers safe.
- Respects the user's ``scholarship_deadline_approaching`` notification
  preference (checked BEFORE claiming, so a disabled-then-re-enabled
  preference can still notify later).
- Message copy is byte-identical to the client's template in
  ``frontend/src/config/notificationCatalog.ts``:
  title ``Deadline approaching: <name>``,
  body ``Due <date>. Check the Opportunity Library for details.``

Free-text deadline dates that do not parse as ``YYYY-MM-DD`` are skipped
(conservative — same idea as the client's ``Number.isNaN(date.getTime())``).
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone

from app.core.notifications import is_notification_enabled
from app.services.store import Store

logger = logging.getLogger(__name__)

# Mirrors DEADLINE_RADAR_THRESHOLD_DAYS in frontend/src/components/news/OpportunityCard.tsx.
# Keep the two in sync (noted in AI-Context/functional notification docs).
DEADLINE_RADAR_THRESHOLD_DAYS = 7


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def _parse_deadline_date(raw: str) -> date | None:
    """Parse a deadline date string as YYYY-MM-DD (UTC-naive dates).

    Returns None for free-text or otherwise unparsable values — the scan must
    never notify about a date it could not actually read.
    """
    value = (raw or "").strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _nearest_upcoming_deadline(deadlines_json: str | None, today: date) -> date | None:
    """Nearest deadline that is today or later, or None when none qualifies."""
    if not deadlines_json:
        return None
    try:
        entries = json.loads(deadlines_json)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(entries, list):
        return None

    upcoming: list[date] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        parsed = _parse_deadline_date(str(entry.get("date") or ""))
        if parsed is not None and parsed >= today:
            upcoming.append(parsed)
    return min(upcoming) if upcoming else None


def run_deadline_notification_scan(store: Store, user_id: str | None = None) -> int:
    """Create deadline notifications for due opportunities. Returns the count.

    ``user_id`` scopes the scan to one user (lazy login pass); None scans all
    users (cron). Rows already claimed today are excluded in SQL; the claim
    itself is a conditional UPDATE, so a concurrent client-radar scan or a
    second worker can never double-notify the same opportunity.
    """
    today = _today_utc()
    window_end = today + timedelta(days=DEADLINE_RADAR_THRESHOLD_DAYS)
    today_start_utc = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
    now_iso = datetime.now(timezone.utc).isoformat()
    conn = store.legacy_connection

    where = "linked_sheet_id IS NOT NULL AND (last_deadline_notified_at IS NULL OR last_deadline_notified_at < :today_start)"
    params: dict = {"today_start": today_start_utc.isoformat()}
    if user_id is not None:
        where += " AND user_id = :uid"
        params["uid"] = user_id

    rows = conn.execute(
        "SELECT id, user_id, canonical_name, deadlines_json "
        f"FROM scholarship_opportunities WHERE {where}",
        params,
    ).fetchall()
    if not rows:
        return 0

    # Batch-load the notification preferences for every candidate owner.
    user_ids = sorted({str(row["user_id"]) for row in rows if row["user_id"]})
    settings_by_user: dict[str, object] = {}
    if user_ids:
        placeholders = ",".join("?" for _ in user_ids)
        profile_rows = conn.execute(
            f"SELECT user_id, notification_settings FROM local_profiles WHERE user_id IN ({placeholders})",
            user_ids,
        ).fetchall()
        settings_by_user = {
            str(row["user_id"]): row["notification_settings"] for row in profile_rows
        }

    notified = 0
    for row in rows:
        owner_id = str(row["user_id"]) if row["user_id"] else None
        if not owner_id:
            continue
        try:
            if not is_notification_enabled(
                settings_by_user.get(owner_id), "scholarship_deadline_approaching"
            ):
                continue

            nearest = _nearest_upcoming_deadline(row["deadlines_json"], today)
            if nearest is None or nearest > window_end:
                continue

            # Atomic day-granularity claim, mirroring the client's
            # last_deadline_notified_at check but race-safe against concurrent
            # scans: 0 rows updated means someone else claimed it first.
            claimed = conn.execute(
                "UPDATE scholarship_opportunities SET last_deadline_notified_at = ? "
                "WHERE id = ? AND (last_deadline_notified_at IS NULL OR last_deadline_notified_at < ?)",
                (now_iso, row["id"], today_start_utc.isoformat()),
            )
            if not claimed.rowcount:
                continue

            days_left = (nearest - today).days
            due_label = "today" if days_left == 0 else f"in {days_left} days"
            conn.execute(
                "INSERT INTO notifications (user_id, title, body, notification_type, preference_key, due_at) "
                "VALUES (?, ?, ?, 'general', 'scholarship_deadline_approaching', ?)",
                (
                    owner_id,
                    f"Deadline approaching: {row['canonical_name']}",
                    f"Due {nearest.isoformat()} ({due_label}). Check the Opportunity Library for details.",
                    nearest.isoformat(),
                ),
            )
            conn.commit()
            notified += 1
        except Exception:
            # One bad row must never abort the whole scan; roll back only this
            # row's partial claim so the next scan can retry it.
            conn.db.rollback()
            logger.warning(
                "deadline notification scan failed for opportunity %s",
                row["id"],
                exc_info=True,
            )

    if notified:
        logger.info("run_deadline_notification_scan: created %d notification(s)", notified)
    return notified
