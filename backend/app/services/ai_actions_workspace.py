"""Normalizers for the sheet-workspace agent actions.

Moved out of ``ai_actions.py`` (SCHOLARDOCX-0110 file-size split). Behavior is
unchanged: each normalizer validates a raw planner action, resolves implicit
project/sheet references from earlier actions in the same plan, and reports
missing fields instead of guessing.
"""
from __future__ import annotations

from typing import Any


NOTE_COLORS = {"sun", "mint", "sky", "rose", "lilac", "sand"}


def clean(value: Any) -> str:
    return str(value or "").strip()


def clean_row(row: dict[str, Any]) -> dict[str, Any]:
    cleaned = {}
    for key, value in row.items():
        clean_key = clean(key)
        if not clean_key:
            continue
        if isinstance(value, bool):
            cleaned[clean_key] = value
        else:
            clean_value = clean(value)
            if clean_value:
                cleaned[clean_key] = clean_value
    return cleaned


def normalize_degree(value: Any) -> str:
    lowered = clean(value).lower()
    if lowered in {"bachelor", "bachelors", "undergrad", "undergraduate"}:
        return "bachelors"
    if lowered in {"master", "masters", "ms", "msc"}:
        return "masters"
    return "phd"


def project_ref(raw_action: dict[str, Any], previous_actions: list[dict[str, Any]]) -> dict[str, Any]:
    if raw_action.get("project_id"):
        return {"project_id": raw_action.get("project_id")}
    project_name = clean(raw_action.get("project_name"))
    if project_name:
        return {"project_name": project_name}
    created = [action for action in previous_actions if action.get("type") == "create_project"]
    if len(created) == 1:
        return {"project_name": created[0]["project"]["name"]}
    for prev in reversed(previous_actions):
        if prev.get("project_id"):
            return {"project_id": prev.get("project_id")}
        prev_pname = clean(prev.get("project_name") or (prev.get("project") or {}).get("name"))
        if prev_pname:
            return {"project_name": prev_pname}
    return {}


def sheet_ref(raw_action: dict[str, Any], previous_actions: list[dict[str, Any]]) -> dict[str, Any]:
    if raw_action.get("sheet_id"):
        return {"sheet_id": raw_action.get("sheet_id")}
    sheet_name = clean(raw_action.get("sheet_name"))
    if sheet_name:
        return {"sheet_name": sheet_name}
    created = [action for action in previous_actions if action.get("type") == "create_sheet"]
    if len(created) == 1:
        return {"sheet_name": created[0]["sheet"]["name"]}
    for prev in reversed(previous_actions):
        if prev.get("sheet_id"):
            return {"sheet_id": prev.get("sheet_id")}
        prev_sname = clean(prev.get("sheet_name") or (prev.get("sheet") or {}).get("name"))
        if prev_sname:
            return {"sheet_name": prev_sname}
    return {}


