"""SCHOLARDOCX-0220 polish bundle: credit-grant notification helper,
admin_block_user permission key, and the per-user search cache.

Per CODE_RULES: no test execution here; per-user rows only (no global-table
writes — pricing/prefs are read through real rows the tests create, and the
cache is pure in-memory).
"""
from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.db.connection import get_engine
from app.db.models import Notifications
from app.services import ai_tokens
from app.services.search_cache import cache_get, cache_put, clear_cache, make_key
from app.services.store import Store

from tests.helpers import cleanup_user_records, make_settings

USER_ID = "00000000-0000-0000-0000-000000000031"
USER_EMAIL = "polish-0220@test.local"


def make_store(tmp_path):
    settings = make_settings(tmp_path)
    engine = get_engine(settings.database_target)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    store = Store(session)
    return store, store.legacy_connection


def _cleanup(conn):
    conn.db.rollback()
    cleanup_user_records(conn, user_id=USER_ID, email=USER_EMAIL)


def _seed_user(conn, notification_settings=None):
    conn.execute(
        "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked) "
        "VALUES (?, ?, 'hash', 'Polish User', '[\"free_user\"]', 1, 0)",
        (USER_ID, USER_EMAIL),
    )
    if notification_settings is not None:
        conn.execute(
            "INSERT INTO local_profiles (user_id, notification_settings) VALUES (?, ?)",
            (USER_ID, notification_settings),
        )
    conn.commit()


def _notification_rows(store):
    store.db.expire_all()
    rows = store.db.execute(
        select(Notifications).where(Notifications.user_id == USER_ID)
    ).scalars().all()
    return [(r.title, r.body, r.preference_key) for r in rows]


# ── notify_credits_granted ───────────────────────────────────────────────────

def test_notify_credits_granted_creates_billing_row(tmp_path):
    store, conn = make_store(tmp_path)
    _cleanup(conn)
    try:
        _seed_user(conn)  # no profile row → defaults → billing enabled
        ai_tokens.notify_credits_granted(
            USER_ID, 5000, session=store.db, source="pack_purchase"
        )
        assert _notification_rows(store) == [
            ("AI credits added", "5,000 AI credits were added to your account.", "billing")
        ]
    finally:
        _cleanup(conn)


def test_notify_credits_granted_respects_disabled_preference(tmp_path):
    store, conn = make_store(tmp_path)
    _cleanup(conn)
    try:
        _seed_user(conn, notification_settings='{"billing": false}')
        ai_tokens.notify_credits_granted(
            USER_ID, 5000, session=store.db, source="pack_purchase"
        )
        assert _notification_rows(store) == []
    finally:
        _cleanup(conn)


def test_notify_credits_granted_never_raises(tmp_path):
    """Best-effort by contract: an insert failure must not propagate."""
    store, conn = make_store(tmp_path)
    _cleanup(conn)
    try:
        _seed_user(conn)
        broken = MagicMock()
        broken.execute.side_effect = RuntimeError("db gone")
        # Should swallow, not raise.
        ai_tokens.notify_credits_granted(
            USER_ID, 5000, session=broken, source="pack_purchase"
        )
    finally:
        _cleanup(conn)


# ── admin_block_user permission key ──────────────────────────────────────────

def test_toggle_user_block_uses_its_own_permission_key():
    """Block must be gated on admin_block_user, not the suspend key it used
    to borrow (the SCHOLARDOCX-0212-era 'same flag for now' shortcut)."""
    from app.api import admin as admin_api

    captured: list[str] = []

    def fake_require_feature(feature, *args, **kwargs):
        captured.append(feature)

    service = MagicMock()
    service.db = MagicMock()
    service.toggle_user_block.return_value = {"ok": True}

    with patch.object(admin_api, "require_feature", side_effect=fake_require_feature), \
         patch.object(admin_api, "check_admin_modification_clearance"):
        admin_api.toggle_user_block(
            "some-user-id",
            admin_api.BlockUpdatePayload(is_blocked=True),
            admin_service=service,
            current_user={"id": "admin-1", "roles": ["general_admin"]},
        )

    assert captured == ["admin_block_user"]
    assert service.toggle_user_block.called


def test_admin_block_user_seeded_for_both_admin_roles():
    from app.services.admin import DEFAULT_ROLE_LIMITS

    for role in ("general_admin", "super_admin"):
        features = {name for name, _limit, _reset in DEFAULT_ROLE_LIMITS[role]}
        assert "admin_block_user" in features, role


# ── search cache ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _fresh_cache():
    clear_cache()
    yield
    clear_cache()


def test_cache_roundtrip_and_user_isolation():
    key_a = make_key("user-a", "brave", "phd funding", 20)
    key_b = make_key("user-b", "brave", "phd funding", 20)
    cache_put(key_a, [{"url": "x"}])
    assert cache_get(key_a) == [{"url": "x"}]
    # Same query, different user → miss (never share entries across users).
    assert cache_get(key_b) is None


def test_cache_query_and_param_sensitivity():
    base = make_key("user-a", "tavily", "same query", 2)
    cache_put(base, ["r"])
    # make_key is a pure join — the CALLER normalizes the query
    # (strip/casefold), which is what makes case variants hit:
    assert cache_get(make_key("user-a", "tavily", " Same Query ".strip().casefold(), 2)) == ["r"]
    assert cache_get(make_key("user-a", "tavily", "other query", 2)) is None
    assert cache_get(make_key("user-a", "tavily", "same query", 5)) is None


def test_cache_ttl_expiry(monkeypatch):
    key = make_key("u", "brave", "q", 5)
    now = 1000.0
    monkeypatch.setattr(time, "monotonic", lambda: now)
    cache_put(key, ["v"], ttl_seconds=60)
    assert cache_get(key) == ["v"]
    monkeypatch.setattr(time, "monotonic", lambda: now + 61)
    assert cache_get(key) is None  # expired


def test_cache_bounded_eviction(monkeypatch):
    from app.services import search_cache

    now = 1000.0
    monkeypatch.setattr(time, "monotonic", lambda: now)
    monkeypatch.setattr(search_cache, "MAX_ENTRIES", 3)
    for i in range(3):
        cache_put(make_key("u", "brave", f"q{i}", 5), [i])
    # At capacity: the next insert evicts the oldest (q0).
    cache_put(make_key("u", "brave", "q3", 5), [3])
    assert cache_get(make_key("u", "brave", "q0", 5)) is None
    assert cache_get(make_key("u", "brave", "q3", 5)) == [3]
