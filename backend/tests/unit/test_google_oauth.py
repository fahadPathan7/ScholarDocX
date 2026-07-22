"""Unit tests for Google OAuth sign-in/sign-up (SCHOLARDOCX-0169).

Covers the pure, non-network logic:
- ``_resolve_user``: linked-user lookup, auto-link-by-email, active-free
  account creation for brand-new Google users.
- state-cookie signing/verification (CSRF guard).
- ``/auth/google/login`` route: disabled-config 503, enabled-config 302.
- ``/auth/google/callback`` error paths (missing state, mismatch, Google error).

The actual Google token-exchange and id_token validation are NOT tested
here — they require live Google endpoints and are integration concerns.
"""
import time
from unittest import mock

import jwt
import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.db.connection import connect, get_engine
from app.services.store import Store
from tests.helpers import cleanup_user_records, make_settings


# ---------------------------------------------------------------------------
# _resolve_user
# ---------------------------------------------------------------------------

def _store_with_user(tmp_path, uid: str, email: str, linked_google_sub: str | None = None):
    """Create a Store + seed a user (optionally pre-linked to a Google sub).

    Returns (session, store, settings).
    """
    settings = make_settings(tmp_path)
    # Clean any leftover first.
    with connect(settings.database_target) as db:
        cleanup_user_records(db, user_id=uid, email=email)
        db.commit()

    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (:uid, :email, 'x', 'Test', '[\"free_user\"]', 1, 0) "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {"uid": uid, "email": email},
    )
    if linked_google_sub:
        session.execute(
            text(
                "INSERT INTO external_identities "
                "(id, provider, provider_subject_id, user_id, email) "
                "VALUES (:eid, 'google', :sub, :uid, :email) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {
                "eid": uid.replace("0001", "eeee"),
                "sub": linked_google_sub,
                "uid": uid,
                "email": email,
            },
        )
    session.commit()
    store = Store(session)
    store.current_user_id = uid
    return session, store, settings


def test_resolve_user_creates_active_free_account_for_new_google_user(tmp_path):
    """A new Google user → active free account created immediately
    (signup_method='google', is_active=1, roles=['free_user']),
    external identity linked, dependents seeded."""
    from app.api.auth_google import _resolve_user

    settings = make_settings(tmp_path)
    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    store = Store(session)
    email = "newgoogle-resolve@test.local"
    try:
        result = _resolve_user(
            store=store,
            google_sub="google-sub-new-user-001",
            email=email,
            display_name="New Google User",
            avatar_url="https://example.com/avatar.png",
        )
        assert result is not None
        assert result["email"] == email
        assert result["is_active"] == 1  # active immediately
        assert result["signup_method"] == "google"
        assert result["pending_payment_since"] is None  # no pending state
        assert "free_user" in result["roles"]
        # external_identities row was linked.
        linked = store.legacy_connection.execute(
            "SELECT user_id FROM external_identities "
            "WHERE provider = ? AND provider_subject_id = ?",
            ("google", "google-sub-new-user-001"),
        ).fetchone()
        assert linked is not None
        assert linked["user_id"] == result["id"]
        # Dependents seeded.
        profile = store.legacy_connection.execute(
            "SELECT user_id FROM local_profiles WHERE user_id = ?",
            (result["id"],),
        ).fetchone()
        assert profile is not None
    finally:
        session.close()


def test_resolve_user_auto_links_by_email(tmp_path):
    """A verified Google email matching an existing user → auto-link + return user."""
    from app.api.auth_google import _resolve_user

    uid = "00000000-0000-0000-0000-0000000000a1"
    email = "autolink-resolve@test.local"
    session, store, _ = _store_with_user(tmp_path, uid, email)
    try:
        result = _resolve_user(
            store=store,
            google_sub="google-sub-autolink-001",
            email=email,
            display_name="Auto Link",
            avatar_url="https://example.com/a.png",
        )
        assert result is not None
        assert result["email"] == email
        # external_identities row was inserted.
        linked = store.legacy_connection.execute(
            "SELECT provider, provider_subject_id, user_id FROM external_identities "
            "WHERE provider = ? AND provider_subject_id = ?",
            ("google", "google-sub-autolink-001"),
        ).fetchone()
        assert linked is not None
        assert linked["user_id"] == uid
    finally:
        session.close()


def test_resolve_user_finds_existing_linked_identity(tmp_path):
    """A returning linked user is resolved via external_identities (no re-link)."""
    from app.api.auth_google import _resolve_user

    uid = "00000000-0000-0000-0000-0000000000a2"
    email = "linked-resolve@test.local"
    session, store, _ = _store_with_user(
        tmp_path, uid, email, linked_google_sub="google-sub-returning-001"
    )
    try:
        result = _resolve_user(
            store=store,
            google_sub="google-sub-returning-001",
            email=email,
            display_name=None,
            avatar_url=None,
        )
        assert result is not None
        assert result["id"] == uid
        # No duplicate external_identities row.
        rows = store.legacy_connection.execute(
            "SELECT id FROM external_identities "
            "WHERE provider = ? AND provider_subject_id = ?",
            ("google", "google-sub-returning-001"),
        ).fetchall()
        assert len(rows) == 1
    finally:
        session.close()


# ---------------------------------------------------------------------------
# State cookie signing
# ---------------------------------------------------------------------------

def test_state_cookie_roundtrip(monkeypatch):
    """The signed state cookie decodes back to the original state/nonce."""
    monkeypatch.setenv("JWT_SECRET", "test-google-oauth-secret-key-1")
    get_settings.cache_clear()
    try:
        from app.api.auth_google import _STATE_COOKIE_MAX_AGE

        settings = get_settings()
        payload = {
            "oas": "the-state",
            "nonce": "the-nonce",
            "cv": "the-verifier",
            "iat": int(time.time()),
            "exp": int(time.time()) + _STATE_COOKIE_MAX_AGE,
        }
        token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")
        decoded = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
        assert decoded["oas"] == "the-state"
        assert decoded["nonce"] == "the-nonce"
        assert decoded["cv"] == "the-verifier"
    finally:
        get_settings.cache_clear()


