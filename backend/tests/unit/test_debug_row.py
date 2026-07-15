import pytest
from sqlalchemy import text
from app.services.admin import AdminService
from tests.unit.test_admin_notifications import make_session, seed_user

def test_debug_row(tmp_path):
    session = make_session(tmp_path)
    try:
        seed_user(session, 2, "member@example.com", {"system": False})

        result = AdminService(session).send_notifications(
            1,
            title="Required system notice",
            body="This category should always deliver.",
            category="system",
            recipient_user_ids=[2],
        )

        rows = session.execute(text("SELECT * FROM notifications WHERE user_id = 2")).fetchall()
        print(f"DEBUG: Found {len(rows)} rows: {rows}")
        assert len(rows) > 0, "No rows found!"
    finally:
        session.close()
