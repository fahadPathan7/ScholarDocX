"""Tool-connected workspace agent (SCHOLARDOCX-0255).

The assistant used to be a single-shot planner: one model call had to guess a
complete JSON plan from the message alone, follow-ups were routed by regex, and
it could not look anything up first. This module runs a bounded tool-calling
loop instead. The workspace action catalog is exposed to the model as two
MCP-style tools:

- ``run_read_action`` — any read action (rows, columns, counts, deadlines …).
  It is normalized and executed immediately; bounded results go back to the
  model so it can answer, or decide what to change, from real data.
- ``propose_changes`` — the only route to a write. Actions are checked with the
  same normalizers the planner uses; a problem goes back to the model as a tool
  error so it can fix it or ask the user. A valid proposal ends the turn as a
  ``needs_confirmation`` plan, which the UI shows with Confirm / Cancel.
  Nothing is written until the user confirms (``/ai/actions/execute``).

A plain text reply ends the turn as ``answered``.

Every model call is one billed provider call (``AiService.chat_with_tools``),
at most ``MAX_AGENT_STEPS`` per user message.
"""
from __future__ import annotations

import json
import logging
from datetime import date
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException

from app.services.ai import AiService, PROVIDER_FAILURE_MODES
from app.services.ai_actions_analyze import serialize_results_for_analysis
from app.services.ai_actions_catalog import READ_ONLY_ACTIONS

if TYPE_CHECKING:  # pragma: no cover
    from app.services.ai_actions import AiActionService

logger = logging.getLogger(__name__)

MAX_AGENT_STEPS = 5
MAX_HISTORY_MESSAGES = 10
MAX_HISTORY_CHARS = 2000
MAX_TOOL_RESULT_CHARS = 12_000

AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "run_read_action",
            "description": (
                "Read the user's ScholarDocX workspace. Runs immediately and returns the data. "
                "Use it to look up projects, sheets, rows, columns, counts, deadlines, notes, "
                "documents or reminders before answering or proposing changes. Pass ONE read "
                "action object from the catalog, e.g. "
                '{"type":"get_rows","project_id":"<id>","sheet_id":"<id>"}.'
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "object",
                        "description": "One READ action object from the catalog (has a \"type\" field).",
                    }
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_changes",
            "description": (
                "Propose changes to the workspace (create, add, update, rename, delete, pin …). "
                "The user then sees the list with a Confirm button; nothing changes until they "
                "confirm. Put every change for this request in one call. Pass write action "
                "objects from the catalog and a one-sentence summary of what will happen."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "One sentence shown above the Confirm button, e.g. 'Add one blank row after row 4 in ttt.'",
                    },
                    "actions": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "Write action objects from the catalog, in order.",
                    },
                },
                "required": ["summary", "actions"],
            },
        },
    },
]

AGENT_RULES = (
    "You are Lumi, the ScholarDocX workspace assistant. You are connected to the user's "
    "workspace through two tools: run_read_action (look things up; runs immediately) and "
    "propose_changes (prepare changes; the user confirms them with a button).\n\n"
    "HOW TO WORK:\n"
    "1. Never guess workspace data. If you need rows, columns, ids, or counts, call "
    "run_read_action first, then answer from the result.\n"
    "2. To change anything, call propose_changes once with every action needed. Do NOT ask "
    "'please confirm' in text and NEVER say a change is done: the user confirms with the "
    "button and the system reports the result.\n"
    "3. Do not demand values the user did not give. Missing cell values stay empty: a blank "
    "row is rows:[{}]. 'Add a row after row 4' means insert_after_row: 4.\n"
    "4. Ask a question in plain text only when the target truly cannot be determined from "
    "the message, the conversation, the workspace snapshot, or a read (for example two "
    "sheets with the same name). Ask one short, specific question.\n"
    "5. When the message contains project_id / sheet_id, use those ids in every action. "
    "Users count rows from 1; row_index in actions is 0-based.\n"
    "6. If a tool returns an error, fix the action and try again, or ask the user.\n"
    "7. Never perform admin or account actions (roles, plans, tokens, users, invites).\n"
    "8. Reply concisely in markdown. Use exact names and numbers from tool results.\n"
)


