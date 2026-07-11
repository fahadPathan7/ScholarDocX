"""Agentic action planning and execution for the AI assistant.

SCHOLARDOCX-0110 split this module: normalizers live in
``ai_actions_workspace`` and ``ai_actions_records``, executors in
``ai_actions_execute`` and ``ai_actions_records``, and the action registry
plus messaging in ``ai_actions_catalog``. This module keeps the
plan-confirm-execute orchestration, planner prompts, heuristics, and the
role-limit enforcement hooks used by executors.
"""
from __future__ import annotations

from datetime import date
from typing import Any
import json
import re

from app.core.config import Settings
from app.services.ai import AiService, PROVIDER_FAILURE_MODES
from app.services.store import Store
from app.services.ai_actions_catalog import (
    SUPPORTED_ACTIONS,
    READ_ONLY_ACTIONS,
    describe_actions,
    execution_message,
)
from app.services.ai_actions_execute import WORKSPACE_EXECUTORS
from app.services import ai_actions_records as records
from app.services import ai_actions_workspace as workspace


ACTION_TRIGGER_RE = re.compile(
    r"\b(create|make|add|start|set up|setup|new|update|edit|change|modify|rename"
    r"|delete|remove|clear|pin|unpin|get|show|list|find|search|count|how many"
    r"|which|who|what|where|when|duplicate|copy|analyze|summary|summarize"
    r"|upcoming|overdue|deadline|applied|status|filter|log|complete|mark|draft"
    r"|remind|save|track)"
    r"\b", re.IGNORECASE
)
ACTION_TARGET_RE = re.compile(
    r"\b(project|projects|sheet|sheets|row|rows|sticky|note|notes|checklist"
    r"|column|columns|group|dashboard|deadline|deadlines|notification|notifications"
    r"|applied|status|university|universities|professor|professors|overdue|upcoming"
    r"|document|documents|version|template|templates|email|emails|draft|drafts"
    r"|outreach|reminder|reminders|program|programs|application|applications"
    r"|research note|research notes)"
    r"\b", re.IGNORECASE
)
# Admin/account-management requests the agent must refuse regardless of role.
ADMIN_TASK_RE = re.compile(
    r"\b(suspend|unsuspend|ban|unban|revoke)\b[^.]*\b(user|users|account|accounts)\b"
    r"|\binvite (code|codes|request|requests)\b"
    r"|\brole limits?\b"
    r"|\b(assign|change|manage|give|set)\b[^.]*\b(role|roles|plan|permission|permissions)\b"
    r"|\b(grant|give|add)\b[^.]*\btokens?\b"
    r"|\btoken (pack|packs|request|requests)\b"
    r"|\bapp settings?\b"
    r"|\baudit logs?\b"
    r"|\bpassword reset\b"
    r"|\b(enable|disable|activate|deactivate|manage)\b[^.]*\b(model|models)\b"
    r"|\bmake\b[^.]*\badmin\b"
    r"|\b(upgrade|downgrade|promote|demote)\b[^.]*\b(user|users|account|plan)\b",
    re.IGNORECASE,
)
ADMIN_REFUSAL_MESSAGE = (
    "I can't perform admin or account-management tasks (users, roles, plans, "
    "limits, invites, tokens, app settings, or AI model management). I can "
    "manage your own workspace data instead — projects, sheets, documents, "
    "emails, reminders, deadlines, universities, professors, applications, "
    "and notes."
)

