"""Connected apps: the MCP endpoint (SCHOLARDOCX-0258).

Protocol/auth tests stub only the database-touching functions, so they check the
gateway, tool schemas, scope and allow-list rules. The last group runs the real
stack against the test Postgres.
"""
import json
import logging

import httpx
import pytest
from sqlalchemy import text
from fastapi import FastAPI
from starlette.routing import Route
from starlette.testclient import TestClient

from app.core.config import Settings
from app.db.connection import connect, get_engine
from app.services import connected_apps as apps
from app.services import mcp_server
from tests.helpers import cleanup_user_records, make_settings, make_user

HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def _rpc(client, method, params=None, key="sdx_good", extra=None):
    headers = {**HEADERS, **({"Authorization": f"Bearer {key}"} if key else {}), **(extra or {})}
    return client.post("/mcp", headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})


def _call(client, name, args=None, **kw):
    return _rpc(client, "tools/call", {"name": name, "arguments": args or {}}, **kw).json()["result"]


@pytest.fixture
def stubbed(monkeypatch):
    """(client factory, list of read actions seen). Only DB-touching calls are stubbed."""
    seen: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        mcp_server, "_read_sync",
        lambda settings, user, action: (seen.append((user["id"], action)) or {"results": [{"ok": 1}], "truncated": False}),
    )

    def make(scope="read_suggest"):
        endpoint = mcp_server.build_mcp_endpoint(Settings())
        principal = apps.Principal(user={"id": "u1", "roles": ["pro_user"]}, app_id="a1", app_name="Claude Code", scope=scope)

        def authenticate(raw):
            if raw == "sdx_good":
                return principal
            raise apps.AuthFailure(403 if raw == "sdx_suspended" else 401, "no")

        endpoint._authenticate_sync = authenticate
        app = FastAPI(lifespan=endpoint.lifespan)
        app.router.routes.append(Route(mcp_server.MCP_PATH, endpoint=endpoint.asgi))
        return TestClient(app)

    return make, seen


def test_tools_are_typed_annotated_and_hide_internals(stubbed):
    make, _ = stubbed
    with make() as client:
        tools = {t["name"]: t for t in _rpc(client, "tools/list").json()["result"]["tools"]}
    assert set(tools) == {
        "list_projects", "list_sheets", "get_rows", "search_rows", "filter_rows",
        "get_deadlines", "get_overdue_rows", "get_dashboard", "propose_changes",
    }
    assert all(t["annotations"]["readOnlyHint"] for n, t in tools.items() if n != "propose_changes")
    assert tools["propose_changes"]["annotations"]["destructiveHint"] is False
    assert not any("principal" in t["inputSchema"].get("properties", {}) for t in tools.values())


def test_server_is_stateless_and_reads_use_the_key_owner(stubbed):
    make, seen = stubbed
    with make() as client:
        init = _rpc(client, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                           "clientInfo": {"name": "t", "version": "1"}})
        assert init.status_code == 200 and "mcp-session-id" not in init.headers
        result = _call(client, "get_deadlines", {"project_name": "MSc", "days_ahead": 9999})
    assert result["isError"] is False
    assert seen[-1] == ("u1", {"type": "get_deadlines", "days_ahead": 365, "project_name": "MSc"})


@pytest.mark.parametrize("action", ["delete_project", "delete_row", "clear_sheet", "bulk_update_rows", "create_document", "log_outreach", "made_up"])
def test_destructive_bulk_and_record_actions_are_refused(stubbed, action):
    make, _ = stubbed
    with make() as client:
        result = _call(client, "propose_changes", {"summary": "x", "actions": [{"type": action}]})
    assert result["isError"] is True
    assert "not available to connected apps" in result["content"][0]["text"]


@pytest.mark.parametrize("action", ["delete_project", "clear_sheet", "bulk_update_rows", "create_document"])
def test_direct_write_keys_get_the_same_allow_list(stubbed, action):
    make, _ = stubbed
    with make("read_write") as client:
        result = _call(client, "propose_changes", {"summary": "x", "actions": [{"type": action}]})
    assert result["isError"] is True
    assert "not available to connected apps" in result["content"][0]["text"]


def test_read_only_key_cannot_suggest(stubbed):
    make, _ = stubbed
    with make("read") as client:
        result = _call(client, "propose_changes", {"summary": "x", "actions": [{"type": "add_rows"}]})
    assert result["isError"] is True and "can only read" in result["content"][0]["text"]


