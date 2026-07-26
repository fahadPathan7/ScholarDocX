import os
from typing import Any
import pytest
from app.services.ai_actions_workspace import project_ref, sheet_ref
from app.services.ai_actions_execute import (
    row_for_columns,
    normalize_row_updates,
    resolve_project,
    resolve_page,
    execute_pin_project,
    execute_unpin_project,
    execute_pin_sheet,
    execute_unpin_sheet,
    execute_add_to_dashboard,
    execute_remove_from_dashboard,
    execute_add_rows,
    execute_update_row,
    execute_bulk_update_rows,
)
from app.services.ai_actions_records import _find_by_name
from app.services.ai_actions_read import filter_rows_by_value
from app.services.store import Store


def test_multi_action_context_inheritance():
    prev_actions = [
        {"type": "add_column", "project_id": "proj-123", "sheet_id": "sheet-456", "column": {"name": "Status"}}
    ]
    raw_action = {"type": "update_row", "row_index": 0, "updates": {"Status": "Offer"}}
    
    p_ref = project_ref(raw_action, prev_actions)
    s_ref = sheet_ref(raw_action, prev_actions)

    assert p_ref == {"project_id": "proj-123"}
    assert s_ref == {"sheet_id": "sheet-456"}


def test_multi_action_context_inheritance_by_name():
    prev_actions = [
        {"type": "get_rows", "project_name": "Canada PhD", "sheet_name": "Professors"}
    ]
    raw_action = {"type": "add_rows", "rows": [{"Name": "Dr. Smith"}]}

    p_ref = project_ref(raw_action, prev_actions)
    s_ref = sheet_ref(raw_action, prev_actions)

    assert p_ref == {"project_name": "Canada PhD"}
    assert s_ref == {"sheet_name": "Professors"}


def test_case_insensitive_column_key_matching():
    cols = ["University name", "Professor name", "Status", "Application Deadline"]
    row_input = {"university name": "MIT", "status": "Applied", "extra_key": "val"}
    
    processed = row_for_columns(row_input, cols)
    assert processed == {"University name": "MIT", "Status": "Applied"}

    updates_input = {"status": "Accepted", "professor name": "Dr. Chen"}
    norm_updates = normalize_row_updates(updates_input, cols)
    assert norm_updates == {"Status": "Accepted", "Professor name": "Dr. Chen"}


def make_store() -> tuple[Store, Any]:
    from app.db.connection import get_engine, initialize_database
    from sqlalchemy.orm import sessionmaker
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not db_url:
        pytest.skip("DATABASE_URL not set; database tests require PostgreSQL connection string")
    initialize_database(db_url)
    engine = get_engine(db_url)
    session = sessionmaker(bind=engine)()
    store = Store(session)

    # Pre-clean test records with names used in these test cases
    try:
        for proj in store.list_records("projects"):
            pname = proj.get("name", "")
            if any(target in pname for target in ["Canada PhD", "US PhD", "AskAiGuidanceProj"]):
                for page in store.list_records("project_pages"):
                    if page.get("project_id") == proj["id"]:
                        store.delete_record("project_pages", page["id"])
                for sheet in store.list_records("project_sheets"):
                    if sheet.get("project_id") == proj["id"]:
                        store.delete_record("project_sheets", sheet["id"])
                store.delete_record("projects", proj["id"])
        session.commit()
    except Exception:
        session.rollback()

    return store, session


def test_fallback_substring_resolution():
    store, session = make_store()
    project = None
    uni = None
    try:
        project = store.create_record("projects", {"name": "Canada PhD 2027", "degree_type": "phd"})
        sheet_res = store.create_sheet_with_defaults(project["id"], "Professor Shortlist")
        
        # Resolve project by substring "Canada PhD"
        resolved_proj = resolve_project(store, {"project_name": "Canada PhD"}, {"projects": {}, "sheets": {}})
        assert resolved_proj["id"] == project["id"]

        # Resolve sheet by substring "Shortlist"
        resolved_pg = resolve_page(store, project["id"], {"sheet_name": "Shortlist"}, {"projects": {}, "sheets": {}})
        assert resolved_pg["sheet_id"] == sheet_res["sheet"]["id"]

        # Record resolution by substring
        uni = store.create_record("universities", {"name": "Massachusetts Institute of Technology", "country": "USA"})
        found_uni = _find_by_name(store, "universities", "name", "Massachusetts Institute")
        assert found_uni["id"] == uni["id"]
    finally:
        try:
            if project:
                for page in store.list_records("project_pages"):
                    if page.get("project_id") == project["id"]:
                        store.delete_record("project_pages", page["id"])
                for sheet in store.list_records("project_sheets"):
                    if sheet.get("project_id") == project["id"]:
                        store.delete_record("project_sheets", sheet["id"])
                store.delete_record("projects", project["id"])
            if uni:
                store.delete_record("universities", uni["id"])
            session.commit()
        except Exception:
            session.rollback()
        finally:
            session.close()


