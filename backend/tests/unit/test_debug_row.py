"""Debug/regression test for notification row persistence.

Originally used integer user ids (SQLite era). Rewritten to use UUIDs so it
works against the shared Postgres target without FK violations.
"""
import uuid

import pytest
from sqlalchemy import text

from app.services.admin import AdminService
from tests.unit.test_admin_notifications import make_session, seed_user


def test_notification_row_persists_after_send(tmp_path):
    """AdminService.send_notifications must write a row that is immediately
    readable on the same session — regression guard for an earlier bug where
    the row was rolled back before the assert."""
    session = make_session(tmp_path)
    try:
        # Both sender and recipient must be real user rows to satisfy audit_logs FK.
        sender_id = seed_user(
            session,
            f"debug-sender-{uuid.uuid4().hex[:8]}@example.com",
        )
        member_id = seed_user(
            session,
            f"debug-member-{uuid.uuid4().hex[:8]}@example.com",
            {"system": False},
        )

        result = AdminService(session).send_notifications(
            sender_id,
            title="Required system notice",
            body="This category should always deliver.",
            category="system",
            recipient_user_ids=[member_id],
        )

        rows = session.execute(
            text("SELECT * FROM notifications WHERE user_id = :uid"),
            {"uid": member_id},
        ).fetchall()
        assert len(rows) > 0, "Notification row was not found — may have been rolled back."
        assert result["delivered_count"] >= 1
    finally:
        session.close()
