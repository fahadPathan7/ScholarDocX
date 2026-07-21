"""Unit tests for the pending-account cleanup (SCHOLARDOCX-0162).

The purge function issues a Postgres-specific ``NOW() - INTERVAL`` query, so
these tests use a real Postgres store (the ``make_store`` pattern from
``test_webhooks.py``) and seed rows with controlled ``pending_payment_since``
timestamps. The shared test DB is swept by conftest between tests.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.db.connection import get_engine
from app.db.models import AppSettings, Users
from app.services.registration_cleanup import (
    DEFAULT_PENDING_TTL_HOURS,
    purge_expired_pending_accounts,
    maybe_run_lazy_cleanup,
)
from app.services.store import Store

from tests.helpers import cleanup_user_records, make_settings


# Distinct stable UUIDs per fixture row so cleanup between runs is idempotent.
EXPIRED_ID = "00000000-0000-0000-0000-000000000031"
FRESH_ID = "00000000-0000-0000-0000-000000000032"
ACTIVE_PAID_ID = "00000000-0000-0000-0000-000000000033"


def make_store(tmp_path):
    settings = make_settings(tmp_path)
    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    store = Store(session)
    return store, store.legacy_connection


def _seed_pending_user(conn, user_id: str, email: str, *, pending_since_iso: str,
                       is_active: int = 0):
    conn.db.rollback()
    cleanup_user_records(conn, user_id=user_id, email=email)
    conn.execute(
        """
        INSERT INTO users (
            id, email, password_hash, display_name, roles, is_active, is_blocked,
            pending_payment_since, plan_started_at
        ) VALUES (?, ?, 'x', 'Test', ?, ?, 0, ?, ?)
        """,
        (
            user_id, email, '["free_user"]', is_active, pending_since_iso, pending_since_iso,
        ),
    )
    # Seed one dependent so we can assert cascade behavior.
    conn.execute(
        "INSERT INTO user_usage_stats (user_id, feature, current_count, last_reset_at) "
        "VALUES (?, 'total_projects', 0, CURRENT_TIMESTAMP)",
        (user_id,),
    )
    conn.commit()
    conn.db.expunge_all()


@pytest.fixture(autouse=True)
def _cleanup_pending_fixtures():
    yield
    # Belt-and-suspenders: remove any fixture rows that survived the test.
    try:
        from app.core.config import Settings
        from app.db.connection import connect

        settings = Settings()
        with connect(settings.database_target) as db:
            for uid, email in (
                (EXPIRED_ID, "expired@example.com"),
                (FRESH_ID, "fresh@example.com"),
                (ACTIVE_PAID_ID, "active-paid@example.com"),
            ):
                cleanup_user_records(db, user_id=uid, email=email)
    except Exception:
        pass


def test_purge_deletes_only_expired_pending_rows(tmp_path):
    """Rows older than the TTL + inactive are deleted; fresh/active rows survive."""
    store, conn = make_store(tmp_path)
    try:
        now = datetime.now(timezone.utc)
        expired_iso = (now - timedelta(hours=DEFAULT_PENDING_TTL_HOURS + 1)).isoformat()
        fresh_iso = (now - timedelta(minutes=5)).isoformat()

        _seed_pending_user(conn, EXPIRED_ID, "expired@example.com", pending_since_iso=expired_iso)
        _seed_pending_user(conn, FRESH_ID, "fresh@example.com", pending_since_iso=fresh_iso)
        # An activated user with pending_payment_since already cleared must be untouched.
        _seed_pending_user(
            conn, ACTIVE_PAID_ID, "active-paid@example.com",
            pending_since_iso=fresh_iso, is_active=1,
        )
        conn.execute(
            "UPDATE users SET pending_payment_since = NULL WHERE id = ?",
            (ACTIVE_PAID_ID,),
        )
        conn.commit()
        conn.db.expunge_all()

        deleted = purge_expired_pending_accounts(store, older_than_hours=DEFAULT_PENDING_TTL_HOURS)

        assert deleted == 1
        remaining_ids = {
            str(r.id) for r in store.db.scalars(select(Users)).all()
            if str(r.id) in (EXPIRED_ID, FRESH_ID, ACTIVE_PAID_ID)
        }
        assert EXPIRED_ID not in remaining_ids
        assert FRESH_ID in remaining_ids
        assert ACTIVE_PAID_ID in remaining_ids
    finally:
        store.db.close()


def test_purge_is_idempotent(tmp_path):
    """Running the purge twice never deletes more than the first pass."""
    store, conn = make_store(tmp_path)
    try:
        expired_iso = (
            datetime.now(timezone.utc) - timedelta(hours=DEFAULT_PENDING_TTL_HOURS + 2)
        ).isoformat()
        _seed_pending_user(conn, EXPIRED_ID, "expired@example.com", pending_since_iso=expired_iso)

        first = purge_expired_pending_accounts(store, older_than_hours=DEFAULT_PENDING_TTL_HOURS)
        second = purge_expired_pending_accounts(store, older_than_hours=DEFAULT_PENDING_TTL_HOURS)

        assert first == 1
        assert second == 0
    finally:
        store.db.close()


def test_purge_also_removes_dependents(tmp_path):
    """A pending user only ever has user_usage_stats / local_profiles /
    document_categories rows; the purge must clear them so the NOT NULL FK on
    user_usage_stats doesn't block the user delete."""
    store, conn = make_store(tmp_path)
    try:
        expired_iso = (
            datetime.now(timezone.utc) - timedelta(hours=DEFAULT_PENDING_TTL_HOURS + 1)
        ).isoformat()
        _seed_pending_user(conn, EXPIRED_ID, "expired@example.com", pending_since_iso=expired_iso)

        deleted = purge_expired_pending_accounts(store, older_than_hours=DEFAULT_PENDING_TTL_HOURS)
        assert deleted == 1

        # The usage-stat row seeded in _seed_pending_user must be gone.
        leftover = conn.execute(
            "SELECT COUNT(*) AS n FROM user_usage_stats WHERE user_id = ?",
            (EXPIRED_ID,),
        ).fetchone()
        assert int(leftover["n"]) == 0
    finally:
        store.db.close()