ACTION_PLANNER_SYSTEM_PROMPT = (
    "You are ScholarDocX's workspace action planner. Convert user requests "
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
    "'upcoming', 'overdue', 'next week', 'within N days', 'in 3 days'. Resolve "
    "relative dates to YYYY-MM-DD. Never say you don't know the date.\n"
    "9. ADMIN EXCLUSION: NEVER plan admin or account-management actions — "
    "managing users, suspensions, roles, plans, role limits, invites, token "
    "grants, app settings, or AI model management. For such requests return "
    "status no_action.\n\n"

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

    "RECORD DOMAINS — each supports create_<domain>, update_<domain> {<name field>, "
    "updates}, delete_<domain> {<name field>}, and a list action:\n"
    "  document — create_document {title, document_type: sop|research_proposal|lor|cv|essay|other}; "
    "identified by title; list_documents\n"
    "  email_template — create_email_template {name, subject_template, body_template}; list_email_templates\n"
    "  email_draft — create_email_draft {subject, body, recipient_email?, status?, template_name?, professor_name?}; "
    "identified by subject; list_email_drafts\n"
    "  reminder — create_reminder {title, due_at: YYYY-MM-DD, notes?}; list_reminders\n"
    "  deadline — create_deadline {title, due_at: YYYY-MM-DD, deadline_type?, notes?}; list_deadlines\n"
    "  university — create_university {name, country, region?, website_url?, notes?}; list_universities\n"
    "  program — create_program {name, university_name, degree_type?, department?, application_url?, funding_url?, notes?}; list_programs\n"
    "  professor — create_professor {name, university_name?, program_name?, title?, email?, profile_url?, research_interests?, notes?}; list_professors\n"
    "  application — create_application {university_name, program_name?, professor_name?, status?, intake_term?, priority?, application_url?, notes?}; "
    "identified by university_name; list_applications\n"
    "  research_note — create_research_note {title, content, professor_name?, university_name?, sources?}; list_research_notes\n\n"

    "SPECIAL RECORD ACTIONS:\n"
    "  add_document_version — {document_title, content, version_label?} (never overwrites old versions)\n"
    "  complete_reminder — {title}    complete_deadline — {title}\n"
    "  log_outreach — {recipient_email, subject, sent_at?, professor_name?, notes?, follow_up_days?}\n"
    "  update_outreach_log — {subject, updates: {response_status: Waiting|Replied|No Response, notes?}}\n"
    "  list_outreach_logs — {}\n"
    "  get_due_reminders — {days_ahead?}\n"
    "  mark_notifications_read — {}\n\n"

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

    "RECORD DOMAIN EXAMPLES:\n"
    "- 'draft an SOP document called My MIT SOP' → create_document {title:'My MIT SOP', document_type:'sop'}\n"
    "- 'save this as a new version of My MIT SOP' → add_document_version\n"
    "- 'remind me to email Prof. Chen in 3 days' → create_reminder with due_at = CURRENT_DATE + 3 days\n"
    "- 'I emailed prof.chen@mit.edu about my application, follow up in 5 days' → log_outreach with follow_up_days=5\n"
    "- 'Prof. Chen replied to my email' → update_outreach_log with response_status='Replied'\n"
    "- 'add MIT as a university in the USA' → create_university {name:'MIT', country:'USA'}\n"
    "- 'track my MIT application' → create_application {university_name:'MIT'}\n"
    "- 'what reminders are due this week?' → get_due_reminders {days_ahead:7}\n"
    "- 'mark deadline GRE registration as done' → complete_deadline {title:'GRE registration'}\n\n"

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
    "- Match existing record names from CURRENT WORKSPACE records when the user references them.\n"
)


