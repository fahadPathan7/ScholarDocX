"""SCHOLARDOCX-0150: end-to-end execution tests for every sheet Ask AI prompt.

The sheet Ask AI catalog sends prompts that target a sheet by `project_id` +
`sheet_id`. These tests verify the action-execution layer can actually carry
out each prompt's underlying operation when the planner emits an ID-based
action — i.e. the runtime plumbing the prompts depend on works for every
prompt in the catalog.

We bypass the LLM planner (no provider keys in CI) and feed the executor the
exact action shapes the planner would emit. This isolates the
"can the agent actually do this?" question from "is the model smart enough?".
"""

from __future__ import annotations

import json
import os
from datetime import date, timedelta

import pytest
from dotenv import load_dotenv
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.db.connection import get_engine, initialize_database
from app.services.ai_actions import AiActionService
from app.services.store import Store

load_dotenv()

_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
pytestmark = pytest.mark.skipif(
    not _DATABASE_URL,
    reason="DATABASE_URL not set; Ask AI action tests need a live DB",
)


@pytest.fixture
def service_and_sheet():
    """Fresh project + sheet + status column for each test; cleaned up after."""
    import uuid
    initialize_database(_DATABASE_URL)
    engine = get_engine(_DATABASE_URL)
    session = sessionmaker(bind=engine)()
    store = Store(session)
    svc = AiActionService(Settings(), store)

    unique_proj_name = f"AskAiProbeProj_{uuid.uuid4().hex[:8]}"
    unique_sheet_name = f"AskAiProbeSheet_{uuid.uuid4().hex[:8]}"

    # Create project + sheet, then add a Status column + sample rows.
    res = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "create_project", "project": {"name": unique_proj_name}},
            {"type": "create_sheet", "project_name": unique_proj_name, "sheet": {"name": unique_sheet_name}},
            {"type": "add_column", "project_name": unique_proj_name, "sheet_name": unique_sheet_name,
             "column": {"name": "Status", "type": "select"}},
            {"type": "add_column", "project_name": unique_proj_name, "sheet_name": unique_sheet_name,
             "column": {"name": "Funding", "type": "number"}},
            {"type": "add_column", "project_name": unique_proj_name, "sheet_name": unique_sheet_name,
             "column": {"name": "Deadline", "type": "date"}},
            {"type": "add_rows", "project_name": unique_proj_name, "sheet_name": unique_sheet_name,
             "rows": [
                 {"Status": "Applied", "Funding": "30000"},
                 {"Status": "Applied", "Funding": "50000"},
                 {"Status": "Interview", "Funding": "0"},
             ]},
        ]}
    )

    project_id = str(res["results"][0]["project"]["id"])
    sheet_id = str(res["results"][1]["sheet"]["id"])

    yield svc, store, project_id, sheet_id

    # Post-clean
    try:
        session.rollback()
        for page in store.list_records("project_pages"):
            if str(page.get("project_id")) == project_id:
                store.delete_record("project_pages", page["id"])
        for sheet in store.list_records("project_sheets"):
            if str(sheet.get("project_id")) == project_id:
                store.delete_record("project_sheets", sheet["id"])
        store.delete_record("projects", project_id)
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


def _rows(store, sheet_id):
    """Return decoded rows for a sheet."""
    pages = [p for p in store.list_records("project_pages") if p.get("sheet_id") == sheet_id]
    import json
    if not pages:
        return []
    raw = pages[0].get("rows_json") or "[]"
    return json.loads(raw) if isinstance(raw, str) else raw


# ── Analyze prompts (read actions — verify they return data, not errors) ────


