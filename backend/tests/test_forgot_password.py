from fastapi import HTTPException

from app.api.admin import resolve_password_reset_request, PasswordResetResolvePayload
from app.api.auth import ForgotPasswordPayload, forgot_password, _password_reset_attempts
from app.auth.limits import invalidate_limits_cache
from app.auth.password import verify_password
from app.db.connection import initialize_database
from app.services.admin import AdminService
from app.services.store import Store


GENERIC_SUBSTRING = "request has been submitted to the administrator"


def make_store(tmp_path):
    database_path = tmp_path / "app.db"
    initialize_database(database_path)
    from app.db.connection import get_engine
    from sqlalchemy.orm import sessionmaker
    engine = get_engine(database_path)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    return Store(session), session.connection().connection.dbapi_connection


def seed_user(connection, user_id, email, roles='["general_user"]'):
    connection.execute(
        """
        INSERT INTO users (id, email, password_hash, display_name, roles, is_active, is_blocked)
        VALUES (?, ?, ?, ?, ?, 1, 0)
        """,
        (
            user_id,
            email,
            "$2b$12$Ips0zkIqEjVyfWtGRl7BH.TFYknvo8RypghNzxslffUkwXV32k/zq",
            "Test User",
            roles,
        ),
    )
    connection.commit()


class FakeRequest:
    """Minimal stand-in for fastapi.Request exposing request.client.host."""

    def __init__(self, host: str):
        self.client = type("Client", (), {"host": host})()


def reset_rate_limiter():
    # The IP rate limiter is a module-level dict shared across tests; clear it
    # so each test starts with a fresh per-IP budget.
    _password_reset_attempts.clear()


def count_requests(connection, user_id=None):
    if user_id is None:
        return connection.execute("SELECT COUNT(*) FROM password_reset_requests").fetchone()[0]
    return connection.execute(
        "SELECT COUNT(*) FROM password_reset_requests WHERE user_id = ?", (user_id,)
    ).fetchone()[0]


