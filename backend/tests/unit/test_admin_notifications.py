import json
import uuid
from typing import Optional
import pytest

from app.db.connection import get_engine
from app.services.admin import AdminService
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from tests.helpers import make_settings


def make_session(tmp_path):
    settings = make_settings(tmp_path)
    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


def seed_user(session, email: str, settings: Optional[dict] = None) -> str:
    """Insert a user with a fresh UUID and return the new user id.

    SCHOLARDOCX-0140: primary keys are UUID strings, so the caller no longer
    passes a fixed integer id — one is generated here.
    """
    user_id = str(uuid.uuid4())
    session.execute(text("DELETE FROM notifications WHERE user_id = :user_id"), {"user_id": user_id})
    session.execute(text("DELETE FROM local_profiles WHERE user_id = :user_id"), {"user_id": user_id})
    session.execute(text("DELETE FROM users WHERE id = :user_id"), {"user_id": user_id})

    # Also delete by email to prevent UniqueViolation if a previous test failed to clean up
    session.execute(text("DELETE FROM users WHERE email = :email"), {"email": email})

    session.execute(
        text("""
        INSERT INTO users (
            id, email, password_hash, display_name, roles, is_active, is_blocked
        ) VALUES (:user_id, :email, :password_hash, :display_name, '["general_user"]', 1, 0)
        """),
        {
            "user_id": user_id,
            "email": email,
            "password_hash": "$2b$12$Ips0zkIqEjVyfWtGRl7BH.TFYknvo8RypghNzxslffUkwXV32k/zq",
            "display_name": "Test User",
        },
    )
    session.execute(
        text("""
        INSERT INTO local_profiles (user_id, display_name, email, notification_settings)
        VALUES (:user_id, 'Test User', :email, :settings)
        """),
        {
            "user_id": user_id,
            "email": email,
            "settings": json.dumps(settings or {}),
        },
    )
    session.commit()
    return user_id


def _admin_id() -> str:
    """Generate a throwaway admin sender id (notifications logging only)."""
    return str(uuid.uuid4())


def test_send_notifications_respects_user_category_preferences(tmp_path):
    session = make_session(tmp_path)
    try:
        enabled_id = seed_user(session, f"enabled-{uuid.uuid4().hex}@example.com", {"billing": True})
        disabled_id = seed_user(session, f"disabled-{uuid.uuid4().hex}@example.com", {"billing": False})

        result = AdminService(session).send_notifications(
            enabled_id,
            title="Billing update",
            body="Your billing cycle was updated.",
            category="billing",
            send_to_all=True,
        )

        rows = session.execute(
            text("SELECT user_id, title, preference_key FROM notifications ORDER BY user_id ASC")
        ).fetchall()

        assert result["status"] == "success"
        assert result["delivered_count"] >= 2
        assert enabled_id in result["delivered_user_ids"]
        assert disabled_id in result.get("skipped_user_ids", [])

        user_ids = [r[0] for r in rows]
        pref_keys = {r[0]: r[2] for r in rows}

        assert enabled_id in user_ids
        assert pref_keys[enabled_id] == "billing"
    finally:
        session.close()


def test_system_notifications_remain_deliverable_even_if_flagged_false(tmp_path):
    session = make_session(tmp_path)
    try:
        member_id = seed_user(session, f"member-{uuid.uuid4().hex}@example.com", {"system": False})

        result = AdminService(session).send_notifications(
            member_id,
            title="Required system notice",
            body="This category should always deliver.",
            category="system",
            recipient_user_ids=[member_id],
        )

        row = session.execute(
            text("SELECT user_id, title, preference_key FROM notifications WHERE user_id = :uid"),
            {"uid": member_id},
        ).fetchone()

        assert result["status"] == "success"
        assert result["delivered_count"] >= 1
        assert member_id in result["delivered_user_ids"]

        assert row is not None, "Notification row for the seeded user was not found in the database. Was it rolled back or deleted by another test?"
        assert row[2] == "system"
    finally:
        session.close()


def test_send_notifications_requires_known_category(tmp_path):
    session = make_session(tmp_path)
    try:
        member_id = seed_user(session, f"member-{uuid.uuid4().hex}@example.com")

        with pytest.raises(ValueError, match="Unsupported notification category"):
            AdminService(session).send_notifications(
                _admin_id(),
                title="Unknown category",
                body="This should fail.",
                category="custom",
                recipient_user_ids=[member_id],
            )
    finally:
        session.close()
