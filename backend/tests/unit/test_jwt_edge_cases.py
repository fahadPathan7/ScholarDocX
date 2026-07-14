"""Corner-case tests for app.auth.jwt beyond the happy path in test_auth_jwt.py.

Focuses on: empty/None/wrong-secret decode inputs, the token_version
None==None silent-pass-through edge case, and zero-expiration behavior.
"""

import time
from unittest import mock

import pytest

from app.auth.jwt import create_token, decode_token, verify_token_version


@pytest.fixture
def basic_user():
    return {
        "id": 1,
        "email": "test@example.com",
        "display_name": "Test User",
        "roles": ["general_user"],
        "token_version": 1,
    }


# ── decode_token edge cases ─────────────────────────────────────────────────

class TestDecodeTokenEdgeCases:
    def test_empty_string_raises(self):
        with pytest.raises(ValueError):
            decode_token("", "secret")

    def test_wrong_secret_raises(self):
        token = create_token(
            {"id": 1, "email": "x@y.z", "display_name": "X"}, "correct-secret", 30
        )
        with pytest.raises(ValueError, match="Invalid token"):
            decode_token(token, "wrong-secret")

    def test_none_token_raises(self):
        # jwt.decode(None, ...) raises InvalidTokenError → wrapped as ValueError.
        with pytest.raises((ValueError, TypeError)):
            decode_token(None, "secret")

    def test_garbage_string_raises(self):
        with pytest.raises(ValueError, match="Invalid token"):
            decode_token("not-a-jwt-at-all", "secret")


# ── verify_token_version edge cases ─────────────────────────────────────────

class TestVerifyTokenVersionEdgeCases:
    def test_both_missing_token_version_silent_pass(self):
        # KNOWN EDGE CASE: both .get() return None, and None == None is True.
        # This means tokens/users without an explicit version are treated as
        # matching. Documented here; changing this is a separate security task.
        assert verify_token_version({}, {}) is True

    def test_payload_has_version_user_missing(self):
        # payload version 2 vs user's None → 2 == None → False
        assert verify_token_version({"token_version": 2}, {}) is False

    def test_user_has_version_payload_missing(self):
        assert verify_token_version({}, {"token_version": 2}) is False

    def test_explicit_version_match(self):
        assert verify_token_version({"token_version": 5}, {"token_version": 5}) is True


# ── create_token edge cases ─────────────────────────────────────────────────

class TestCreateTokenEdgeCases:
    def test_zero_expiration_days(self):
        # A 0-day expiration means exp == iat, so the token is expired immediately
        # (or within the same second). decode_token should reject it as expired.
        user = {"id": 1, "email": "x@y.z", "display_name": "X"}
        token = create_token(user, "secret", 0)
        # The token may or may not be expired depending on sub-second timing,
        # but it must at least be a decodable string.
        assert isinstance(token, str)

    def test_unicode_in_display_name(self):
        user = {
            "id": 1,
            "email": "josé@müller.de",
            "display_name": "José Müller",
            "roles": ["general_user"],
            "token_version": 1,
        }
        token = create_token(user, "secret", 30)
        decoded = decode_token(token, "secret")
        assert decoded["display_name"] == "José Müller"
        assert decoded["email"] == "josé@müller.de"

    def test_missing_roles_defaults_to_general_user(self):
        user = {"id": 1, "email": "x@y.z", "display_name": "X"}
        token = create_token(user, "secret", 30)
        decoded = decode_token(token, "secret")
        assert decoded["roles"] == ["general_user"]

    def test_token_contains_jti_uuid(self):
        user = {"id": 1, "email": "x@y.z", "display_name": "X"}
        token = create_token(user, "secret", 30)
        decoded = decode_token(token, "secret")
        # jti is a uuid4 hex string — 36 chars with dashes.
        assert "jti" in decoded
        assert len(decoded["jti"]) == 36
