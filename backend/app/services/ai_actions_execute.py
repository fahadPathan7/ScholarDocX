"""Executors for the sheet-workspace agent actions.

Moved out of ``ai_actions.py`` (SCHOLARDOCX-0110 file-size split). Each
executor takes the owning ``AiActionService`` (``svc``) so it can reach the
store and the role-limit enforcement helpers. Create-type executors enforce
the same plan limits as the manual REST routes before mutating anything.
"""
from __future__ import annotations

from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
from typing import Any
import json

from app.services.ai_actions_workspace import clean, clean_row
from app.services.ai_actions_read import (
    filter_rows_by_value,
    execute_search_rows,
    execute_filter_rows,
    execute_analyze_sheet,
    execute_get_deadlines,
    execute_get_overdue_rows,
    execute_get_column_values,
)


def resolve_project(store, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    if action.get("project_id"):
        pid = str(action["project_id"])
        for ref_proj in refs.get("projects", {}).values():
            if str(ref_proj.get("id")) == pid:
                return ref_proj
        return store.get_record("projects", pid)
    
    pname = clean(action.get("project_name"))
    if pname:
        ref = refs.get("projects", {}).get(pname.lower())
        if ref:
            return ref
    elif refs.get("latest_project"):
        return refs["latest_project"]
    
    projects = store.list_records("projects")
    if pname:
        matches = [p for p in projects if (p.get("name") or "").lower() == pname.lower()]
        if len(matches) == 1:
            return matches[0]
        matches = [p for p in projects if pname.lower() in (p.get("name") or "").lower() or (p.get("name") or "").lower() in pname.lower()]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise ValueError(f"Multiple projects matching {pname}; provide the project id.")
    if projects:
        return projects[0]
    raise ValueError("No project found. Please create a project first.")


def resolve_page(store, project_id: str, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    if action.get("sheet_id"):
        sheet_id = str(action["sheet_id"])
        ref_page = refs.get("pages", {}).get((str(project_id), sheet_id))
        if ref_page:
            return ref_page
        if refs.get("latest_page") and str(refs["latest_page"].get("sheet_id") or "") == sheet_id:
            return refs["latest_page"]
        return page_for_sheet_id(store, str(project_id), sheet_id, refs)

    sheet_name = clean(action.get("sheet_name"))
    if sheet_name:
        ref = refs.get("sheets", {}).get((project_id, sheet_name.lower()))
        if ref:
            sheet_id = str(ref["sheet"]["id"])
            return page_for_sheet_id(store, project_id, sheet_id, refs)
    elif refs.get("latest_sheet"):
        latest = refs["latest_sheet"]
        sheet_id = str(latest["sheet"]["id"])
        return page_for_sheet_id(store, str(latest["sheet"]["project_id"]), sheet_id, refs)

    summary = store.project_summary(project_id)
    sheets = summary.get("sheets", [])
    pages = summary.get("pages", [])

    if sheet_name:
        matched_sheets = [s for s in sheets if s.get("name", "").lower() == sheet_name.lower()]
        if len(matched_sheets) == 1:
            return page_for_sheet_id(store, project_id, str(matched_sheets[0]["id"]), refs)

        matches = [p for p in pages if (p.get("name") or "").lower() == sheet_name.lower()]
        if len(matches) == 1:
            return matches[0]

        matched_sheets = [
            s for s in sheets
            if sheet_name.lower() in s.get("name", "").lower()
            or s.get("name", "").lower() in sheet_name.lower()
        ]
        if len(matched_sheets) == 1:
            return page_for_sheet_id(store, project_id, str(matched_sheets[0]["id"]), refs)

        matches = [
            p for p in pages
            if sheet_name.lower() in (p.get("name") or "").lower()
            or (p.get("name") or "").lower() in sheet_name.lower()
        ]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1 or len(matched_sheets) > 1:
            raise ValueError(f"Multiple sheets matching {sheet_name}; provide the sheet id.")

    if pages:
        return pages[0]

    raise ValueError("Sheet not found. Please provide an existing sheet name.")


def page_for_sheet_id(store, project_id: str, sheet_id: str, refs: dict[str, Any] | None = None) -> dict:
    if refs:
        ref_page = refs.get("pages", {}).get((str(project_id), str(sheet_id)))
        if ref_page:
            return ref_page
        latest = refs.get("latest_page")
        if latest and str(latest.get("sheet_id") or "") == str(sheet_id):
            return latest
    summary = store.project_summary(project_id)
    for page in summary.get("pages", []):
        if str(page.get("sheet_id") or "") == str(sheet_id):
            return page
    for page in store.list_records("project_pages"):
        if str(page.get("sheet_id") or "") == str(sheet_id):
            return page
    raise ValueError("Sheet page not found.")


def row_for_columns(row: dict[str, Any], column_names: list[str]) -> dict[str, Any]:
    cleaned = clean_row(row)
    if not column_names:
        return cleaned
    col_map = {col.lower(): col for col in column_names}
    res = {}
    for key, value in cleaned.items():
        matched_col = col_map.get(key.lower())
        if matched_col:
            res[matched_col] = value
        elif key in column_names:
            res[key] = value
    return res


def normalize_row_updates(updates: dict[str, Any], column_names: list[str]) -> dict[str, Any]:
    if not column_names or not updates:
        return updates
    col_map = {col.lower(): col for col in column_names}
    normalized = {}
    for key, val in updates.items():
        matched_col = col_map.get(key.lower())
        target_key = matched_col if matched_col else key
        normalized[target_key] = val
    return normalized


def _enforce_sheet_limits(svc, project_id: str) -> None:
    """Mirror the sheets_per_project + total_sheets checks from routes.py."""
    per_project_limit = svc.limit_for("sheets_per_project")
    if per_project_limit != -1:
        current = svc.store.legacy_connection.execute(
            "SELECT COUNT(*) AS sheet_count FROM project_sheets WHERE project_id = ?", (project_id,)
        ).fetchone()["sheet_count"]
        if current >= per_project_limit:
            svc.raise_limit(f"Limit exceeded for sheets_per_project. Your plan allows {per_project_limit}.")
    svc.enforce("total_sheets", 1)


def execute_create_project(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    svc.enforce("total_projects", 1)
    project = svc.store.create_record("projects", action["project"])
    try:
        svc.store.create_record(
            "notifications",
            {
                "project_id": project["id"],
                "title": f"Project created: {project['name']}",
                "notification_type": "project",
                "body": "Created by Lumi from a confirmed AI action.",
            },
        )
    except Exception:
        pass
    pname = (project.get("name") or "").lower()
    if pname:
        refs["projects"][pname] = project
    refs["latest_project"] = project
    return {"type": "create_project", "project": project}


def execute_create_sheet(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    _enforce_sheet_limits(svc, project["id"])
    result = svc.store.create_sheet_with_defaults(project["id"], action["sheet"]["name"])
    sname = (result.get("sheet", {}).get("name") or "").lower()
    if sname:
        refs["sheets"][(project["id"], sname)] = result
    refs["latest_sheet"] = result
    if "pages" not in refs:
        refs["pages"] = {}
    refs["pages"][(str(project["id"]), str(result["sheet"]["id"]))] = result["page"]
    refs["latest_page"] = result["page"]
    return {"type": "create_sheet", "project": project, "sheet": result["sheet"], "page": result["page"]}


def execute_add_rows(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
    column_names = [
        col.get("name") if isinstance(col, dict) else col
        for col in columns
        if not (isinstance(col, dict) and col.get("type") == "group")
    ]
    new_rows = [row_for_columns(row, column_names) for row in action["rows"]]
    new_rows = [row for row in new_rows if row]
    per_sheet_limit = svc.limit_for("records_per_sheet")
    if per_sheet_limit != -1 and len(rows) + len(new_rows) > per_sheet_limit:
        svc.raise_limit(f"Limit exceeded for records_per_sheet. Your plan allows {per_sheet_limit}.")
    svc.enforce("total_records", len(new_rows))
    rows.extend(new_rows)
    updated = svc.store.update_record(
        "project_pages",
        page["id"],
        {"columns_json": columns, "rows_json": rows},
    )
    if "pages" not in refs:
        refs["pages"] = {}
    refs["pages"][(str(project["id"]), str(updated.get("sheet_id") or page.get("sheet_id")))] = updated
    refs["latest_page"] = updated
    return {"type": "add_rows", "project": project, "page": updated, "row_count": len(new_rows)}


def execute_create_sticky_note(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    svc.enforce("total_sticky_notes", 1)
    note = action["note"]
    checklist = [
        {"id": f"ai-{index + 1}", "text": item, "done": False}
        for index, item in enumerate(note.get("checklist_items", []))
    ]
    created = svc.store.create_record(
        "sticky_notes",
        {
            "title": note["title"],
            "body": note.get("body", ""),
            "color": note.get("color", "sun"),
            "is_checklist": bool(note.get("is_checklist")),
            "checklist_json": checklist,
        },
    )
    return {"type": "create_sticky_note", "note": created}


def execute_update_project(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    updated = svc.store.update_record("projects", project["id"], action.get("updates", {}))
    return {"type": "update_project", "project": updated}


def execute_update_sheet(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    sheet_id = page.get("sheet_id")
    updates = action.get("updates", {})
    updated_sheet = svc.store.update_record("project_sheets", sheet_id, updates)
    if "name" in updates:
        svc.store.update_record("project_pages", page["id"], {"name": updates["name"]})
    return {"type": "update_sheet", "sheet": updated_sheet, "project": project}


def execute_update_row(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    row_index = action.get("row_index")
    if row_index is None:
        raise ValueError("Row index is required for update_row action")

    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])

    if row_index < 0 or row_index >= len(rows):
        raise ValueError(f"Row index {row_index} is out of range")

    column_names = [
        col.get("name") if isinstance(col, dict) else col
        for col in columns
        if not (isinstance(col, dict) and col.get("type") == "group")
    ]
    norm_updates = normalize_row_updates(action.get("updates", {}), column_names)
    rows[row_index].update(norm_updates)
    updated = svc.store.update_record(
        "project_pages",
        page["id"],
        {"columns_json": columns, "rows_json": rows},
    )
    if "pages" not in refs:
        refs["pages"] = {}
    sid = str(updated.get("sheet_id") or page.get("sheet_id") or "")
    if sid:
        refs["pages"][(str(project["id"]), sid)] = updated
    refs["latest_page"] = updated
    return {"type": "update_row", "project": project, "page": updated, "row_index": row_index}


def execute_delete_project(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    svc.store.delete_record("projects", project["id"])
    return {"type": "delete_project", "project_name": project["name"]}


def execute_delete_sheet(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    sheet_id = page.get("sheet_id")
    sheet = svc.store.get_record("project_sheets", sheet_id)
    svc.store.delete_record("project_sheets", sheet_id)
    return {"type": "delete_sheet", "sheet_name": sheet["name"], "project": project}


def execute_delete_row(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    row_index = action.get("row_index")
    if row_index is None:
        raise ValueError("Row index is required for delete_row action")

    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])

    if row_index < 0 or row_index >= len(rows):
        raise ValueError(f"Row index {row_index} is out of range")

    rows.pop(row_index)
    updated = svc.store.update_record(
        "project_pages",
        page["id"],
        {"columns_json": columns, "rows_json": rows},
    )
    return {"type": "delete_row", "project": project, "page": updated, "row_index": row_index}


def execute_add_column(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)

    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])

    new_column = action.get("column", {})
    columns.append(new_column)

    column_name = new_column.get("name", "")
    for row in rows:
        if column_name not in row:
            row[column_name] = ""

    updated = svc.store.update_record(
        "project_pages",
        page["id"],
        {"columns_json": columns, "rows_json": rows},
    )
    if "pages" not in refs:
        refs["pages"] = {}
    sid = str(updated.get("sheet_id") or page.get("sheet_id") or "")
    if sid:
        refs["pages"][(str(project["id"]), sid)] = updated
    refs["latest_page"] = updated
    return {"type": "add_column", "project": project, "page": updated, "column_name": column_name}


def execute_add_group(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)

    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])

    group_column = {
        "name": action.get("group_name", "New Group"),
        "type": "group",
        "color": action.get("color", "#2f6d7a")
    }
    columns.append(group_column)

    updated = svc.store.update_record(
        "project_pages",
        page["id"],
        {"columns_json": columns, "rows_json": rows},
    )
    return {"type": "add_group", "project": project, "page": updated, "group_name": group_column["name"]}


def execute_pin_project(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    pin_type = action.get("pin_type", "sidebar")
    field = "pinned_to_dashboard" if pin_type == "dashboard" else "is_pinned"
    updated = svc.store.update_record("projects", project["id"], {field: 1})
    return {"type": "pin_project", "project": updated, "pin_type": pin_type}


def execute_pin_sheet(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    sheet_name = clean(action.get("sheet_name"))
    sheets = svc.store.list_records("project_sheets")
    matched = [s for s in sheets if str(s.get("project_id")) == str(project["id"]) and (s.get("name") or "").lower() == (sheet_name or "").lower()]
    sheet_id = matched[0]["id"] if matched else None
    if not sheet_id:
        page = resolve_page(svc.store, project["id"], action, refs)
        sheet_id = page.get("sheet_id") or page.get("id")
    pin_type = action.get("pin_type", "sidebar")
    field = "pinned_to_dashboard" if pin_type == "dashboard" else "is_pinned"
    updated = svc.store.update_record("project_sheets", sheet_id, {field: 1})
    return {"type": "pin_sheet", "sheet": updated, "project": project, "pin_type": pin_type}


def execute_add_to_dashboard(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    item_type = action.get("item_type")
    if item_type == "project":
        project = resolve_project(svc.store, action, refs)
        updated = svc.store.update_record("projects", project["id"], {"pinned_to_dashboard": 1})
        return {"type": "add_to_dashboard", "item_type": "project", "project": updated}
    elif item_type == "sheet":
        project = resolve_project(svc.store, action, refs)
        sheet_id = action.get("sheet_id")
        sheet_name = clean(action.get("sheet_name"))
        if not sheet_id and sheet_name:
            ref = refs.get("sheets", {}).get((str(project["id"]), sheet_name.lower())) or refs.get("sheets", {}).get((project.get("name", "").lower(), sheet_name.lower()))
            if ref:
                sheet_id = ref.get("sheet", {}).get("id") or ref.get("id")
        if not sheet_id and sheet_name:
            sheets = svc.store.list_records("project_sheets")
            matched = [s for s in sheets if str(s.get("project_id")) == str(project["id"]) and (s.get("name") or "").lower() == sheet_name.lower()]
            sheet_id = matched[0]["id"] if matched else None
        if not sheet_id:
            page = resolve_page(svc.store, project["id"], action, refs)
            sheet_id = page.get("sheet_id")
        if not sheet_id:
            raise ValueError(f"Sheet '{sheet_name}' not found for project")
        updated = svc.store.update_record("project_sheets", sheet_id, {"pinned_to_dashboard": 1})
        return {"type": "add_to_dashboard", "item_type": "sheet", "sheet": updated, "project": project}
    else:
        raise ValueError(f"Unsupported item_type for add_to_dashboard: {item_type}")


def execute_remove_from_dashboard(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    item_type = action.get("item_type")
    if item_type == "project":
        project = resolve_project(svc.store, action, refs)
        updated = svc.store.update_record("projects", project["id"], {"pinned_to_dashboard": 0})
        return {"type": "remove_from_dashboard", "item_type": "project", "project": updated}
    elif item_type == "sheet":
        project = resolve_project(svc.store, action, refs)
        sheet_id = action.get("sheet_id")
        sheet_name = clean(action.get("sheet_name"))
        if not sheet_id and sheet_name:
            ref = refs.get("sheets", {}).get((str(project["id"]), sheet_name.lower())) or refs.get("sheets", {}).get((project.get("name", "").lower(), sheet_name.lower()))
            if ref:
                sheet_id = ref.get("sheet", {}).get("id") or ref.get("id")
        if not sheet_id and sheet_name:
            sheets = svc.store.list_records("project_sheets")
            matched = [s for s in sheets if str(s.get("project_id")) == str(project["id"]) and (s.get("name") or "").lower() == sheet_name.lower()]
            sheet_id = matched[0]["id"] if matched else None
        if not sheet_id:
            page = resolve_page(svc.store, project["id"], action, refs)
            sheet_id = page.get("sheet_id")
        if not sheet_id:
            raise ValueError(f"Sheet '{sheet_name}' not found for project")
        updated = svc.store.update_record("project_sheets", sheet_id, {"pinned_to_dashboard": 0})
        return {"type": "remove_from_dashboard", "item_type": "sheet", "sheet": updated, "project": project}
    else:
        raise ValueError("remove_from_dashboard requires item_type")


def execute_get_projects(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    projects = svc.store.list_records("projects")
    return {"type": "get_projects", "projects": projects, "count": len(projects)}


def execute_get_sheets(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    summary = svc.store.project_summary(project["id"])
    sheets = summary.get("sheets", [])
    return {"type": "get_sheets", "project": project, "sheets": sheets, "count": len(sheets)}


def execute_get_rows(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
    return {"type": "get_rows", "project": project, "page": page, "rows": rows, "count": len(rows)}


def execute_get_project_summary(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    summary = svc.store.project_summary(project["id"])
    return {"type": "get_project_summary", "project": project, "summary": summary}


def execute_count_items(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    item_type = action.get("item_type")
    if item_type == "projects":
        projects = svc.store.list_records("projects")
        return {"type": "count_items", "item_type": "projects", "count": len(projects)}
    elif item_type == "sheets":
        project = resolve_project(svc.store, action, refs)
        summary = svc.store.project_summary(project["id"])
        sheets = summary.get("sheets", [])
        return {"type": "count_items", "item_type": "sheets", "project": project, "count": len(sheets)}
    elif item_type == "rows":
        project = resolve_project(svc.store, action, refs)
        page = resolve_page(svc.store, project["id"], action, refs)
        rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
        return {"type": "count_items", "item_type": "rows", "project": project, "page": page, "count": len(rows)}
    else:
        raise ValueError(f"Unsupported item_type for count_items: {item_type}")


def execute_rename_project(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    new_name = action["new_name"]
    updated = svc.store.update_record("projects", project["id"], {"name": new_name})
    return {"type": "rename_project", "project": updated, "old_name": project.get("name"), "new_name": new_name}


def execute_rename_sheet(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    new_name = action["new_name"]
    old_name = page.get("name", "")
    svc.store.update_record("project_sheets", page["sheet_id"], {"name": new_name})
    svc.store.update_record("project_pages", page["id"], {"name": new_name})
    return {"type": "rename_sheet", "project": project, "old_name": old_name, "new_name": new_name}


def execute_bulk_update_rows(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    filter_column = action["filter_column"]
    filter_value = action.get("filter_value")
    updates = action["updates"]

    column_names = [
        col.get("name") if isinstance(col, dict) else col
        for col in columns
        if not (isinstance(col, dict) and col.get("type") == "group")
    ]
    norm_updates = normalize_row_updates(updates, column_names)

    matched = filter_rows_by_value(rows, filter_column, filter_value, "equals", columns)
    for entry in matched:
        row_idx = entry["row_index"]
        for key, val in norm_updates.items():
            rows[row_idx][key] = val

    updated = svc.store.update_record("project_pages", page["id"], {"rows_json": rows})
    if "pages" not in refs:
        refs["pages"] = {}
    sid = str(updated.get("sheet_id") or page.get("sheet_id") or "")
    if sid:
        refs["pages"][(str(project["id"]), sid)] = updated
    refs["latest_page"] = updated
    return {"type": "bulk_update_rows", "project": project, "updated_count": len(matched),
            "filter_column": filter_column, "filter_value": filter_value}


def execute_clear_sheet(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    old_rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
    svc.store.update_record("project_pages", page["id"], {"rows_json": []})
    return {"type": "clear_sheet", "project": project, "cleared_count": len(old_rows)}


def execute_duplicate_sheet(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    _enforce_sheet_limits(svc, project["id"])
    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
    new_name = action.get("new_name") or f"Copy of {page.get('name', 'Sheet')}"
    new_sheet = svc.store.create_record("project_sheets", {"project_id": project["id"], "name": new_name})
    new_page = svc.store.create_record("project_pages", {
        "project_id": project["id"],
        "sheet_id": new_sheet["id"],
        "name": new_name,
        "columns_json": columns,
        "rows_json": rows,
    })
    return {"type": "duplicate_sheet", "project": project, "sheet": new_sheet, "page": new_page}


def execute_unpin_project(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    pin_type = action.get("pin_type", "sidebar")
    updates: dict[str, Any] = {}
    if pin_type == "dashboard":
        updates["pinned_to_dashboard"] = 0
    else:
        updates["is_pinned"] = 0
    updated = svc.store.update_record("projects", project["id"], updates)
    return {"type": "unpin_project", "project": updated, "pin_type": pin_type}


def execute_unpin_sheet(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    sheet_name = clean(action.get("sheet_name"))
    sheets = svc.store.list_records("project_sheets")
    matched = [s for s in sheets if str(s.get("project_id")) == str(project["id"]) and (s.get("name") or "").lower() == (sheet_name or "").lower()]
    sheet_id = matched[0]["id"] if matched else None
    if not sheet_id:
        page = resolve_page(svc.store, project["id"], action, refs)
        sheet_id = page.get("sheet_id") or page.get("id")
    pin_type = action.get("pin_type", "sidebar")
    updates: dict[str, Any] = {}
    if pin_type == "dashboard":
        updates["pinned_to_dashboard"] = 0
    else:
        updates["is_pinned"] = 0
    updated = svc.store.update_record("project_sheets", sheet_id, updates)
    return {"type": "unpin_sheet", "sheet": updated, "project": project, "pin_type": pin_type}


def execute_remove_from_dashboard(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    item_type = action.get("item_type")
    if item_type == "project":
        project = resolve_project(svc.store, action, refs)
        updated = svc.store.update_record("projects", project["id"], {"pinned_to_dashboard": 0})
        return {"type": "remove_from_dashboard", "item_type": "project", "project": updated}
    elif item_type == "sheet":
        project = resolve_project(svc.store, action, refs)
        sheet_name = clean(action.get("sheet_name"))
        sheets = svc.store.list_records("project_sheets")
        matched = [s for s in sheets if str(s.get("project_id")) == str(project["id"]) and (s.get("name") or "").lower() == (sheet_name or "").lower()]
        sheet_id = matched[0]["id"] if matched else None
        if not sheet_id:
            page = resolve_page(svc.store, project["id"], action, refs)
            sheet_id = page.get("sheet_id") or page.get("id")
        updated = svc.store.update_record("project_sheets", sheet_id, {"pinned_to_dashboard": 0})
        return {"type": "remove_from_dashboard", "item_type": "sheet", "sheet": updated, "project": project}
    else:
        raise ValueError("remove_from_dashboard requires item_type")


def execute_update_sticky_note(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    note_title = action["note_title"]
    notes = svc.store.list_records("sticky_notes")
    match = next((n for n in notes if n.get("title", "").lower() == note_title.lower()), None)
    if not match:
        raise ValueError(f"Sticky note '{note_title}' not found.")
    updated = svc.store.update_record("sticky_notes", match["id"], action["updates"])
    return {"type": "update_sticky_note", "note": updated}


def execute_delete_sticky_note(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    note_title = action["note_title"]
    notes = svc.store.list_records("sticky_notes")
    match = next((n for n in notes if n.get("title", "").lower() == note_title.lower()), None)
    if not match:
        raise ValueError(f"Sticky note '{note_title}' not found.")
    deleted = svc.store.delete_record("sticky_notes", match["id"])
    return {"type": "delete_sticky_note", "note": deleted}


def execute_search_rows_action(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    result = execute_search_rows(rows, columns, action["query"])
    return {"type": "search_rows", "project": project, **result}


def execute_filter_rows_action(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    col_query = action.get("column_query") or action.get("column_name")
    result = execute_filter_rows(
        rows, columns,
        column_query=col_query,
        value=action.get("value"),
        operator=action.get("operator", "equals"),
    )
    return {"type": "filter_rows", "project": project, **result}


def execute_analyze_sheet_action(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    result = execute_analyze_sheet(
        rows, columns,
        focus_column=action.get("focus_column"),
        days_ahead=action.get("days_ahead"),
    )
    return {"type": "analyze_sheet", "project": project, **result}


def execute_get_deadlines_action(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    summary = svc.store.project_summary(project["id"])
    pages = summary.get("pages", [])
    days_ahead = action.get("days_ahead", 30)
    result = execute_get_deadlines(pages, days_ahead=days_ahead)
    return {"type": "get_deadlines", "project": project, **result}


def execute_get_overdue_rows_action(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    summary = svc.store.project_summary(project["id"])
    pages = summary.get("pages", [])
    result = execute_get_overdue_rows(pages)
    return {"type": "get_overdue_rows", "project": project, **result}


def execute_get_column_values_action(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project = resolve_project(svc.store, action, refs)
    page = resolve_page(svc.store, project["id"], action, refs)
    rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])
    columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])
    result = execute_get_column_values(
        rows, columns,
        column_query=action.get("column_query"),
    )
    return {"type": "get_column_values", "project": project, **result}


def execute_get_sticky_notes(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    notes = svc.store.list_records("sticky_notes")
    lines = [f"📝 **Sticky Notes: {len(notes)}**\n"]
    if notes:
        for note in notes:
            title = note.get("title", "(untitled)")
            body = note.get("body", "")[:50]
            color = note.get("color", "sun")
            lines.append(f"- **{title}** ({color}): {body}")
    else:
        lines.append("_No sticky notes found._")
    return {"type": "get_sticky_notes", "notes": notes, "count": len(notes), "message": "\n".join(lines)}


def execute_get_dashboard(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    summary = svc.store.dashboard_summary()
    counts = summary.get("counts", {})
    lines = ["📊 **Dashboard Summary**\n"]
    lines.append("| Item | Count |")
    lines.append("|---|---|")
    for key, count in counts.items():
        display = key.replace("_", " ").title()
        lines.append(f"| {display} | **{count}** |")

    status_counts = summary.get("status_counts", [])
    if status_counts:
        lines.append("\n**Application Status:**")
        for sc in status_counts:
            lines.append(f"- {sc['status']}: **{sc['count']}**")

    deadlines = summary.get("upcoming_deadlines", [])
    if deadlines:
        lines.append(f"\n**Upcoming Deadlines: {len(deadlines)}**")
        for d in deadlines[:5]:
            lines.append(f"- {d.get('title', '—')} — {d.get('due_at', '—')}")

    return {"type": "get_dashboard", "summary": summary, "message": "\n".join(lines)}


def execute_get_notifications(svc, action: dict[str, Any], refs: dict[str, Any]) -> dict:
    project_id = action.get("project_id")
    if not project_id and action.get("project_name"):
        project = resolve_project(svc.store, action, refs)
        project_id = project["id"]

    if project_id:
        summary = svc.store.project_summary(project_id)
        notifications = summary.get("notifications", [])
    else:
        notifications = [
            n for n in svc.store.list_records("notifications")
            if not n.get("read_at")
        ][:20]

    lines = [f"🔔 **Unread Notifications: {len(notifications)}**\n"]
    if notifications:
        for n in notifications:
            title = n.get("title", "—")
            body = n.get("body", "")[:50]
            lines.append(f"- **{title}**: {body}")
    else:
        lines.append("_No unread notifications._")

    return {"type": "get_notifications", "notifications": notifications,
            "count": len(notifications), "message": "\n".join(lines)}


WORKSPACE_EXECUTORS = {
    "create_project": execute_create_project,
    "create_sheet": execute_create_sheet,
    "add_rows": execute_add_rows,
    "create_sticky_note": execute_create_sticky_note,
    "update_project": execute_update_project,
    "update_sheet": execute_update_sheet,
    "update_row": execute_update_row,
    "delete_project": execute_delete_project,
    "delete_sheet": execute_delete_sheet,
    "delete_row": execute_delete_row,
    "add_column": execute_add_column,
    "add_group": execute_add_group,
    "pin_project": execute_pin_project,
    "pin_sheet": execute_pin_sheet,
    "add_to_dashboard": execute_add_to_dashboard,
    "get_projects": execute_get_projects,
    "get_sheets": execute_get_sheets,
    "get_rows": execute_get_rows,
    "get_project_summary": execute_get_project_summary,
    "count_items": execute_count_items,
    "rename_project": execute_rename_project,
    "rename_sheet": execute_rename_sheet,
    "bulk_update_rows": execute_bulk_update_rows,
    "clear_sheet": execute_clear_sheet,
    "duplicate_sheet": execute_duplicate_sheet,
    "unpin_project": execute_unpin_project,
    "unpin_sheet": execute_unpin_sheet,
    "remove_from_dashboard": execute_remove_from_dashboard,
    "update_sticky_note": execute_update_sticky_note,
    "delete_sticky_note": execute_delete_sticky_note,
    "search_rows": execute_search_rows_action,
    "filter_rows": execute_filter_rows_action,
    "analyze_sheet": execute_analyze_sheet_action,
    "get_deadlines": execute_get_deadlines_action,
    "get_overdue_rows": execute_get_overdue_rows_action,
    "get_column_values": execute_get_column_values_action,
    "get_sticky_notes": execute_get_sticky_notes,
    "get_dashboard": execute_get_dashboard,
    "get_notifications": execute_get_notifications,
}
