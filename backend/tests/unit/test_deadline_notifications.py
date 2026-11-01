"""Deadline notification scan (SCHOLARDOCX-0219).

Covers the server-side companion to the client-side deadline radar: window
logic, tracker-link requirement, preference gate (checked BEFORE the claim),
once-per-day dedupe via last_deadline_notified_at, and the internal endpoint's
auth matrix. Per-user rows only; no global tables are touched.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.deadline_notifications import (
    DEADLINE_RADAR_THRESHOLD_DAYS,
    run_deadline_notification_scan,
)

from tests.helpers import cleanup_user_records, make_settings

USER_ID = "00000000-0000-0000-0000-0000000000a1"
USER_EMAIL = "deadline-scan@test.local"
OTHER_USER_ID = "00000000-0000-0000-0000-0000000000a2"
OTHER_USER_EMAIL = "deadline-scan-other@test.local"


def _make_store(tmp_path):
    from app.db.connection import get_engine
    from app.services.store import Store
    from sqlalchemy.orm import sessionmaker

    settings = make_settings(tmp_path)
    engine = get_engine(settings.database_target)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    store = Store(session)
    return settings, store, store.legacy_connection


def _cleanup(conn):
    conn.db.rollback()
    for uid, email in [(USER_ID, USER_EMAIL), (OTHER_USER_ID, OTHER_USER_EMAIL)]:
        cleanup_user_records(conn, user_id=uid, email=email)


def _seed_user(conn, uid, email, settings_json=None):
    conn.execute(
        "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked) "
        "VALUES (?, ?, 'hash', 'Deadline User', '[\"free_user\"]', 1, 0)",
        (uid, email),
    )
    conn.execute(
        "INSERT INTO local_profiles (user_id, notification_settings) VALUES (?, ?)",
        (uid, settings_json if settings_json is not None else None),
    )


def _seed_linked_sheet(conn, uid) -> str:
    """Create a real project + sheet (linked_sheet_id has an FK) owned by uid.

    Fresh UUID per call — several opportunities in one test each need their
    own sheet row (a shared fixed id collides on projects_pkey).
    """
    import uuid as _uuid
    sheet_id = str(_uuid.uuid4())
    conn.execute(
        "INSERT INTO projects (id, user_id, name) VALUES (?, ?, 'Deadline Test Project')",
        (sheet_id, uid),
    )
    conn.execute(
        "INSERT INTO project_sheets (id, project_id, user_id, name) VALUES (?, ?, ?, 'Tracker')",
        (sheet_id, sheet_id, uid),
    )
    return sheet_id


def _seed_opportunity(conn, uid, *, deadlines, linked=True, notified_at=None, name="Test Scholarship"):
    deadline_json = json.dumps([{"date": d, "label": None} for d in deadlines])
    sheet_id = _seed_linked_sheet(conn, uid) if linked else None
    conn.execute(
        "INSERT INTO scholarship_opportunities "
        "(user_id, canonical_name, normalized_url, deadlines_json, linked_sheet_id, last_deadline_notified_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            uid,
            name,
            f"https://example.com/{uid}-{name.lower().replace(' ', '-')}",
            deadline_json,
            sheet_id,
            notified_at,
        ),
    )


def _notifications(conn, uid):
    return conn.execute(
        "SELECT title, body, notification_type, preference_key FROM notifications WHERE user_id = ? ORDER BY created_at",
        (uid,),
    ).fetchall()


def _date_iso(days_from_now: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days_from_now)).date().isoformat()


@pytest.fixture(autouse=True)
def _clean(tmp_path):
    settings, store, conn = _make_store(tmp_path)
    _cleanup(conn)
    yield settings, store, conn
    _cleanup(conn)


def test_scan_notifies_within_window_once(_clean):
    settings, store, conn = _clean
    _seed_user(conn, USER_ID, USER_EMAIL)
    _seed_opportunity(conn, USER_ID, deadlines=[_date_iso(3)])
    conn.commit()

    assert run_deadline_notification_scan(store) == 1
    rows = _notifications(conn, USER_ID)
    assert len(rows) == 1
    assert rows[0]["title"] == "Deadline approaching: Test Scholarship"
    assert rows[0]["notification_type"] == "general"
    assert rows[0]["preference_key"] == "scholarship_deadline_approaching"
    assert _date_iso(3) in rows[0]["body"]

    # Idempotent within the same day: the claim column is set.
    assert run_deadline_notification_scan(store) == 0
    assert len(_notifications(conn, USER_ID)) == 1


def test_scan_skips_outside_window_past_and_unlinked(_clean):
    settings, store, conn = _clean
    _seed_user(conn, USER_ID, USER_EMAIL)
    _seed_opportunity(conn, USER_ID, deadlines=[_date_iso(DEADLINE_RADAR_THRESHOLD_DAYS + 5)], name="Too Far")
    _seed_opportunity(conn, USER_ID, deadlines=[_date_iso(-2)], name="Past Deadline")
    _seed_opportunity(conn, USER_ID, deadlines=[_date_iso(1)], linked=False, name="Unlinked")
    conn.commit()

    assert run_deadline_notification_scan(store) == 0
    assert _notifications(conn, USER_ID) == []


def test_scan_respects_disabled_preference_without_claiming(_clean):
    settings, store, conn = _clean
    _seed_user(conn, USER_ID, USER_EMAIL, settings_json=json.dumps({"scholarship_deadline_approaching": False}))
    _seed_opportunity(conn, USER_ID, deadlines=[_date_iso(2)])
    conn.commit()

    assert run_deadline_notification_scan(store) == 0
    assert _notifications(conn, USER_ID) == []

    # The preference gate runs BEFORE the claim, so re-enabling later still
    # notifies (last_deadline_notified_at must still be NULL).
    row = conn.execute(
        "SELECT last_deadline_notified_at FROM scholarship_opportunities WHERE user_id = ?",
        (USER_ID,),
    ).fetchone()
    assert row["last_deadline_notified_at"] is None


def test_scan_skips_already_notified_today(_clean):
    settings, store, conn = _clean
    now_iso = datetime.now(timezone.utc).isoformat()
    _seed_user(conn, USER_ID, USER_EMAIL)
    _seed_opportunity(conn, USER_ID, deadlines=[_date_iso(1)], notified_at=now_iso)
    conn.commit()

    assert run_deadline_notification_scan(store) == 0
    assert _notifications(conn, USER_ID) == []


def test_scan_user_scope_covers_only_that_user(_clean):
    settings, store, conn = _clean
    _seed_user(conn, USER_ID, USER_EMAIL)
    _seed_user(conn, OTHER_USER_ID, OTHER_USER_EMAIL)
    _seed_opportunity(conn, USER_ID, deadlines=[_date_iso(1)], name="Mine")
    _seed_opportunity(conn, OTHER_USER_ID, deadlines=[_date_iso(1)], name="Theirs")
    conn.commit()

    # Lazy per-user pass (login path) only touches the named user.
    assert run_deadline_notification_scan(store, user_id=USER_ID) == 1
    assert len(_notifications(conn, USER_ID)) == 1
    assert _notifications(conn, OTHER_USER_ID) == []

    # The full cron pass picks up the rest.
    assert run_deadline_notification_scan(store) == 1
    assert len(_notifications(conn, OTHER_USER_ID)) == 1


def test_scan_skips_free_text_deadlines(_clean):
    settings, store, conn = _clean
    _seed_user(conn, USER_ID, USER_EMAIL)
    _seed_opportunity(conn, USER_ID, deadlines=["March next year"], name="Free Text")
    conn.commit()

    assert run_deadline_notification_scan(store) == 0
    assert _notifications(conn, USER_ID) == []


def test_internal_endpoint_auth(monkeypatch, _clean):
    client = TestClient(app)

    # Unset secret -> 503 (fail closed)
    monkeypatch.delenv("CLEANUP_SECRET", raising=False)
    res = client.post("/api/internal/deadline-notifications")
    assert res.status_code == 503

    # Wrong token -> 401
    monkeypatch.setenv("CLEANUP_SECRET", "test-secret-key")
    res = client.post(
        "/api/internal/deadline-notifications",
        headers={"X-Cleanup-Token": "wrong-key"},
    )
    assert res.status_code == 401

    # Valid token -> 200; the scan itself is mocked so the shared test DB is
    # not mutated by the endpoint test (its logic is covered above).
    from app.api import internal as internal_api
    called = {}
    monkeypatch.setattr(
        internal_api,
        "run_deadline_notification_scan",
        lambda store: called.setdefault("runs", 0) + 0 or 1,
    )
    res = client.post(
        "/api/internal/deadline-notifications",
        headers={"X-Cleanup-Token": "test-secret-key"},
    )
    assert res.status_code == 200
    assert res.json() == {"status": "success", "notified": 1}
    assert "runs" in called
