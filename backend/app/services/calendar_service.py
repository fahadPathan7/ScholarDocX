"""Calendar item merging: sheet-row-derived dates + manual reminders
(SCHOLARDOCX-0185).

Kept separate from Store (already over the project's 1000-line target) and
from calendar_models.py (models only). Store still computes the sheet-row
dates itself (`Store._calendar_items`); this module attaches dashboard-only
"done" state to them, fetches manual reminders, and merges both into one
sorted list in the same item shape the frontend already consumes.
"""
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session


def _reminder_rows(session: Session, user_id: str, *, project_id: Optional[str], include_general: bool) -> list[dict]:
    """Fetch manual reminders visible in this context.

    - `project_id` given (a specific project's own calendar): only that
      project's own reminders. General (project_id NULL) reminders never
      appear inside a project's calendar.
    - `project_id` None (the central Dashboard): every reminder for the
      user — both general and project-scoped — matching how sheet-row
      dates already aggregate across all projects on the central Dashboard.
    """
    if project_id is not None:
        rows = session.execute(
            text(
                "SELECT r.*, p.name AS project_name FROM calendar_reminders r "
                "LEFT JOIN projects p ON p.id = r.project_id "
                "WHERE r.user_id = :uid AND r.project_id = :pid "
                "ORDER BY r.reminder_date ASC"
            ),
            {"uid": user_id, "pid": project_id},
        ).mappings().all()
        return [dict(row) for row in rows]

    clause = "" if include_general else "AND r.project_id IS NOT NULL"
    rows = session.execute(
        text(
            "SELECT r.*, p.name AS project_name FROM calendar_reminders r "
            "LEFT JOIN projects p ON p.id = r.project_id "
            f"WHERE r.user_id = :uid {clause} "
            "ORDER BY r.reminder_date ASC"
        ),
        {"uid": user_id},
    ).mappings().all()
    return [dict(row) for row in rows]


def _reminder_to_item(reminder: dict) -> dict:
    return {
        "id": reminder["id"],
        "title": reminder["title"],
        "date": reminder["reminder_date"],
        "date_key": reminder["reminder_date"],
        "date_field": "Reminder",
        "type": "manual-reminder",
        "source": "Reminder",
        "note": reminder.get("note"),
        "project_id": reminder.get("project_id"),
        "project_name": reminder.get("project_name"),
        "is_done": bool(reminder.get("is_done")),
    }


def _sheet_mark_map(session: Session, user_id: str) -> dict[tuple[str, int, str], bool]:
    rows = session.execute(
        text(
            "SELECT page_id, row_index, date_field, is_done "
            "FROM sheet_calendar_item_marks WHERE user_id = :uid"
        ),
        {"uid": user_id},
    ).mappings().all()
    return {(str(row["page_id"]), int(row["row_index"]), row["date_field"]): bool(row["is_done"]) for row in rows}


def _attach_sheet_completions(session: Session, user_id: str, sheet_items: list[dict]) -> list[dict]:
    marks = _sheet_mark_map(session, user_id)
    for item in sheet_items:
        key = (str(item.get("page_id")), int(item.get("row_index", 0)), item.get("date_field"))
        item["id"] = f"sheet:{item.get('page_id')}:{item.get('row_index')}:{item.get('date_field')}"
        item["is_done"] = marks.get(key, False)
    return sheet_items


def build_calendar_items(
    session: Session,
    user_id: Optional[str],
    sheet_items: list[dict],
    *,
    project_id: Optional[str] = None,
    include_reminders: bool = True,
) -> list[Any]:
    """Merge sheet-row dates with manual reminders into one sorted list.

    Pass `project_id` when building a single project's own calendar (scopes
    reminders to that project only); omit it for the central Dashboard
    (aggregates every reminder the user owns, general or project-scoped).
    """
    sheet_items = _attach_sheet_completions(session, user_id, sheet_items) if user_id else sheet_items
    reminder_items: list[dict] = []
    if include_reminders and user_id:
        reminders = _reminder_rows(session, user_id, project_id=project_id, include_general=project_id is None)
        reminder_items = [_reminder_to_item(r) for r in reminders]
    merged = sheet_items + reminder_items
    return sorted(merged, key=lambda item: (item.get("date_key") or "", item.get("date") or ""))


def set_sheet_item_done(
    session: Session,
    user_id: str,
    page_id: str,
    row_index: int,
    date_field: str,
    is_done: bool,
) -> dict:
    """Upsert the dashboard-only done state for one sheet-row-derived date.

    Verifies the page belongs to this user first — this table has no other
    ownership guard since it isn't behind the generic per-table CRUD system.
    """
    owner = session.execute(
        text("SELECT user_id FROM project_pages WHERE id = :pid"),
        {"pid": page_id},
    ).mappings().fetchone()
    if owner is None or str(owner["user_id"]) != str(user_id):
        raise LookupError("Sheet page not found")

    session.execute(
        text(
            "INSERT INTO sheet_calendar_item_marks "
            "(user_id, page_id, row_index, date_field, is_done, updated_at) "
            "VALUES (:uid, :pid, :ridx, :field, :done, CURRENT_TIMESTAMP) "
            "ON CONFLICT (user_id, page_id, row_index, date_field) "
            "DO UPDATE SET is_done = :done, updated_at = CURRENT_TIMESTAMP"
        ),
        {"uid": user_id, "pid": page_id, "ridx": row_index, "field": date_field, "done": int(is_done)},
    )
    session.commit()
    return {"page_id": page_id, "row_index": row_index, "date_field": date_field, "is_done": is_done}
