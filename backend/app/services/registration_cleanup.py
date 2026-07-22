"""Pending-payment account cleanup (SCHOLARDOCX-0162).

Paid self-registration creates an inert user (``is_active=0``,
``pending_payment_since`` set) that cannot log in until the Polar webhook
confirms payment. If payment never arrives, the account must be deleted so
inert rows and throwaway emails do not accumulate.

This module owns the single purge function. It is invoked from three triggers:

1. **GitHub Actions cron** every 2h → ``POST /api/internal/cleanup-pending``
   (secret-gated). Free, reliable, honors the zero-cost constraint (Render Cron
   Jobs are paid; an in-process asyncio loop dies on free-tier sleep after
   15 min).
2. **Lazy safety net** on ``/auth/login``: if
   ``app_settings.last_pending_cleanup_at`` is older than the TTL, run the
   purge on the next login. Mirrors the codebase's lazy-expiry pattern
   (invite codes, usage-stat resets, rate-limit pruning) and catches drift if
   the external cron ever misses.
3. **Manual admin** button → ``POST /admin/cleanup/pending-accounts``.

The delete window is anchored on ``pending_payment_since`` and is exact
regardless of trigger timing: only rows older than ``older_than_hours`` (and
still inactive) are removed.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.db.models import AppSettings
from app.services.store import Store

logger = logging.getLogger(__name__)

# Default unpaid TTL. Matches the user-facing copy ("deleted after 2 hours") and
# the GitHub Actions cadence. Kept as a parameter so tests and the admin button
# can pass a different window if ever needed.
DEFAULT_PENDING_TTL_HOURS = 2


def purge_expired_pending_accounts(
    store: Store, older_than_hours: int = DEFAULT_PENDING_TTL_HOURS
) -> int:
    """Delete pending-payment accounts older than ``older_than_hours``.

    A row is eligible only when ALL of: ``pending_payment_since IS NOT NULL``,
    ``is_active = 0``, and ``pending_payment_since < NOW() - older_than_hours``.
    This cannot touch:
      - activated users (webhook already cleared pending_payment_since and set
        is_active=1),
      - invite-code registrants (pending_payment_since is NULL),
      - admin-deactivated users (pending_payment_since is NULL).

    Dependent rows in ``user_usage_stats`` (NOT NULL FK), ``local_profiles``, and
    ``document_categories`` are removed first; a pending account only ever has
    these three seeded (it never logged in).

    Returns the number of user rows deleted. Idempotent — re-running is a no-op
    once nothing matches.
    """
    conn = store.legacy_connection
    # Fetch candidate ids first so we can delete dependents per-user (the NOT
    # NULL FK on user_usage_stats would otherwise block the user delete). A
    # single correlated DELETE ... USING isn't portable across the legacy
    # connection's expected dialect shape, so the two-step is safer here.
    rows = conn.execute(
        "SELECT id FROM users "
        "WHERE pending_payment_since IS NOT NULL "
        "AND is_active = 0 "
        "AND pending_payment_since < NOW() - (? || ' hours')::INTERVAL",
        (str(older_than_hours),),
    ).fetchall()
    if not rows:
        return 0

    ids = [r["id"] for r in rows]
    for user_id in ids:
        # SCHOLARDOCX-0169: Google inert accounts have external_identities
        # rows that must be deleted first (FK → users.id) or the user
        # delete fails and the email stays locked.
        conn.execute("DELETE FROM external_identities WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM user_usage_stats WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM local_profiles WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM document_categories WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()

    sample = ", ".join(ids[:5])
    logger.info(
        f"purge_expired_pending_accounts: deleted {len(ids)} unpaid pending "
        f"account(s) (older than {older_than_hours}h); sample: {sample}"
    )
    return len(ids)


def maybe_run_lazy_cleanup(store: Store, ttl_hours: int = DEFAULT_PENDING_TTL_HOURS) -> int:
    """Run the purge only if the last run is older than the TTL.

    Intended for the lazy safety net on ``/auth/login``. Reads/updates the
    ``last_pending_cleanup_at`` app setting (ISO timestamp). On a fresh install
    (no setting row) the purge runs once and seeds the marker.
    """
    # Read + write the marker via the ORM session rather than legacy_connection:
    # the legacy shim appends `RETURNING id` to every INSERT, but app_settings'
    # primary key is `key` (no `id` column), so a raw INSERT raises. The ORM
    # path matches how webhooks.get_app_setting already reads this table.
    db = store.db
    setting = db.scalar(select(AppSettings).where(AppSettings.key == "last_pending_cleanup_at"))
    now = datetime.now(timezone.utc)

    if setting and setting.value:
        try:
            last = datetime.fromisoformat(setting.value)
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            age_seconds = (now - last).total_seconds()
            if age_seconds < ttl_hours * 3600:
                return 0  # not due yet
        except (ValueError, TypeError):
            # Corrupt timestamp — treat as due and refresh it below.
            logger.warning(
                f"last_pending_cleanup_at unparseable ({setting.value!r}); running cleanup"
            )

    deleted = purge_expired_pending_accounts(store, older_than_hours=ttl_hours)
    iso = now.isoformat()
    if setting:
        setting.value = iso
    else:
        db.add(AppSettings(key="last_pending_cleanup_at", value=iso))
    db.commit()
    return deleted
