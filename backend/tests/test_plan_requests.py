from datetime import datetime
from unittest import mock

from fastapi import HTTPException

from app.api.admin import list_plan_requests as list_admin_plan_requests, review_plan_request, PlanRequestReviewPayload
from app.auth.limits import invalidate_limits_cache
from app.api.auth import PlanRequestPayload, list_my_plan_requests, request_plan_upgrade
from app.db.connection import connect, initialize_database
from app.services.admin import AdminService
from app.services.store import Store


def make_store(tmp_path):
    database_path = tmp_path / "app.db"
    initialize_database(database_path)
    from app.db.connection import get_engine
    from sqlalchemy.orm import sessionmaker
    engine = get_engine(database_path)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    return Store(session), session.connection().connection.dbapi_connection


def seed_user(connection, user_id, email, roles, plan_started_at=None, plan_ends_at=None):
    connection.execute(
        """
        INSERT INTO users (
            id, email, password_hash, display_name, roles, is_active, is_blocked,
            plan_started_at, plan_ends_at
        ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
        """,
        (
            user_id,
            email,
            "$2b$12$Ips0zkIqEjVyfWtGRl7BH.TFYknvo8RypghNzxslffUkwXV32k/zq",
            "Test User",
            roles,
            plan_started_at,
            plan_ends_at,
        ),
    )
    connection.commit()


class FixedDatetime(datetime):
    fixed_now = datetime(2026, 6, 6, 12, 0, 0)

    @classmethod
    def utcnow(cls):
        return cls.fixed_now

    @classmethod
    def now(cls, tz=None):
        if tz is not None:
            return cls.fixed_now.replace(tzinfo=tz)
        return cls.fixed_now


def test_plan_request_endpoint_persists_request_type(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com", '["pro_user"]')

        payload = PlanRequestPayload(
            requested_plan="pro_user",
            request_type="extension",
            billing_cycle="monthly",
            message="Please extend my current plan.",
        )

        response = request_plan_upgrade(payload, store, {"id": 2})

        row = connection.execute(
            """
            SELECT request_type, requested_plan, billing_cycle, message
            FROM plan_upgrade_requests
            WHERE user_id = 2
            """,
        ).fetchone()

        assert response["status"] == "success"
        assert row["request_type"] == "extension"
        assert row["requested_plan"] == "pro_user"
        assert row["billing_cycle"] == "monthly"
    finally:
        store.db.close()


def test_list_my_plan_requests_returns_user_history(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com", '["pro_user"]')
        connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message, status)
            VALUES
              (2, 'upgrade', 'max_user', 'monthly', 'Need more limits.', 'Pending'),
              (2, 'extension', 'pro_user', 'yearly', 'Please renew.', 'Approved')
            """
        )
        connection.commit()

        response = list_my_plan_requests(store, {"id": 2})

        assert response["status"] == "success"
        assert len(response["requests"]) == 2
        assert {request["request_type"] for request in response["requests"]} == {"upgrade", "extension"}
    finally:
        store.db.close()


def test_approve_plan_extension_extends_active_plan_from_current_end(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(
            connection,
            2,
            "member@example.com",
            '["pro_user"]',
            plan_started_at="2026-06-01T00:00:00",
            plan_ends_at="2026-06-20T00:00:00",
        )
        request_id = connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message)
            VALUES (2, 'extension', 'pro_user', 'monthly', 'Please extend my pro plan.')
            """,
        ).lastrowid
        connection.commit()

        with mock.patch("app.services.admin.datetime", FixedDatetime):
            result = AdminService(store.db).resolve_plan_request(1, request_id, "approve")

        updated_user = connection.execute(
            "SELECT roles, plan_started_at, plan_ends_at FROM users WHERE id = 2"
        ).fetchone()

        assert result["status"] == "success"
        assert updated_user["roles"] == '["pro_user"]'
        assert updated_user["plan_started_at"] == "2026-06-01T00:00:00"
        assert updated_user["plan_ends_at"] == "2026-07-20T00:00:00"
    finally:
        store.db.close()


