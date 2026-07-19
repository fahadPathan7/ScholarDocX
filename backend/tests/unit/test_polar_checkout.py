"""Unit tests for the Polar checkout session endpoint.

SCHOLARDOCX-0156: the hosted checkout must show the user's email pre-filled AND
disabled. The backend does this by passing Polar a customer identifier
(`customer_id` for known customers, `external_customer_id` + `customer_email`
for new ones) derived from `current_user` — never from the client-supplied
`payload.customer_email`.

These tests call `create_polar_checkout` directly with a `current_user` dict
(the same pattern used in `test_plan_requests.py`) and a `FakeClient` monkey-
patched onto `httpx.AsyncClient` so no network call is made.
"""
import os

import pytest
from fastapi import HTTPException

from app.api.auth import PolarCheckoutPayload, create_polar_checkout
from app.core.config import get_settings


USER_ID = "00000000-0000-0000-0000-000000000010"
USER_EMAIL = "checkout@example.com"
# An origin that matches the default CORS allowlist (localhost dev server) so
# success_url validation passes without extra config. (SCHOLARDOCX-0157)
ALLOWED_ORIGIN = "http://localhost:5173"
ALLOWED_SUCCESS_URL = f"{ALLOWED_ORIGIN}/billing"


class _FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {"url": "https://polar.sh/checkout/test"}

    @property
    def text(self):
        # Returned on non-2xx; only the server-side log should see this, never
        # the user-facing detail. Tests assert it does not leak.
        return '{"error":"upstream detail","request_id":"req_123"}'

    def json(self):
        return self._payload


class _FakeClient:
    """Captures the request body sent to Polar and returns a configured response."""

    captured_body: dict = None
    response: _FakeResponse = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, json=None, headers=None):
        _FakeClient.captured_body = json
        return _FakeClient.response or _FakeResponse()


@pytest.fixture
def fake_polar(monkeypatch):
    """Replace httpx.AsyncClient with _FakeClient and stub the Polar env.

    SCHOLARDOCX-0157: the checkout endpoint now reads config from the lru_cached
    `get_settings()`, so we patch the cached instance's fields directly rather
    than mutating env vars (which the cache would ignore).
    """
    _FakeClient.captured_body = None
    _FakeClient.response = None
    monkeypatch.setattr("httpx.AsyncClient", _FakeClient)
    settings = get_settings()
    monkeypatch.setattr(settings, "polar_access_token", "polar_test_token")
    monkeypatch.setattr(settings, "polar_env", "sandbox")
    # Ensure the allowlist covers ALLOWED_SUCCESS_URL and a known attacker origin.
    monkeypatch.setattr(settings, "cors_origins", [ALLOWED_ORIGIN])
    yield _FakeClient


@pytest.fixture
def payload():
    return PolarCheckoutPayload(
        product_id="prod_abc",
        customer_email="attacker@example.com",  # must be IGNORED by the backend
        success_url=ALLOWED_SUCCESS_URL,
    )


@pytest.mark.asyncio
async def test_known_customer_passes_customer_id(fake_polar, payload):
    """Returning customer (polar_customer_id present) → customer_id set, no external_customer_id."""
    current_user = {
        "id": USER_ID,
        "email": USER_EMAIL,
        "polar_customer_id": "cus_existing_123",
    }

    result = await create_polar_checkout(payload, current_user)

    body = fake_polar.captured_body
    assert body["customer_id"] == "cus_existing_123"
    assert "external_customer_id" not in body
    # For known customers Polar already has the email, so we don't send it.
    assert "customer_email" not in body
    assert result == {"status": "success", "url": "https://polar.sh/checkout/test"}


@pytest.mark.asyncio
async def test_new_customer_passes_external_id_and_email(fake_polar, payload):
    """New customer (no polar_customer_id) → external_customer_id + customer_email, no customer_id."""
    current_user = {
        "id": USER_ID,
        "email": USER_EMAIL,
        "polar_customer_id": None,
    }

    await create_polar_checkout(payload, current_user)

    body = fake_polar.captured_body
    assert body["external_customer_id"] == USER_ID
    assert body["customer_email"] == USER_EMAIL
    assert "customer_id" not in body


@pytest.mark.asyncio
async def test_uses_current_user_email_not_payload_email(fake_polar, payload):
    """The email sent to Polar comes from current_user, never the client-supplied payload value."""
    current_user = {
        "id": USER_ID,
        "email": USER_EMAIL,
        "polar_customer_id": None,
    }

    await create_polar_checkout(payload, current_user)

    body = fake_polar.captured_body
    assert body["customer_email"] == USER_EMAIL
    assert body["customer_email"] != payload.customer_email


@pytest.mark.asyncio
async def test_forwards_product_id_and_success_url(fake_polar, payload):
    """product_id and success_url are forwarded to Polar unchanged."""
    current_user = {"id": USER_ID, "email": USER_EMAIL, "polar_customer_id": None}

    await create_polar_checkout(payload, current_user)

    body = fake_polar.captured_body
    assert body["product_id"] == "prod_abc"
    assert body["success_url"] == ALLOWED_SUCCESS_URL


@pytest.mark.asyncio
async def test_known_customer_forwards_product_id_and_success_url(fake_polar, payload):
    """product_id/success_url forwarding is independent of the customer branch."""
    current_user = {
        "id": USER_ID,
        "email": USER_EMAIL,
        "polar_customer_id": "cus_existing_123",
    }

    await create_polar_checkout(payload, current_user)

    body = fake_polar.captured_body
    assert body["product_id"] == "prod_abc"
    assert body["success_url"] == ALLOWED_SUCCESS_URL


# ---------------------------------------------------------------------------
# SCHOLARDOCX-0157 hardening tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rejects_non_allowlisted_success_url(fake_polar, payload):
    """success_url outside the CORS allowlist is rejected with 400 (open-redirect guard)."""
    payload.success_url = "https://attacker.example/steal"
    current_user = {"id": USER_ID, "email": USER_EMAIL, "polar_customer_id": None}

    with pytest.raises(HTTPException) as exc:
        await create_polar_checkout(payload, current_user)

    assert exc.value.status_code == 400
    # No request should have reached the provider.
    assert fake_polar.captured_body is None


@pytest.mark.asyncio
async def test_generic_error_on_upstream_failure(fake_polar, payload):
    """Upstream error response must NOT leak the provider name or its body to the user."""
    _FakeClient.response = _FakeResponse(status_code=422)  # upstream failure
    current_user = {"id": USER_ID, "email": USER_EMAIL, "polar_customer_id": None}

    with pytest.raises(HTTPException) as exc:
        await create_polar_checkout(payload, current_user)

    assert exc.value.status_code == 400
    detail = exc.value.detail
    # No infrastructure name and no upstream body echoed (AGENTS.md rule).
    assert "polar" not in detail.lower()
    assert "req_123" not in detail
    assert "upstream detail" not in detail
