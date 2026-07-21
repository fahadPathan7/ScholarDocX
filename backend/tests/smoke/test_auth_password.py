import pytest

from app.auth.password import (
    generate_random_password,
    hash_password,
    validate_password_strength,
    validate_password_with_reason,
    verify_password,
)


@pytest.mark.smoke
def test_hash_and_verify_password():
    password = "MySecurePassword123!"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword123!", hashed) is False


def test_generate_random_password():
    password = generate_random_password(16)

    assert len(password) == 16
    assert validate_password_strength(password) is True


@pytest.mark.smoke
def test_validate_password_strength():
    assert validate_password_strength("StrongPass1!") is True
    assert validate_password_strength("weakpass") is False
    assert validate_password_strength("NoSpecialChar123") is False
    assert validate_password_strength("nouppercase1!") is False
    assert validate_password_strength("NOLOWERCASE1!") is False
    assert validate_password_strength("NoNumber!") is False
    assert validate_password_strength("Short1!") is False


# ──────────────────────────────────────────────────────────────────────────
# SCHOLARDOCX-0168: validate_password_with_reason tests.
#
# The previous boolean validator left callers to invent their own failure
# messages, which drifted out of sync with the actual rule (3 sites claimed
# "3 to 10 characters" when the real rule is 8+ with upper/lower/digit/
# special). validate_password_with_reason returns the specific failing reason
# so the rule and the message can never drift apart.
# ──────────────────────────────────────────────────────────────────────────


def test_validate_password_with_reason_success():
    """A password meeting all rules returns (True, None)."""
    ok, reason = validate_password_with_reason("StrongPass1!")
    assert ok is True
    assert reason is None


def test_validate_password_with_reason_too_short():
    """Length < 8 is the first failure surfaced."""
    ok, reason = validate_password_with_reason("Ab1!")
    assert ok is False
    assert reason is not None
    assert "8" in reason            # mentions the real minimum
    assert "10" not in reason       # no fake max


def test_validate_password_with_reason_missing_uppercase():
    """An 8+ char password without uppercase surfaces that specific rule."""
    ok, reason = validate_password_with_reason("alllowercase1!")
    assert ok is False
    assert reason is not None
    assert "uppercase" in reason.lower()


def test_validate_password_with_reason_missing_lowercase():
    ok, reason = validate_password_with_reason("ALLUPPERCASE1!")
    assert ok is False
    assert reason is not None
    assert "lowercase" in reason.lower()


def test_validate_password_with_reason_missing_digit():
    ok, reason = validate_password_with_reason("NoDigitHere!")
    assert ok is False
    assert reason is not None
    assert "digit" in reason.lower()


def test_validate_password_with_reason_missing_special():
    ok, reason = validate_password_with_reason("NoSpecialChar123")
    assert ok is False
    assert reason is not None
    assert "special" in reason.lower()


def test_validate_password_with_reason_no_fake_max_length():
    """Regression guard: there is no upper bound on length. A 100-char
    password that satisfies all other rules must pass."""
    pw = "Ab1!" + "x" * 96   # 100 chars total, satisfies every rule
    ok, reason = validate_password_with_reason(pw)
    assert ok is True
    assert reason is None


def test_validate_password_with_reason_checks_in_documented_order():
    """First-failure-wins: a password that is both too short AND missing
    every other category should surface the length error, not whatever
    happens to evaluate first."""
    ok, reason = validate_password_with_reason("a")
    assert ok is False
    assert reason is not None
    assert "8" in reason
    assert "uppercase" not in reason.lower()  # length was the first failure