def test_application_status_breakdown_via_ids(service_and_sheet):
    """Prompt 'Application status breakdown' → filter_rows by Status, per value."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "filter_rows", "project_id": pid, "sheet_id": sid,
             "column_query": "Status", "value": "Applied", "operator": "equals"},
        ]}
    )
    assert result["status"] == "done"
    res = result["results"][0]
    assert res["count"] == 2  # two Applied rows
    assert len(res["matched"]) == 2


def test_funding_totals_via_get_rows(service_and_sheet):
    """Prompt 'Funding totals' → get_rows returns all rows so Funding can be summed."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "get_rows", "project_id": pid, "sheet_id": sid},
        ]}
    )
    assert result["status"] == "done"
    # get_rows returns rows under "rows" (list of {row_index, row})
    raw_rows = result["results"][0].get("rows") or []
    rows = [r.get("row", r) if isinstance(r, dict) else r for r in raw_rows]
    total = sum(int(r.get("Funding", 0) or 0) for r in rows)
    assert total == 80000  # 30000 + 50000 + 0


def test_deadline_risk_via_analyze_sheet(service_and_sheet):
    """Prompt 'Deadline risk report' → analyze_sheet runs without error."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "analyze_sheet", "project_id": pid, "sheet_id": sid,
             "focus_column": "Deadline", "days_ahead": 45},
        ]}
    )
    assert result["status"] == "done"


def test_response_rate_via_get_column_values(service_and_sheet):
    """Prompt 'Outreach response rate' → get_column_values returns distinct values."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "get_column_values", "project_id": pid, "sheet_id": sid,
             "column_query": "Status"},
        ]}
    )
    assert result["status"] == "done"


# ── Transform prompts (write actions — verify they mutate data by ID) ──────


def test_draft_emails_adds_column(service_and_sheet):
    """Prompt 'Draft outreach emails' → add_column by ID lands a new column."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "add_column", "project_id": pid, "sheet_id": sid,
             "column": {"name": "Email Draft", "type": "text"}},
        ]}
    )
    assert result["status"] == "done"
    import json
    pages = [p for p in store.list_records("project_pages") if p.get("sheet_id") == sid]
    cols = json.loads(pages[0]["columns_json"]) if pages else []
    assert any(c["name"] == "Email Draft" for c in cols)


def test_categorize_adds_stage_column_and_bulk_fills(service_and_sheet):
    """Prompt 'Categorize by stage' → add_column + bulk_update_rows by ID."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "add_column", "project_id": pid, "sheet_id": sid,
             "column": {"name": "Stage", "type": "select"}},
            {"type": "bulk_update_rows", "project_id": pid, "sheet_id": sid,
             "filter_column": "Status", "filter_value": "Applied",
             "updates": {"Stage": "In Progress"}},
        ]}
    )
    assert result["status"] == "done"
    rows = _rows(store, sid)
    # Both Applied rows should now have Stage = In Progress
    assert all(r.get("Stage") == "In Progress" for r in rows if r.get("Status") == "Applied")


def test_priority_score_adds_and_fills(service_and_sheet):
    """Prompt 'Priority score' → add_column + update_row per row by ID."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "add_column", "project_id": pid, "sheet_id": sid,
             "column": {"name": "Priority", "type": "number"}},
            {"type": "update_row", "project_id": pid, "sheet_id": sid, "row_index": 0,
             "updates": {"Priority": "5"}},
            {"type": "update_row", "project_id": pid, "sheet_id": sid, "row_index": 1,
             "updates": {"Priority": "4"}},
            {"type": "update_row", "project_id": pid, "sheet_id": sid, "row_index": 2,
             "updates": {"Priority": "2"}},
        ]}
    )
    assert result["status"] == "done"
    rows = _rows(store, sid)
    priorities = [r.get("Priority") for r in rows]
    assert priorities == ["5", "4", "2"]


def test_rank_by_fit_adds_and_fills(service_and_sheet):
    """Prompt 'Rank by fit' → add_column + per-row update_row by ID."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "add_column", "project_id": pid, "sheet_id": sid,
             "column": {"name": "Fit Rank", "type": "number"}},
            {"type": "update_row", "project_id": pid, "sheet_id": sid, "row_index": 1,
             "updates": {"Fit Rank": "1"}},  # the 50000-funding row ranks first
            {"type": "update_row", "project_id": pid, "sheet_id": sid, "row_index": 0,
             "updates": {"Fit Rank": "2"}},
            {"type": "update_row", "project_id": pid, "sheet_id": sid, "row_index": 2,
             "updates": {"Fit Rank": "3"}},
        ]}
    )
    assert result["status"] == "done"
    rows = _rows(store, sid)
    ranks = [r.get("Fit Rank") for r in rows]
    assert ranks == ["2", "1", "3"]


