import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.connection import connect
from app.core.config import get_settings
from tests.helpers import cleanup_user_records

client = TestClient(app)
settings = get_settings()

# SCHOLARDOCX-0140: primary keys are UUID strings. Fixed UUID for the seeded
# admin user so raw-SQL inserts and forged tokens stay self-consistent.
ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001"


def _delete_user_safely(conn, email):
    cleanup_user_records(conn, email=email)


@pytest.fixture(autouse=True)
def setup_db():
    conn = connect(settings.database_target)
    _delete_user_safely(conn, "test_user@example.com")
    # Several tests register throwaway users through TEST_INVITE (e.g.
    # valid_token_user@example.com). Those users keep registered_with_invite_id
    # pointing at the invite row, and that FK is ON DELETE NO ACTION, so the
    # upsert below (which updates the old invite row) would fail.
    # Detach every user still tied to TEST_INVITE before replacing it.
    conn.execute(
        "UPDATE users SET registered_with_invite_id = NULL "
        "WHERE registered_with_invite_id IN (SELECT id FROM invite_codes WHERE code = 'TEST_INVITE')"
    )
    # Seed admin user
    conn.execute(f"INSERT INTO users (id, email, password_hash, display_name, roles, is_active) VALUES ('{ADMIN_USER_ID}', 'admin@localhost', '$2b$12$Ips0zkIqEjVyfWtGRl7BH.TFYknvo8RypghNzxslffUkwXV32k/zq', 'Applicant', '[\"super_admin\", \"max_user\"]', 1) ON CONFLICT (id) DO NOTHING")
    conn.execute(f"INSERT INTO invite_codes (code, max_uses, used_count, created_by) VALUES ('TEST_INVITE', 1, 0, '{ADMIN_USER_ID}') ON CONFLICT (code) DO UPDATE SET max_uses = EXCLUDED.max_uses, used_count = EXCLUDED.used_count, created_by = EXCLUDED.created_by")
    conn.commit()
    conn.close()

@pytest.mark.regression
def test_register_success():
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test_user@example.com",
            "password": "StrongPassword123!",
            "invite_code": "TEST_INVITE",
            "display_name": "Test User"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"

def test_register_invalid_invite():
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test2@example.com",
            "password": "StrongPassword123!",
            "invite_code": "INVALID_CODE",
            "display_name": "Test User"
        }
    )
    assert response.status_code == 400
    assert "Invalid invite code" in response.json()["detail"]

def test_register_weak_password():
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test3@example.com",
            "password": "weak",
            "invite_code": "TEST_INVITE",
            "display_name": "Test User"
        }
    )
    assert response.status_code == 400

@pytest.mark.regression
def test_login_success():
    # Register first
    client.post(
        "/api/auth/register",
        json={
            "email": "test_user@example.com",
            "password": "StrongPassword123!",
            "invite_code": "TEST_INVITE",
            "display_name": "Test User"
        }
    )
    
    # Login
    response = client.post(
        "/api/auth/login",
        json={
            "email": "test_user@example.com",
            "password": "StrongPassword123!"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "token" in data
    assert data["user"]["email"] == "test_user@example.com"
    assert "free_user" in data["user"]["roles"]

def test_login_invalid_password():
    response = client.post(
        "/api/auth/login",
        json={
            "email": "test_user@example.com",
            "password": "WrongPassword!"
        }
    )
    assert response.status_code == 401

def test_logout():
    response = client.post("/api/auth/logout")
    assert response.status_code == 200


def _register_and_login(email: str, invite_code: str) -> str:
    client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "StrongPassword123!",
            "invite_code": invite_code,
            "display_name": email,
        },
    )
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongPassword123!"},
    )
    assert response.status_code == 200, response.text
    return response.json()["token"]


@pytest.mark.regression
def test_jwt_secret_is_not_the_committed_constant():
    """The signing secret must be a per-install random value, not the committed placeholder."""
    from app.core.config import get_settings
    from app.db.connection import COMPROMISED_JWT_SECRET_PREFIX
    secret = get_settings().jwt_secret_key
    assert secret is not None
    assert secret != ""
    assert not str(secret).startswith(COMPROMISED_JWT_SECRET_PREFIX)


@pytest.mark.regression
def test_forged_token_with_committed_constant_is_rejected():
    """A JWT signed with the publicly-known committed secret must NOT authenticate.

    Regression for the role-guard bypass: previously the secret WAS the
    committed constant, so a forged super_admin token granted full access.
    """
    from app.auth.jwt import create_token

    forged = create_token(
        {
            "id": ADMIN_USER_ID,
            "email": "admin@localhost",
            "display_name": "Forged",
            "roles": ["super_admin"],
            "is_active": 1,
            "token_version": 1,
        },
        "scholar-docx-secure personal workspace-secret-key-do-not-use-in-cloud",
        30,
    )
    response = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {forged}"}
    )
    assert response.status_code == 401


def test_valid_login_token_still_authenticates():
    """Sanity check: legitimate login tokens still work after the secret change."""
    token = _register_and_login("valid_token_user@example.com", "TEST_INVITE")
    response = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "valid_token_user@example.com"


@pytest.mark.regression
def test_news_bookmarks_are_scoped_per_user():
    """User B must never see user A's bookmarks (IDOR regression)."""
    conn = connect(settings.database_target)
    try:
        conn.execute(
            f"INSERT INTO invite_codes (code, max_uses, used_count, created_by) "
            f"VALUES ('INVITE_IDOR_A', 5, 0, '{ADMIN_USER_ID}') "
            "ON CONFLICT (code) DO UPDATE SET max_uses = EXCLUDED.max_uses, "
            "used_count = EXCLUDED.used_count, created_by = EXCLUDED.created_by"
        )
        conn.execute(
            f"INSERT INTO invite_codes (code, max_uses, used_count, created_by) "
            f"VALUES ('INVITE_IDOR_B', 5, 0, '{ADMIN_USER_ID}') "
            "ON CONFLICT (code) DO UPDATE SET max_uses = EXCLUDED.max_uses, "
            "used_count = EXCLUDED.used_count, created_by = EXCLUDED.created_by"
        )
        conn.execute("DELETE FROM bookmarked_news WHERE article_id = 'ART-IDOR-A'")
        _delete_user_safely(conn, "idor.a@example.com")
        _delete_user_safely(conn, "idor.b@example.com")
        conn.commit()
    finally:
        conn.close()

    token_a = _register_and_login("idor.a@example.com", "INVITE_IDOR_A")
    token_b = _register_and_login("idor.b@example.com", "INVITE_IDOR_B")

    created = client.post(
        "/api/news/bookmarks",
        json={"article_id": "ART-IDOR-A", "title": "A", "link": "https://a.test"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert created.status_code == 200, created.text

    response = client.get(
        "/api/news/bookmarks", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert response.status_code == 200
    article_ids = {row["article_id"] for row in response.json()}
    assert "ART-IDOR-A" not in article_ids


def test_plans_requires_authentication():
    """The role-limit matrix must not leak to anonymous callers."""
    response = client.get("/api/auth/plans")
    assert response.status_code in (401, 403)
