"""Agent action registry: supported sets, descriptions, execution messages.

Combines the sheet-workspace actions with the record-domain actions from
``ai_actions_records``. Admin actions are intentionally absent from every set
so the executor can never run them.
"""
from __future__ import annotations

from typing import Any

from app.services.ai_actions_records import (
    RECORD_ACTIONS,
    RECORD_READ_ONLY,
    describe_record_action,
)


WORKSPACE_ACTIONS = {
    # CREATE
    "create_project", "create_sheet", "add_rows", "create_sticky_note",
    # UPDATE
    "update_project", "update_sheet", "update_row",
    "rename_project", "rename_sheet",
    "bulk_update_rows",
    "update_sticky_note",
    # DELETE
    "delete_project", "delete_sheet", "delete_row", "delete_sticky_note",
    "clear_sheet",
    # MODIFY
    "add_column", "add_group",
    "pin_project", "pin_sheet", "unpin_project", "unpin_sheet",
    "add_to_dashboard", "remove_from_dashboard",
    "duplicate_sheet",
    # READ — basic
    "get_projects", "get_sheets", "get_rows", "get_project_summary", "count_items",
    # READ — smart / analytical
    "search_rows", "filter_rows", "analyze_sheet",
    "get_sticky_notes", "get_dashboard",
    "get_deadlines", "get_overdue_rows",
    "get_notifications",
    "get_column_values",
}
WORKSPACE_READ_ONLY = {
    "get_projects", "get_sheets", "get_rows", "get_project_summary", "count_items",
    "search_rows", "filter_rows", "analyze_sheet",
    "get_sticky_notes", "get_dashboard",
    "get_deadlines", "get_overdue_rows",
    "get_notifications",
    "get_column_values",
}

SUPPORTED_ACTIONS = WORKSPACE_ACTIONS | RECORD_ACTIONS
READ_ONLY_ACTIONS = WORKSPACE_READ_ONLY | RECORD_READ_ONLY


