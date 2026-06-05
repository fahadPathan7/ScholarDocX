import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.connection import connect
from app.core.config import get_settings

client = TestClient(app)
settings = get_settings()

@pytest.fixture(autouse=True)
def setup_db():
    conn = connect(settings.database_path)
    # Seed admin user
    conn.execute("INSERT OR IGNORE INTO users (id, email, password_hash, display_name, roles, is_active) VALUES (1, 'admin@localhost', '$2b$12$Ips0zkIqEjVyfWtGRl7BH.TFYknvo8RypghNzxslffUkwXV32k/zq', 'Applicant', '[\"super_admin\", \"max_user\"]', 1)")
    conn.execute("INSERT OR REPLACE INTO invite_codes (code, max_uses, used_count, created_by) VALUES ('TEST_INVITE', 1, 0, 1)")
    # Clear test users
    conn.execute("DELETE FROM users WHERE email = 'test_user@example.com'")
    conn.commit()
    conn.close()

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
    assert "general_user" in data["user"]["roles"]

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