def test_gateway_auth_origin_and_credential_separation(stubbed):
    make, _ = stubbed
    with make() as client:
        missing = _rpc(client, "tools/list", key=None)
        assert missing.status_code == 401 and missing.headers["www-authenticate"] == "Bearer"
        assert _rpc(client, "tools/list", key="sdx_bad").status_code == 401
        assert _rpc(client, "tools/list", key="sdx_suspended").status_code == 403
        assert _rpc(client, "tools/list", key="eyJhbGciOiJIUzI1NiJ9.e30.sig").status_code == 401  # a session JWT
        # A key in the query string is never read.
        q = client.post("/mcp?token=sdx_good", headers=HEADERS, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        assert q.status_code == 401
        assert _rpc(client, "tools/list", extra={"Origin": "https://evil.example"}).status_code == 403
        assert _rpc(client, "tools/list", extra={"Origin": "http://localhost:5173"}).status_code == 200


def test_access_key_is_not_a_session_credential(monkeypatch):
    """An access key must not open any /api route (no token passthrough)."""
    from app.main import create_app

    with TestClient(create_app()) as client:
        assert client.get("/api/ai/models", headers={"Authorization": "Bearer sdx_" + "a" * 43}).status_code == 401


def test_per_user_call_rate_is_limited(stubbed):
    make, _ = stubbed
    with make() as client:
        codes = [_rpc(client, "tools/list").status_code for _ in range(62)]
    assert codes[:60] == [200] * 60 and codes[60:] == [429, 429]


def test_logs_never_contain_the_key_or_arguments(stubbed, caplog):
    make, _ = stubbed
    with caplog.at_level(logging.INFO), make() as client:
        _call(client, "search_rows", {"query": "SECRET-QUERY", "project_name": "p", "sheet_name": "s"})
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "sdx_good" not in text and "SECRET-QUERY" not in text
    assert "tool=search_rows" in text


# --- real stack ---------------------------------------------------------------

@pytest.fixture
def real(tmp_path, monkeypatch):
    from app.main import create_app

    settings = make_settings(tmp_path)
    user = make_user(settings, ["pro_user"])
    from sqlalchemy.orm import sessionmaker
    session = sessionmaker(autocommit=False, bind=get_engine(settings.database_target))()
    created, key = apps.create_app(session, {**user, "token_version": 1}, "test", "read_suggest", 30)

    async def no_network(*a, **k):
        raise AssertionError("connected apps must never make an outbound provider call")

    monkeypatch.setattr(httpx.AsyncClient, "send", no_network)
    with TestClient(create_app()) as client:
        yield client, key, user, session
    session.close()
    with connect(settings.database_target) as db:
        cleanup_user_records(db, email=user["email"])
        db.commit()


def test_real_read_and_suggestion_round_trip_makes_no_provider_call(real):
    client, key, user, session = real
    assert _call(client, "list_projects", key=key)["isError"] is False
    proposed = _call(client, "propose_changes", {
        "summary": "Create a project",
        "actions": [{"type": "create_project", "project": {"name": "MCP Test Project"}}],
    }, key=key)
    assert proposed["isError"] is False
    assert "awaiting_confirmation_in_scholardocx" in proposed["content"][0]["text"]
    pending = apps.list_suggestions(session, user["id"], "pending")
    assert len(pending) == 1 and pending[0]["app_name"] == "test"
    # Nothing was applied.
    assert not [p for p in apps.list_suggestions(session, user["id"]) if p["status"] == "confirmed"]


def test_direct_write_key_applies_immediately_and_records_it(real):
    client, _, user, session = real
    _, direct_key = apps.create_app(session, {**user, "token_version": 1}, "direct", "read_write", 30)
    result = _call(client, "propose_changes", {
        "summary": "Create a project",
        "actions": [{"type": "create_project", "project": {"name": "Direct Write Project"}}],
    }, key=direct_key)
    assert result["isError"] is False
    assert '"status": "applied"' in result["content"][0]["text"]
    names = [r[0] for r in session.execute(text("SELECT name FROM projects WHERE user_id = :u"), {"u": user["id"]}).all()]
    assert "Direct Write Project" in names
    [done] = [s for s in apps.list_suggestions(session, user["id"], "confirmed")]
    assert done["app_name"] == "direct"
    stored = session.execute(text("SELECT plan_json FROM connected_app_suggestions WHERE id = :i"), {"i": done["id"]}).scalar_one()
    assert json.loads(stored)["auto_applied"] is True
