"""Unit tests for expired plan downgrade (SCHOLARDOCX-0166).

Tests that users with expired plan dates are downgraded to free_user role while
preserving any admin roles (general_admin, super_admin) strictly intact.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.main import app
from app.db.connection import get_engine
from app.services.plan_expiry import downgrade_expired_user_plans
from app.services.store import Store

from tests.helpers import cleanup_user_records, make_settings

EXPIRED_USER_ID = "00000000-0000-0000-0000-000000000091"
UNEXPIRED_USER_ID = "00000000-0000-0000-0000-000000000092"
ADMIN_EXPIRED_USER_ID = "00000000-0000-0000-0000-000000000093"

EXPIRED_EMAIL = "expired-user@test.local"
UNEXPIRED_EMAIL = "unexpired-user@test.local"
ADMIN_EXPIRED_EMAIL = "admin-expired-user@test.local"


def make_store(tmp_path):
    settings = make_settings(tmp_path)
    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    store = Store(session)
    return store, store.legacy_connection


def _cleanup_test_users(conn):
    conn.db.rollback()
    for uid, email in [
        (EXPIRED_USER_ID, EXPIRED_EMAIL),
        (UNEXPIRED_USER_ID, UNEXPIRED_EMAIL),
        (ADMIN_EXPIRED_USER_ID, ADMIN_EXPIRED_EMAIL),
    ]:
        cleanup_user_records(conn, user_id=uid, email=email)


def test_downgrade_expired_user_plans(tmp_path):
    store, conn = make_store(tmp_path)
    _cleanup_test_users(conn)

    yesterday_iso = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    tomorrow_iso = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

    try:
        # 1. Expired regular paid user
        conn.execute(
            "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked, plan_ends_at) "
            "VALUES (?, ?, 'hash', 'Expired User', ?, 1, 0, ?)",
            (EXPIRED_USER_ID, EXPIRED_EMAIL, json.dumps(["pro_user"]), yesterday_iso),
        )

        # 2. Unexpired regular paid user
        conn.execute(
            "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked, plan_ends_at) "
            "VALUES (?, ?, 'hash', 'Unexpired User', ?, 1, 0, ?)",
            (UNEXPIRED_USER_ID, UNEXPIRED_EMAIL, json.dumps(["pro_user"]), tomorrow_iso),
        )

        # 3. Expired user with admin role (super_admin + pro_user)
        conn.execute(
            "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked, plan_ends_at) "
            "VALUES (?, ?, 'hash', 'Admin Expired User', ?, 1, 0, ?)",
            (ADMIN_EXPIRED_USER_ID, ADMIN_EXPIRED_EMAIL, json.dumps(["super_admin", "pro_user"]), yesterday_iso),
        )
        conn.commit()

        # Execute downgrade
        downgraded_count = downgrade_expired_user_plans(store)
        assert downgraded_count == 2  # EXPIRED_USER_ID and ADMIN_EXPIRED_USER_ID

        # Verify EXPIRED_USER_ID roles -> ["free_user"]
        row_expired = conn.execute("SELECT roles FROM users WHERE id = ?", (EXPIRED_USER_ID,)).fetchone()
        roles_expired = json.loads(row_expired["roles"])
        assert "free_user" in roles_expired
        assert "pro_user" not in roles_expired

        # Verify UNEXPIRED_USER_ID roles -> ["pro_user"]
        row_unexpired = conn.execute("SELECT roles FROM users WHERE id = ?", (UNEXPIRED_USER_ID,)).fetchone()
        roles_unexpired = json.loads(row_unexpired["roles"])
        assert "pro_user" in roles_unexpired

        # Verify ADMIN_EXPIRED_USER_ID roles -> super_admin preserved + free_user
        row_admin = conn.execute("SELECT roles FROM users WHERE id = ?", (ADMIN_EXPIRED_USER_ID,)).fetchone()
        roles_admin = json.loads(row_admin["roles"])
        assert "super_admin" in roles_admin
        assert "free_user" in roles_admin
        assert "pro_user" not in roles_admin

    finally:
        _cleanup_test_users(conn)


def test_downgrade_internal_endpoint_auth(monkeypatch):
    client = TestClient(app)

    # When secret is unset -> 503
    monkeypatch.delenv("CLEANUP_SECRET", raising=False)
    res = client.post("/api/internal/downgrade-expired-plans")
    assert res.status_code == 503

    # When secret is set but invalid token provided -> 401
    monkeypatch.setenv("CLEANUP_SECRET", "test-secret-key")
    res_unauth = client.post("/api/internal/downgrade-expired-plans", headers={"X-Cleanup-Token": "wrong-key"})
    assert res_unauth.status_code == 401

    # When valid token provided -> 200 OK
    res_ok = client.post("/api/internal/downgrade-expired-plans", headers={"X-Cleanup-Token": "test-secret-key"})
    assert res_ok.status_code == 200
    json_data = res_ok.json()
    assert json_data["status"] == "success"
    assert "downgraded" in json_data


def test_admin_cleanup_expired_plans_endpoint():
    client = TestClient(app)
    # Admin endpoint requires authentication
    res_unauth = client.post("/api/admin/cleanup/expired-plans")
    assert res_unauth.status_code in (401, 403)

