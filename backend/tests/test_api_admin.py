import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from unittest.mock import patch, MagicMock
from app.auth.dependencies import get_current_user

def override_get_current_user_general():
    return {"id": 1, "email": "test@test.com", "roles": ["general_user"]}

def override_get_current_user_admin():
    return {"id": 2, "email": "admin@test.com", "roles": ["general_admin"]}

def override_get_current_user_super():
    return {"id": 3, "email": "super@test.com", "roles": ["super_admin"]}

@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)

def test_admin_routes_protected_by_auth(client):
    response = client.get("/api/admin/dashboard")
    # without token, get_current_user might return 401 or 403
    assert response.status_code in [401, 403]

def test_admin_routes_require_admin_role(client):
    client.app.dependency_overrides[get_current_user] = override_get_current_user_general
    response = client.get("/api/admin/dashboard")
    assert response.status_code == 403
    client.app.dependency_overrides.clear()

@patch("app.services.admin.AdminService.get_dashboard_stats")
def test_admin_routes_allow_admin_role(mock_get_dashboard_stats, client):
    client.app.dependency_overrides[get_current_user] = override_get_current_user_admin
    mock_get_dashboard_stats.return_value = {"counts": {"total_users": 10}, "recent_registrations": [], "recent_logins": []}
    
    response = client.get("/api/admin/dashboard")
    assert response.status_code == 200
    assert response.json()["counts"]["total_users"] == 10
    client.app.dependency_overrides.clear()

@patch("app.services.admin.AdminService.get_user_details")
@patch("app.services.admin.AdminService.update_user_roles")
def test_super_admin_required_for_roles(mock_update_roles, mock_get_user_details, client):
    mock_get_user_details.return_value = {"id": 1, "roles": ["super_admin"]}
    # general_admin should be forbidden
    client.app.dependency_overrides[get_current_user] = override_get_current_user_admin
    response = client.patch("/api/admin/users/1/roles", json={"roles": ["pro_user"]})
    assert response.status_code == 403
    
    # super_admin should be allowed
    client.app.dependency_overrides[get_current_user] = override_get_current_user_super
    mock_update_roles.return_value = {"id": 1, "roles": ["pro_user"]}
    response = client.patch("/api/admin/users/1/roles", json={"roles": ["pro_user"]})
    assert response.status_code == 200
    client.app.dependency_overrides.clear()

@patch("app.services.admin.AdminService.delete_invite_code")
def test_delete_invite_code(mock_delete, client):
    client.app.dependency_overrides[get_current_user] = override_get_current_user_admin
    response = client.delete("/api/admin/invites/TESTCODE")
    assert response.status_code == 200
    mock_delete.assert_called_once_with(2, "TESTCODE")
    client.app.dependency_overrides.clear()

@patch("app.services.admin.AdminService.create_user")
def test_create_user_by_admin_success(mock_create_user, client):
    client.app.dependency_overrides[get_current_user] = override_get_current_user_admin
    mock_create_user.return_value = {"id": 10, "email": "newuser@test.com", "roles": ["general_user"]}
    
    # Password strength check passes
    response = client.post("/api/admin/users", json={
        "email": "newuser@test.com",
        "password": "Password123!",
        "display_name": "New User",
        "roles": ["general_user"]
    })
    assert response.status_code == 200
    assert response.json()["email"] == "newuser@test.com"
    client.app.dependency_overrides.clear()

def test_create_user_by_admin_forbidden_admin_roles(client):
    client.app.dependency_overrides[get_current_user] = override_get_current_user_admin
    
    # Try to assign admin role (general_admin) as a general_admin -> Forbidden
    response = client.post("/api/admin/users", json={
        "email": "newadmin@test.com",
        "password": "Password123!",
        "display_name": "New Admin",
        "roles": ["general_admin"]
    })
    assert response.status_code == 400
    client.app.dependency_overrides.clear()

@patch("app.services.admin.AdminService.create_user")
def test_create_user_by_super_admin_allowed_admin_roles(mock_create_user, client):
    client.app.dependency_overrides[get_current_user] = override_get_current_user_super
    mock_create_user.return_value = {"id": 11, "email": "newadmin@test.com", "roles": ["general_admin"]}
    
    # Super admin can assign administrative roles
    response = client.post("/api/admin/users", json={
        "email": "newadmin@test.com",
        "password": "Password123!",
        "display_name": "New Admin",
        "roles": ["general_admin"]
    })
    assert response.status_code == 200
    client.app.dependency_overrides.clear()
