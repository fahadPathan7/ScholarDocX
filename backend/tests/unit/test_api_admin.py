import json
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from unittest.mock import patch, MagicMock
from app.auth.dependencies import get_current_user
from app.services.admin import AdminService

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


# ──────────────────────────────────────────────────────────────────────────
# SCHOLARDOCX-0167: signup_method / plan_source tests.
#
# signup_method is an immutable origin fact stored on the row (set once at
# user creation); list_users passes it through, only falling back to 'admin'
# if the column is somehow NULL. plan_source, by contrast, IS derived from
# mutable current-state fields (polar_subscription_id, paid-tier roles) since
# it reflects the user's current plan funding, not their origin.
#
# We feed fixture rows through a mocked connection and assert:
#   - signup_method passes through unchanged (origin is durable)
#   - signup_method falls back to 'admin' on a NULL column (legacy hole)
#   - plan_source derives correctly for the 4 plan-funding lifecycle states
# ──────────────────────────────────────────────────────────────────────────


def _make_admin_service_with_rows(rows):
    """Build an AdminService whose list_users query returns the given rows.

    AdminService.__init__ takes a LegacyConnection directly via its
    `isinstance(db, LegacyConnection)` fast path, then reads `db.db`. We mock
    both the inner `db` attribute and the outer connection's
    `.execute(...).fetchall()` chain so the classifier runs against fixture
    rows without needing a real DB.
    """
    from app.db.legacy_db import LegacyConnection
    fake_connection = MagicMock(spec=LegacyConnection)
    fake_connection.db = MagicMock()  # inner SQLAlchemy session, unused here
    fake_connection.execute.return_value.fetchall.return_value = rows
    svc = AdminService(db=fake_connection)
    return svc


def _user_row(
    *,
    roles,
    signup_method=None,
    registered_with_invite_id=None,
    invite_code=None,
    polar_customer_id=None,
    polar_subscription_id=None,
    pending_payment_since=None,
    plan_ends_at=None,
    is_active=True,
):
    """Build a single user row as returned by the list_users SELECT.

    `roles` is passed as a Python list and serialized to JSON to match how
    Postgres stores/returns the column. `signup_method` defaults to None to
    exercise the NULL-fallback path; callers who want to assert passthrough
    pass an explicit value.
    """
    return {
        "id": 1,
        "email": "user@test.com",
        "display_name": "Test User",
        "roles": json.dumps(roles),
        "is_active": is_active,
        "is_blocked": False,
        "last_login_at": None,
        "plan_started_at": None,
        "plan_ends_at": plan_ends_at,
        "created_at": None,
        "token_version": 1,
        "polar_customer_id": polar_customer_id,
        "polar_subscription_id": polar_subscription_id,
        "signup_method": signup_method,
        "polar_cancel_at_period_end": False,
        "plan_renews_at": None,
        "pending_payment_since": pending_payment_since,
        "registered_with_invite_id": registered_with_invite_id,
        "invite_code": invite_code,
    }


# ── signup_method passthrough tests ──────────────────────────────────────
# signup_method is now a stored origin column, not derived. list_users must
# pass it through verbatim. These tests confirm that, regardless of any
# mutable current-state fields (roles, polar links, pending_payment_since),
# the stored origin value wins.

def test_signup_method_invite_passthrough():
    """Stored 'invite' origin passes through even if the user later acquired
    paid roles or polar links (origin ≠ current state)."""
    row = _user_row(
        roles=["pro_user"],
        signup_method="invite",
        polar_customer_id="pol_cust_999",  # added later, must not change origin
        polar_subscription_id="sub_999",
    )
    result = _make_admin_service_with_rows([row]).list_users()[0]
    assert result["signup_method"] == "invite"


