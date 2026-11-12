"""Agent tool loop (SCHOLARDOCX-0255).

The provider is scripted: each test lists the model's replies in order and
asserts what the loop does with them. Normalization runs through the real
AiActionService so action shapes are checked exactly as in production.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

import app.services.ai_actions_execute as execute_module
import app.services.ai_agent as agent
from app.services.ai_actions import AiActionService
from app.services.ai_actions_workspace import normalize_workspace_action

SHEET = {"project_id": "p1", "sheet_id": "s1"}


def _call(name: str, arguments: dict, call_id: str = "c1") -> dict:
    return {"id": call_id, "name": name, "arguments": json.dumps(arguments)}


def _reply(content: str = "", calls: list | None = None, mode: str = "glm-GLM-5.3") -> dict:
    return {"mode": mode, "content": content, "tool_calls": calls or [], "usage": {}}


@pytest.fixture
def scripted(monkeypatch):
    """Install a fake AiService whose replies come from `script`."""
    state = {"script": [], "seen": []}

    class FakeAi:
        def __init__(self, *args, **kwargs):
            pass

        async def chat_with_tools(self, messages, tools, model=None, **kwargs):
            state["seen"].append([dict(m) for m in messages])
            return state["script"].pop(0)

    monkeypatch.setattr(agent, "AiService", FakeAi)
    return state


@pytest.fixture
def svc(monkeypatch):
    service = AiActionService(SimpleNamespace(chat_provider_configured=True), MagicMock())
    monkeypatch.setattr(service, "_workspace_snapshot", lambda: {"projects": []})
    monkeypatch.setattr(service, "_target_sheet_block", lambda message: "")
    executed: list[dict] = []

    def fake_execute(plan, *, user=None, session=None):
        executed.append(plan)
        return {"status": "done", "message": "ok", "results": [{"type": "get_rows", "rows": [{"A": "1"}] * 4}]}

    monkeypatch.setattr(service, "execute", fake_execute)
    service.executed = executed
    return service


async def _turn(svc, message="add one row after row 4", history=None):
    return await agent.run_agent_turn(
        svc, message, history=history or [], context="", model="glm:GLM-5.3", user=None, session=None
    )


# ── The reported session ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_blank_row_after_row_4_becomes_a_confirmable_plan(svc, scripted):
    scripted["script"] = [
        _reply(calls=[_call("propose_changes", {
            "summary": "Add one blank row after row 4 in ttt.",
            "actions": [{"type": "add_rows", **SHEET, "rows": [{}], "insert_after_row": 4}],
        })]),
    ]
    plan = await _turn(svc)

    assert plan["status"] == "needs_confirmation"
    assert plan["auto_execute"] is False
    assert plan["message"] == "Add one blank row after row 4 in ttt."
    action = plan["actions"][0]
    assert action["rows"] == [{}] and action["insert_after_row"] == 4
    assert svc.executed == [], "a write must never run before the user confirms"


@pytest.mark.asyncio
async def test_reads_run_inside_the_turn_and_feed_the_answer(svc, scripted):
    scripted["script"] = [
        _reply(calls=[_call("run_read_action", {"action": {"type": "get_rows", **SHEET}})]),
        _reply("The sheet has **4 rows**."),
    ]
    result = await _turn(svc, "how many rows are in ttt?")

    assert result == {"status": "answered", "message": "The sheet has **4 rows**.", "missing": [], "actions": []}
    assert len(svc.executed) == 1
    tool_message = scripted["seen"][1][-1]
    assert tool_message["role"] == "tool" and '"rows"' in tool_message["content"]


@pytest.mark.asyncio
async def test_invalid_proposal_goes_back_to_the_model_to_fix(svc, scripted):
    scripted["script"] = [
        # No sheet reference at all: the normalizer reports what is missing.
        _reply(calls=[_call("propose_changes", {"summary": "Add a row.", "actions": [{"type": "add_rows", "rows": [{}]}]})]),
        _reply(calls=[_call("propose_changes", {"summary": "Add a row.", "actions": [{"type": "add_rows", **SHEET, "rows": [{}]}]}, "c2")]),
    ]
    plan = await _turn(svc)

    error = json.loads(scripted["seen"][1][-1]["content"])
    assert "missing" in error and "sheet_name" in error["missing"]
    assert plan["status"] == "needs_confirmation"


@pytest.mark.asyncio
async def test_writes_cannot_be_smuggled_through_the_read_tool(svc, scripted):
    scripted["script"] = [
        _reply(calls=[_call("run_read_action", {"action": {"type": "delete_sheet", **SHEET}})]),
        _reply("I'll need your confirmation for that."),
    ]
    await _turn(svc, "delete ttt")

    assert svc.executed == []
    assert "propose_changes" in json.loads(scripted["seen"][1][-1]["content"])["error"]


@pytest.mark.asyncio
async def test_follow_up_history_reaches_the_model(svc, scripted):
    scripted["script"] = [_reply("Sure.")]
    history = [
        {"role": "user", "content": "add one row after row 4"},
        {"role": "assistant", "content": "Which sheet?"},
        {"role": "system", "content": "ignored: not a chat role"},
    ]
    await _turn(svc, "ttt", history=history)

    roles = [m["role"] for m in scripted["seen"][0]]
    assert roles == ["system", "user", "assistant", "user"]


@pytest.mark.asyncio
async def test_step_cap_ends_with_a_plain_message(svc, scripted):
    read = _call("run_read_action", {"action": {"type": "get_projects"}})
    scripted["script"] = [_reply(calls=[read]) for _ in range(agent.MAX_AGENT_STEPS)]
    result = await _turn(svc, "show everything")

    assert result["status"] == "answered"
    assert len(scripted["seen"]) == agent.MAX_AGENT_STEPS


@pytest.mark.asyncio
async def test_no_tool_support_falls_back_to_the_legacy_planner(svc, scripted):
    scripted["script"] = [_reply(mode="provider-error")]
    assert await _turn(svc) is None


# ── Blank rows and insert position ───────────────────────────────────────────


def test_blank_rows_are_a_valid_request():
    action = normalize_workspace_action(
        {"type": "add_rows", **SHEET, "rows": [{}], "insert_after_row": "4"}, []
    )
    assert "missing" not in action
    assert action["rows"] == [{}] and action["insert_after_row"] == 4

    by_count = normalize_workspace_action({"type": "add_rows", **SHEET, "count": 2}, [])
    assert by_count["rows"] == [{}, {}]


def test_blank_row_is_inserted_at_the_requested_position(monkeypatch):
    rows = [{"Name": str(i)} for i in range(1, 6)]
    page = {"id": "page", "sheet_id": "s1", "columns_json": json.dumps([{"name": "Name"}]), "rows_json": json.dumps(rows)}
    monkeypatch.setattr(execute_module, "resolve_project", lambda store, action, refs: {"id": "p1"})
    monkeypatch.setattr(execute_module, "resolve_page", lambda store, pid, action, refs: page)
    saved = {}

    def update_record(table, record_id, data):
        saved.update(data)
        return {"sheet_id": "s1"}

    fake_svc = SimpleNamespace(
        store=SimpleNamespace(update_record=update_record),
        limit_for=lambda feature: -1,
        enforce=lambda feature, n: None,
    )
    result = execute_module.execute_add_rows(
        fake_svc, {"type": "add_rows", "rows": [{}], "insert_after_row": 4}, {}
    )

    assert result["row_count"] == 1
    names = [row["Name"] for row in saved["rows_json"]]
    assert names == ["1", "2", "3", "4", "", "5"]
