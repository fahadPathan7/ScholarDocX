import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.connection import connect
from app.core.config import get_settings

client = TestClient(app)
settings = get_settings()


def _delete_user_safely(conn, email):
    """Delete a user and the child rows registration creates for it.

    The register endpoint inserts rows into local_profiles, user_usage_stats,
    document_categories and sets registered_with_invite_id. Several of those
    FKs are ON DELETE NO ACTION, so a bare ``DELETE FROM users`` raises a
    foreign-key error when those children exist — which happens on a fresh
    workspace (e.g. CI) once any test has registered the user. Clearing the
    dependents first lets the user be removed cleanly so registration tests can
    re-create it from scratch each run.
    """
    row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        return
    uid = row["id"]
    conn.execute("UPDATE users SET registered_with_invite_id = NULL WHERE id = ?", (uid,))
    for child in ("local_profiles", "user_usage_stats", "document_categories"):
        conn.execute(f"DELETE FROM {child} WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM users WHERE id = ?", (uid,))


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
    conn.execute("INSERT INTO users (id, email, password_hash, display_name, roles, is_active) VALUES (1, 'admin@localhost', '$2b$12$Ips0zkIqEjVyfWtGRl7BH.TFYknvo8RypghNzxslffUkwXV32k/zq', 'Applicant', '[\"super_admin\", \"max_user\"]', 1) ON CONFLICT (id) DO NOTHING")
    conn.execute("INSERT INTO invite_codes (code, max_uses, used_count, created_by) VALUES ('TEST_INVITE', 1, 0, 1) ON CONFLICT (code) DO UPDATE SET max_uses = EXCLUDED.max_uses, used_count = EXCLUDED.used_count, created_by = EXCLUDED.created_by")
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
    conn = connect(settings.database_target)
    try:
        row = conn.execute(
            "SELECT value FROM app_settings WHERE key = 'jwt_secret_key'"
        ).fetchone()
    finally:
        conn.close()
    assert row is not None
    assert row["value"]
    assert not str(row["value"]).startswith("scholar-docx-secure personal workspace")


@pytest.mark.regression
def test_forged_token_with_committed_constant_is_rejected():
    """A JWT signed with the publicly-known committed secret must NOT authenticate.

    Regression for the role-guard bypass: previously the secret WAS the
    committed constant, so a forged super_admin token granted full access.
    """
    from app.auth.jwt import create_token

    forged = create_token(
        {
            "id": 1,
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
            "INSERT INTO invite_codes (code, max_uses, used_count, created_by) "
            "VALUES ('INVITE_IDOR_A', 5, 0, 1) "
            "ON CONFLICT (code) DO UPDATE SET max_uses = EXCLUDED.max_uses, "
            "used_count = EXCLUDED.used_count, created_by = EXCLUDED.created_by"
        )
        conn.execute(
            "INSERT INTO invite_codes (code, max_uses, used_count, created_by) "
            "VALUES ('INVITE_IDOR_B', 5, 0, 1) "
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