class AiActionService:
    def __init__(self, settings: Settings, store: Store) -> None:
        self.settings = settings
        self.store = store
        self.user: dict | None = None
        self.session = None

    async def plan(self, message: str, context: str = "", model: str = None, *, user: dict = None, session=None) -> dict:
        if ADMIN_TASK_RE.search(message):
            return {
                "status": "needs_info",
                "message": ADMIN_REFUSAL_MESSAGE,
                "missing": ["supported_action"],
                "actions": [],
            }
        if not self._looks_like_action_request(message):
            return self._no_action()

        fallback_plan = self._heuristic_plan(message)
        if self.settings.chat_provider_configured:
            prompt = self._build_planner_prompt(message, context)
            response = await AiService(self.settings, user=user, session=session).chat(
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

    def execute(self, plan: dict[str, Any], *, user: dict = None, session=None) -> dict:
        normalized = self._normalize_plan(plan, "")
        if normalized.get("status") != "needs_confirmation":
            raise ValueError(normalized.get("message") or "Action plan is not ready to execute.")

        self.user = user
        self.session = session

        refs: dict[str, Any] = {"projects": {}, "sheets": {}, "latest_project": None, "latest_sheet": None}
        results = []
        try:
            for action in normalized["actions"]:
                action_type = action["type"]
                executor = WORKSPACE_EXECUTORS.get(action_type)
                if executor:
                    results.append(executor(self, action, refs))
                elif action_type in records.RECORD_ACTIONS:
                    results.append(records.execute_record_action(self.store, action))
                else:
                    raise ValueError(f"Unsupported action: {action_type}")
        finally:
            # Agent deletes free plan quota and partial failures must not leave
            # counters inflated: recount from live data after every plan.
            if self.user and self.session is not None:
                from app.auth.limits import resync_usage_counts
                resync_usage_counts(self.user["id"], self.session)

        return {
            "status": "done",
            "message": execution_message(results),
            "results": results,
        }

    # ------------------------------------------------------------------
    # Role-limit enforcement (used by executors)
    # ------------------------------------------------------------------

    def enforce(self, feature: str, increment: int = 1) -> None:
        """Apply the same role-limit check the manual routes apply."""
        if not (self.user and self.session is not None):
            return
        from app.auth.limits import check_and_increment_limit
        check_and_increment_limit(self.user, feature, increment, self.session)

    def limit_for(self, feature: str) -> int:
        """Current user's limit for a feature, or -1 when unlimited/unknown."""
        if not (self.user and self.session is not None):
            return -1
        from app.auth.limits import get_user_limit
        return get_user_limit(self.user, feature, self.session)

    def raise_limit(self, detail: str) -> None:
        from app.auth.limits import UsageLimitExceeded
        raise UsageLimitExceeded(detail)

    # ------------------------------------------------------------------
    # Planner prompt
    # ------------------------------------------------------------------

    def _build_planner_prompt(self, message: str, context: str) -> str:
        workspace_json = json.dumps(self._workspace_snapshot(), ensure_ascii=True)
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
            "ACTION EXAMPLES (RECORD DOMAINS):\n"
            '{"type":"create_document","title":"My MIT SOP","document_type":"sop"}\n'
            '{"type":"update_document","title":"My MIT SOP","updates":{"title":"MIT SOP Final"}}\n'
            '{"type":"delete_document","title":"Old SOP"}\n'
            '{"type":"list_documents"}\n'
            '{"type":"add_document_version","document_title":"My MIT SOP","content":"Full SOP text...","version_label":"v2"}\n'
            '{"type":"create_email_template","name":"Cold outreach","subject_template":"Prospective PhD student — {{topic}}","body_template":"Dear Professor {{name}}, ..."}\n'
            '{"type":"create_email_draft","subject":"Prospective PhD student","body":"Dear Prof. Chen, ...","recipient_email":"chen@mit.edu","professor_name":"Prof. Chen"}\n'
            '{"type":"create_reminder","title":"Email Prof. Chen","due_at":"2026-07-05","notes":"Follow up on SOP feedback"}\n'
            '{"type":"complete_reminder","title":"Email Prof. Chen"}\n'
            '{"type":"get_due_reminders","days_ahead":7}\n'
            '{"type":"create_deadline","title":"MIT application","due_at":"2026-12-15","deadline_type":"application"}\n'
            '{"type":"complete_deadline","title":"MIT application"}\n'
            '{"type":"create_university","name":"MIT","country":"USA","region":"Massachusetts"}\n'
            '{"type":"create_program","name":"PhD Computer Science","university_name":"MIT","degree_type":"phd"}\n'
            '{"type":"create_professor","name":"Prof. Chen","university_name":"MIT","email":"chen@mit.edu","research_interests":"ML systems"}\n'
            '{"type":"create_application","university_name":"MIT","program_name":"PhD Computer Science","status":"Preparing","intake_term":"Fall 2027"}\n'
            '{"type":"update_application","university_name":"MIT","updates":{"status":"Submitted"}}\n'
            '{"type":"create_research_note","title":"Chen lab funding","content":"Lab has NSF grant through 2028.","professor_name":"Prof. Chen"}\n'
            '{"type":"log_outreach","recipient_email":"chen@mit.edu","subject":"Prospective PhD student","follow_up_days":5}\n'
            '{"type":"update_outreach_log","subject":"Prospective PhD student","updates":{"response_status":"Replied"}}\n'
            '{"type":"list_outreach_logs"}\n'
            '{"type":"mark_notifications_read"}\n\n'
            "PARSING RULES:\n"
            "1. Extract names EXACTLY as user states them (preserve case, spacing, punctuation)\n"
            "2. When user says 'create a sheet inside X project named Y' → project_name=X, sheet.name=Y\n"
            "3. When user says 'create a sheet named Y in X' → project_name=X, sheet.name=Y\n"
            "4. When user says 'add a project called X' → project.name=X\n"
            "5. If project/sheet name is vague ('the project', 'my project', 'this project', 'here'), YOU MUST infer it from the CONVERSATION CONTEXT. If it cannot be inferred from CONVERSATION CONTEXT, return needs_info.\n"
            "6. Match existing project/sheet/record names from workspace when user references them\n"
            "7. For row operations, row_index is 0-based (first row = 0)\n"
            "8. For 'deadline this month' → analyze_sheet with focus_column matching the deadline column\n"
            "9. For 'how many applied' → filter_rows with column_query='Applied', operator='is_true'\n"
            "10. For boolean queries (sent, applied, funded, etc.) → use is_true/is_false operators\n"
            "11. For 'within N days' → use get_deadlines with days_ahead=N, or analyze_sheet with days_ahead=N\n"
            "12. For 'overdue' → use get_overdue_rows\n"
            "13. For 'find X' or 'search X' → use search_rows with query=X\n"
            "14. Resolve relative dates ('in 3 days', 'next Friday') to YYYY-MM-DD using CURRENT_DATE\n"
            "15. NEVER plan admin/account-management actions; return no_action for those\n\n"
            "DECISION LOGIC:\n"
            "- If user is just chatting/asking questions → status: no_action\n"
            "- If critical info is missing and cannot be inferred from CONTEXT → status: needs_info, list missing fields\n"
            "- If you have all required info → status: needs_confirmation, build actions array\n\n"
            f"CURRENT WORKSPACE:\n{workspace_json}\n\n"
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
        snapshot: dict[str, Any] = {"projects": projects}
        record_names = records.records_snapshot(self.store)
        if record_names:
            snapshot["records"] = record_names
        return snapshot

    # ------------------------------------------------------------------
    # Plan normalization
    # ------------------------------------------------------------------

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
            if not action:
                continue
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
            "message": plan.get("message") or "Review these ScholarDocX actions before I run them.",
            "missing": [],
            "actions": normalized_actions,
            "summary": describe_actions(normalized_actions),
            "auto_execute": is_read_only,
        }

    def _normalize_action(self, raw_action: dict[str, Any], previous_actions: list[dict[str, Any]]) -> dict | None:
        action = workspace.normalize_workspace_action(raw_action, previous_actions)
        if action is not None:
            return action
        return records.normalize_record_action(raw_action)

    # ------------------------------------------------------------------
    # Heuristic fallback (no provider configured / provider failed)
    # ------------------------------------------------------------------

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
            list_targets = {
                "document": "list_documents",
                "email template": "list_email_templates",
                "email draft": "list_email_drafts",
                "reminder": "list_reminders",
                "universit": "list_universities",
                "program": "list_programs",
                "professor": "list_professors",
                "application": "list_applications",
                "research note": "list_research_notes",
                "outreach": "list_outreach_logs",
            }
            for keyword, list_action in list_targets.items():
                if keyword in lowered:
                    return self._normalize_plan({"actions": [{"type": list_action}]}, message)
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
                "message": (
                    "I can manage your workspace — projects, sheets, rows, sticky notes, "
                    "documents, email templates and drafts, outreach logs, reminders, "
                    "deadlines, universities, programs, professors, applications, and "
                    "research notes. Could you clarify what you'd like me to do? For example:\n"
                    "- Create a project named [name]\n"
                    "- Create a reminder [title] due [date]\n"
                    "- Add [name] as a university in [country]"
                ),
                "missing": ["action_details"],
                "actions": []
            }

        return self._no_action()

    # ------------------------------------------------------------------
    # Misc helpers
    # ------------------------------------------------------------------

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
        return workspace.clean(value)

    def _degree_from_text(self, text: str) -> str:
        lowered = text.lower()
        if "bachelor" in lowered or "undergrad" in lowered:
            return "bachelors"
        if "master" in lowered or " ms" in lowered or "msc" in lowered:
            return "masters"
        return "phd"

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
