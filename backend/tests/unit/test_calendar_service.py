"""SCHOLARDOCX-0185: manual calendar reminders + sheet-item done checkbox.

Covers app/services/calendar_service.py: merging sheet-derived items with
manual reminders, project-vs-general reminder scoping, and the dashboard-only
sheet-item done toggle (must never touch the underlying sheet row).
"""
from pathlib import Path

import pytest

from app.db.connection import connect, get_db
from app.services import calendar_service
from tests.helpers import make_settings, make_user


def make_project(settings, user_id: str, name: str = "Test Project") -> str:
    with connect(settings.database_target) as db:
        cur = db.execute(
            "INSERT INTO projects (user_id, name) VALUES (?, ?)",
            (user_id, name),
        )
        db.commit()
        return str(cur.lastrowid)


def make_project_page(settings, user_id: str, project_id: str, name: str = "Sheet 1") -> str:
    with connect(settings.database_target) as db:
        cur = db.execute(
            "INSERT INTO project_pages (user_id, project_id, name) VALUES (?, ?, ?)",
            (user_id, project_id, name),
        )
        db.commit()
        return str(cur.lastrowid)


def insert_reminder(settings, user_id: str, title: str, date: str, project_id: str | None = None) -> str:
    with connect(settings.database_target) as db:
        cur = db.execute(
            "INSERT INTO calendar_reminders (user_id, project_id, title, reminder_date) "
            "VALUES (?, ?, ?, ?)",
            (user_id, project_id, title, date),
        )
        db.commit()
        return str(cur.lastrowid)


def test_general_reminder_included_only_on_dashboard(tmp_path: Path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    project_a = make_project(settings, user["id"], "Project A")
    insert_reminder(settings, user["id"], "General reminder", "2026-08-01")

    session = next(get_db(settings.database_target))
    try:
        dashboard_items = calendar_service.build_calendar_items(session, user["id"], [])
        assert any(i["title"] == "General reminder" for i in dashboard_items)

        project_items = calendar_service.build_calendar_items(session, user["id"], [], project_id=project_a)
        assert not any(i["title"] == "General reminder" for i in project_items)
    finally:
        session.close()


def test_project_scoped_reminder_excluded_from_other_projects(tmp_path: Path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    project_a = make_project(settings, user["id"], "Project A")
    project_b = make_project(settings, user["id"], "Project B")
    insert_reminder(settings, user["id"], "Project A reminder", "2026-08-02", project_id=project_a)

    session = next(get_db(settings.database_target))
    try:
        items_a = calendar_service.build_calendar_items(session, user["id"], [], project_id=project_a)
        assert any(i["title"] == "Project A reminder" for i in items_a)

        items_b = calendar_service.build_calendar_items(session, user["id"], [], project_id=project_b)
        assert not any(i["title"] == "Project A reminder" for i in items_b)

        dashboard_items = calendar_service.build_calendar_items(session, user["id"], [])
        matches = [i for i in dashboard_items if i["title"] == "Project A reminder"]
        assert len(matches) == 1
        assert matches[0]["project_name"] == "Project A"
    finally:
        session.close()


def test_build_calendar_items_merges_and_sorts_by_date(tmp_path: Path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    insert_reminder(settings, user["id"], "Later reminder", "2026-08-10")
    insert_reminder(settings, user["id"], "Earlier reminder", "2026-08-01")

    sheet_items = [
        {
            "title": "Sheet row date",
            "date": "2026-08-05",
            "date_key": "2026-08-05",
            "date_field": "Deadline",
            "type": "sheet-date",
            "source": "Applications",
            "page_id": "00000000-0000-0000-0000-000000000000",
            "row_index": 0,
        }
    ]

    session = next(get_db(settings.database_target))
    try:
        merged = calendar_service.build_calendar_items(session, user["id"], sheet_items)
        titles_in_order = [i["title"] for i in merged]
        assert titles_in_order == ["Earlier reminder", "Sheet row date", "Later reminder"]
        sheet_item = next(i for i in merged if i["title"] == "Sheet row date")
        assert sheet_item["id"] == "sheet:00000000-0000-0000-0000-000000000000:0:Deadline"
        assert sheet_item["is_done"] is False
    finally:
        session.close()


def test_set_sheet_item_done_upserts_and_does_not_touch_row(tmp_path: Path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    project_id = make_project(settings, user["id"])
    page_id = make_project_page(settings, user["id"], project_id)

    session = next(get_db(settings.database_target))
    try:
        with connect(settings.database_target) as db:
            before = db.execute(
                "SELECT rows_json FROM project_pages WHERE id = ?", (page_id,)
            ).fetchone()["rows_json"]

        result = calendar_service.set_sheet_item_done(session, user["id"], page_id, 0, "Deadline", True)
        assert result["is_done"] is True

        with connect(settings.database_target) as db:
            after = db.execute(
                "SELECT rows_json FROM project_pages WHERE id = ?", (page_id,)
            ).fetchone()["rows_json"]
        assert before == after

        # Reflected when merged into a calendar item for that same cell.
        sheet_items = [{
            "title": "Row", "date": "2026-08-05", "date_key": "2026-08-05",
            "date_field": "Deadline", "type": "sheet-date", "source": "Sheet",
            "page_id": page_id, "row_index": 0,
        }]
        merged = calendar_service.build_calendar_items(session, user["id"], sheet_items, include_reminders=False)
        assert merged[0]["is_done"] is True

        # Toggle back off.
        calendar_service.set_sheet_item_done(session, user["id"], page_id, 0, "Deadline", False)
        merged2 = calendar_service.build_calendar_items(session, user["id"], sheet_items, include_reminders=False)
        assert merged2[0]["is_done"] is False
    finally:
        session.close()


def test_set_sheet_item_done_rejects_page_owned_by_another_user(tmp_path: Path):
    settings = make_settings(tmp_path)
    owner = make_user(settings, ["general_user"], email="owner@test.local")
    intruder = make_user(settings, ["general_user"], email="intruder@test.local")
    project_id = make_project(settings, owner["id"])
    page_id = make_project_page(settings, owner["id"], project_id)

    session = next(get_db(settings.database_target))
    try:
        with pytest.raises(LookupError):
            calendar_service.set_sheet_item_done(session, intruder["id"], page_id, 0, "Deadline", True)
    finally:
        session.close()