def test_approve_expired_plan_extension_starts_from_approval_time(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(
            connection,
            2,
            "member@example.com",
            '["pro_user"]',
            plan_started_at="2026-05-01T00:00:00",
            plan_ends_at="2026-06-02T00:00:00",
        )
        request_id = connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message)
            VALUES (2, 'extension', 'pro_user', 'yearly', 'Please renew my pro plan.')
            """,
        ).lastrowid
        connection.commit()

        with mock.patch("app.services.admin.datetime", FixedDatetime):
            result = AdminService(store.db).resolve_plan_request(1, request_id, "approve")

        updated_user = connection.execute(
            "SELECT roles, plan_started_at, plan_ends_at FROM users WHERE id = 2"
        ).fetchone()

        assert result["status"] == "success"
        assert updated_user["roles"] == '["pro_user"]'
        assert updated_user["plan_started_at"] == "2026-06-06T12:00:00"
        assert updated_user["plan_ends_at"] == "2027-06-06T12:00:00"
    finally:
        store.db.close()


def test_upgrade_request_replaces_current_plan(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(
            connection,
            2,
            "member@example.com",
            '["pro_user"]',
            plan_started_at="2026-06-01T00:00:00",
            plan_ends_at="2026-06-20T00:00:00",
        )
        request_id = connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message)
            VALUES (2, 'upgrade', 'max_user', 'monthly', 'Please upgrade me.')
            """,
        ).lastrowid
        connection.commit()

        with mock.patch("app.services.admin.datetime", FixedDatetime):
            result = AdminService(store.db).resolve_plan_request(1, request_id, "approve")

        updated_user = connection.execute(
            "SELECT roles, plan_started_at, plan_ends_at FROM users WHERE id = 2"
        ).fetchone()

        assert result["status"] == "success"
        assert updated_user["roles"] == '["max_user"]'
        assert updated_user["plan_started_at"] == "2026-06-06T12:00:00"
        assert updated_user["plan_ends_at"] == "2026-07-06T12:00:00"
    finally:
        store.db.close()



def test_admin_plan_request_listing_uses_requests_permission_for_extension_requests(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com", '["pro_user"]')
        connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message, status)
            VALUES (2, 'extension', 'pro_user', 'monthly', 'Renew me.', 'Pending')
            """
        )
        connection.commit()

        current_user = {
            "id": 10,
            "roles": ["general_admin"],
            "plan_started_at": None,
            "plan_ends_at": None,
        }
        connection.execute(
            "UPDATE role_limits SET limit_count = 1 WHERE role = 'general_admin' AND feature = 'admin_manage_plan_requests'"
        )
        connection.commit()
        invalidate_limits_cache()

        rows = list_admin_plan_requests("all", AdminService(store.db), current_user)

        assert len(rows) == 1
        assert rows[0]["request_type"] == "extension"
    finally:
        store.db.close()


def test_cannot_request_multiple_pending_plans(tmp_path):
    """
    Ensure a user cannot create a new plan request if they already have one pending.
    """
    store, connection = make_store(tmp_path)
    try:
        user_id = 110
        seed_user(connection, user_id, "test@example.com", '["general_user"]')
        
        # Insert first pending request
        store.connection.execute(
        """
        INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, status)
        VALUES (?, 'upgrade', 'pro_user', 'Pending')
        """, (user_id,)
    )
        store.connection.commit()
        
        # Try to insert second request via API-like flow
        from app.api.auth import request_plan_upgrade, PlanRequestPayload
        from fastapi import HTTPException
        
        payload = PlanRequestPayload(
            requested_plan="max_user",
            request_type="extension",
            billing_cycle="monthly",
            message="Please approve"
        )
        
        try:
            request_plan_upgrade(payload, store=store, current_user={"id": user_id})
            assert False, "Should have raised HTTPException"
        except HTTPException as e:
            assert e.status_code == 400
            assert "already have a pending plan request" in e.detail
    finally:
        store.db.close()


def test_admin_plan_request_review_blocks_extension_without_requests_permission(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com", '["pro_user"]')
        request_id = connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message, status)
            VALUES (2, 'extension', 'pro_user', 'monthly', 'Renew me.', 'Pending')
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
            "UPDATE role_limits SET limit_count = 0 WHERE role = 'general_admin' AND feature = 'admin_manage_plan_requests'"
        )
        connection.commit()
        invalidate_limits_cache()

        try:
            review_plan_request(
                request_id,
                PlanRequestReviewPayload(action="Approve"),
                AdminService(store.db),
                current_user,
            )
            assert False, "Expected HTTPException for missing requests permission"
        except HTTPException as exc:
            assert exc.status_code == 403
            assert "ADMIN_MANAGE_PLAN_REQUESTS" in str(exc.detail) or "admin_manage_plan_requests" in str(exc.detail).lower()
    finally:
        store.db.close()