def normalize_workspace_action(
    raw_action: dict[str, Any], previous_actions: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Normalize one workspace action; None if the type is not a workspace action."""
    action_type = raw_action.get("type")

    if action_type == "create_project":
        project = raw_action.get("project") if isinstance(raw_action.get("project"), dict) else raw_action
        name = clean(project.get("name"))
        if not name:
            return {"type": action_type, "missing": ["project_name"]}
        return {
            "type": action_type,
            "project": {
                "name": name,
                "degree_type": normalize_degree(project.get("degree_type")),
                "intake_term": clean(project.get("intake_term")),
                "status": clean(project.get("status")) or "Active",
                "description": clean(project.get("description")),
            },
        }

    if action_type == "create_sheet":
        sheet = raw_action.get("sheet") if isinstance(raw_action.get("sheet"), dict) else raw_action
        name = clean(sheet.get("name") or raw_action.get("sheet_name"))
        proj_ref = project_ref(raw_action, previous_actions)
        missing = []
        if not name:
            missing.append("sheet_name")
        if not proj_ref:
            missing.append("project_name")
        if missing:
            return {"type": action_type, "missing": missing}
        return {"type": action_type, **proj_ref, "sheet": {"name": name}}

    if action_type == "add_rows":
        rows = raw_action.get("rows") if isinstance(raw_action.get("rows"), list) else []
        clean_rows = [clean_row(row) for row in rows if isinstance(row, dict)]
        clean_rows = [row for row in clean_rows if row]
        sh_ref = sheet_ref(raw_action, previous_actions)
        proj_ref = project_ref(raw_action, previous_actions)
        missing = []
        if not clean_rows:
            missing.append("row_values")
        if not sh_ref:
            missing.append("sheet_name")
        if not proj_ref and not sh_ref.get("sheet_id"):
            missing.append("project_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "rows": clean_rows}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "create_sticky_note":
        note = raw_action.get("note") if isinstance(raw_action.get("note"), dict) else raw_action
        title = clean(note.get("title"))
        body = clean(note.get("body"))
        checklist_items = note.get("checklist_items") if isinstance(note.get("checklist_items"), list) else []
        checklist_items = [clean(item) for item in checklist_items if clean(item)]
        if not title and not body and not checklist_items:
            return {"type": action_type, "missing": ["note_content"]}
        return {
            "type": action_type,
            "note": {
                "title": title or (checklist_items[0] if checklist_items else body[:60] or "AI note"),
                "body": body,
                "color": note.get("color") if note.get("color") in NOTE_COLORS else "sun",
                "is_checklist": bool(note.get("is_checklist") or checklist_items),
                "checklist_items": checklist_items,
            },
        }

    if action_type == "update_project":
        proj_ref = project_ref(raw_action, previous_actions)
        updates = raw_action.get("updates", {})
        if not proj_ref or not updates:
            return {"type": action_type, "missing": ["project_name", "updates"]}
        return {"type": action_type, **proj_ref, "updates": updates}

    if action_type == "update_sheet":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        updates = raw_action.get("updates", {})
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if not updates:
            missing.append("updates")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "updates": updates}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "update_row":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        row_index = raw_action.get("row_index")
        updates = raw_action.get("updates", {})
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if row_index is None:
            missing.append("row_index")
        if not updates:
            missing.append("updates")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "row_index": row_index, "updates": updates}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "delete_project":
        proj_ref = project_ref(raw_action, previous_actions)
        if not proj_ref:
            return {"type": action_type, "missing": ["project_name"]}
        return {"type": action_type, **proj_ref}

    if action_type == "delete_sheet":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "delete_row":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        row_index = raw_action.get("row_index")
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if row_index is None:
            missing.append("row_index")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "row_index": row_index}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "add_column":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        column = raw_action.get("column", {})
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if not column.get("name"):
            missing.append("column_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "column": column}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "add_group":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        group_name = clean(raw_action.get("group_name"))
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if not group_name:
            missing.append("group_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {
            "type": action_type,
            "group_name": group_name,
            "color": raw_action.get("color", "#2f6d7a")
        }
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "pin_project" or action_type == "unpin_project":
        proj_ref = project_ref(raw_action, previous_actions)
        pin_type = raw_action.get("pin_type", "sidebar")
        if not proj_ref:
            return {"type": action_type, "missing": ["project_name"]}
        return {"type": action_type, **proj_ref, "pin_type": pin_type}

    if action_type == "pin_sheet" or action_type == "unpin_sheet":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        pin_type = raw_action.get("pin_type", "sidebar")
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "pin_type": pin_type}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type in ("add_to_dashboard", "remove_from_dashboard"):
        item_type = raw_action.get("item_type")
        if item_type == "project":
            proj_ref = project_ref(raw_action, previous_actions)
            if not proj_ref:
                return {"type": action_type, "missing": ["project_name"]}
            return {"type": action_type, "item_type": "project", **proj_ref}
        elif item_type == "sheet":
            proj_ref = project_ref(raw_action, previous_actions)
            sh_ref = sheet_ref(raw_action, previous_actions)
            missing = []
            if not proj_ref:
                missing.append("project_name")
            if not sh_ref:
                missing.append("sheet_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "item_type": "sheet"}
            action.update(proj_ref)
            action.update(sh_ref)
            return action
        else:
            return {"type": action_type, "missing": ["item_type"]}

    if action_type == "get_projects":
        return {"type": action_type}

    if action_type == "get_sheets":
        proj_ref = project_ref(raw_action, previous_actions)
        if not proj_ref:
            return {"type": action_type, "missing": ["project_name"]}
        return {"type": action_type, **proj_ref}

    if action_type == "get_rows":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "get_project_summary":
        proj_ref = project_ref(raw_action, previous_actions)
        if not proj_ref:
            return {"type": action_type, "missing": ["project_name"]}
        return {"type": action_type, **proj_ref}

    if action_type == "count_items":
        item_type = raw_action.get("item_type")
        if item_type == "projects":
            return {"type": action_type, "item_type": "projects"}
        elif item_type == "sheets":
            proj_ref = project_ref(raw_action, previous_actions)
            if not proj_ref:
                return {"type": action_type, "missing": ["project_name"]}
            return {"type": action_type, "item_type": "sheets", **proj_ref}
        elif item_type == "rows":
            proj_ref = project_ref(raw_action, previous_actions)
            sh_ref = sheet_ref(raw_action, previous_actions)
            missing = []
            if not proj_ref:
                missing.append("project_name")
            if not sh_ref:
                missing.append("sheet_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "item_type": "rows"}
            action.update(proj_ref)
            action.update(sh_ref)
            return action
        else:
            return {"type": action_type, "missing": ["item_type"]}

    if action_type == "rename_project":
        proj_ref = project_ref(raw_action, previous_actions)
        new_name = clean(raw_action.get("new_name"))
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not new_name:
            missing.append("new_name")
        if missing:
            return {"type": action_type, "missing": missing}
        return {"type": action_type, **proj_ref, "new_name": new_name}

    if action_type == "rename_sheet":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        new_name = clean(raw_action.get("new_name"))
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if not new_name:
            missing.append("new_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "new_name": new_name}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "bulk_update_rows":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        filter_column = clean(raw_action.get("filter_column"))
        filter_value = raw_action.get("filter_value")
        updates = raw_action.get("updates", {})
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if not filter_column:
            missing.append("filter_column")
        if not updates:
            missing.append("updates")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "filter_column": filter_column,
                  "filter_value": filter_value, "updates": updates}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "clear_sheet":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "duplicate_sheet":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        new_name = clean(raw_action.get("new_name"))
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type}
        if new_name:
            action["new_name"] = new_name
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "update_sticky_note":
        note_title = clean(raw_action.get("note_title"))
        updates = raw_action.get("updates", {})
        if not note_title:
            return {"type": action_type, "missing": ["note_title"]}
        if not updates:
            return {"type": action_type, "missing": ["updates"]}
        return {"type": action_type, "note_title": note_title, "updates": updates}

    if action_type == "delete_sticky_note":
        note_title = clean(raw_action.get("note_title"))
        if not note_title:
            return {"type": action_type, "missing": ["note_title"]}
        return {"type": action_type, "note_title": note_title}

    if action_type == "search_rows":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        query = clean(raw_action.get("query"))
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if not query:
            missing.append("query")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "query": query}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "filter_rows":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        column_query = clean(raw_action.get("column_query") or raw_action.get("column_name"))
        value = raw_action.get("value")
        operator = raw_action.get("operator", "equals")
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if not column_query:
            missing.append("column_query")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "column_query": column_query,
                  "value": value, "operator": operator}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "analyze_sheet":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type}
        if raw_action.get("focus_column"):
            action["focus_column"] = clean(raw_action["focus_column"])
        if raw_action.get("days_ahead") is not None:
            action["days_ahead"] = int(raw_action["days_ahead"])
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type == "get_deadlines":
        proj_ref = project_ref(raw_action, previous_actions)
        if not proj_ref:
            return {"type": action_type, "missing": ["project_name"]}
        action = {"type": action_type}
        if raw_action.get("days_ahead") is not None:
            action["days_ahead"] = int(raw_action["days_ahead"])
        action.update(proj_ref)
        return action

    if action_type == "get_overdue_rows":
        proj_ref = project_ref(raw_action, previous_actions)
        if not proj_ref:
            return {"type": action_type, "missing": ["project_name"]}
        return {"type": action_type, **proj_ref}

    if action_type == "get_column_values":
        proj_ref = project_ref(raw_action, previous_actions)
        sh_ref = sheet_ref(raw_action, previous_actions)
        column_query = clean(raw_action.get("column_query") or raw_action.get("column_name"))
        missing = []
        if not proj_ref:
            missing.append("project_name")
        if not sh_ref:
            missing.append("sheet_name")
        if not column_query:
            missing.append("column_query")
        if missing:
            return {"type": action_type, "missing": missing}
        action = {"type": action_type, "column_query": column_query}
        action.update(proj_ref)
        action.update(sh_ref)
        return action

    if action_type in ("get_sticky_notes", "get_dashboard"):
        return {"type": action_type}

    if action_type == "get_notifications":
        proj_ref = project_ref(raw_action, previous_actions)
        action = {"type": action_type}
        if proj_ref:
            action.update(proj_ref)
        return action

    return None