def _history_messages(history: list[dict] | None) -> list[dict[str, str]]:
    """Recent turns as chat messages: only user/assistant text, bounded."""
    out: list[dict[str, str]] = []
    for item in (history or [])[-MAX_HISTORY_MESSAGES:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = str(item.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            out.append({"role": role, "content": content[:MAX_HISTORY_CHARS]})
    return out


def build_agent_system_prompt(svc: "AiActionService", message: str, context: str) -> str:
    from app.services.ai_actions import ACTION_EXAMPLES_TEXT

    workspace_json = json.dumps(svc._workspace_snapshot(), ensure_ascii=True)
    return (
        f"{AGENT_RULES}\n"
        f"CURRENT_DATE: {date.today().isoformat()} (resolve relative dates to YYYY-MM-DD)\n\n"
        f"ACTION CATALOG (argument shapes for both tools):\n{ACTION_EXAMPLES_TEXT}\n"
        f"WORKSPACE SNAPSHOT:\n{workspace_json}\n\n"
        f"{svc._target_sheet_block(message)}"
        f"EARLIER CONVERSATION SUMMARY:\n{(context or '(none)')[:4000]}\n"
    )


def _parse_arguments(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _tool_error(message: str, **extra: Any) -> dict[str, Any]:
    return {"error": message, **extra}


def run_read(svc: "AiActionService", args: dict[str, Any], *, user, session) -> dict[str, Any]:
    """Execute one read action now and return bounded results for the model."""
    action = args.get("action") if isinstance(args.get("action"), dict) else args
    if not isinstance(action, dict) or not action.get("type"):
        return _tool_error('Pass one action object with a "type", e.g. {"type":"get_projects"}.')
    if action.get("type") not in READ_ONLY_ACTIONS:
        return _tool_error(
            f"'{action.get('type')}' changes data. Use propose_changes for it; run_read_action only reads."
        )
    plan = svc._normalize_plan({"status": "needs_confirmation", "actions": [action]}, "")
    if plan.get("status") != "needs_confirmation":
        return _tool_error(
            plan.get("message") or "That read could not be prepared.",
            missing=plan.get("missing", []),
        )
    try:
        executed = svc.execute(plan, user=user, session=session)
    except HTTPException as exc:
        return _tool_error(str(exc.detail))
    except (LookupError, ValueError) as exc:
        return _tool_error(str(exc))
    results_json, truncated = serialize_results_for_analysis(executed.get("results", []))
    # Embed as data, not as a string, so the model is not handed JSON that was
    # encoded twice (escaped quotes everywhere).
    try:
        results: Any = json.loads(results_json) if results_json else executed.get("message", "")
    except ValueError:
        results = results_json
    return {"results": results, "truncated": truncated}


def check_proposal(svc: "AiActionService", args: dict[str, Any]) -> tuple[dict[str, Any], dict | None]:
    """Validate a write proposal. Returns (tool result, plan-or-None)."""
    actions = args.get("actions")
    if isinstance(actions, dict):
        actions = [actions]
    if not isinstance(actions, list) or not actions:
        return _tool_error("Pass at least one action in 'actions'."), None
    summary = str(args.get("summary") or "").strip()
    plan = svc._normalize_plan(
        {"status": "needs_confirmation", "actions": actions, "message": summary}, ""
    )
    if plan.get("status") == "needs_info":
        return (
            _tool_error(
                "Some actions are missing required fields. Fill them from the conversation, "
                "the workspace, or a read; ask the user only if you cannot.",
                missing=plan.get("missing", []),
            ),
            None,
        )
    if plan.get("status") != "needs_confirmation" or not plan.get("actions"):
        return _tool_error("None of those actions are supported. Use the catalog shapes."), None
    if all(a.get("type") in READ_ONLY_ACTIONS for a in plan["actions"]):
        return _tool_error("Those are reads. Use run_read_action for them."), None
    plan["message"] = summary or "Review these changes before I make them."
    plan["auto_execute"] = False
    return {"ok": True, "status": "shown_to_user_for_confirmation"}, plan


def _answer(message: str) -> dict[str, Any]:
    return {"status": "answered", "message": message, "missing": [], "actions": []}


async def run_agent_turn(
    svc: "AiActionService",
    message: str,
    *,
    history: list[dict] | None,
    context: str,
    model: str | None,
    user: dict | None,
    session,
) -> dict[str, Any] | None:
    """Run one user message through the tool loop.

    Returns a plan-shaped dict (``answered`` / ``needs_confirmation``), or
    ``None`` when the very first model call fails, so the caller can fall back
    to the single-shot planner (e.g. a model that rejects ``tools``).
    """
    ai = AiService(svc.settings, user=user, session=session)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": build_agent_system_prompt(svc, message, context)},
        *_history_messages(history),
        {"role": "user", "content": message},
    ]

    for step in range(MAX_AGENT_STEPS):
        response = await ai.chat_with_tools(
            messages, AGENT_TOOLS, model=model, request_label="agent_step"
        )
        if response.get("mode") in PROVIDER_FAILURE_MODES:
            if step == 0:
                return None
            return _answer("I couldn't finish that just now. Please try again in a moment.")

        calls = response.get("tool_calls") or []
        if not calls:
            text = str(response.get("content") or "").strip()
            if not text and step == 0:
                return None
            return _answer(text or "Done looking. Tell me what you'd like to do next.")

        messages.append(
            {
                "role": "assistant",
                "content": response.get("content") or None,
                "tool_calls": [
                    {
                        "id": call["id"],
                        "type": "function",
                        "function": {"name": call["name"], "arguments": call["arguments"]},
                    }
                    for call in calls
                ],
            }
        )

        proposal: dict | None = None
        for call in calls:
            args = _parse_arguments(call.get("arguments"))
            if call["name"] == "run_read_action":
                result = run_read(svc, args, user=user, session=session)
            elif call["name"] == "propose_changes" and proposal is None:
                result, plan = check_proposal(svc, args)
                if plan is not None:
                    proposal = plan
            elif call["name"] == "propose_changes":
                result = _tool_error("Only one proposal per turn; it is already shown to the user.")
            else:
                result = _tool_error(f"Unknown tool '{call['name']}'.")
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": json.dumps(result, ensure_ascii=True)[:MAX_TOOL_RESULT_CHARS],
                }
            )
        if proposal is not None:
            return proposal

    logger.info("Agent turn hit the %s-step cap", MAX_AGENT_STEPS)
    return _answer(
        "That needed more steps than I can take in one go. Could you narrow it down, "
        "for example to one sheet?"
    )