# ── Selection-aware prompts ────────────────────────────────────────────────


def test_act_on_selected_rows_bulk_update(service_and_sheet):
    """Prompt 'Bulk-update selected rows' → bulk_update_rows by ID."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "bulk_update_rows", "project_id": pid, "sheet_id": sid,
             "filter_column": "Status", "filter_value": "Applied",
             "updates": {"Status": "Interview"}},
        ]}
    )
    assert result["status"] == "done"
    rows = _rows(store, sid)
    statuses = [r.get("Status") for r in rows]
    # Both previously-Applied rows flipped to Interview; original Interview stays
    assert statuses.count("Interview") == 3


def test_fill_focused_cell_update_row(service_and_sheet):
    """Prompt 'Fill the focused cell' → update_row single cell by ID."""
    svc, store, pid, sid = service_and_sheet
    result = svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "update_row", "project_id": pid, "sheet_id": sid, "row_index": 2,
             "updates": {"Funding": "25000"}},
        ]}
    )
    assert result["status"] == "done"
    rows = _rows(store, sid)
    assert rows[2]["Funding"] == "25000"


# ── Row-index injection for row-scoped prompts (SCHOLARDOCX-0179) ──────────


def test_extract_targeted_row_indices_parses_single_and_multi():
    """Pure parsing — no DB needed."""
    single = AiActionService._extract_targeted_row_indices(
        'Look at row 5 (sheet_id: "abc") (row_index: 4).'
    )
    assert single == [4]

    multi = AiActionService._extract_targeted_row_indices(
        'Compare rows (sheet_id: "abc") (row_indices: [0, 12, 47]).'
    )
    assert multi == [0, 12, 47]

    none_present = AiActionService._extract_targeted_row_indices(
        'Show upcoming deadlines (sheet_id: "abc").'
    )
    assert none_present == []


def test_target_sheet_block_includes_row_beyond_default_window(service_and_sheet):
    """SCHOLARDOCX-0179: a row-scoped prompt naming a row past the first-30
    window (e.g. row_index 33 on a 35-row sheet) must still get that row's
    real data injected, not just the first 30 rows."""
    svc, store, pid, sid = service_and_sheet

    # Bulk-add rows so the sheet has 35 total (3 already exist from the fixture).
    svc.execute(
        {"status": "needs_confirmation", "actions": [
            {"type": "add_rows", "project_id": pid, "sheet_id": sid,
             "rows": [{"Status": "Researching", "Funding": str(i)} for i in range(32)]},
        ]}
    )
    rows = _rows(store, sid)
    assert len(rows) == 35

    message = f'Summarize row 34 (sheet_id: "{sid}") (row_index: 33).'
    block = svc._target_sheet_block(message)
    payload = json.loads(block.split(":\n", 1)[1].strip())
    by_index = {entry["row_index"]: entry for entry in payload}

    assert 33 in by_index, "targeted row beyond the first-30 window must be injected"
    assert by_index[33]["Funding"] == rows[33]["Funding"]
    assert 0 in by_index  # default first-30 window is still included
    assert 30 not in by_index  # rows between the window and the target are not pulled in for free


def test_target_sheet_block_without_row_marker_stays_within_default_window(service_and_sheet):
    """No `(row_index: N)` marker present → behaves exactly as before
    (first 30 rows only), confirming the new parsing is additive."""
    svc, store, pid, sid = service_and_sheet
    message = f'Show upcoming deadlines (sheet_id: "{sid}").'
    block = svc._target_sheet_block(message)
    assert '"row_index": 0' in block
    assert '"row_index": 2' in block  # last of the fixture's 3 seeded rows