def test_signup_method_purchase_passthrough():
    """The fahad@gmail.com case: stored 'purchase' origin passes through even
    after pending_payment_since is cleared by the activation webhook."""
    row = _user_row(
        roles=["pro_user"],
        signup_method="purchase",
        polar_customer_id="pol_cust_123",
        polar_subscription_id="sub_123",
        pending_payment_since=None,  # cleared on activation — was the old bug
        is_active=True,
    )
    result = _make_admin_service_with_rows([row]).list_users()[0]
    assert result["signup_method"] == "purchase"


def test_signup_method_admin_passthrough():
    """The fahadpathan56@gmail.com case: stored 'admin' origin passes through
    EVEN IF the account has polar_customer_id set (e.g. attached for testing).
    This is the regression that prompted making signup_method a persisted
    column instead of a derived value."""
    row = _user_row(
        roles=["super_admin", "max_user"],
        signup_method="admin",
        polar_customer_id="pol_cust_56",  # present, but origin is still admin
        polar_subscription_id="sub_56",
    )
    result = _make_admin_service_with_rows([row]).list_users()[0]
    assert result["signup_method"] == "admin"


def test_signup_method_null_falls_back_to_admin():
    """Safety net: if a legacy row has NULL (e.g. migration hole), list_users
    falls back to 'admin' rather than crashing or returning None."""
    row = _user_row(roles=["free_user"], signup_method=None)
    result = _make_admin_service_with_rows([row]).list_users()[0]
    assert result["signup_method"] == "admin"


def test_plan_source_polar():
    """Active Polar subscription present → plan_source 'polar'."""
    row = _user_row(
        roles=["pro_user"],
        polar_customer_id="pol_cust_123",
        polar_subscription_id="sub_123",
    )
    result = _make_admin_service_with_rows([row]).list_users()[0]
    assert result["plan_source"] == "polar"


def test_plan_source_admin_set():
    """Paid-tier role WITHOUT a Polar subscription (admin granted the plan)
    → 'admin_set'. Note: plan_ends_at must NOT override this either way."""
    row = _user_row(roles=["pro_user"], plan_ends_at="2026-12-31")
    result = _make_admin_service_with_rows([row]).list_users()[0]
    assert result["plan_source"] == "admin_set"


def test_plan_source_none_for_free_user():
    """Self-registered free user with no Polar link and no paid-tier role → 'none'."""
    row = _user_row(roles=["free_user"], signup_method="invite")
    result = _make_admin_service_with_rows([row]).list_users()[0]
    assert result["plan_source"] == "none"


def test_plan_source_none_for_admin_created_free_user():
    """Admin-created free user → 'none'. Free plans are subscription-free
    regardless of origin or a stale plan_ends_at (SCHOLARDOCX-0170)."""
    row = _user_row(roles=["free_user"], signup_method="admin", plan_ends_at="2026-08-20")
    result = _make_admin_service_with_rows([row]).list_users()[0]
    assert result["plan_source"] == "none"


def test_plan_source_admin_set_for_admin_created_paid_user():
    """Admin-created user on a PAID tier → 'admin_set' (origin admin)."""
    row = _user_row(roles=["pro_user"], signup_method="admin", plan_ends_at="2026-08-20")
    result = _make_admin_service_with_rows([row]).list_users()[0]
    assert result["plan_source"] == "admin_set"


# ──────────────────────────────────────────────────────────────────────────
# SCHOLARDOCX-0170: free plans must not carry an expiration date.
#
# update_user_roles / create_user / resolve_plan_request must set
# plan_ends_at = NULL when the assigned tier is free_user. Paid tiers keep
# their duration / custom-date behavior. We capture the UPDATE/INSERT params
# via a mocked connection and assert the plan_ends_at argument.
# ──────────────────────────────────────────────────────────────────────────


