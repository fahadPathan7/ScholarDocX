from datetime import datetime
from unittest import mock

from fastapi import HTTPException

from app.api.admin import list_plan_requests as list_admin_plan_requests, review_plan_request, PlanRequestReviewPayload
from app.auth.limits import invalidate_limits_cache
from app.api.auth import PlanRequestPayload, list_my_plan_requests, request_plan_upgrade
from app.db.connection import get_engine
from app.services.admin import AdminService
from app.services.store import Store

from tests.helpers import cleanup_user_records, make_settings


# SCHOLARDOCX-0140: primary keys are UUID strings. Fixed UUIDs give the tests a
# stable user/admin id without relying on a DB-assigned integer sequence.
TEST_USER_ID = "00000000-0000-0000-0000-000000000002"
TEST_ADMIN_ID = "00000000-0000-0000-0000-000000000001"


def make_store(tmp_path):
    settings = make_settings(tmp_path)
    from sqlalchemy.orm import sessionmaker
    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    store = Store(session)
    # Route raw SQL through the legacy shim (translates '?' placeholders,
    # supports lastrowid / row["col"]) instead of the raw psycopg3 dbapi
    # connection, which rejects '?' placeholders. SCHOLARDOCX-0140.
    connection = store.legacy_connection
    seed_user(connection, TEST_ADMIN_ID, "plan-admin@example.com", '["super_admin", "max_user"]')
    return store, connection


def _cleanup_user(connection, user_id, email):
    cleanup_user_records(connection, user_id=user_id, email=email)


def seed_user(connection, user_id, email, roles, plan_started_at=None, plan_ends_at=None):
    # SCHOLARDOCX-0140: clean up any prior run's rows for this fixed id/email
    # before inserting, so re-runs against the shared Postgres DB don't hit a
    # unique/FK violation (the DB is not reset between test sessions).
    _cleanup_user(connection, user_id, email)
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
        seed_user(connection, TEST_USER_ID, "member@example.com", '["pro_user"]')

        payload = PlanRequestPayload(
            requested_plan="pro_user",
            request_type="extension",
            billing_cycle="monthly",
            message="Please extend my current plan.",
        )

        response = request_plan_upgrade(payload, store, {"id": TEST_USER_ID})

        row = connection.execute(
            """
            SELECT request_type, requested_plan, billing_cycle, message
            FROM plan_upgrade_requests
            WHERE user_id = ?
            """,
            (TEST_USER_ID,),
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
        seed_user(connection, TEST_USER_ID, "member@example.com", '["pro_user"]')
        connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message, status)
            VALUES
              (?, 'upgrade', 'max_user', 'monthly', 'Need more limits.', 'Pending'),
              (?, 'extension', 'pro_user', 'quarterly', 'Please renew.', 'Approved')
            """,
            (TEST_USER_ID, TEST_USER_ID),
        )
        connection.commit()

        response = list_my_plan_requests(store, {"id": TEST_USER_ID})

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
            TEST_USER_ID,
            "member@example.com",
            '["pro_user"]',
            plan_started_at="2026-06-01T00:00:00",
            plan_ends_at="2026-06-20T00:00:00",
        )
        request_id = connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message)
            VALUES (?, 'extension', 'pro_user', 'monthly', 'Please extend my pro plan.')
            """,
            (TEST_USER_ID,),
        ).lastrowid
        connection.commit()

        with mock.patch("app.services.admin.datetime", FixedDatetime):
            result = AdminService(store.db).resolve_plan_request(TEST_ADMIN_ID, request_id, "approve")

        updated_user = connection.execute(
            "SELECT roles, plan_started_at, plan_ends_at FROM users WHERE id = ?", (TEST_USER_ID,)
        ).fetchone()

        assert result["status"] == "success"
        assert updated_user["roles"] == '["pro_user"]'
        assert str(updated_user["plan_started_at"]).startswith("2026-06-01 00:00:00")
        assert str(updated_user["plan_ends_at"]).startswith("2026-07-20 00:00:00")
    finally:
        store.db.close()


