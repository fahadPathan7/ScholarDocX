"""Unit tests for the paid self-registration endpoint (SCHOLARDOCX-0162).

Mirrors the fake-store style of the ``_assemble_public_plans`` test in
``test_polar_checkout.py``: the endpoint reads only a handful of
app_settings/users rows via ``store.legacy_connection.execute(sql, params)``,
so a small fake covers all branches without a database.

The Polar checkout call inside ``register_paid`` is async and hits the network;
the happy-path test monkeypatches ``_create_polar_checkout_session`` so no HTTP
call is made. The validation tests never reach that call (they raise first).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi import HTTPException

from app.api import auth as auth_module
from app.api.auth import RegisterPaidPayload, register_paid
from app.auth.rate_limit import RATE_LIMIT_RULES, rate_limiter


# A canonical Polar-style product UUID (passes _is_uuid_shape).
PRO_PRODUCT_UUID = "5b1f3a2c-4d6e-4a8f-9b21-2c3d4e5f6789"
ALLOWED_ORIGIN = "http://localhost:5173"


class _Row(dict):
    """A row that supports both attribute and key access (legacy shim shape)."""

    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc


class _FakeResult:
    def __init__(self, rows: list[dict], lastrowid: Any = None):
        self._rows = rows
        self.lastrowid = lastrowid

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class _FakeConn:
    """Captures executed SQL + params and returns scripted rows.

    Recognizes the specific queries register-paid issues:
      - registration_mode lookup
      - email-exists check
      - plan settings lookup
      - INSERT INTO users ... (returns lastrowid)
      - dependent inserts / cleanup deletes
    """

    def __init__(
        self,
        *,
        registration_mode: str = "invite_or_paid",
        existing_user: dict | None = None,
        plan_active: str = "1",
        plan_product_id: str = PRO_PRODUCT_UUID,
    ):
        self.registration_mode = registration_mode
        self.existing_user = existing_user
        self.plan_active = plan_active
        self.plan_product_id = plan_product_id
        self.lastrowid: Any = None
        self.executed: list[tuple[str, tuple]] = []
        # Track which user ids got a DELETE so rollback tests can assert it.
        self.deleted_user_ids: list[str] = []
        self._next_id = 1

    def execute(self, sql: str, params: tuple = ()):  # noqa: D401 - test shim
        self.executed.append((sql, params))
        lowered = sql.lstrip().lower()

        if "registration_mode" in lowered and "select" in lowered:
            return _FakeResult([_Row({"value": self.registration_mode})])
        if "from users where email" in lowered and "select" in lowered:
            return _FakeResult([_Row(self.existing_user)] if self.existing_user else [])
        if "from app_settings where key in" in lowered:
            return _FakeResult([
                _Row({"key": f"plan_is_active_general", "value": self.plan_active}),
                _Row({"key": "polar_product_id_general_monthly", "value": self.plan_product_id}),
            ])
        if lowered.startswith("insert into users"):
            fake_id = f"user-{self._next_id}"
            self._next_id += 1
            self.lastrowid = fake_id
            return _FakeResult([], lastrowid=fake_id)
        if lowered.startswith("delete from users"):
            # params[0] is the user_id for the DELETE WHERE id = ?
            if params:
                self.deleted_user_ids.append(params[0])
            return _FakeResult([])
        return _FakeResult([])

    def commit(self):
        return None


class _FakeStore:
    def __init__(self, conn: _FakeConn):
        self._conn = conn

    @property
    def legacy_connection(self):
        return self._conn


class _FakeRequest:
    """Minimal Request stand-in for client_ip + success_url derivation."""

    def __init__(self, host: str = "localhost:5173", scheme: str = "http"):
        self.headers = {"host": host, "origin": f"{scheme}://{host}"}
        self.url = type("U", (), {"scheme": scheme})()
        self.client = None


def _payload(**overrides) -> RegisterPaidPayload:
    defaults = {
        "email": "newuser@example.com",
        "password": "StrongP@ss1!",
        "display_name": "New User",
        "plan": "basic",
        "billing_cycle": "monthly",
        "success_url": f"{ALLOWED_ORIGIN}/registration-complete",
    }
    defaults.update(overrides)
    return RegisterPaidPayload(**defaults)


# ---------------------------------------------------------------------------
# Gating
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_paid_rejects_invite_only_mode():
    conn = _FakeConn(registration_mode="invite_only")
    store = _FakeStore(conn)

    with pytest.raises(HTTPException) as exc:
        await register_paid(_payload(), _FakeRequest(), store)

    assert exc.value.status_code == 403
    assert "invite code" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_register_paid_accepts_invite_or_paid_mode():
    """Happy path: no mode rejection, reaches checkout and returns its URL."""
    conn = _FakeConn(registration_mode="invite_or_paid")
    store = _FakeStore(conn)

    async def _fake_checkout(user, product_id, success_url, settings):
        return {"status": "success", "url": "https://checkout.example/xyz"}

    original = auth_module._create_polar_checkout_session
    auth_module._create_polar_checkout_session = _fake_checkout
    try:
        result = await register_paid(_payload(), _FakeRequest(), store)
    finally:
        auth_module._create_polar_checkout_session = original

    assert result["status"] == "success"
    assert result["checkout_url"] == "https://checkout.example/xyz"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_paid_rejects_weak_password():
    conn = _FakeConn()
    with pytest.raises(HTTPException) as exc:
        await register_paid(_payload(password="weak"), _FakeRequest(), _FakeStore(conn))
    assert exc.value.status_code == 400
    assert "password" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_register_paid_rejects_duplicate_email():
    conn = _FakeConn(existing_user={"id": "u-1", "is_active": 1, "pending_payment_since": None})
    with pytest.raises(HTTPException) as exc:
        await register_paid(_payload(), _FakeRequest(), _FakeStore(conn))
    assert exc.value.status_code == 400
    assert "already registered" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_register_paid_rejects_pending_email_with_clear_message():
    """A second attempt for an email already awaiting payment gets a 409 + a
    'finish checkout or wait' message (not 'already registered')."""
    conn = _FakeConn(
        existing_user={"id": "u-2", "is_active": 0, "pending_payment_since": "2026-07-21T10:00:00+00:00"}
    )
    with pytest.raises(HTTPException) as exc:
        await register_paid(_payload(), _FakeRequest(), _FakeStore(conn))
    assert exc.value.status_code == 409
    assert "awaiting payment" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_register_paid_rejects_inactive_plan():
    conn = _FakeConn(plan_active="0")
    with pytest.raises(HTTPException) as exc:
        await register_paid(_payload(), _FakeRequest(), _FakeStore(conn))
    assert exc.value.status_code == 400
    assert "not available" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_register_paid_rejects_unconfigured_plan_product():
    """A non-UUID product id (e.g. placeholder sentinel) is rejected."""
    conn = _FakeConn(plan_product_id="polar_prod_basic_monthly")  # not a UUID
    with pytest.raises(HTTPException) as exc:
        await register_paid(_payload(), _FakeRequest(), _FakeStore(conn))
    assert exc.value.status_code == 400
    assert "not available" in exc.value.detail.lower()


# ---------------------------------------------------------------------------
# Rollback on checkout failure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_paid_rolls_back_user_on_checkout_failure():
    conn = _FakeConn()
    store = _FakeStore(conn)

    async def _failing_checkout(user, product_id, success_url, settings):
        raise HTTPException(status_code=400, detail="Checkout session could not be created.")

    original = auth_module._create_polar_checkout_session
    auth_module._create_polar_checkout_session = _failing_checkout
    try:
        with pytest.raises(HTTPException):
            await register_paid(_payload(), _FakeRequest(), store)
    finally:
        auth_module._create_polar_checkout_session = original

    # The inert user created just before the checkout call must be deleted so
    # the email is immediately free to retry (no orphan, no 2h wait).
    assert len(conn.deleted_user_ids) == 1, (
        f"expected the rolled-back user to be deleted, got {conn.deleted_user_ids}"
    )


# ---------------------------------------------------------------------------
# Rate-limit rule presence (catalog surface)
# ---------------------------------------------------------------------------


def test_auth_register_paid_rate_limit_rule_present():
    """The 1/24h/IP rule exists in the central registry so it shows in the
    admin Info tab and is enforced by check_and_record in register_paid."""
    rule = next((r for r in RATE_LIMIT_RULES if r["key"] == "auth_register_paid"), None)
    assert rule is not None
    assert rule["max_requests"] == 1
    assert rule["window_seconds"] == 86400
    assert rule["scope"] == "ip"


def test_auth_register_paid_second_attempt_within_24h_is_blocked():
    """A second call from the same IP within the window raises 429."""
    rate_limiter.reset()
    ip = "203.0.113.9"
    rate_limiter.check_and_record("auth_register_paid", ip)  # first attempt ok
    with pytest.raises(HTTPException) as exc:
        rate_limiter.check_and_record("auth_register_paid", ip)  # second blocked
    assert exc.value.status_code == 429
    rate_limiter.reset()