def _capture_admin_service():
    """Build an AdminService whose connection records every execute() call.

    Returns (svc, calls) where `calls` is the list of (sql, params) tuples.
    The Polar-subscription guard SELECT returns a row with no active sub so
    role updates are allowed; INSERT calls return a cursor with lastrowid.
    """
    from app.db.legacy_db import LegacyConnection
    fake_connection = MagicMock(spec=LegacyConnection)
    fake_connection.db = MagicMock()

    calls = []

    def _execute(sql, params=()):
        calls.append((str(sql), params))
        result = MagicMock()
        # fetchone returns None by default: this makes both the Polar-guard
        # SELECT (update_user_roles) and the email-exists SELECT (create_user)
        # pass through — no active sub, no pre-existing email.
        result.fetchone.return_value = None
        # create_user reads cursor.lastrowid.
        result.lastrowid = 42
        return result

    fake_connection.execute.side_effect = _execute
    svc = AdminService(db=fake_connection)
    return svc, calls


def _find_user_update_call(calls):
    """Return the params tuple of the UPDATE users ... plan_ends_at call."""
    for sql, params in calls:
        if "UPDATE users" in sql and "plan_ends_at" in sql:
            return params
    raise AssertionError("No UPDATE users with plan_ends_at was executed")


def test_update_user_roles_free_plan_sets_no_end_date():
    """Setting a user's tier to free_user must NULL plan_ends_at."""
    svc, calls = _capture_admin_service()
    svc.get_user_details = MagicMock(return_value={"id": 1, "roles": ["free_user"]})
    svc.update_user_roles(admin_id=2, user_id=1, roles=["free_user"])
    params = _find_user_update_call(calls)
    # UPDATE users SET roles=?, plan_started_at=?, plan_ends_at=?, ... WHERE id=?
    # plan_ends_at is the 3rd positional param.
    assert params[2] is None, f"free plan must have NULL plan_ends_at, got {params[2]!r}"
    assert params[1] is not None, "plan_started_at should be set"


def test_update_user_roles_paid_plan_sets_end_date():
    """Regression guard: paid tier still gets a plan_ends_at (duration path)."""
    svc, calls = _capture_admin_service()
    svc.get_user_details = MagicMock(return_value={"id": 1, "roles": ["pro_user"]})
    svc.update_user_roles(admin_id=2, user_id=1, roles=["pro_user"], plan_duration_days=30)
    params = _find_user_update_call(calls)
    assert params[2] is not None, "paid plan must have a plan_ends_at"


def test_create_user_free_plan_sets_no_end_date():
    """Admin-created free user must be inserted with plan_ends_at = NULL."""
    svc, calls = _capture_admin_service()
    svc.get_user_details = MagicMock(return_value={"id": 42, "roles": ["free_user"]})
    svc.create_user(
        admin_id=2,
        email="free@test.com",
        password_hash="hash",
        display_name="Free",
        roles=["free_user"],
        plan_duration="1_month",
    )
    insert_params = None
    for sql, params in calls:
        if "INSERT INTO users" in sql:
            insert_params = params
            break
    assert insert_params is not None, "No INSERT INTO users was executed"
    # INSERT INTO users (email, password_hash, display_name, roles, is_active,
    # plan_started_at, plan_ends_at, signup_method) VALUES (?, ?, ?, ?, 1, ?, ?, 'admin')
    # Bound params in order: email(0), password_hash(1), display_name(2),
    # roles_json(3), plan_started_at(4), plan_ends_at(5).
    assert insert_params[5] is None, f"free plan must have NULL plan_ends_at, got {insert_params[5]!r}"
    assert insert_params[4] is not None, "plan_started_at should be set"


def test_create_user_paid_plan_sets_end_date():
    """Regression guard: admin-created paid tier still gets plan_ends_at."""
    svc, calls = _capture_admin_service()
    svc.get_user_details = MagicMock(return_value={"id": 42, "roles": ["pro_user"]})
    svc.create_user(
        admin_id=2,
        email="pro@test.com",
        password_hash="hash",
        display_name="Pro",
        roles=["pro_user"],
        plan_duration="1_month",
    )
    insert_params = None
    for sql, params in calls:
        if "INSERT INTO users" in sql:
            insert_params = params
            break
    assert insert_params is not None
    assert insert_params[5] is not None, "paid plan must have a plan_ends_at"