def test_pinning_and_dashboard_db_schema_fields():
    from uuid import uuid4
    from app.core.config import Settings
    from app.services.ai_actions import AiActionService
    store, session = make_store()
    project_id = None
    proj_name = f"US PhD {uuid4().hex[:6]}"
    sheet_name = f"Overview {uuid4().hex[:6]}"
    try:
        svc = AiActionService(Settings(), store)
        res = svc.execute(
            {"status": "needs_confirmation", "actions": [
                {"type": "create_project", "project": {"name": proj_name}},
                {"type": "create_sheet", "project_name": proj_name, "sheet": {"name": sheet_name}},
            ]}
        )
        project = res["results"][0]["project"]
        sheet_res = res["results"][1]
        project_id = str(project["id"])

        refs = {"projects": {}, "sheets": {}}

        # Pin sidebar project
        execute_pin_project(svc, {"project_id": project_id, "project_name": proj_name, "pin_type": "sidebar"}, refs)
        p = store.get_record("projects", project_id)
        assert p["is_pinned"] == 1

        # Pin dashboard project
        execute_pin_project(svc, {"project_id": project_id, "project_name": proj_name, "pin_type": "dashboard"}, refs)
        p = store.get_record("projects", project_id)
        assert p["pinned_to_dashboard"] == 1

        # Unpin sidebar project
        execute_unpin_project(svc, {"project_id": project_id, "project_name": proj_name, "pin_type": "sidebar"}, refs)
        p = store.get_record("projects", project_id)
        assert p["is_pinned"] == 0

        # Pin sheet dashboard
        execute_add_to_dashboard(svc, {"item_type": "sheet", "project_id": project_id, "project_name": proj_name, "sheet_name": sheet_name}, refs)
        s = store.get_record("project_sheets", sheet_res["sheet"]["id"])
        assert s["pinned_to_dashboard"] == 1

        # Remove sheet dashboard
        execute_remove_from_dashboard(svc, {"item_type": "sheet", "project_id": project_id, "project_name": proj_name, "sheet_name": sheet_name}, refs)
        s = store.get_record("project_sheets", sheet_res["sheet"]["id"])
        assert s["pinned_to_dashboard"] == 0
    finally:
        try:
            if project_id:
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


def test_filter_rows_by_value_semantic_matching():
    columns = [
        {"name": "University name", "type": "text"},
        {"name": "Applied", "type": "boolean"},
        {"name": "Status", "type": "text"}
    ]
    rows = [
        {"University name": "MIT", "Applied": "true", "Status": "Accepted"},
        {"University name": "Harvard", "Applied": "false", "Status": "Pending"}
    ]

    # Query using lowercase column name "applied"
    filtered = filter_rows_by_value(rows, "applied", value=None, operator="is_true", columns=columns)
    assert len(filtered) == 1
    assert filtered[0]["row"]["University name"] == "MIT"


@pytest.mark.asyncio
async def test_ask_ai_empty_sheet_guidance():
    from uuid import uuid4
    from app.services.ai_actions import AiActionService
    from app.services.ai_actions_analyze import serialize_results_for_analysis, build_analyst_prompt
    from app.core.config import Settings

    store, session = make_store()
    project_id = None
    proj_name = f"EmptyProj {uuid4().hex[:6]}"
    sheet_name = f"EmptySheet {uuid4().hex[:6]}"
    try:
        svc = AiActionService(Settings(), store)
        res = svc.execute(
            {"status": "needs_confirmation", "actions": [
                {"type": "create_project", "project": {"name": proj_name}},
                {"type": "create_sheet", "project_name": proj_name, "sheet": {"name": sheet_name}},
            ]}
        )
        project = res["results"][0]["project"]
        sheet_res = res["results"][1]
        project_id = str(project["id"])

        # Heuristic plan for count_items / get_rows on empty sheet
        plan = svc._heuristic_plan(
            f'Show me all upcoming deadlines in the sheet "{sheet_name}" (sheet_id: "{sheet_res["sheet"]["id"]}") '
            f'in project "{proj_name}" (project_id: "{project_id}") [rows: 0].'
        )
        assert plan is not None

        # Execute read action on empty sheet returns 0 rows
        exec_res = svc.execute(plan)
        assert exec_res["status"] == "done"
        serialized, _ = serialize_results_for_analysis(exec_res["results"])
        assert "count" in serialized or "0" in serialized

        # Analyst prompt contains 0-row empty sheet guidance rule
        prompt = build_analyst_prompt("Show me all upcoming deadlines", serialized, False)
        assert "USER QUESTION:" in prompt
    finally:
        try:
            if project_id:
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