def test_maybe_run_lazy_cleanup_is_throttled_by_marker(tmp_path):
    """A fresh last_pending_cleanup_at marker suppresses the purge; a stale one runs it."""
    store, conn = make_store(tmp_path)
    try:
        expired_iso = (
            datetime.now(timezone.utc) - timedelta(hours=DEFAULT_PENDING_TTL_HOURS + 1)
        ).isoformat()
        _seed_pending_user(conn, EXPIRED_ID, "expired@example.com", pending_since_iso=expired_iso)

        # Seed a FRESH marker (1 minute ago) → purge must NOT run.
        # NOTE: app_settings PK is `key` (no `id` column), and the legacy
        # connection shim appends `RETURNING id` to INSERTs, which would fail
        # here. Use the ORM session directly to set the marker.
        fresh_marker = (
            datetime.now(timezone.utc) - timedelta(minutes=1)
        ).isoformat()
        existing = store.db.scalar(
            select(AppSettings).where(AppSettings.key == "last_pending_cleanup_at")
        )
        if existing:
            existing.value = fresh_marker
        else:
            store.db.add(AppSettings(key="last_pending_cleanup_at", value=fresh_marker))
        store.db.commit()

        first = maybe_run_lazy_cleanup(store, ttl_hours=DEFAULT_PENDING_TTL_HOURS)
        assert first == 0  # throttled

        # Move the marker into the stale past → purge runs and deletes the row.
        stale_marker = (
            datetime.now(timezone.utc) - timedelta(hours=DEFAULT_PENDING_TTL_HOURS + 1)
        ).isoformat()
        marker_row = store.db.scalar(
            select(AppSettings).where(AppSettings.key == "last_pending_cleanup_at")
        )
        assert marker_row is not None
        marker_row.value = stale_marker
        store.db.commit()

        second = maybe_run_lazy_cleanup(store, ttl_hours=DEFAULT_PENDING_TTL_HOURS)
        assert second == 1
    finally:
        store.db.close()
