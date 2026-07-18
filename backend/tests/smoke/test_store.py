import json
import pytest

from app.db.connection import connect, get_engine
from app.services.store import Store, render_text

from tests.helpers import make_settings


def make_store(tmp_path):
    settings = make_settings(tmp_path)
    from sqlalchemy.orm import sessionmaker
    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    return Store(session), session.connection().connection.dbapi_connection


@pytest.mark.smoke
def test_seeded_degree_workspaces(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        workspaces = store.list_records("degree_workspaces")
        assert {item["degree_type"] for item in workspaces} == {"bachelors", "masters", "phd"}
    finally:
        store.db.close()


@pytest.mark.smoke
def test_create_application_and_dashboard_summary(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        university = store.create_record("universities", {"name": "Aalto University", "country": "Finland"})
        program = store.create_record("programs", {"university_id": university["id"], "name": "Computer Science"})
        app = store.create_record(
            "applications",
            {"university_id": university["id"], "program_id": program["id"], "status": "Drafting"},
        )
        store.create_record(
            "deadlines",
            {
                "application_id": app["id"],
                "deadline_type": "Application",
                "title": "Main deadline",
                "due_at": "2026-12-01",
            },
        )

        summary = store.dashboard_summary()

        assert summary["counts"]["applications"] == 1
        assert summary["status_counts"][0]["status"] == "Drafting"
        assert summary["upcoming_deadlines"][0]["title"] == "Main deadline"
    finally:
        store.db.close()


def test_dashboard_recent_projects_capped_at_five(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        for index in range(6):
            store.create_record("projects", {"name": f"Project {index}", "degree_type": "phd"})

        summary = store.dashboard_summary()

        assert len(summary["recent_projects"]) == 5
    finally:
        store.db.close()


def test_dashboard_pinned_projects_and_sheets_require_dashboard_pin(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        project = store.create_record(
            "projects",
            {"name": "Pinned project", "degree_type": "phd", "is_pinned": True, "pinned_to_dashboard": True},
        )
        hidden_project = store.create_record(
            "projects",
            {"name": "Locally pinned", "degree_type": "masters", "is_pinned": True, "pinned_to_dashboard": False},
        )
        visible_sheet = store.create_record(
            "project_sheets",
            {"project_id": project["id"], "name": "Pinned sheet", "is_pinned": True, "pinned_to_dashboard": True},
        )
        store.create_record(
            "project_sheets",
            {"project_id": hidden_project["id"], "name": "Sheet only", "is_pinned": True, "pinned_to_dashboard": False},
        )

        summary = store.dashboard_summary()

        assert [item["name"] for item in summary["pinned_projects"]] == ["Pinned project"]
        assert summary["pinned_sheets"][0]["id"] == visible_sheet["id"]
        assert summary["pinned_sheets"][0]["project_name"] == "Pinned project"
    finally:
        store.db.close()


def test_dashboard_includes_pinned_static_files(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        store.create_record(
            "static_files",
            {
                "display_name": "Pinned CV.pdf",
                "file_type": "cvs",
                "relative_path": "media/cvs/Pinned CV.pdf",
                "pinned_to_dashboard": True,
            },
        )
        store.create_record(
            "static_files",
            {
                "display_name": "Local only.pdf",
                "file_type": "sop",
                "relative_path": "media/sop/Local only.pdf",
                "is_pinned": True,
                "pinned_to_dashboard": False,
            },
        )

        summary = store.dashboard_summary()

        assert [item["display_name"] for item in summary["pinned_docs"]] == ["Pinned CV.pdf"]
    finally:
        store.db.close()


def test_static_file_pin_flags_can_be_toggled(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        file_record = store.create_record(
            "static_files",
            {
                "display_name": "Portfolio.pdf",
                "file_type": "cvs",
                "relative_path": "media/cvs/Portfolio.pdf",
            },
        )

        pinned = store.update_record("static_files", file_record["id"], {"is_pinned": True, "pinned_to_dashboard": True})
        summary = store.dashboard_summary()
        unpinned = store.update_record("static_files", file_record["id"], {"is_pinned": False, "pinned_to_dashboard": False})

        assert pinned["is_pinned"] == 1
        assert pinned["pinned_to_dashboard"] == 1
        assert [item["display_name"] for item in summary["pinned_docs"]] == ["Portfolio.pdf"]
        assert unpinned["is_pinned"] == 0
        assert unpinned["pinned_to_dashboard"] == 0
    finally:
        store.db.close()


def test_sticky_notes_are_persisted_and_counted(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        note = store.create_record(
            "sticky_notes",
            {
                "title": "Professor follow-up",
                "body": "Send a warmer second email.",
                "color": "mint",
                "is_checklist": False,
                "checklist_json": "[]",
            },
        )

        updated = store.update_record("sticky_notes", note["id"], {"is_checklist": True, "checklist_json": '[{"text":"Draft","done":false}]'})
        summary = store.dashboard_summary()

        assert updated["is_checklist"] == 1
        assert summary["counts"]["sticky_notes"] == 1
    finally:
        store.db.close()


def test_render_email_template_replaces_known_variables():
    text = render_text("Dear {{ professor_name }}, {{missing}}", {"professor_name": "Dr. Rahman"})

    assert text == "Dear Dr. Rahman, {{missing}}"


def test_document_category_creation_is_limited_to_sixteen(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        existing_count = len(store.document_categories())
        for index in range(16 - existing_count):
            store.create_document_category(f"Extra {index}")

        try:
            store.create_document_category("Overflow")
            assert False, "Expected document category limit"
        except ValueError as exc:
            assert "limited to 16" in str(exc)
    finally:
        store.db.close()


def test_outreach_follow_up_creates_reminder(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        outreach = store.log_outreach(
            {
                "recipient_email": "advisor@example.edu",
                "subject": "Research inquiry",
                "sent_at": "2026-05-27",
            },
            follow_up_days=10,
        )
        reminders = store.list_records("reminders")

        assert outreach["recipient_email"] == "advisor@example.edu"
        assert str(reminders[0]["due_at"])[:10] == "2026-06-06"
    finally:
        store.db.close()


def test_project_page_json_and_notifications(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        project = store.create_record("projects", {"name": "Finland PhD", "degree_type": "phd"})
        page = store.create_record(
            "project_pages",
            {
                "project_id": project["id"],
                "name": "Professors",
                "columns_json": ["University", "Professor email", "Follow-up date"],
                "rows_json": [{"University": "Aalto", "Professor email": "prof@example.edu", "Follow-up date": "2026-06-04"}],
            },
        )
        store.create_record(
            "notifications",
            {
                "project_id": project["id"],
                "title": "Schedule email",
                "notification_type": "scheduled-email",
                "due_at": "2026-06-01T09:00",
            },
        )

        summary = store.project_summary(project["id"])

        assert page["name"] == "Professors"
        assert summary["page_count"] == 1
        assert summary["sheet_count"] == 0
        assert summary["row_count"] == 1
        assert summary["notification_count"] == 1
        assert summary["pages"][0]["columns"] == [
            {"name": "University", "type": "text"},
            {"name": "Professor email", "type": "text"},
            {"name": "Follow-up date", "type": "text"},
        ]
        assert summary["calendar_items"][0]["date_key"] == "2026-06-04"
        assert summary["calendar_items"][0]["page_id"] == page["id"]
        assert summary["calendar_items"][0]["row_index"] == 0

        dashboard = store.dashboard_summary()
        assert dashboard["calendar_items"][0]["project_id"] == project["id"]
        assert dashboard["calendar_items"][0]["project_name"] == "Finland PhD"
    finally:
        store.db.close()


def test_create_sheet_with_single_default_table(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        project = store.create_record("projects", {"name": "USA MS", "degree_type": "masters"})

        result = store.create_sheet_with_defaults(project["id"], "Fall shortlist")
        summary = store.project_summary(project["id"])

        assert result["sheet"]["name"] == "Fall shortlist"
        assert result["page"]["name"] == "Fall shortlist"
        page_cols_raw = result["page"]["columns_json"]
        page_cols = json.loads(page_cols_raw) if isinstance(page_cols_raw, str) else page_cols_raw
        col_names = [c["name"] if isinstance(c, dict) else c for c in page_cols]
        assert "BSc certificate" in col_names
        assert "BSc transcript" in col_names
        assert "SOP" in col_names
        assert "Linked documents" not in col_names
        assert "Attachments" in col_names
        assert summary["sheet_count"] == 1
        assert summary["page_count"] == 1
    finally:
        store.db.close()


def test_local_profile_seed_and_update(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        store.create_record("local_profiles", {"display_name": "Applicant", "email": "user@example.com"})
        profile = store.get_record("local_profiles", 1)
        assert profile["display_name"] == "Applicant"

        updated = store.update_record("local_profiles", 1, {"display_name": "Fahad", "email": "me@example.com"})

        assert updated["display_name"] == "Fahad"
    finally:
        store.db.close()


def test_document_category_rename_and_delete_removes_files(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        workspace_path = tmp_path / "workspace"
        media_path = workspace_path / "media"
        docs_path = media_path / "portfolio"
        docs_path.mkdir(parents=True)
        physical_file = docs_path / "sample.pdf"
        physical_file.write_text("content")

        category = store.create_document_category("Portfolio")
        file_record = store.create_record(
            "static_files",
            {
                "display_name": "sample.pdf",
                "file_type": category["slug"],
                "relative_path": str(physical_file.relative_to(workspace_path)),
            },
        )

        renamed = store.rename_document_category(category["id"], "Writing Samples")
        updated_file = store.get_record("static_files", file_record["id"])

        assert renamed["slug"] == "writing-samples"
        assert updated_file["file_type"] == "writing-samples"

        deleted = store.delete_document_category(renamed["id"], workspace_path, media_path)

        assert deleted["deleted_document_count"] == 1
        assert not physical_file.exists()
        
        # Manually create another category so the list isn't empty
        store.create_document_category("Other")
        assert store.document_categories()
        assert all(item["slug"] != "writing-samples" for item in store.document_categories())
    finally:
        store.db.close()


@pytest.mark.smoke
def test_project_meta_is_lightweight_with_row_counts(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        project = store.create_record("projects", {"name": "Finland PhD", "degree_type": "phd"})
        store.create_record(
            "project_pages",
            {
                "project_id": project["id"],
                "name": "Professors",
                "columns_json": ["University", "Professor email", "Follow-up date"],
                "rows_json": [
                    {"University": "Aalto", "Professor email": "prof@example.edu", "Follow-up date": "2026-06-04"},
                    {"University": "Helsinki", "Professor email": "prof2@example.edu", "Follow-up date": "2026-06-10"},
                ],
            },
        )

        meta = store.project_meta(project["id"])

        # Stubs must NOT ship decoded rows or columns (the whole point of /meta).
        stub = meta["page_stubs"][0]
        assert "rows" not in stub
        assert "columns" not in stub
        assert stub["row_count"] == 2
        for key in ("id", "sheet_id", "name", "updated_at", "row_count"):
            assert key in stub

        # Aggregates
        assert meta["row_count"] == 2
        assert meta["page_count"] == 1
        assert "calendar_items" in meta
        assert meta["calendar_items"][0]["date_key"] == "2026-06-04"
        assert meta["calendar_items"][0]["project_id"] == project["id"]
    finally:
        store.db.close()


@pytest.mark.smoke
def test_project_meta_skips_calendar_when_requested(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        project = store.create_record("projects", {"name": "P2", "degree_type": "phd"})
        store.create_record(
            "project_pages",
            {
                "project_id": project["id"],
                "name": "Dates",
                "columns_json": ["Deadline"],
                "rows_json": [{"Deadline": "2026-06-04"}],
            },
        )

        meta = store.project_meta(project["id"], include_calendar=False)
        assert "calendar_items" not in meta
        # row_count is still derived server-side
        assert meta["page_stubs"][0]["row_count"] == 1
    finally:
        store.db.close()


@pytest.mark.smoke
def test_get_project_page_returns_decoded_page(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        project = store.create_record("projects", {"name": "P3", "degree_type": "phd"})
        page = store.create_record(
            "project_pages",
            {
                "project_id": project["id"],
                "name": "Sheet",
                "columns_json": ["University", "Professor email"],
                "rows_json": [{"University": "Aalto", "Professor email": "x@example.edu"}],
                "email_config_json": {"toColumn": "Professor email"},
            },
        )

        decoded = store.get_project_page(page["id"])
        # Legacy string[] columns are migrated to {name, type}.
        assert decoded["columns"] == [
            {"name": "University", "type": "text"},
            {"name": "Professor email", "type": "text"},
        ]
        assert decoded["rows"] == [{"University": "Aalto", "Professor email": "x@example.edu"}]
        assert decoded["email_config"] == {"toColumn": "Professor email"}

        # Unknown id raises LookupError (404 at the route layer).
        import uuid as _uuid
        with pytest.raises(LookupError):
            store.get_project_page(str(_uuid.uuid4()))
    finally:
        store.db.close()


@pytest.mark.smoke
def test_project_sheet_counts_groups_by_project(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        p1 = store.create_record("projects", {"name": "A", "degree_type": "phd"})
        p2 = store.create_record("projects", {"name": "B", "degree_type": "phd"})

        store.create_sheet_with_defaults(p1["id"], "s1")
        store.create_sheet_with_defaults(p1["id"], "s2")
        store.create_sheet_with_defaults(p2["id"], "s3")

        counts = store.project_sheet_counts()
        assert counts[str(p1["id"])] == 2
        assert counts[str(p2["id"])] == 1
    finally:
        store.db.close()


def test_project_sheet_counts_includes_empty_projects(tmp_path):
    """SCHOLARDOCX-0150: a project with NO sheets must still appear in the
    counts dict with value 0. Previously the GROUP BY on project_sheets
    silently omitted empty projects, which left the project card's "X / Y
    sheets" counter stuck on its loading state in the UI.
    """
    store, connection = make_store(tmp_path)
    try:
        # Three projects: one with two sheets, one with one sheet, one EMPTY.
        p_full = store.create_record("projects", {"name": "Full", "degree_type": "phd"})
        p_one = store.create_record("projects", {"name": "One", "degree_type": "phd"})
        p_empty = store.create_record("projects", {"name": "Empty", "degree_type": "phd"})

        store.create_sheet_with_defaults(p_full["id"], "s1")
        store.create_sheet_with_defaults(p_full["id"], "s2")
        store.create_sheet_with_defaults(p_one["id"], "s3")
        # NOTE: no sheets added to p_empty.

        counts = store.project_sheet_counts()

        # The empty project MUST be a key with value 0 — not missing.
        assert str(p_empty["id"]) in counts, (
            "empty project must appear in sheet_counts (was omitted by GROUP BY)"
        )
        assert counts[str(p_empty["id"])] == 0
        assert counts[str(p_full["id"])] == 2
        assert counts[str(p_one["id"])] == 1
    finally:
        store.db.close()