def test_forgot_password_creates_request_for_known_user(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        reset_rate_limiter()
        seed_user(connection, 2, "member@example.com")

        resp = forgot_password(
            ForgotPasswordPayload(email="member@example.com"),
            FakeRequest("10.0.0.10"),
            store,
        )

        assert resp["status"] == "success"
        assert GENERIC_SUBSTRING in resp["message"]
        assert count_requests(connection, 2) == 1
        row = connection.execute(
            "SELECT status, ip_address FROM password_reset_requests WHERE user_id = 2"
        ).fetchone()
        assert row["status"] == "Pending"
        assert row["ip_address"] == "10.0.0.10"
    finally:
        store.db.close()


def test_forgot_password_unknown_email_creates_no_row_same_message(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        reset_rate_limiter()
        resp = forgot_password(
            ForgotPasswordPayload(email="nobody@example.com"),
            FakeRequest("10.0.0.11"),
            store,
        )
        assert resp["status"] == "success"
        assert GENERIC_SUBSTRING in resp["message"]
        assert count_requests(connection) == 0
    finally:
        store.db.close()


def test_forgot_password_max_one_pending_per_user(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        reset_rate_limiter()
        seed_user(connection, 2, "member@example.com")

        first = forgot_password(
            ForgotPasswordPayload(email="member@example.com"),
            FakeRequest("10.0.0.21"),
            store,
        )
        # Second attempt from a different IP so the per-IP limit does not apply;
        # the per-user "one pending" rule must still block a second row.
        second = forgot_password(
            ForgotPasswordPayload(email="member@example.com"),
            FakeRequest("10.0.0.22"),
            store,
        )

        assert first["message"] == second["message"]
        assert count_requests(connection, 2) == 1
    finally:
        store.db.close()


def test_forgot_password_ip_rate_limit_one_per_hour(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        reset_rate_limiter()
        seed_user(connection, 2, "member@example.com")

        first = forgot_password(
            ForgotPasswordPayload(email="member@example.com"),
            FakeRequest("10.0.0.31"),
            store,
        )
        second = forgot_password(
            ForgotPasswordPayload(email="member@example.com"),
            FakeRequest("10.0.0.31"),  # same IP within the 1h window
            store,
        )

        assert first["message"] == second["message"]
        # Only the first call should have created a row.
        assert count_requests(connection, 2) == 1
    finally:
        store.db.close()


def test_resolve_set_password_updates_hash_and_token_version(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com")
        before = connection.execute(
            "SELECT password_hash, token_version FROM users WHERE id = 2"
        ).fetchone()

        request_id = connection.execute(
            """
            INSERT INTO password_reset_requests (email, user_id, ip_address, status)
            VALUES ('member@example.com', 2, '10.0.0.40', 'Pending')
            """
        ).lastrowid
        connection.commit()

        result = AdminService(store.db).resolve_password_reset_request(
            admin_id=1, request_id=request_id, action="set_password", new_password="NewPass!2024"
        )

        after = connection.execute(
            "SELECT password_hash, token_version FROM users WHERE id = 2"
        ).fetchone()
        req = connection.execute(
            "SELECT status, reviewed_by FROM password_reset_requests WHERE id = ?", (request_id,)
        ).fetchone()

        assert result["status"] == "success"
        assert after["password_hash"] != before["password_hash"]
        assert after["token_version"] == before["token_version"] + 1
        assert verify_password("NewPass!2024", after["password_hash"]) is True
        assert req["status"] == "Completed"
        assert req["reviewed_by"] == 1
    finally:
        store.db.close()


def test_resolve_dismiss_marks_dismissed_without_changing_password(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com")
        before = connection.execute(
            "SELECT password_hash, token_version FROM users WHERE id = 2"
        ).fetchone()

        request_id = connection.execute(
            """
            INSERT INTO password_reset_requests (email, user_id, ip_address, status)
            VALUES ('member@example.com', 2, '10.0.0.50', 'Pending')
            """
        ).lastrowid
        connection.commit()

        result = AdminService(store.db).resolve_password_reset_request(
            admin_id=1, request_id=request_id, action="dismiss"
        )

        after = connection.execute(
            "SELECT password_hash, token_version FROM users WHERE id = 2"
        ).fetchone()
        req = connection.execute(
            "SELECT status FROM password_reset_requests WHERE id = ?", (request_id,)
        ).fetchone()

        assert result["status"] == "success"
        assert req["status"] == "Dismissed"
        assert after["password_hash"] == before["password_hash"]
        assert after["token_version"] == before["token_version"]
    finally:
        store.db.close()


def test_resolve_set_password_requires_non_empty_password(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com")
        request_id = connection.execute(
            """
            INSERT INTO password_reset_requests (email, user_id, ip_address, status)
            VALUES ('member@example.com', 2, '10.0.0.60', 'Pending')
            """
        ).lastrowid
        connection.commit()

        try:
            AdminService(store.db).resolve_password_reset_request(
                admin_id=1, request_id=request_id, action="set_password", new_password="   "
            )
            assert False, "Expected ValueError for empty password"
        except ValueError as e:
            assert "password" in str(e).lower()
    finally:
        store.db.close()


def test_resolve_rejects_already_resolved_request(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com")
        request_id = connection.execute(
            """
            INSERT INTO password_reset_requests (email, user_id, ip_address, status)
            VALUES ('member@example.com', 2, '10.0.0.70', 'Completed')
            """
        ).lastrowid
        connection.commit()

        try:
            AdminService(store.db).resolve_password_reset_request(
                admin_id=1, request_id=request_id, action="dismiss"
            )
            assert False, "Expected ValueError for already-resolved request"
        except ValueError as e:
            assert "resolved" in str(e).lower()
    finally:
        store.db.close()


def test_admin_resolve_blocks_without_permission(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com")
        request_id = connection.execute(
            """
            INSERT INTO password_reset_requests (email, user_id, ip_address, status)
            VALUES ('member@example.com', 2, '10.0.0.80', 'Pending')
            """
        ).lastrowid
        connection.commit()

        current_user = {
            "id": 10,
            "roles": ["general_admin"],
            "plan_started_at": None,
            "plan_ends_at": None,
        }
        connection.execute(
            "UPDATE role_limits SET limit_count = 0 WHERE role = 'general_admin' AND feature = 'admin_manage_password_resets'"
        )
        connection.commit()
        invalidate_limits_cache()

        try:
            resolve_password_reset_request(
                request_id,
                PasswordResetResolvePayload(action="dismiss"),
                AdminService(store.db),
                current_user,
            )
            assert False, "Expected HTTPException for missing password-resets permission"
        except HTTPException as exc:
            assert exc.status_code == 403
    finally:
        store.db.close()


def test_admin_list_password_reset_requests(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com")
        connection.execute(
            """
            INSERT INTO password_reset_requests (email, user_id, ip_address, status)
            VALUES
              ('member@example.com', 2, '10.0.0.90', 'Pending'),
              ('member@example.com', 2, '10.0.0.91', 'Completed')
            """
        )
        connection.commit()

        all_rows = AdminService(store.db).list_password_reset_requests(None)
        pending = AdminService(store.db).list_password_reset_requests("Pending")

        assert len(all_rows) == 2
        assert len(pending) == 1
        assert pending[0]["status"] == "Pending"
        assert pending[0]["user_email"] == "member@example.com"
        assert all_rows[0]["user_email"] == "member@example.com"
    finally:
        store.db.close()


def test_dashboard_stats_counts_pending_password_resets(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com")
        connection.execute(
            """
            INSERT INTO password_reset_requests (email, user_id, status)
            VALUES
              ('member@example.com', 2, 'Pending'),
              ('member@example.com', 2, 'Pending'),
              ('member@example.com', 2, 'Completed'),
              ('member@example.com', 2, 'Dismissed')
            """
        )
        connection.commit()

        stats = AdminService(store.db).get_dashboard_stats()

        assert stats["counts"]["pending_password_resets"] == 2
    finally:
        store.db.close()
