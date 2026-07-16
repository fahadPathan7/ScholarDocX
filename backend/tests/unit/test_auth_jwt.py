import time
from unittest import mock

import pytest
import jwt

from app.auth.jwt import create_token, decode_token, verify_token_version


def test_create_and_decode_token():
    user = {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "test@example.com",
        "display_name": "Test User",
        "roles": ["admin"],
        "token_version": 2
    }
    
    token = create_token(user, "secret", 30)
    assert isinstance(token, str)
    
    payload = decode_token(token, "secret")
    assert payload["user_id"] == "00000000-0000-0000-0000-000000000001"
    assert payload["email"] == "test@example.com"
    assert payload["display_name"] == "Test User"
    assert payload["roles"] == ["admin"]
    assert payload["token_version"] == 2
    assert "jti" in payload
    assert "iat" in payload
    assert "exp" in payload


def test_decode_token_expired():
    user = {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "test@example.com",
        "display_name": "Test User",
    }
    
    # Mock time to create an expired token
    with mock.patch("time.time", return_value=time.time() - (31 * 24 * 3600)):
        token = create_token(user, "secret", 30)
        
    with pytest.raises(ValueError, match="Token has expired"):
        decode_token(token, "secret")


def test_decode_token_invalid():
    with pytest.raises(ValueError, match="Invalid token"):
        decode_token("invalid.token.string", "secret")


def test_decode_token_rejects_legacy_integer_user_id():
    token = jwt.encode(
        {
            "user_id": 1,
            "email": "test@example.com",
            "display_name": "Test User",
            "iat": int(time.time()),
            "exp": int(time.time()) + 60,
        },
        "secret",
        algorithm="HS256",
    )

    with pytest.raises(ValueError, match="Invalid token identity"):
        decode_token(token, "secret")


def test_verify_token_version():
    token_payload = {"token_version": 2}
    user_match = {"token_version": 2}
    user_mismatch = {"token_version": 3}
    
    assert verify_token_version(token_payload, user_match) is True
    assert verify_token_version(token_payload, user_mismatch) is False