def describe_actions(actions: list[dict[str, Any]]) -> list[str]:
    descriptions = []
    for action in actions:
        # CREATE
        if action["type"] == "create_project":
            descriptions.append(f"Create project: {action['project']['name']}")
        elif action["type"] == "create_sheet":
            descriptions.append(f"Create sheet: {action['sheet']['name']}")
        elif action["type"] == "add_rows":
            descriptions.append(f"Add {len(action['rows'])} row(s) to {action.get('sheet_name', 'the sheet')}")
        elif action["type"] == "create_sticky_note":
            descriptions.append(f"Create sticky note: {action['note']['title']}")
        # UPDATE
        elif action["type"] == "update_project":
            descriptions.append(f"Update project: {action.get('project_name', 'project')}")
        elif action["type"] == "update_sheet":
            descriptions.append(f"Update sheet: {action.get('sheet_name', 'sheet')}")
        elif action["type"] == "update_row":
            descriptions.append(f"Update row {action.get('row_index', 0)} in {action.get('sheet_name', 'sheet')}")
        elif action["type"] == "rename_project":
            descriptions.append(f"Rename project to {action.get('new_name')}")
        elif action["type"] == "rename_sheet":
            descriptions.append(f"Rename sheet to {action.get('new_name')}")
        elif action["type"] == "bulk_update_rows":
            descriptions.append(f"Bulk update rows in {action.get('sheet_name')} where {action.get('filter_column')} is {action.get('filter_value')}")
        elif action["type"] == "update_sticky_note":
            descriptions.append(f"Update sticky note: {action.get('note_title')}")
        # DELETE
        elif action["type"] == "delete_project":
            descriptions.append(f"Delete project: {action.get('project_name', 'project')}")
        elif action["type"] == "delete_sheet":
            descriptions.append(f"Delete sheet: {action.get('sheet_name', 'sheet')}")
        elif action["type"] == "delete_row":
            descriptions.append(f"Delete row {action.get('row_index', 0)} from {action.get('sheet_name', 'sheet')}")
        elif action["type"] == "clear_sheet":
            descriptions.append(f"Clear all rows from {action.get('sheet_name')}")
        elif action["type"] == "delete_sticky_note":
            descriptions.append(f"Delete sticky note: {action.get('note_title')}")
        # MODIFY
        elif action["type"] == "add_column":
            descriptions.append(f"Add column: {action.get('column', {}).get('name', 'column')}")
        elif action["type"] == "add_group":
            descriptions.append(f"Add group: {action.get('group_name', 'group')}")
        elif action["type"] == "duplicate_sheet":
            descriptions.append(f"Duplicate sheet {action.get('sheet_name')}")
        elif action["type"] == "pin_project":
            descriptions.append(f"Pin project: {action.get('project_name', 'project')}")
        elif action["type"] == "pin_sheet":
            descriptions.append(f"Pin sheet: {action.get('sheet_name', 'sheet')}")
        elif action["type"] == "unpin_project":
            descriptions.append(f"Unpin project: {action.get('project_name', 'project')}")
        elif action["type"] == "unpin_sheet":
            descriptions.append(f"Unpin sheet: {action.get('sheet_name', 'sheet')}")
        elif action["type"] == "add_to_dashboard":
            descriptions.append(f"Add {action.get('item_type', 'item')} to dashboard")
        elif action["type"] == "remove_from_dashboard":
            descriptions.append(f"Remove {action.get('item_type', 'item')} from dashboard")
        # READ
        elif action["type"] == "get_projects":
            descriptions.append("Get all projects")
        elif action["type"] == "get_sheets":
            descriptions.append(f"Get sheets from {action.get('project_name', 'project')}")
        elif action["type"] == "get_rows":
            descriptions.append(f"Get rows from {action.get('sheet_name', 'sheet')}")
        elif action["type"] == "get_project_summary":
            descriptions.append(f"Get summary of {action.get('project_name', 'project')}")
        elif action["type"] == "count_items":
            descriptions.append(f"Count {action.get('item_type', 'items')}")
        elif action["type"] == "search_rows":
            descriptions.append(f"Search for '{action.get('query')}' in {action.get('sheet_name')}")
        elif action["type"] == "filter_rows":
            descriptions.append(f"Filter rows in {action.get('sheet_name')} by {action.get('column_query')}")
        elif action["type"] == "analyze_sheet":
            descriptions.append(f"Analyze {action.get('sheet_name')} data")
        elif action["type"] == "get_deadlines":
            descriptions.append(f"Find upcoming deadlines for {action.get('project_name')}")
        elif action["type"] == "get_overdue_rows":
            descriptions.append(f"Find overdue items for {action.get('project_name')}")
        elif action["type"] == "get_column_values":
            descriptions.append(f"Get unique values for {action.get('column_query')}")
        elif action["type"] == "get_sticky_notes":
            descriptions.append("List sticky notes")
        elif action["type"] == "get_dashboard":
            descriptions.append("Get dashboard summary")
        elif action["type"] == "get_notifications":
            descriptions.append("Get unread notifications")
        else:
            record_description = describe_record_action(action)
            if record_description:
                descriptions.append(record_description)
    return descriptions


