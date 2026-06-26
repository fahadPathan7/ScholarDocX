from __future__ import annotations

from datetime import date, datetime
from typing import Any
import json
import re

from app.core.config import Settings
from app.services.ai import AiService, PROVIDER_FAILURE_MODES
from app.services.store import Store
from app.services.ai_actions_read import (
    find_best_column,
    find_column_by_semantic_match,
    analyze_date_column,
    filter_rows_by_value,
    count_by_column_value,
    get_unique_column_values,
    format_rows_as_table,
    format_date_analysis,
    format_value_counts,
    format_filter_results,
    execute_search_rows,
    execute_filter_rows,
    execute_analyze_sheet,
    execute_get_deadlines,
    execute_get_overdue_rows,
    execute_get_column_values,
    parse_date_value,
)


SUPPORTED_ACTIONS = {
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
READ_ONLY_ACTIONS = {
    "get_projects", "get_sheets", "get_rows", "get_project_summary", "count_items",
    "search_rows", "filter_rows", "analyze_sheet",
    "get_sticky_notes", "get_dashboard",
    "get_deadlines", "get_overdue_rows",
    "get_notifications",
    "get_column_values",
}
ACTION_TRIGGER_RE = re.compile(
    r"\b(create|make|add|start|set up|setup|new|update|edit|change|modify|rename"
    r"|delete|remove|clear|pin|unpin|get|show|list|find|search|count|how many"
    r"|which|who|what|where|when|duplicate|copy|analyze|summary|summarize"
    r"|upcoming|overdue|deadline|applied|status|filter)"
    r"\b", re.IGNORECASE
)
ACTION_TARGET_RE = re.compile(
    r"\b(project|projects|sheet|sheets|row|rows|sticky|note|notes|checklist"
    r"|column|columns|group|dashboard|deadline|deadlines|notification|notifications"
    r"|applied|status|university|professor|overdue|upcoming)"
    r"\b", re.IGNORECASE
)
NOTE_COLORS = {"sun", "mint", "sky", "rose", "lilac", "sand"}

ACTION_PLANNER_SYSTEM_PROMPT = (
    "You are ScholarDocX's local workspace action planner. Convert user requests "
    "into precise JSON action plans. You are smart, concise, and thorough.\n\n"
    "CRITICAL RULES:\n"
    "1. Return ONLY valid JSON. No markdown, no explanations, no code blocks.\n"
    "2. Extract exact names, values, and intentions from the request.\n"
    "3. Preserve project/sheet names EXACTLY as stated (case, spacing, punctuation).\n"
    "4. If information is ambiguous or missing, return needs_info status with a focused question.\n"
    "5. For casual chat, research, or non-workspace requests, return no_action.\n"
    "6. For ALL read operations, return needs_confirmation status.\n"
    "7. SEMANTIC COLUMN MATCHING: When user refers to a column by a partial or "
    "related name (e.g., 'deadline' when column is 'Application Deadline', or "
    "'applied' when column is 'Applied'), use the CLOSEST matching column name "
    "from the workspace. You have access to column names in CURRENT WORKSPACE.\n"
    "8. DATE-AWARE: Use CURRENT_DATE (injected below) to reason about 'this month', "
    "'upcoming', 'overdue', 'next week', 'within N days'. Never say you don't know the date.\n\n"

    "SUPPORTED ACTIONS:\n\n"
    "CREATE:\n"
    "  create_project — {project: {name, degree_type, intake_term, status, description}}\n"
    "  create_sheet   — {project_name, sheet: {name}}\n"
    "  add_rows       — {project_name, sheet_name, rows: [{col: val, ...}]}\n"
    "  create_sticky_note — {note: {title, body, color, is_checklist, checklist_items: []}}\n\n"

    "UPDATE:\n"
    "  update_project  — {project_name, updates: {field: value}}\n"
    "  update_sheet    — {project_name, sheet_name, updates: {field: value}}\n"
    "  update_row      — {project_name, sheet_name, row_index (0-based), updates: {col: val}}\n"
    "  rename_project  — {project_name, new_name}\n"
    "  rename_sheet    — {project_name, sheet_name, new_name}\n"
    "  bulk_update_rows — {project_name, sheet_name, filter_column, filter_value, updates: {col: val}}\n"
    "  update_sticky_note — {note_title, updates: {title, body, color}}\n\n"

    "DELETE:\n"
    "  delete_project  — {project_name}\n"
    "  delete_sheet    — {project_name, sheet_name}\n"
    "  delete_row      — {project_name, sheet_name, row_index (0-based)}\n"
    "  delete_sticky_note — {note_title}\n"
    "  clear_sheet     — {project_name, sheet_name} (removes all rows, keeps columns)\n\n"

    "MODIFY:\n"
    "  add_column      — {project_name, sheet_name, column: {name, type}}\n"
    "  add_group       — {project_name, sheet_name, group_name, color}\n"
    "  pin_project / unpin_project — {project_name, pin_type: sidebar|dashboard}\n"
    "  pin_sheet / unpin_sheet     — {project_name, sheet_name, pin_type}\n"
    "  add_to_dashboard / remove_from_dashboard — {item_type: project|sheet, project_name, sheet_name?}\n"
    "  duplicate_sheet — {project_name, sheet_name, new_name?}\n\n"

    "READ — Basic:\n"
    "  get_projects       — {} (no params needed)\n"
    "  get_sheets         — {project_name}\n"
    "  get_rows           — {project_name, sheet_name}\n"
    "  get_project_summary — {project_name}\n"
    "  count_items        — {item_type: projects|sheets|rows, project_name?, sheet_name?}\n\n"

    "READ — Smart / Analytical (THE POWERFUL ONES):\n"
    "  search_rows    — {project_name, sheet_name, query} → full-text search across all columns\n"
    "  filter_rows    — {project_name, sheet_name, column_query, value, operator} → filter by column value\n"
    "    operators: equals, not_equals, contains, is_true, is_false, is_empty, is_not_empty, gt, lt\n"
    "  analyze_sheet  — {project_name, sheet_name, focus_column?, days_ahead?} → date analysis, status breakdown\n"
    "  get_deadlines  — {project_name, days_ahead?} → upcoming deadlines across all sheets in project\n"
    "  get_overdue_rows — {project_name} → rows with dates past today\n"
    "  get_column_values — {project_name, sheet_name, column_query} → unique values + counts\n"
    "  get_sticky_notes — {} (no params)\n"
    "  get_dashboard   — {} (no params)\n"
    "  get_notifications — {project_name?} → unread notifications\n\n"

    "SEMANTIC COLUMN MATCHING EXAMPLES:\n"
    "- User: 'how many have deadline this month?' → analyze_sheet with focus_column='Deadline'\n"
    "- User: 'which rows have applied?' → filter_rows with column_query='Applied', operator='is_true'\n"
    "- User: 'count applied from this sheet' → filter_rows with column_query='Applied', operator='is_true'\n"
    "- User: 'upcoming deadlines within 10 days' → get_deadlines with days_ahead=10\n"
    "- User: 'show overdue items' → get_overdue_rows\n"
    "- User: 'how many have status Accepted?' → filter_rows with column_query='Status', value='Accepted'\n"
    "- User: 'what statuses are there?' → get_column_values with column_query='Status'\n"
    "- User: 'find MIT in my sheet' → search_rows with query='MIT'\n"
    "- User: 'how many rows have email sent?' → filter_rows with column_query='Cold email sent', operator='is_true'\n"
    "- User: 'deadlines this month' → analyze_sheet with focus_column='Deadline'\n"
    "- User: 'show me notes' → get_sticky_notes\n"
    "- User: 'dashboard summary' → get_dashboard\n\n"

    "PARSING GUIDELINES:\n"
    "- 'create a sheet inside X project' → create_sheet, project_name=X\n"
    "- 'show me all projects' → get_projects\n"
    "- 'how many sheets in X' → count_items, item_type=sheets, project_name=X\n"
    "- 'list sheets in X' → get_sheets, project_name=X\n"
    "- When user says 'the project' or 'my project', infer from CONVERSATION CONTEXT. If not possible, needs_info.\n"
    "- When user references a column name approximately, use the CLOSEST match from the sheet's column list.\n"
    "- Row indices are 0-based (first row = 0, second row = 1).\n"
    "- For date questions, use analyze_sheet or get_deadlines. Set days_ahead for 'within N days' questions.\n"
    "- For 'how many have X' questions, use filter_rows with the matching column and appropriate operator.\n"
    "- For boolean columns (Applied, Email sent, etc.), use is_true / is_false operators.\n"
)


class AiActionService:
    def __init__(self, settings: Settings, store: Store) -> None:
        self.settings = settings
        self.store = store

    async def plan(self, message: str, context: str = "", model: str = None) -> dict:
        if not self._looks_like_action_request(message):
            return self._no_action()

        fallback_plan = self._heuristic_plan(message)
        if self.settings.chat_provider_configured:
            prompt = self._build_planner_prompt(message, context)
            response = await AiService(self.settings).chat(
                prompt,
                model=model,
                max_tokens=1200,
                override_system_prompt=ACTION_PLANNER_SYSTEM_PROMPT,
            )
            if response.get("mode") not in PROVIDER_FAILURE_MODES and response.get("answer"):
                parsed = self._extract_json(response["answer"])
                if parsed:
                    normalized = self._normalize_plan(parsed, message)
                    # If AI returned no_action but we detected action keywords, use fallback instead
                    if normalized.get("status") == "no_action" and fallback_plan.get("status") != "no_action":
                        print(f"[AI Actions] AI returned no_action but heuristic detected action. Using fallback.")
                        return fallback_plan
                    return normalized
                else:
                    print(f"[AI Actions] Failed to parse JSON from AI response. Using fallback.")

        return fallback_plan

    def execute(self, plan: dict[str, Any]) -> dict:
        normalized = self._normalize_plan(plan, "")
        if normalized.get("status") != "needs_confirmation":
            raise ValueError(normalized.get("message") or "Action plan is not ready to execute.")

        refs: dict[str, Any] = {"projects": {}, "sheets": {}, "latest_project": None, "latest_sheet": None}
        results = []
        for action in normalized["actions"]:
            action_type = action["type"]
            if action_type == "create_project":
                results.append(self._execute_create_project(action, refs))
            elif action_type == "create_sheet":
                results.append(self._execute_create_sheet(action, refs))
            elif action_type == "add_rows":
                results.append(self._execute_add_rows(action, refs))
            elif action_type == "create_sticky_note":
                results.append(self._execute_create_sticky_note(action))
            elif action_type == "update_project":
                results.append(self._execute_update_project(action, refs))
            elif action_type == "update_sheet":
                results.append(self._execute_update_sheet(action, refs))
            elif action_type == "update_row":
                results.append(self._execute_update_row(action, refs))
            elif action_type == "delete_project":
                results.append(self._execute_delete_project(action, refs))
            elif action_type == "delete_sheet":
                results.append(self._execute_delete_sheet(action, refs))
            elif action_type == "delete_row":
                results.append(self._execute_delete_row(action, refs))
            elif action_type == "add_column":
                results.append(self._execute_add_column(action, refs))
            elif action_type == "add_group":
                results.append(self._execute_add_group(action, refs))
            elif action_type == "pin_project":
                results.append(self._execute_pin_project(action, refs))
            elif action_type == "pin_sheet":
                results.append(self._execute_pin_sheet(action, refs))
            elif action_type == "add_to_dashboard":
                results.append(self._execute_add_to_dashboard(action, refs))
            elif action_type == "get_projects":
                results.append(self._execute_get_projects(action, refs))
            elif action_type == "get_sheets":
                results.append(self._execute_get_sheets(action, refs))
            elif action_type == "get_rows":
                results.append(self._execute_get_rows(action, refs))
            elif action_type == "get_project_summary":
                results.append(self._execute_get_project_summary(action, refs))
            elif action_type == "count_items":
                results.append(self._execute_count_items(action, refs))
            # --- New WRITE actions ---
            elif action_type == "rename_project":
                results.append(self._execute_rename_project(action, refs))
            elif action_type == "rename_sheet":
                results.append(self._execute_rename_sheet(action, refs))
            elif action_type == "bulk_update_rows":
                results.append(self._execute_bulk_update_rows(action, refs))
            elif action_type == "clear_sheet":
                results.append(self._execute_clear_sheet(action, refs))
            elif action_type == "duplicate_sheet":
                results.append(self._execute_duplicate_sheet(action, refs))
            elif action_type == "unpin_project":
                results.append(self._execute_unpin_project(action, refs))
            elif action_type == "unpin_sheet":
                results.append(self._execute_unpin_sheet(action, refs))
            elif action_type == "remove_from_dashboard":
                results.append(self._execute_remove_from_dashboard(action, refs))
            elif action_type == "update_sticky_note":
                results.append(self._execute_update_sticky_note(action))
            elif action_type == "delete_sticky_note":
                results.append(self._execute_delete_sticky_note(action))
            # --- Smart READ actions ---
            elif action_type == "search_rows":
                results.append(self._execute_search_rows(action, refs))
            elif action_type == "filter_rows":
                results.append(self._execute_filter_rows(action, refs))
            elif action_type == "analyze_sheet":
                results.append(self._execute_analyze_sheet(action, refs))
            elif action_type == "get_deadlines":
                results.append(self._execute_get_deadlines(action, refs))
            elif action_type == "get_overdue_rows":
                results.append(self._execute_get_overdue_rows(action, refs))
            elif action_type == "get_column_values":
                results.append(self._execute_get_column_values(action, refs))
            elif action_type == "get_sticky_notes":
                results.append(self._execute_get_sticky_notes(action, refs))
            elif action_type == "get_dashboard":
                results.append(self._execute_get_dashboard(action, refs))
            elif action_type == "get_notifications":
                results.append(self._execute_get_notifications(action, refs))
            else:
                raise ValueError(f"Unsupported action: {action_type}")

        return {
            "status": "done",
            "message": self._execution_message(results),
            "results": results,
        }

    def _build_planner_prompt(self, message: str, context: str) -> str:
        workspace = json.dumps(self._workspace_snapshot(), ensure_ascii=True)
        today_str = date.today().isoformat()
        return (
            "Return ONLY valid JSON (no markdown, no code blocks, no explanations).\n\n"
            f"CURRENT_DATE: {today_str}\n\n"
            "JSON SCHEMA:\n"
            "{\n"
            '  "status": "no_action" | "needs_info" | "needs_confirmation",\n'
            '  "message": "brief user-facing message",\n'
            '  "missing": ["field_names"],\n'
            '  "actions": [ACTION_OBJECTS]\n'
            "}\n\n"
            "ACTION EXAMPLES (CREATE/UPDATE/DELETE):\n"
            '{"type":"create_project","project":{"name":"Canada PhD 2027","degree_type":"phd","intake_term":"Fall 2027","status":"Active","description":""}}\n'
            '{"type":"create_sheet","project_name":"Canada PhD 2027","sheet":{"name":"Professor Shortlist"}}\n'
            '{"type":"add_rows","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","rows":[{"University name":"MIT","Professor name":"Dr. Smith","Status":"Researching"}]}\n'
            '{"type":"update_project","project_name":"Canada PhD 2027","updates":{"status":"Completed"}}\n'
            '{"type":"rename_project","project_name":"Canada PhD 2027","new_name":"Canada PhD 2028"}\n'
            '{"type":"rename_sheet","project_name":"Canada PhD 2027","sheet_name":"Old Name","new_name":"New Name"}\n'
            '{"type":"delete_sheet","project_name":"Canada PhD 2027","sheet_name":"Old Sheet"}\n'
            '{"type":"clear_sheet","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist"}\n'
            '{"type":"duplicate_sheet","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","new_name":"Copy of Professor Shortlist"}\n'
            '{"type":"bulk_update_rows","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","filter_column":"Status","filter_value":"Researching","updates":{"Status":"Ready"}}\n'
            '{"type":"add_column","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","column":{"name":"Response Date","type":"date"}}\n'
            '{"type":"pin_project","project_name":"Canada PhD 2027","pin_type":"dashboard"}\n'
            '{"type":"unpin_project","project_name":"Canada PhD 2027","pin_type":"dashboard"}\n'
            '{"type":"create_sticky_note","note":{"title":"Todo","body":"Finish SOP","color":"sun","is_checklist":false}}\n'
            '{"type":"update_sticky_note","note_title":"Todo","updates":{"body":"Updated body"}}\n'
            '{"type":"delete_sticky_note","note_title":"Todo"}\n\n'
            "ACTION EXAMPLES (READ — Basic):\n"
            '{"type":"get_projects"}\n'
            '{"type":"get_sheets","project_name":"Canada PhD 2027"}\n'
            '{"type":"get_rows","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist"}\n'
            '{"type":"get_project_summary","project_name":"Canada PhD 2027"}\n'
            '{"type":"count_items","item_type":"sheets","project_name":"Canada PhD 2027"}\n\n'
            "ACTION EXAMPLES (READ — Smart / Analytical):\n"
            '{"type":"search_rows","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","query":"MIT"}\n'
            '{"type":"filter_rows","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","column_query":"Applied","operator":"is_true"}\n'
            '{"type":"filter_rows","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","column_query":"Status","value":"Accepted","operator":"equals"}\n'
            '{"type":"analyze_sheet","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","focus_column":"Deadline"}\n'
            '{"type":"analyze_sheet","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","focus_column":"Deadline","days_ahead":10}\n'
            '{"type":"get_deadlines","project_name":"Canada PhD 2027","days_ahead":10}\n'
            '{"type":"get_overdue_rows","project_name":"Canada PhD 2027"}\n'
            '{"type":"get_column_values","project_name":"Canada PhD 2027","sheet_name":"Professor Shortlist","column_query":"Status"}\n'
            '{"type":"get_sticky_notes"}\n'
            '{"type":"get_dashboard"}\n'
            '{"type":"get_notifications","project_name":"Canada PhD 2027"}\n\n'
            "PARSING RULES:\n"
            "1. Extract names EXACTLY as user states them (preserve case, spacing, punctuation)\n"
            "2. When user says 'create a sheet inside X project named Y' → project_name=X, sheet.name=Y\n"
            "3. When user says 'create a sheet named Y in X' → project_name=X, sheet.name=Y\n"
            "4. When user says 'add a project called X' → project.name=X\n"
            "5. If project/sheet name is vague ('the project', 'my project', 'this project', 'here'), YOU MUST infer it from the CONVERSATION CONTEXT. If it cannot be inferred from CONVERSATION CONTEXT, return needs_info.\n"
            "6. Match existing project/sheet names from workspace when user references them\n"
            "7. For row operations, row_index is 0-based (first row = 0)\n"
            "8. For 'deadline this month' → analyze_sheet with focus_column matching the deadline column\n"
            "9. For 'how many applied' → filter_rows with column_query='Applied', operator='is_true'\n"
            "10. For boolean queries (sent, applied, funded, etc.) → use is_true/is_false operators\n"
            "11. For 'within N days' → use get_deadlines with days_ahead=N, or analyze_sheet with days_ahead=N\n"
            "12. For 'overdue' → use get_overdue_rows\n"
            "13. For 'find X' or 'search X' → use search_rows with query=X\n\n"
            "DECISION LOGIC:\n"
            "- If user is just chatting/asking questions → status: no_action\n"
            "- If critical info is missing and cannot be inferred from CONTEXT → status: needs_info, list missing fields\n"
            "- If you have all required info → status: needs_confirmation, build actions array\n\n"
            f"CURRENT WORKSPACE:\n{workspace}\n\n"
            f"CONVERSATION CONTEXT:\n{context or '(none)'}\n\n"
            f"USER REQUEST:\n{message}\n\n"
            "Return JSON now:"
        )


    def _workspace_snapshot(self) -> dict[str, Any]:
        projects = []
        for project in self.store.list_records("projects")[:30]:
            try:
                summary = self.store.project_summary(project["id"])
                sheets = []
                for sheet in summary.get("sheets", [])[:20]:
                    # Find matching page for column info
                    page = next(
                        (p for p in summary.get("pages", [])
                         if p.get("sheet_id") == sheet.get("id")),
                        None,
                    )
                    sheet_info: dict[str, Any] = {
                        "id": sheet.get("id"),
                        "name": sheet.get("name"),
                    }
                    if page:
                        cols = page.get("columns", [])
                        # Include column names and types (exclude groups)
                        sheet_info["columns"] = [
                            {"name": c["name"], "type": c.get("type", "text")}
                            for c in cols
                            if isinstance(c, dict) and c.get("type") != "group"
                        ][:30]
                        sheet_info["row_count"] = len(page.get("rows", []))
                    sheets.append(sheet_info)
            except Exception:
                sheets = []
            projects.append(
                {
                    "id": project.get("id"),
                    "name": project.get("name"),
                    "degree_type": project.get("degree_type"),
                    "intake_term": project.get("intake_term"),
                    "sheets": sheets,
                }
            )
        return {"projects": projects}


    def _normalize_plan(self, plan: dict[str, Any], message: str) -> dict:
        status = plan.get("status")
        if status not in {"no_action", "needs_info", "needs_confirmation"}:
            status = "needs_confirmation" if plan.get("actions") else "needs_info"

        raw_actions = plan.get("actions") if isinstance(plan.get("actions"), list) else []
        normalized_actions = []
        missing = [item for item in plan.get("missing", []) if isinstance(item, str)]

        for raw_action in raw_actions:
            if not isinstance(raw_action, dict):
                continue
            action = self._normalize_action(raw_action, normalized_actions)
            if action.get("missing"):
                missing.extend(action["missing"])
            elif action.get("type") in SUPPORTED_ACTIONS:
                normalized_actions.append(action)

        missing = sorted(set(missing))
        if missing:
            return {
                "status": "needs_info",
                "message": plan.get("message") or self._missing_info_message(missing),
                "missing": missing,
                "actions": normalized_actions,
            }

        if not normalized_actions:
            if self._looks_like_action_request(message):
                return {
                    "status": "needs_info",
                    "message": plan.get("message") or "Tell me what you want to create and the required names or row values.",
                    "missing": ["action_details"],
                    "actions": [],
                }
            return self._no_action()

        is_read_only = all(a.get("type") in READ_ONLY_ACTIONS for a in normalized_actions)

        return {
            "status": "needs_confirmation",
            "message": plan.get("message") or "Review these local ScholarDocX actions before I run them.",
            "missing": [],
            "actions": normalized_actions,
            "summary": self._describe_actions(normalized_actions),
            "auto_execute": is_read_only,
        }

    def _normalize_action(self, raw_action: dict[str, Any], previous_actions: list[dict[str, Any]]) -> dict:
        action_type = raw_action.get("type")
        if action_type == "create_project":
            project = raw_action.get("project") if isinstance(raw_action.get("project"), dict) else raw_action
            name = self._clean(project.get("name"))
            if not name:
                return {"type": action_type, "missing": ["project_name"]}
            return {
                "type": action_type,
                "project": {
                    "name": name,
                    "degree_type": self._normalize_degree(project.get("degree_type")),
                    "intake_term": self._clean(project.get("intake_term")),
                    "status": self._clean(project.get("status")) or "Active",
                    "description": self._clean(project.get("description")),
                },
            }

        if action_type == "create_sheet":
            sheet = raw_action.get("sheet") if isinstance(raw_action.get("sheet"), dict) else raw_action
            name = self._clean(sheet.get("name") or raw_action.get("sheet_name"))
            project_ref = self._project_ref(raw_action, previous_actions)
            missing = []
            if not name:
                missing.append("sheet_name")
            if not project_ref:
                missing.append("project_name")
            if missing:
                return {"type": action_type, "missing": missing}
            return {"type": action_type, **project_ref, "sheet": {"name": name}}

        if action_type == "add_rows":
            rows = raw_action.get("rows") if isinstance(raw_action.get("rows"), list) else []
            clean_rows = [self._clean_row(row) for row in rows if isinstance(row, dict)]
            clean_rows = [row for row in clean_rows if row]
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            project_ref = self._project_ref(raw_action, previous_actions)
            missing = []
            if not clean_rows:
                missing.append("row_values")
            if not sheet_ref:
                missing.append("sheet_name")
            if not project_ref and not sheet_ref.get("sheet_id"):
                missing.append("project_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "rows": clean_rows}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "create_sticky_note":
            note = raw_action.get("note") if isinstance(raw_action.get("note"), dict) else raw_action
            title = self._clean(note.get("title"))
            body = self._clean(note.get("body"))
            checklist_items = note.get("checklist_items") if isinstance(note.get("checklist_items"), list) else []
            checklist_items = [self._clean(item) for item in checklist_items if self._clean(item)]
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
            project_ref = self._project_ref(raw_action, previous_actions)
            updates = raw_action.get("updates", {})
            if not project_ref or not updates:
                return {"type": action_type, "missing": ["project_name", "updates"]}
            return {"type": action_type, **project_ref, "updates": updates}

        if action_type == "update_sheet":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            updates = raw_action.get("updates", {})
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if not updates:
                missing.append("updates")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "updates": updates}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "update_row":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            row_index = raw_action.get("row_index")
            updates = raw_action.get("updates", {})
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if row_index is None:
                missing.append("row_index")
            if not updates:
                missing.append("updates")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "row_index": row_index, "updates": updates}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "delete_project":
            project_ref = self._project_ref(raw_action, previous_actions)
            if not project_ref:
                return {"type": action_type, "missing": ["project_name"]}
            return {"type": action_type, **project_ref}

        if action_type == "delete_sheet":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "delete_row":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            row_index = raw_action.get("row_index")
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if row_index is None:
                missing.append("row_index")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "row_index": row_index}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "add_column":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            column = raw_action.get("column", {})
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if not column.get("name"):
                missing.append("column_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "column": column}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "add_group":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            group_name = self._clean(raw_action.get("group_name"))
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
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
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "pin_project":
            project_ref = self._project_ref(raw_action, previous_actions)
            pin_type = raw_action.get("pin_type", "sidebar")
            if not project_ref:
                return {"type": action_type, "missing": ["project_name"]}
            return {"type": action_type, **project_ref, "pin_type": pin_type}

        if action_type == "pin_sheet":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            pin_type = raw_action.get("pin_type", "sidebar")
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "pin_type": pin_type}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "add_to_dashboard":
            item_type = raw_action.get("item_type")
            if item_type == "project":
                project_ref = self._project_ref(raw_action, previous_actions)
                if not project_ref:
                    return {"type": action_type, "missing": ["project_name"]}
                return {"type": action_type, "item_type": "project", **project_ref}
            elif item_type == "sheet":
                project_ref = self._project_ref(raw_action, previous_actions)
                sheet_ref = self._sheet_ref(raw_action, previous_actions)
                missing = []
                if not project_ref:
                    missing.append("project_name")
                if not sheet_ref:
                    missing.append("sheet_name")
                if missing:
                    return {"type": action_type, "missing": missing}
                action = {"type": action_type, "item_type": "sheet"}
                action.update(project_ref)
                action.update(sheet_ref)
                return action
            else:
                return {"type": action_type, "missing": ["item_type"]}

        if action_type == "get_projects":
            # No parameters needed - returns all projects
            return {"type": action_type}

        if action_type == "get_sheets":
            project_ref = self._project_ref(raw_action, previous_actions)
            if not project_ref:
                return {"type": action_type, "missing": ["project_name"]}
            return {"type": action_type, **project_ref}

        if action_type == "get_rows":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "get_project_summary":
            project_ref = self._project_ref(raw_action, previous_actions)
            if not project_ref:
                return {"type": action_type, "missing": ["project_name"]}
            return {"type": action_type, **project_ref}

        if action_type == "count_items":
            item_type = raw_action.get("item_type")
            if item_type == "projects":
                # No additional parameters needed
                return {"type": action_type, "item_type": "projects"}
            elif item_type == "sheets":
                project_ref = self._project_ref(raw_action, previous_actions)
                if not project_ref:
                    return {"type": action_type, "missing": ["project_name"]}
                return {"type": action_type, "item_type": "sheets", **project_ref}
            elif item_type == "rows":
                project_ref = self._project_ref(raw_action, previous_actions)
                sheet_ref = self._sheet_ref(raw_action, previous_actions)
                missing = []
                if not project_ref:
                    missing.append("project_name")
                if not sheet_ref:
                    missing.append("sheet_name")
                if missing:
                    return {"type": action_type, "missing": missing}
                action = {"type": action_type, "item_type": "rows"}
                action.update(project_ref)
                action.update(sheet_ref)
                return action
            else:
                return {"type": action_type, "missing": ["item_type"]}

        # --- New action type normalizers ---

        if action_type == "rename_project":
            project_ref = self._project_ref(raw_action, previous_actions)
            new_name = self._clean(raw_action.get("new_name"))
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not new_name:
                missing.append("new_name")
            if missing:
                return {"type": action_type, "missing": missing}
            return {"type": action_type, **project_ref, "new_name": new_name}

        if action_type == "rename_sheet":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            new_name = self._clean(raw_action.get("new_name"))
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if not new_name:
                missing.append("new_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "new_name": new_name}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "bulk_update_rows":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            filter_column = self._clean(raw_action.get("filter_column"))
            filter_value = raw_action.get("filter_value")
            updates = raw_action.get("updates", {})
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if not filter_column:
                missing.append("filter_column")
            if not updates:
                missing.append("updates")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "filter_column": filter_column,
                       "filter_value": filter_value, "updates": updates}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "clear_sheet":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "duplicate_sheet":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            new_name = self._clean(raw_action.get("new_name"))
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type}
            if new_name:
                action["new_name"] = new_name
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type in ("unpin_project",):
            project_ref = self._project_ref(raw_action, previous_actions)
            pin_type = raw_action.get("pin_type", "sidebar")
            if not project_ref:
                return {"type": action_type, "missing": ["project_name"]}
            return {"type": action_type, **project_ref, "pin_type": pin_type}

        if action_type in ("unpin_sheet",):
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            pin_type = raw_action.get("pin_type", "sidebar")
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "pin_type": pin_type}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "remove_from_dashboard":
            item_type = raw_action.get("item_type")
            if item_type == "project":
                project_ref = self._project_ref(raw_action, previous_actions)
                if not project_ref:
                    return {"type": action_type, "missing": ["project_name"]}
                return {"type": action_type, "item_type": "project", **project_ref}
            elif item_type == "sheet":
                project_ref = self._project_ref(raw_action, previous_actions)
                sheet_ref = self._sheet_ref(raw_action, previous_actions)
                missing = []
                if not project_ref:
                    missing.append("project_name")
                if not sheet_ref:
                    missing.append("sheet_name")
                if missing:
                    return {"type": action_type, "missing": missing}
                action = {"type": action_type, "item_type": "sheet"}
                action.update(project_ref)
                action.update(sheet_ref)
                return action
            else:
                return {"type": action_type, "missing": ["item_type"]}

        if action_type == "update_sticky_note":
            note_title = self._clean(raw_action.get("note_title"))
            updates = raw_action.get("updates", {})
            if not note_title:
                return {"type": action_type, "missing": ["note_title"]}
            if not updates:
                return {"type": action_type, "missing": ["updates"]}
            return {"type": action_type, "note_title": note_title, "updates": updates}

        if action_type == "delete_sticky_note":
            note_title = self._clean(raw_action.get("note_title"))
            if not note_title:
                return {"type": action_type, "missing": ["note_title"]}
            return {"type": action_type, "note_title": note_title}

        # --- Smart READ action normalizers ---

        if action_type == "search_rows":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            query = self._clean(raw_action.get("query"))
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if not query:
                missing.append("query")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "query": query}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "filter_rows":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            column_query = self._clean(raw_action.get("column_query") or raw_action.get("column_name"))
            value = raw_action.get("value")
            operator = raw_action.get("operator", "equals")
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if not column_query:
                missing.append("column_query")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "column_query": column_query,
                       "value": value, "operator": operator}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "analyze_sheet":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type}
            if raw_action.get("focus_column"):
                action["focus_column"] = self._clean(raw_action["focus_column"])
            if raw_action.get("days_ahead") is not None:
                action["days_ahead"] = int(raw_action["days_ahead"])
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type == "get_deadlines":
            project_ref = self._project_ref(raw_action, previous_actions)
            if not project_ref:
                return {"type": action_type, "missing": ["project_name"]}
            action = {"type": action_type}
            if raw_action.get("days_ahead") is not None:
                action["days_ahead"] = int(raw_action["days_ahead"])
            action.update(project_ref)
            return action

        if action_type == "get_overdue_rows":
            project_ref = self._project_ref(raw_action, previous_actions)
            if not project_ref:
                return {"type": action_type, "missing": ["project_name"]}
            return {"type": action_type, **project_ref}

        if action_type == "get_column_values":
            project_ref = self._project_ref(raw_action, previous_actions)
            sheet_ref = self._sheet_ref(raw_action, previous_actions)
            column_query = self._clean(raw_action.get("column_query") or raw_action.get("column_name"))
            missing = []
            if not project_ref:
                missing.append("project_name")
            if not sheet_ref:
                missing.append("sheet_name")
            if not column_query:
                missing.append("column_query")
            if missing:
                return {"type": action_type, "missing": missing}
            action = {"type": action_type, "column_query": column_query}
            action.update(project_ref)
            action.update(sheet_ref)
            return action

        if action_type in ("get_sticky_notes", "get_dashboard"):
            return {"type": action_type}

        if action_type == "get_notifications":
            project_ref = self._project_ref(raw_action, previous_actions)
            action = {"type": action_type}
            if project_ref:
                action.update(project_ref)
            return action


    def _heuristic_plan(self, message: str) -> dict:
        lowered = message.lower()
        
        # Count items (how many sheets/projects/rows)
        if any(word in lowered for word in ["how many", "count"]):
            if "sheet" in lowered:
                project_name = self._extract_project_name(message)
                if not project_name:
                    return {"status": "needs_info", "message": "Which project should I count sheets in?", "missing": ["project_name"], "actions": []}
                return self._normalize_plan(
                    {"actions": [{"type": "count_items", "item_type": "sheets", "project_name": project_name}]},
                    message,
                )
            elif "project" in lowered:
                return self._normalize_plan(
                    {"actions": [{"type": "count_items", "item_type": "projects"}]},
                    message,
                )
            elif "row" in lowered:
                project_name = self._extract_project_name(message)
                sheet_name = self._extract_sheet_name(message)
                if not project_name or not sheet_name:
                    return {"status": "needs_info", "message": "Which project and sheet should I count rows in?", "missing": ["project_name", "sheet_name"], "actions": []}
                return self._normalize_plan(
                    {"actions": [{"type": "count_items", "item_type": "rows", "project_name": project_name, "sheet_name": sheet_name}]},
                    message,
                )
        
        # Get/show/list operations
        if any(word in lowered for word in ["show", "list", "get", "display"]):
            if "project" in lowered and "sheet" not in lowered:
                # Show all projects
                return self._normalize_plan(
                    {"actions": [{"type": "get_projects"}]},
                    message,
                )
            elif "sheet" in lowered:
                project_name = self._extract_project_name(message)
                if not project_name:
                    return {"status": "needs_info", "message": "Which project should I list sheets from?", "missing": ["project_name"], "actions": []}
                return self._normalize_plan(
                    {"actions": [{"type": "get_sheets", "project_name": project_name}]},
                    message,
                )
            elif "row" in lowered:
                project_name = self._extract_project_name(message)
                sheet_name = self._extract_sheet_name(message)
                if not project_name or not sheet_name:
                    return {"status": "needs_info", "message": "Which project and sheet should I show rows from?", "missing": ["project_name", "sheet_name"], "actions": []}
                return self._normalize_plan(
                    {"actions": [{"type": "get_rows", "project_name": project_name, "sheet_name": sheet_name}]},
                    message,
                )
        
        # Create project
        if "project" in lowered and any(word in lowered for word in ["create", "make", "add", "new", "start"]):
            name = self._extract_project_name(message)
            if not name:
                return {"status": "needs_info", "message": "What should I name the project?", "missing": ["project_name"], "actions": []}
            return self._normalize_plan(
                {"actions": [{"type": "create_project", "project": {"name": name, "degree_type": self._degree_from_text(message)}}]},
                message,
            )
        
        # Create sheet
        if "sheet" in lowered and any(word in lowered for word in ["create", "make", "add", "new"]):
            sheet_name = self._extract_sheet_name(message)
            project_name = self._extract_project_name(message)
            
            missing = []
            if not sheet_name:
                missing.append("sheet_name")
            if not project_name:
                missing.append("project_name")
            
            if missing:
                return {"status": "needs_info", "message": "I need more details to create the sheet.", "missing": missing, "actions": []}
            
            return self._normalize_plan(
                {"actions": [{"type": "create_sheet", "project_name": project_name, "sheet": {"name": sheet_name}}]},
                message,
            )
        
        # Add rows
        if "row" in lowered and any(word in lowered for word in ["add", "create", "insert"]):
            return {"status": "needs_info", "message": "Which project and sheet should receive the rows, and what row values should I add?", "missing": ["project_name", "sheet_name", "row_values"], "actions": []}
        
        # Sticky note
        if any(word in lowered for word in ["sticky", "note", "checklist"]) and any(word in lowered for word in ["create", "make", "add", "new"]):
            body = self._extract_note_body(message)
            if not body:
                return {"status": "needs_info", "message": "What should the sticky note say?", "missing": ["note_content"], "actions": []}
            return self._normalize_plan({"actions": [{"type": "create_sticky_note", "note": {"body": body}}]}, message)
        
        # If we detected action keywords but couldn't parse the request, ask for clarification
        # This prevents falling through to regular chat where AI might make false claims
        if self._looks_like_action_request(message):
            return {
                "status": "needs_info",
                "message": "I can help you create or modify workspace items. Could you please clarify what you'd like me to do? For example:\n- Create a project named [name]\n- Create a sheet named [name] in [project]\n- Add rows to [sheet] in [project]",
                "missing": ["action_details"],
                "actions": []
            }
        
        return self._no_action()

    def _execute_create_project(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self.store.create_record("projects", action["project"])
        self.store.create_record(
            "notifications",
            {
                "project_id": project["id"],
                "title": f"Project created: {project['name']}",
                "notification_type": "project",
                "body": "Created by Lumi from a confirmed AI action.",
            },
        )
        refs["projects"][project["name"].lower()] = project
        refs["latest_project"] = project
        return {"type": "create_project", "project": project}

    def _execute_create_sheet(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        result = self.store.create_sheet_with_defaults(project["id"], action["sheet"]["name"])
        refs["sheets"][(project["id"], result["sheet"]["name"].lower())] = result
        refs["latest_sheet"] = result
        return {"type": "create_sheet", "project": project, "sheet": result["sheet"], "page": result["page"]}

    def _execute_add_rows(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        column_names = [
            col.get("name") if isinstance(col, dict) else col
            for col in columns
            if not (isinstance(col, dict) and col.get("type") == "group")
        ]
        new_rows = [self._row_for_columns(row, column_names) for row in action["rows"]]
        rows.extend(row for row in new_rows if row)
        updated = self.store.update_record(
            "project_pages",
            page["id"],
            {"columns_json": columns, "rows_json": rows},
        )
        return {"type": "add_rows", "project": project, "page": updated, "row_count": len(new_rows)}

    def _execute_create_sticky_note(self, action: dict[str, Any]) -> dict:
        note = action["note"]
        checklist = [
            {"id": f"ai-{index + 1}", "text": item, "done": False}
            for index, item in enumerate(note.get("checklist_items", []))
        ]
        created = self.store.create_record(
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

    def _execute_update_project(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        updates = action.get("updates", {})
        updated = self.store.update_record("projects", project["id"], updates)
        return {"type": "update_project", "project": updated}

    def _execute_update_sheet(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        sheet_id = page.get("sheet_id")
        updates = action.get("updates", {})
        updated_sheet = self.store.update_record("project_sheets", sheet_id, updates)
        # Also update the page name if sheet name changed
        if "name" in updates:
            self.store.update_record("project_pages", page["id"], {"name": updates["name"]})
        return {"type": "update_sheet", "sheet": updated_sheet, "project": project}

    def _execute_update_row(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        row_index = action.get("row_index")
        if row_index is None:
            raise ValueError("Row index is required for update_row action")
        
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        
        if row_index < 0 or row_index >= len(rows):
            raise ValueError(f"Row index {row_index} is out of range")
        
        updates = action.get("updates", {})
        rows[row_index].update(updates)
        
        updated = self.store.update_record(
            "project_pages",
            page["id"],
            {"columns_json": columns, "rows_json": rows},
        )
        return {"type": "update_row", "project": project, "page": updated, "row_index": row_index}

    def _execute_delete_project(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        self.store.delete_record("projects", project["id"])
        return {"type": "delete_project", "project_name": project["name"]}

    def _execute_delete_sheet(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        sheet_id = page.get("sheet_id")
        sheet = self.store.get_record("project_sheets", sheet_id)
        self.store.delete_record("project_sheets", sheet_id)
        return {"type": "delete_sheet", "sheet_name": sheet["name"], "project": project}

    def _execute_delete_row(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        row_index = action.get("row_index")
        if row_index is None:
            raise ValueError("Row index is required for delete_row action")
        
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        
        if row_index < 0 or row_index >= len(rows):
            raise ValueError(f"Row index {row_index} is out of range")
        
        deleted_row = rows.pop(row_index)
        
        updated = self.store.update_record(
            "project_pages",
            page["id"],
            {"columns_json": columns, "rows_json": rows},
        )
        return {"type": "delete_row", "project": project, "page": updated, "row_index": row_index}

    def _execute_add_column(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        
        new_column = action.get("column", {})
        columns.append(new_column)
        
        # Add empty value for new column in all rows
        column_name = new_column.get("name", "")
        for row in rows:
            if column_name not in row:
                row[column_name] = ""
        
        updated = self.store.update_record(
            "project_pages",
            page["id"],
            {"columns_json": columns, "rows_json": rows},
        )
        return {"type": "add_column", "project": project, "page": updated, "column_name": column_name}

    def _execute_add_group(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        
        group_column = {
            "name": action.get("group_name", "New Group"),
            "type": "group",
            "color": action.get("color", "#2f6d7a")
        }
        columns.append(group_column)
        
        updated = self.store.update_record(
            "project_pages",
            page["id"],
            {"columns_json": columns, "rows_json": rows},
        )
        return {"type": "add_group", "project": project, "page": updated, "group_name": group_column["name"]}

    def _execute_pin_project(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        pin_type = action.get("pin_type", "sidebar")  # sidebar or dashboard
        
        if pin_type == "sidebar":
            updated = self.store.update_record("projects", project["id"], {"pinned_sidebar": True})
        else:
            updated = self.store.update_record("projects", project["id"], {"pinned_dashboard": True})
        
        return {"type": "pin_project", "project": updated, "pin_type": pin_type}

    def _execute_pin_sheet(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        sheet_id = page.get("sheet_id")
        pin_type = action.get("pin_type", "sidebar")  # sidebar or dashboard
        
        if pin_type == "sidebar":
            updated = self.store.update_record("project_sheets", sheet_id, {"pinned_sidebar": True})
        else:
            updated = self.store.update_record("project_sheets", sheet_id, {"pinned_dashboard": True})
        
        return {"type": "pin_sheet", "sheet": updated, "project": project, "pin_type": pin_type}

    def _execute_add_to_dashboard(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        item_type = action.get("item_type")  # "project" or "sheet"
        
        if item_type == "project":
            project = self._resolve_project(action, refs)
            updated = self.store.update_record("projects", project["id"], {"pinned_dashboard": True})
            return {"type": "add_to_dashboard", "item_type": "project", "project": updated}
        elif item_type == "sheet":
            project = self._resolve_project(action, refs)
            page = self._resolve_page(project["id"], action, refs)
            sheet_id = page.get("sheet_id")
            updated = self.store.update_record("project_sheets", sheet_id, {"pinned_dashboard": True})
            return {"type": "add_to_dashboard", "item_type": "sheet", "sheet": updated, "project": project}
        else:
            raise ValueError(f"Unsupported item_type for add_to_dashboard: {item_type}")

    def _execute_get_projects(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        projects = self.store.list_records("projects")
        return {"type": "get_projects", "projects": projects, "count": len(projects)}

    def _execute_get_sheets(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        summary = self.store.project_summary(project["id"])
        sheets = summary.get("sheets", [])
        return {"type": "get_sheets", "project": project, "sheets": sheets, "count": len(sheets)}

    def _execute_get_rows(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        return {"type": "get_rows", "project": project, "page": page, "rows": rows, "count": len(rows)}

    def _execute_get_project_summary(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        summary = self.store.project_summary(project["id"])
        return {"type": "get_project_summary", "project": project, "summary": summary}

    def _execute_count_items(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        item_type = action.get("item_type")  # "projects", "sheets", "rows"
        
        if item_type == "projects":
            projects = self.store.list_records("projects")
            return {"type": "count_items", "item_type": "projects", "count": len(projects)}
        elif item_type == "sheets":
            project = self._resolve_project(action, refs)
            summary = self.store.project_summary(project["id"])
            sheets = summary.get("sheets", [])
            return {"type": "count_items", "item_type": "sheets", "project": project, "count": len(sheets)}
        elif item_type == "rows":
            project = self._resolve_project(action, refs)
            page = self._resolve_page(project["id"], action, refs)
            rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
            return {"type": "count_items", "item_type": "rows", "project": project, "page": page, "count": len(rows)}
        else:
            raise ValueError(f"Unsupported item_type for count_items: {item_type}")

    # --- New WRITE action executors ---

    def _execute_rename_project(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        new_name = action["new_name"]
        updated = self.store.update_record("projects", project["id"], {"name": new_name})
        return {"type": "rename_project", "project": updated, "old_name": project.get("name"), "new_name": new_name}

    def _execute_rename_sheet(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        new_name = action["new_name"]
        old_name = page.get("name", "")
        self.store.update_record("project_sheets", page["sheet_id"], {"name": new_name})
        self.store.update_record("project_pages", page["id"], {"name": new_name})
        return {"type": "rename_sheet", "project": project, "old_name": old_name, "new_name": new_name}

    def _execute_bulk_update_rows(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        filter_column = action["filter_column"]
        filter_value = action.get("filter_value")
        updates = action["updates"]

        matched = filter_rows_by_value(rows, filter_column, filter_value, "equals", columns)
        for entry in matched:
            row_idx = entry["row_index"]
            for key, val in updates.items():
                rows[row_idx][key] = val

        self.store.update_record("project_pages", page["id"], {"rows_json": rows})
        return {"type": "bulk_update_rows", "project": project, "updated_count": len(matched),
                "filter_column": filter_column, "filter_value": filter_value}

    def _execute_clear_sheet(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        old_rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        self.store.update_record("project_pages", page["id"], {"rows_json": []})
        return {"type": "clear_sheet", "project": project, "cleared_count": len(old_rows)}

    def _execute_duplicate_sheet(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        new_name = action.get("new_name") or f"Copy of {page.get('name', 'Sheet')}"
        new_sheet = self.store.create_record("project_sheets", {"project_id": project["id"], "name": new_name})
        new_page = self.store.create_record("project_pages", {
            "project_id": project["id"],
            "sheet_id": new_sheet["id"],
            "name": new_name,
            "columns_json": columns,
            "rows_json": rows,
        })
        return {"type": "duplicate_sheet", "project": project, "sheet": new_sheet, "page": new_page}

    def _execute_unpin_project(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        pin_type = action.get("pin_type", "sidebar")
        updates: dict[str, Any] = {}
        if pin_type == "dashboard":
            updates["pinned_to_dashboard"] = 0
        else:
            updates["is_pinned"] = 0
        updated = self.store.update_record("projects", project["id"], updates)
        return {"type": "unpin_project", "project": updated, "pin_type": pin_type}

    def _execute_unpin_sheet(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        pin_type = action.get("pin_type", "sidebar")
        updates: dict[str, Any] = {}
        if pin_type == "dashboard":
            updates["pinned_to_dashboard"] = 0
        else:
            updates["is_pinned"] = 0
        self.store.update_record("project_sheets", page["sheet_id"], updates)
        return {"type": "unpin_sheet", "project": project, "pin_type": pin_type}

    def _execute_remove_from_dashboard(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        item_type = action.get("item_type")
        if item_type == "project":
            project = self._resolve_project(action, refs)
            self.store.update_record("projects", project["id"], {"pinned_to_dashboard": 0})
            return {"type": "remove_from_dashboard", "item_type": "project", "project": project}
        elif item_type == "sheet":
            project = self._resolve_project(action, refs)
            page = self._resolve_page(project["id"], action, refs)
            self.store.update_record("project_sheets", page["sheet_id"], {"pinned_to_dashboard": 0})
            return {"type": "remove_from_dashboard", "item_type": "sheet", "project": project}
        else:
            raise ValueError("remove_from_dashboard requires item_type")

    def _execute_update_sticky_note(self, action: dict[str, Any]) -> dict:
        note_title = action["note_title"]
        notes = self.store.list_records("sticky_notes")
        match = next((n for n in notes if n.get("title", "").lower() == note_title.lower()), None)
        if not match:
            raise ValueError(f"Sticky note '{note_title}' not found.")
        updated = self.store.update_record("sticky_notes", match["id"], action["updates"])
        return {"type": "update_sticky_note", "note": updated}

    def _execute_delete_sticky_note(self, action: dict[str, Any]) -> dict:
        note_title = action["note_title"]
        notes = self.store.list_records("sticky_notes")
        match = next((n for n in notes if n.get("title", "").lower() == note_title.lower()), None)
        if not match:
            raise ValueError(f"Sticky note '{note_title}' not found.")
        deleted = self.store.delete_record("sticky_notes", match["id"])
        return {"type": "delete_sticky_note", "note": deleted}

    # --- Smart READ action executors ---

    def _execute_search_rows(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        result = execute_search_rows(rows, columns, action["query"])
        return {"type": "search_rows", "project": project, **result}

    def _execute_filter_rows(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        result = execute_filter_rows(
            rows, columns,
            column_name=None,
            column_query=action.get("column_query"),
            value=action.get("value"),
            operator=action.get("operator", "equals"),
        )
        return {"type": "filter_rows", "project": project, **result}

    def _execute_analyze_sheet(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        result = execute_analyze_sheet(
            rows, columns,
            focus_column=action.get("focus_column"),
            days_ahead=action.get("days_ahead"),
        )
        return {"type": "analyze_sheet", "project": project, **result}

    def _execute_get_deadlines(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        summary = self.store.project_summary(project["id"])
        pages = summary.get("pages", [])
        days_ahead = action.get("days_ahead", 30)
        result = execute_get_deadlines(pages, days_ahead=days_ahead)
        return {"type": "get_deadlines", "project": project, **result}

    def _execute_get_overdue_rows(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        summary = self.store.project_summary(project["id"])
        pages = summary.get("pages", [])
        result = execute_get_overdue_rows(pages)
        return {"type": "get_overdue_rows", "project": project, **result}

    def _execute_get_column_values(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project = self._resolve_project(action, refs)
        page = self._resolve_page(project["id"], action, refs)
        rows = page.get("rows") or json.loads(page.get("rows_json") or "[]")
        columns = page.get("columns") or json.loads(page.get("columns_json") or "[]")
        result = execute_get_column_values(
            rows, columns,
            column_query=action.get("column_query"),
        )
        return {"type": "get_column_values", "project": project, **result}

    def _execute_get_sticky_notes(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        notes = self.store.list_records("sticky_notes")
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

    def _execute_get_dashboard(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        summary = self.store.dashboard_summary()
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

    def _execute_get_notifications(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        project_id = action.get("project_id")
        if not project_id and action.get("project_name"):
            project = self._resolve_project(action, refs)
            project_id = project["id"]

        if project_id:
            summary = self.store.project_summary(project_id)
            notifications = summary.get("notifications", [])
        else:
            notifications = [
                n for n in self.store.list_records("notifications")
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

    def _resolve_project(self, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        if action.get("project_id"):
            return self.store.get_record("projects", int(action["project_id"]))
        project_name = self._clean(action.get("project_name"))
        if project_name:
            ref = refs["projects"].get(project_name.lower())
            if ref:
                return ref
            matches = [project for project in self.store.list_records("projects") if project.get("name", "").lower() == project_name.lower()]
            if len(matches) == 1:
                return matches[0]
            if len(matches) > 1:
                raise ValueError(f"Multiple projects named {project_name}; open the target project and try again.")
        if refs.get("latest_project"):
            return refs["latest_project"]
        raise ValueError("Project not found. Please provide an existing project name.")

    def _resolve_page(self, project_id: int, action: dict[str, Any], refs: dict[str, Any]) -> dict:
        if action.get("sheet_id"):
            sheet = self.store.get_record("project_sheets", int(action["sheet_id"]))
            project_id = int(sheet["project_id"])
        sheet_name = self._clean(action.get("sheet_name"))
        if sheet_name:
            ref = refs["sheets"].get((project_id, sheet_name.lower()))
            if ref:
                return self._page_for_sheet_id(project_id, ref["sheet"]["id"])
        elif refs.get("latest_sheet"):
            latest = refs["latest_sheet"]
            return self._page_for_sheet_id(int(latest["sheet"]["project_id"]), int(latest["sheet"]["id"]))

        summary = self.store.project_summary(project_id)
        pages = summary.get("pages", [])
        if action.get("sheet_id"):
            matches = [page for page in pages if int(page.get("sheet_id") or 0) == int(action["sheet_id"])]
        else:
            matches = [page for page in pages if page.get("name", "").lower() == sheet_name.lower()]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise ValueError(f"Multiple sheets named {sheet_name}; provide the sheet id.")
        raise ValueError("Sheet not found. Please provide an existing sheet name.")

    def _page_for_sheet_id(self, project_id: int, sheet_id: int) -> dict:
        summary = self.store.project_summary(project_id)
        for page in summary.get("pages", []):
            if int(page.get("sheet_id") or 0) == int(sheet_id):
                return page
        raise ValueError("Sheet page not found.")

    def _row_for_columns(self, row: dict[str, Any], column_names: list[str]) -> dict[str, Any]:
        cleaned = self._clean_row(row)
        if not column_names:
            return cleaned
        return {key: value for key, value in cleaned.items() if key in column_names}

    def _project_ref(self, raw_action: dict[str, Any], previous_actions: list[dict[str, Any]]) -> dict[str, Any]:
        if raw_action.get("project_id"):
            return {"project_id": raw_action.get("project_id")}
        project_name = self._clean(raw_action.get("project_name"))
        if project_name:
            return {"project_name": project_name}
        created = [action for action in previous_actions if action.get("type") == "create_project"]
        if len(created) == 1:
            return {"project_name": created[0]["project"]["name"]}
        return {}

    def _sheet_ref(self, raw_action: dict[str, Any], previous_actions: list[dict[str, Any]]) -> dict[str, Any]:
        if raw_action.get("sheet_id"):
            return {"sheet_id": raw_action.get("sheet_id")}
        sheet_name = self._clean(raw_action.get("sheet_name"))
        if sheet_name:
            return {"sheet_name": sheet_name}
        created = [action for action in previous_actions if action.get("type") == "create_sheet"]
        if len(created) == 1:
            return {"sheet_name": created[0]["sheet"]["name"]}
        return {}

    def _describe_actions(self, actions: list[dict[str, Any]]) -> list[str]:
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
        return descriptions

    def _execution_message(self, results: list[dict[str, Any]]) -> str:
        lines = []
        for result in results:
            if result["type"] in ("search_rows", "filter_rows", "analyze_sheet", "get_deadlines", 
                                  "get_overdue_rows", "get_column_values", "get_sticky_notes", 
                                  "get_dashboard", "get_notifications"):
                # Use the rich formatted message directly from the smart read engine
                lines.append(result.get("message", ""))
                continue

            # Standard WRITE / Basic READ messages
            if not lines:
                lines.append("Done. I updated your local ScholarDocX workspace:")
                
            if result["type"] == "create_project":
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
                lines.append(f"- Added item to dashboard.")
            elif result["type"] == "remove_from_dashboard":
                lines.append(f"- Removed item from dashboard.")
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

    def _missing_info_message(self, missing: list[str]) -> str:
        labels = {
            "project_name": "project name",
            "sheet_name": "sheet name",
            "row_values": "row values",
            "note_content": "note content",
            "supported_action": "a supported action",
        }
        readable = ", ".join(labels.get(item, item.replace("_", " ")) for item in missing)
        return f"I can do that, but I need: {readable}."

    def _extract_json(self, raw_answer: str) -> dict[str, Any] | None:
        start_idx = raw_answer.find("{")
        end_idx = raw_answer.rfind("}")
        if start_idx == -1 or end_idx == -1 or end_idx < start_idx:
            return None
        try:
            parsed = json.loads(raw_answer[start_idx:end_idx + 1])
            return parsed if isinstance(parsed, dict) else None
        except ValueError:
            return None

    def _looks_like_action_request(self, message: str) -> bool:
        return bool(ACTION_TRIGGER_RE.search(message) and ACTION_TARGET_RE.search(message))

    def _no_action(self) -> dict:
        return {"status": "no_action", "message": "", "missing": [], "actions": []}

    def _clean(self, value: Any) -> str:
        return str(value or "").strip()

    def _clean_row(self, row: dict[str, Any]) -> dict[str, Any]:
        cleaned = {}
        for key, value in row.items():
            clean_key = self._clean(key)
            if not clean_key:
                continue
            if isinstance(value, bool):
                cleaned[clean_key] = value
            else:
                clean_value = self._clean(value)
                if clean_value:
                    cleaned[clean_key] = clean_value
        return cleaned

    def _normalize_degree(self, value: Any) -> str:
        lowered = self._clean(value).lower()
        if lowered in {"bachelor", "bachelors", "undergrad", "undergraduate"}:
            return "bachelors"
        if lowered in {"master", "masters", "ms", "msc"}:
            return "masters"
        return "phd"

    def _degree_from_text(self, text: str) -> str:
        lowered = text.lower()
        if "bachelor" in lowered or "undergrad" in lowered:
            return "bachelors"
        if "master" in lowered or " ms" in lowered or "msc" in lowered:
            return "masters"
        return "phd"

    def _extract_named_value(self, message: str, noun: str) -> str:
        # Try multiple patterns to extract names
        patterns = [
            rf"{noun}\s+(?:called|named)\s+['\"]([^'\"]+)['\"]",  # project named "X"
            rf"{noun}\s+(?:called|named)\s+([A-Z][^\s,\.]+(?:\s+[A-Z][^\s,\.]+)*)",  # project named X Y
            rf"(?:called|named)\s+['\"]([^'\"]+)['\"].*{noun}",  # named "X" project
            rf"{noun}\s+['\"]([^'\"]+)['\"]",  # project "X"
            rf"['\"]([^'\"]+)['\"].*{noun}",  # "X" project
        ]
        
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return self._clean(match.group(1))
        
        return ""

    def _extract_project_name(self, message: str) -> str:
        # Try to extract project name with various patterns
        patterns = [
            r"project\s+(?:called|named)\s+['\"]([^'\"]+)['\"]",  # project named "X"
            r"project\s+(?:called|named)\s+([A-Z][^\s,\.]+(?:\s+[A-Z][^\s,\.]+)*)",  # project named X Y
            r"(?:in|inside|to)\s+['\"]([^'\"]+)['\"].*project",  # in "X" project
            r"(?:in|inside|to)\s+([A-Z][^\s,\.]+(?:\s+[A-Z][^\s,\.]+)*)(?:\s+project)",  # in X Y project
            r"project\s+['\"]([^'\"]+)['\"]",  # project "X"
            r"project(?:'s)?\s+name\s+is\s+['\"]([^'\"]+)['\"]",  # project's name is "X"
            r"project(?:'s)?\s+name\s+is\s+([A-Z][^\s,\.]+(?:\s+[A-Z][^\s,\.]+)*)",  # project's name is X Y
        ]
        
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return self._clean(match.group(1))
        
        return ""

    def _extract_sheet_name(self, message: str) -> str:
        # Try to extract sheet name with various patterns
        patterns = [
            r"sheet\s+(?:called|named)\s+['\"]([^'\"]+)['\"]",  # sheet named "X"
            r"sheet\s+(?:called|named)\s+([A-Z][^\s,\.]+(?:\s+[A-Z][^\s,\.]+)*)",  # sheet named X Y
            r"(?:create|make|add)\s+(?:a\s+)?['\"]([^'\"]+)['\"].*sheet",  # create "X" sheet
            r"sheet\s+['\"]([^'\"]+)['\"]",  # sheet "X"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return self._clean(match.group(1))
        
        return ""

    def _extract_note_body(self, message: str) -> str:
        pattern = re.compile(r"(?:sticky\s+note|note|checklist)\s+(?:called|named|saying|with)?\s*['\"]?([^'\"\n]+)", re.IGNORECASE)
        match = pattern.search(message)
        return self._clean(match.group(1)) if match else ""
