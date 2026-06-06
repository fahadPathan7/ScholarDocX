import json

from app.db.connection import connect, initialize_database
from app.services.admin import AdminService


def make_connection(tmp_path):
    database_path = tmp_path / "app.db"
    initialize_database(database_path)
    return connect(database_path)


def seed_user(connection, user_id: int, email: str, settings: dict | None = None):
    connection.execute(
        """
        INSERT INTO users (
            id, email, password_hash, display_name, roles, is_active, is_blocked
        ) VALUES (?, ?, ?, ?, '["general_user"]', 1, 0)
        """,
        (
            user_id,
            email,
            "$2b$12$Ips0zkIqEjVyfWtGRl7BH.TFYknvo8RypghNzxslffUkwXV32k/zq",
            "Test User",
        ),
    )
    connection.execute(
        """
        INSERT INTO local_profiles (user_id, display_name, email, notification_settings)
        VALUES (?, 'Test User', ?, ?)
        """,
        (
            user_id,
            email,
            json.dumps(settings or {}),
        ),
    )
    connection.commit()


def test_send_notifications_respects_user_category_preferences(tmp_path):
    connection = make_connection(tmp_path)
    try:
        seed_user(connection, 2, "enabled@example.com", {"billing": True})
        seed_user(connection, 3, "disabled@example.com", {"billing": False})

        result = AdminService(connection).send_notifications(
            1,
            title="Billing update",
            body="Your billing cycle was updated.",
            category="billing",
            send_to_all=True,
        )

        rows = connection.execute(
            "SELECT user_id, title, preference_key FROM notifications ORDER BY user_id ASC"
        ).fetchall()

        assert result["status"] == "success"
        assert result["delivered_count"] == 2
        assert result["skipped_count"] == 1
        assert result["delivered_user_ids"] == [1, 2]
        assert result["skipped_user_ids"] == [3]
        assert len(rows) == 2
        assert rows[0]["user_id"] == 1
        assert rows[0]["preference_key"] == "billing"
        assert rows[1]["user_id"] == 2
    finally:
        connection.close()


def test_system_notifications_remain_deliverable_even_if_flagged_false(tmp_path):
    connection = make_connection(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com", {"system": False})

        result = AdminService(connection).send_notifications(
            1,
            title="Required system notice",
            body="This category should always deliver.",
            category="system",
            recipient_user_ids=[2],
        )

        row = connection.execute(
            "SELECT user_id, title, preference_key FROM notifications WHERE user_id = 2"
        ).fetchone()

        assert result["status"] == "success"
        assert result["delivered_count"] == 1
        assert result["skipped_count"] == 0
        assert row["preference_key"] == "system"
    finally:
        connection.close()


def test_send_notifications_requires_known_category(tmp_path):
    connection = make_connection(tmp_path)
    try:
        seed_user(connection, 2, "member@example.com")

        try:
            AdminService(connection).send_notifications(
                1,
                title="Unknown category",
                body="This should fail.",
                category="custom",
                recipient_user_ids=[2],
            )
            raise AssertionError("Expected send_notifications to reject unsupported category")
        except ValueError as exc:
            assert "Unsupported notification category" in str(exc)
    finally:
        connection.close()
