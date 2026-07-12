"""Unit tests for the central rate limiter (app.auth.rate_limit).

These tests exercise the in-memory sliding-window logic directly against a
fresh ``RateLimiter`` instance (not the module-level singleton) so they are
isolated and deterministic. They also verify the rule registry that powers the
admin Info tab.
"""

import time

import pytest
from fastapi import HTTPException

from app.auth.rate_limit import (
    RATE_LIMIT_RULES,
    RateLimiter,
    _human_window,
    user_identity,
)


# A small rule mirrored from the real registry shape so tests can manipulate
# timing without touching production buckets.
TEST_RULES = [
    {
        "key": "test_three_per_min",
        "label": "Test (3/min)",
        "method": "POST",
        "path": "/test/three",
        "max_requests": 3,
        "window_seconds": 60,
        "scope": "user",
        "message": "too many (test 3/min)",
    },
    {
        "key": "test_one_per_hour",
        "label": "Test (1/hour)",
        "method": "POST",
        "path": "/test/one",
        "max_requests": 1,
        "window_seconds": 3600,
        "scope": "ip",
        "message": "too many (test 1/hour)",
    },
]


@pytest.fixture
def limiter(monkeypatch):
    """A RateLimiter whose rule table is the small TEST_RULES set."""
    fake_by_key = {r["key"]: r for r in TEST_RULES}
    monkeypatch.setattr("app.auth.rate_limit._RULES_BY_KEY", fake_by_key)
    monkeypatch.setattr("app.auth.rate_limit.RATE_LIMIT_RULES", TEST_RULES)
    inst = RateLimiter()
    return inst


# ---------------------------------------------------------------------- check()
def test_check_passes_below_threshold(limiter):
    limiter.record("test_three_per_min", "alice")
    limiter.record("test_three_per_min", "alice")
    # Two attempts, threshold is 3 -> still allowed (does not raise).
    limiter.check("test_three_per_min", "alice")


def test_check_raises_at_threshold(limiter):
    for _ in range(3):
        limiter.record("test_three_per_min", "alice")
    with pytest.raises(HTTPException) as exc:
        limiter.check("test_three_per_min", "alice")
    assert exc.value.status_code == 429
    assert exc.value.detail == "too many (test 3/min)"


# --------------------------------------------------------------------- record()
def test_record_appends(limiter):
    limiter.record("test_three_per_min", "alice")
    limiter.record("test_three_per_min", "alice")
    bucket = limiter._buckets[("test_three_per_min", "alice")]
    assert len(bucket) == 2


def test_record_unknown_key_raises(limiter):
    with pytest.raises(KeyError):
        limiter.record("does_not_exist", "alice")


# ----------------------------------------------------------- check_and_record()
def test_check_and_record_atomic_threshold(limiter):
    """After max_requests successful calls, the next must trip 429."""
    for _ in range(3):
        limiter.check_and_record("test_three_per_min", "alice")
    with pytest.raises(HTTPException) as exc:
        limiter.check_and_record("test_three_per_min", "alice")
    assert exc.value.status_code == 429


def test_check_and_record_independent_identities(limiter):
    """alice and bob must have completely independent buckets."""
    for _ in range(3):
        limiter.check_and_record("test_three_per_min", "alice")
    # alice is maxed out, but bob is unaffected.
    limiter.check_and_record("test_three_per_min", "bob")
    limiter.check_and_record("test_three_per_min", "bob")


def test_check_and_record_unknown_key_raises(limiter):
    with pytest.raises(KeyError):
        limiter.check_and_record("nope", "alice")


# --------------------------------------------------------------- window pruning
def test_old_entries_expire(monkeypatch, limiter):
    """Timestamps older than the window are pruned and no longer count."""
    fake_now = [1_000_000.0]
    monkeypatch.setattr("app.auth.rate_limit.time.time", lambda: fake_now[0])

    # Fill the bucket at t0.
    for _ in range(3):
        limiter.check_and_record("test_three_per_min", "alice")

    # Advance beyond the 60s window. All three prior entries should be pruned,
    # so a fresh call should succeed and not raise.
    fake_now[0] += 61
    limiter.check_and_record("test_three_per_min", "alice")  # no raise


# ---------------------------------------------------------------- unknown rules
def test_check_unknown_key_raises(limiter):
    with pytest.raises(KeyError):
        limiter.check("does_not_exist", "alice")


# ------------------------------------------------------------------- catalog()
def test_catalog_matches_registry():
    """The module-level singleton catalog must reflect RATE_LIMIT_RULES."""
    from app.auth.rate_limit import rate_limiter

    catalog = rate_limiter.catalog()
    assert len(catalog) == len(RATE_LIMIT_RULES)
    keys = {entry["rule_key"] for entry in catalog}
    expected = {r["key"] for r in RATE_LIMIT_RULES}
    assert keys == expected


def test_catalog_entry_shape():
    from app.auth.rate_limit import rate_limiter

    catalog = rate_limiter.catalog()
    sample = catalog[0]
    required_fields = {
        "rule_key",
        "label",
        "description",
        "method",
        "path",
        "max_requests",
        "window_seconds",
        "window_label",
        "scope",
    }
    assert required_fields.issubset(sample.keys())
    assert sample["description"]  # non-empty


def test_registry_contains_original_four_auth_limits():
    """The refactor must preserve the four original auth rate-limit rules."""
    keys = {r["key"] for r in RATE_LIMIT_RULES}
    assert {
        "auth_login",
        "auth_register",
        "auth_invite_request",
        "auth_forgot_password",
    }.issubset(keys)


def test_every_rule_has_a_description():
    """Each rule must carry a non-empty human-readable description."""
    for rule in RATE_LIMIT_RULES:
        assert isinstance(rule.get("description"), str)
        assert rule["description"].strip(), f"missing description for {rule['key']}"


def test_registry_contains_new_endpoint_limits():
    """Coverage expansion: the new endpoints must be present."""
    keys = {r["key"] for r in RATE_LIMIT_RULES}
    # SCHOLARDOCX-0137 wave 1
    assert {
        "auth_contact_admin",
        "ai_chat",
        "ai_research",
        "ai_summarize",
        "scholarship_deep_hunt_run",
        "advisor_atlas_run",
        "news_search",
        "news_query_preview",
    }.issubset(keys)
    # SCHOLARDOCX-0137 wave 2 — the remaining expensive/costly endpoints
    assert {
        "ai_action_plan",
        "ai_action_execute",
        "scholarship_analyze",
        "advisor_atlas_candidate_refresh",
        "scholarship_catalog_check_cycle",
        "files_upload",
        "auth_password_change",
    }.issubset(keys)


# ------------------------------------------------------------------ helpers
def test_human_window_formats():
    assert _human_window(60) == "1 minute"
    assert _human_window(120) == "2 minutes"
    assert _human_window(3600) == "1 hour"
    assert _human_window(1800) == "30 minutes"
    assert _human_window(45) == "45 seconds"


def test_user_identity():
    assert user_identity({"id": 7}) == "user:7"
    assert user_identity(None) == "anonymous"
    assert user_identity({}) == "anonymous"


# ---------------------------------------------------- singleton reset isolation
def test_singleton_reset_clears_state():
    """The shared singleton should expose reset() for test cleanup."""
    from app.auth.rate_limit import rate_limiter

    rate_limiter.record("auth_login", "10.0.0.1")
    assert ("auth_login", "10.0.0.1") in rate_limiter._buckets
    rate_limiter.reset()
    assert rate_limiter._buckets == {}