def execution_message(results: list[dict[str, Any]]) -> str:
    lines = []
    for result in results:
        if result.get("message"):
            # Rich formatted read/analysis output (smart reads, record lists).
            lines.append(result["message"])
            continue

        # Standard WRITE / Basic READ messages
        if not lines:
            lines.append("Done. I updated your ScholarDocX workspace:")

        if result.get("line"):
            # Record-domain writes carry a preformatted summary line.
            lines.append(result["line"])
        elif result["type"] == "create_project":
            lines.append(f"- Created project **{result['project']['name']}**.")
        elif result["type"] == "create_sheet":
            lines.append(f"- Created sheet **{result['sheet']['name']}** in **{result['project']['name']}**.")
        elif result["type"] == "add_rows":
            lines.append(f"- Added **{result['row_count']}** row(s) to **{result['page']['name']}**.")
        elif result["type"] == "create_sticky_note":
            lines.append(f"- Created sticky note **{result['note']['title']}**.")
        elif result["type"] == "update_project":
            lines.append(f"- Updated project **{result['project']['name']}**.")
        elif result["type"] == "update_sheet":
            lines.append(f"- Updated sheet **{result['sheet']['name']}**.")
        elif result["type"] == "update_row":
            lines.append(f"- Updated row {result.get('row_index', '?')} in **{result.get('page', {}).get('name', '?')}**.")
        elif result["type"] == "rename_project":
            lines.append(f"- Renamed project from **{result.get('old_name')}** to **{result.get('new_name')}**.")
        elif result["type"] == "rename_sheet":
            lines.append(f"- Renamed sheet from **{result.get('old_name')}** to **{result.get('new_name')}**.")
        elif result["type"] == "bulk_update_rows":
            lines.append(f"- Bulk updated {result.get('updated_count')} rows in {result.get('project', {}).get('name')}.")
        elif result["type"] == "update_sticky_note":
            lines.append(f"- Updated sticky note **{result.get('note', {}).get('title')}**.")
        elif result["type"] == "delete_project":
            lines.append(f"- Deleted project **{result.get('project_name', '?')}**.")
        elif result["type"] == "delete_sheet":
            lines.append(f"- Deleted sheet **{result.get('sheet_name', '?')}**.")
        elif result["type"] == "delete_row":
            lines.append(f"- Deleted row {result.get('row_index', '?')} from **{result.get('page', {}).get('name', '?')}**.")
        elif result["type"] == "clear_sheet":
            lines.append(f"- Cleared {result.get('cleared_count')} rows from **{result.get('project', {}).get('name')}**.")
        elif result["type"] == "delete_sticky_note":
            lines.append(f"- Deleted sticky note **{result.get('note', {}).get('title')}**.")
        elif result["type"] == "add_column":
            lines.append(f"- Added column **{result.get('column_name', '?')}** to **{result.get('page', {}).get('name', '?')}**.")
        elif result["type"] == "add_group":
            lines.append(f"- Added group **{result.get('group_name', '?')}** to **{result.get('page', {}).get('name', '?')}**.")
        elif result["type"] == "duplicate_sheet":
            lines.append(f"- Duplicated sheet as **{result.get('sheet', {}).get('name')}**.")
        elif result["type"] == "pin_project":
            lines.append(f"- Pinned project **{result.get('project', {}).get('name')}** to {result.get('pin_type')}.")
        elif result["type"] == "pin_sheet":
            lines.append(f"- Pinned sheet **{result.get('sheet', {}).get('name')}** to {result.get('pin_type')}.")
        elif result["type"] == "unpin_project":
            lines.append(f"- Unpinned project **{result.get('project', {}).get('name')}**.")
        elif result["type"] == "unpin_sheet":
            lines.append(f"- Unpinned sheet **{result.get('project', {}).get('name')}**.")
        elif result["type"] == "add_to_dashboard":
            lines.append("- Added item to dashboard.")
        elif result["type"] == "remove_from_dashboard":
            lines.append("- Removed item from dashboard.")
        elif result["type"] == "get_projects":
            lines = ["Here are your projects:"]
            for project in result.get("projects", []):
                lines.append(f"- **{project.get('name')}** ({project.get('degree_type', 'phd')}, {project.get('status', 'Active')})")
            lines.append(f"\nTotal: **{result.get('count', 0)}** projects")
        elif result["type"] == "get_sheets":
            lines = [f"Sheets in **{result.get('project', {}).get('name')}**:"]
            for sheet in result.get("sheets", []):
                lines.append(f"- **{sheet.get('name')}**")
            lines.append(f"\nTotal: **{result.get('count', 0)}** sheets")
        elif result["type"] == "get_rows":
            lines = [f"Rows in **{result.get('page', {}).get('name')}**:"]
            for idx, row in enumerate(result.get("rows", [])[:10]):
                row_preview = ", ".join([f"{k}: {v}" for k, v in list(row.items())[:3] if not k.startswith("_")])
                lines.append(f"{idx + 1}. {row_preview}")
            if result.get('count', 0) > 10:
                lines.append(f"... and {result['count'] - 10} more rows")
            lines.append(f"\nTotal: **{result.get('count', 0)}** rows")
        elif result["type"] == "get_project_summary":
            summary = result.get("summary", {})
            lines = [f"Summary of **{result.get('project', {}).get('name')}**:"]
            lines.append(f"- Sheets: **{len(summary.get('sheets', []))}**")
            lines.append(f"- Total rows: **{sum(len(page.get('rows', [])) for page in summary.get('pages', []))}**")
        elif result["type"] == "count_items":
            item_type = result.get("item_type")
            count = result.get("count", 0)
            if item_type == "projects":
                lines = [f"You have **{count}** projects."]
            elif item_type == "sheets":
                lines = [f"**{result.get('project', {}).get('name')}** has **{count}** sheets."]
            elif item_type == "rows":
                lines = [f"**{result.get('page', {}).get('name')}** has **{count}** rows."]
    return "\n\n".join(lines)
