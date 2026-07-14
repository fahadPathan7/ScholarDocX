import pytest

from app.auth.password import (
    generate_random_password,
    hash_password,
    validate_password_strength,
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