def test_approve_expired_plan_extension_starts_from_approval_time(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(
            connection,
            TEST_USER_ID,
            "member@example.com",
            '["pro_user"]',
            plan_started_at="2026-05-01T00:00:00",
            plan_ends_at="2026-06-02T00:00:00",
        )
        request_id = connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message)
            VALUES (?, 'extension', 'pro_user', 'quarterly', 'Please renew my pro plan.')
            """,
            (TEST_USER_ID,),
        ).lastrowid
        connection.commit()

        with mock.patch("app.services.admin.datetime", FixedDatetime):
            result = AdminService(store.db).resolve_plan_request(TEST_ADMIN_ID, request_id, "approve")

        updated_user = connection.execute(
            "SELECT roles, plan_started_at, plan_ends_at FROM users WHERE id = ?", (TEST_USER_ID,)
        ).fetchone()

        assert result["status"] == "success"
        assert updated_user["roles"] == '["pro_user"]'
        assert str(updated_user["plan_started_at"]).startswith("2026-06-06 12:00:00")
        assert str(updated_user["plan_ends_at"]).startswith("2026-09-04 12:00:00")
    finally:
        store.db.close()


def test_upgrade_request_replaces_current_plan(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(
            connection,
            TEST_USER_ID,
            "member@example.com",
            '["pro_user"]',
            plan_started_at="2026-06-01T00:00:00",
            plan_ends_at="2026-06-20T00:00:00",
        )
        request_id = connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message)
            VALUES (?, 'upgrade', 'max_user', 'monthly', 'Please upgrade me.')
            """,
            (TEST_USER_ID,),
        ).lastrowid
        connection.commit()

        with mock.patch("app.services.admin.datetime", FixedDatetime):
            result = AdminService(store.db).resolve_plan_request(TEST_ADMIN_ID, request_id, "approve")

        updated_user = connection.execute(
            "SELECT roles, plan_started_at, plan_ends_at FROM users WHERE id = ?", (TEST_USER_ID,)
        ).fetchone()

        assert result["status"] == "success"
        assert updated_user["roles"] == '["max_user"]'
        assert str(updated_user["plan_started_at"]).startswith("2026-06-06 12:00:00")
        assert str(updated_user["plan_ends_at"]).startswith("2026-07-06 12:00:00")
    finally:
        store.db.close()



def test_admin_plan_request_listing_uses_requests_permission_for_extension_requests(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        seed_user(connection, TEST_USER_ID, "member@example.com", '["pro_user"]')
        connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message, status)
            VALUES (?, 'extension', 'pro_user', 'monthly', 'Renew me.', 'Pending')
            """,
            (TEST_USER_ID,),
        )
        connection.commit()

        current_user = {
            "id": "00000000-0000-0000-0000-00000000000a",
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

        matching_rows = [row for row in rows if row["user_id"] == TEST_USER_ID]
        assert len(matching_rows) == 1
        assert matching_rows[0]["request_type"] == "extension"
    finally:
        store.db.close()


def test_cannot_request_multiple_pending_plans(tmp_path):
    """
    Ensure a user cannot create a new plan request if they already have one pending.
    """
    store, connection = make_store(tmp_path)
    try:
        user_id = "00000000-0000-0000-0000-000000000110"
        seed_user(connection, user_id, "test@example.com", '["general_user"]')

        # Insert first pending request
        connection.execute(
        """
        INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, status)
        VALUES (?, 'upgrade', 'pro_user', 'Pending')
        """, (user_id,)
    )
        connection.commit()

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
        seed_user(connection, TEST_USER_ID, "member@example.com", '["pro_user"]')
        request_id = connection.execute(
            """
            INSERT INTO plan_upgrade_requests (user_id, request_type, requested_plan, billing_cycle, message, status)
            VALUES (?, 'extension', 'pro_user', 'monthly', 'Renew me.', 'Pending')
            """,
            (TEST_USER_ID,),
        ).lastrowid
        connection.commit()

        current_user = {
            "id": "00000000-0000-0000-0000-00000000000a",
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
