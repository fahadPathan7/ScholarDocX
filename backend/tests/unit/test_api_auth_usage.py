from fastapi.testclient import TestClient

from app.main import create_app
from app.auth.dependencies import get_current_user


def override_get_current_user_admin_only():
    return {"id": 2, "email": "admin@test.com", "roles": ["general_admin"]}


def test_usage_for_admin_only_user_is_zeroed():
    app = create_app()
    app.dependency_overrides[get_current_user] = override_get_current_user_admin_only
    client = TestClient(app)

    response = client.get("/api/auth/usage")
    assert response.status_code == 200

    data = response.json()
    limits = data["limits"]
    usage = data["usage"]

    assert limits, "Expected user-level limits map for admin-only users"
    assert usage, "Expected user-level usage map for admin-only users"

    assert all(value == 0 for value in limits.values())
    assert all(value == 0 for value in usage.values())

    app.dependency_overrides.clear()
