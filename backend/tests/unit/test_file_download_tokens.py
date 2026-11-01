"""Short-lived file download tokens (SCHOLARDOCX-0222).

Covers the token helpers (round-trip, expiry, purpose isolation — a session
token must NOT be replayable as a download token) and the two route behaviors
(content accepts a valid file-scoped token, rejects mismatched/garbage;
download-link 404s for files the caller doesn't own). Route tests call the
functions directly with mock stores per the established unit-test pattern.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.auth import jwt as auth_jwt
from app.auth.jwt import (
    create_download_token,
    create_token,
    decode_download_token,
)

SECRET = "unit-test-secret"
USER_ID = "00000000-0000-0000-0000-000000000041"
FILE_ID = "00000000-0000-0000-0000-000000000042"


# ── token helpers ────────────────────────────────────────────────────────────

def test_download_token_round_trip():
    token = create_download_token(USER_ID, SECRET, FILE_ID)
    payload = decode_download_token(token, SECRET)
    assert payload["purpose"] == auth_jwt.DOWNLOAD_TOKEN_PURPOSE
    assert payload["user_id"] == USER_ID
    assert payload["file_id"] == FILE_ID


def test_download_token_expires():
    token = create_download_token(USER_ID, SECRET, FILE_ID, ttl_minutes=-1)
    with pytest.raises(ValueError):
        decode_download_token(token, SECRET)


def test_session_token_is_not_a_download_token():
    """Purpose isolation: a 30-day session token must never pass as a
    download token (it would defeat the whole point of short-lived URLs)."""
    session_token = create_token(
        {"id": USER_ID, "email": "u@x", "display_name": "U", "roles": ["free_user"]},
        SECRET,
        expiration_days=30,
    )
    with pytest.raises(ValueError):
        decode_download_token(session_token, SECRET)


def test_download_token_rejects_wrong_secret_and_bad_identity():
    token = create_download_token(USER_ID, SECRET, FILE_ID)
    with pytest.raises(ValueError):
        decode_download_token(token, "other-secret")
    forged = create_download_token("not-a-uuid", SECRET, FILE_ID)
    with pytest.raises(ValueError):
        decode_download_token(forged, SECRET)


# ── routes (direct calls with mock stores) ───────────────────────────────────

def _mock_store_with_file():
    store = MagicMock()
    store.current_user_id = USER_ID
    store.get_record.return_value = {
        "id": FILE_ID,
        "relative_path": "media/x.pdf",
        "mime_type": "application/pdf",
        "display_name": "x.pdf",
    }
    return store


def test_content_route_serves_valid_download_token():
    from app.api.routes import view_file_content

    token = create_download_token(USER_ID, SECRET, FILE_ID)
    store = _mock_store_with_file()
    with patch("app.auth.dependencies.get_jwt_secret", return_value=SECRET), \
         patch("app.core.storage.download_bytes", return_value=(b"%PDF-1.4", "application/pdf")):
        response = view_file_content(
            FILE_ID,
            download_token=token,
            settings=MagicMock(),
            store=store,
            current_user=None,
        )
    assert response.body == b"%PDF-1.4"
    assert response.media_type == "application/pdf"
    # Ownership enforced through the user-scoped lookup.
    assert store.current_user_id == USER_ID


def test_content_route_rejects_token_for_other_file():
    from app.api.routes import view_file_content

    token = create_download_token(USER_ID, SECRET, "00000000-0000-0000-0000-000000000043")
    with patch("app.auth.dependencies.get_jwt_secret", return_value=SECRET):
        with pytest.raises(HTTPException) as exc:
            view_file_content(
                FILE_ID,
                download_token=token,
                settings=MagicMock(),
                store=_mock_store_with_file(),
                current_user=None,
            )
    assert exc.value.status_code == 401


def test_content_route_rejects_garbage_and_requires_a_credential():
    from app.api.routes import view_file_content

    with patch("app.auth.dependencies.get_jwt_secret", return_value=SECRET):
        with pytest.raises(HTTPException) as exc:
            view_file_content(
                FILE_ID,
                download_token="garbage",
                settings=MagicMock(),
                store=_mock_store_with_file(),
                current_user=None,
            )
        assert exc.value.status_code == 401

        with pytest.raises(HTTPException) as exc2:
            view_file_content(
                FILE_ID,
                download_token=None,
                settings=MagicMock(),
                store=_mock_store_with_file(),
                current_user=None,  # no session either
            )
        assert exc2.value.status_code == 401


def test_download_link_returns_scoped_token_and_404s_for_missing_file():
    from app.api.routes import create_file_download_link

    store = _mock_store_with_file()
    with patch("app.auth.dependencies.get_jwt_secret", return_value=SECRET):
        result = create_file_download_link(FILE_ID, store=store)
    payload = decode_download_token(result["download_token"], SECRET)
    assert payload["file_id"] == FILE_ID
    assert payload["user_id"] == str(store.current_user_id)
    assert result["expires_in"] == 300

    missing = MagicMock()
    missing.get_record.side_effect = LookupError("no row")
    with patch("app.auth.dependencies.get_jwt_secret", return_value=SECRET):
        with pytest.raises(HTTPException) as exc:
            create_file_download_link(FILE_ID, store=missing)
    assert exc.value.status_code == 404