def test_state_cookie_rejects_tampering(monkeypatch):
    """A cookie signed with a different secret fails to decode."""
    monkeypatch.setenv("JWT_SECRET", "real-secret-key-1")
    get_settings.cache_clear()
    try:
        forged = jwt.encode(
            {"oas": "x", "nonce": "y", "exp": int(time.time()) + 60},
            "wrong-secret",
            algorithm="HS256",
        )
        settings = get_settings()
        with pytest.raises(jwt.InvalidTokenError):
            jwt.decode(forged, settings.jwt_secret_key, algorithms=["HS256"])
    finally:
        get_settings.cache_clear()


def test_state_cookie_expires(monkeypatch):
    """An expired state cookie fails to decode."""
    monkeypatch.setenv("JWT_SECRET", "test-google-oauth-secret-key-2")
    get_settings.cache_clear()
    try:
        settings = get_settings()
        expired = jwt.encode(
            {
                "oas": "x",
                "nonce": "y",
                "iat": int(time.time()) - 999,
                "exp": int(time.time()) - 100,
            },
            settings.jwt_secret_key,
            algorithm="HS256",
        )
        with pytest.raises(jwt.ExpiredSignatureError):
            jwt.decode(expired, settings.jwt_secret_key, algorithms=["HS256"])
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# /auth/google/login route
# ---------------------------------------------------------------------------

def _import_app():
    """Import (or re-import) the FastAPI app so it picks up current env."""
    import importlib
    import app.main
    importlib.reload(app.main)
    return app.main.app


def test_google_login_returns_503_when_disabled(monkeypatch):
    """No GOOGLE_CLIENT_ID/SECRET → /login returns 503.

    We patch the settings instance's google fields directly because the
    test conftest loads the repo-root .env, which may contain real Google
    credentials. The route checks ``settings.google_enabled`` at request
    time, so patching the lru-cached Settings is the reliable way to
    force the disabled state.
    """
    monkeypatch.setenv("JWT_SECRET", "test-google-oauth-secret-key-3")
    get_settings.cache_clear()
    from fastapi.testclient import TestClient

    app = _import_app()
    client = TestClient(app)
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "", raising=False)
    monkeypatch.setattr(settings, "google_client_secret", "", raising=False)
    try:
        resp = client.get("/api/auth/google/login", follow_redirects=False)
        assert resp.status_code == 503
    finally:
        get_settings.cache_clear()


def test_google_login_redirects_to_google_when_enabled(monkeypatch):
    """With config present, /login 302s to Google and sets the state cookie."""
    monkeypatch.setenv("JWT_SECRET", "test-google-oauth-secret-key-4")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    get_settings.cache_clear()
    from fastapi.testclient import TestClient

    app = _import_app()
    client = TestClient(app)
    try:
        resp = client.get("/api/auth/google/login", follow_redirects=False)
        assert resp.status_code == 302
        loc = resp.headers["location"]
        assert "accounts.google.com/o/oauth2/v2/auth" in loc
        assert "scope=openid" in loc
        # State cookie is set.
        set_cookie = resp.headers.get("set-cookie", "")
        assert "sd_google_oauth_state=" in set_cookie
        assert "HttpOnly" in set_cookie
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# /auth/google/callback error paths
# ---------------------------------------------------------------------------

def test_google_callback_no_state_cookie_redirects_with_error(monkeypatch):
    """Missing state cookie → redirect to /auth-complete?error=..."""
    monkeypatch.setenv("JWT_SECRET", "test-google-oauth-secret-key-5")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    get_settings.cache_clear()
    from fastapi.testclient import TestClient

    app = _import_app()
    client = TestClient(app)
    try:
        resp = client.get(
            "/api/auth/google/callback?code=fakecode&state=fakestate",
            follow_redirects=False,
        )
        assert resp.status_code == 302
        loc = resp.headers["location"]
        assert "auth-complete" in loc
        assert "error=" in loc
    finally:
        get_settings.cache_clear()


def test_google_callback_state_mismatch_redirects_with_error(monkeypatch):
    """State mismatch (cookie state ≠ query state) → error redirect."""
    monkeypatch.setenv("JWT_SECRET", "test-google-oauth-secret-key-6")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    get_settings.cache_clear()
    from fastapi.testclient import TestClient

    app = _import_app()
    client = TestClient(app)
    try:
        # First hit /login to get a valid state cookie.
        login_resp = client.get("/api/auth/google/login", follow_redirects=False)
        # Now hit callback with a DIFFERENT state.
        resp = client.get(
            "/api/auth/google/callback?code=fakecode&state=wrongstate",
            follow_redirects=False,
        )
        assert resp.status_code == 302
        loc = resp.headers["location"]
        assert "error=" in loc
        assert "auth-complete" in loc
    finally:
        get_settings.cache_clear()


def test_google_callback_google_error_param_redirects(monkeypatch):
    """If Google returns ?error=access_denied, user is redirected cleanly."""
    monkeypatch.setenv("JWT_SECRET", "test-google-oauth-secret-key-7")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    get_settings.cache_clear()
    from fastapi.testclient import TestClient

    app = _import_app()
    client = TestClient(app)
    try:
        resp = client.get(
            "/api/auth/google/callback?error=access_denied",
            follow_redirects=False,
        )
        assert resp.status_code == 302
        loc = resp.headers["location"]
        assert "error=" in loc
    finally:
        get_settings.cache_clear()
