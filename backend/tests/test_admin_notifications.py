import json
from typing import Optional
import pytest

from app.db.connection import get_engine, initialize_database
from app.services.admin import AdminService
from sqlalchemy.orm import sessionmaker


def make_session(tmp_path):
    database_path = tmp_path / "app.db"
    initialize_database(database_path)
    engine = get_engine(database_path)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


def seed_user(connection, user_id: int, email: str, settings: Optional[dict] = None):
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
    session = make_session(tmp_path)
    try:
        seed_user(session.connection().connection.dbapi_connection, 2, "enabled@example.com", {"billing": True})
        seed_user(session.connection().connection.dbapi_connection, 3, "disabled@example.com", {"billing": False})

        result = AdminService(session).send_notifications(
            1,
            title="Billing update",
            body="Your billing cycle was updated.",
            category="billing",
            send_to_all=True,
        )

        rows = session.connection().connection.dbapi_connection.execute(
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
        session.close()


def test_system_notifications_remain_deliverable_even_if_flagged_false(tmp_path):
    session = make_session(tmp_path)
    try:
        seed_user(session.connection().connection.dbapi_connection, 2, "member@example.com", {"system": False})

        result = AdminService(session).send_notifications(
            1,
            title="Required system notice",
            body="This category should always deliver.",
            category="system",
            recipient_user_ids=[2],
        )

        row = session.connection().connection.dbapi_connection.execute(
            "SELECT user_id, title, preference_key FROM notifications WHERE user_id = 2"
        ).fetchone()

        assert result["status"] == "success"
        assert result["delivered_count"] == 1
        assert result["skipped_count"] == 0
        assert row["preference_key"] == "system"
    finally:
        session.close()


def test_send_notifications_requires_known_category(tmp_path):
    session = make_session(tmp_path)
    try:
        seed_user(session.connection().connection.dbapi_connection, 2, "member@example.com")

        with pytest.raises(ValueError, match="Unsupported notification category"):
            AdminService(session).send_notifications(
                1,
                title="Unknown category",
                body="This should fail.",
                category="custom",
                recipient_user_ids=[2],
            )
    finally:
        session.close()
