import json
from app.db.connection import connect, initialize_database
from app.services.store import Store, render_text


def make_store(tmp_path):
    database_path = tmp_path / "app.db"
    initialize_database(database_path)
    connection = connect(database_path)
    return Store(connection), connection


def test_seeded_degree_workspaces(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        workspaces = store.list_records("degree_workspaces")
        assert {item["degree_type"] for item in workspaces} == {"bachelors", "masters", "phd"}
    finally:
        connection.close()


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
        connection.close()


def test_dashboard_recent_projects_capped_at_five(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        for index in range(6):
            store.create_record("projects", {"name": f"Project {index}", "degree_type": "phd"})

        summary = store.dashboard_summary()

        assert len(summary["recent_projects"]) == 5
    finally:
        connection.close()


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
        connection.close()


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
        connection.close()


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
        connection.close()


def test_sticky_notes_are_persisted_and_counted(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        note = store.create_record(
            "sticky_notes",
            {
                "title": "Professor follow-up",
                "body": "Send a warmer second email.",
                "color": "mint",
                "is_bold": True,
                "is_checklist": False,
                "checklist_json": "[]",
            },
        )

        updated = store.update_record("sticky_notes", note["id"], {"is_checklist": True, "checklist_json": '[{"text":"Draft","done":false}]'})
        summary = store.dashboard_summary()

        assert updated["is_checklist"] == 1
        assert summary["counts"]["sticky_notes"] == 1
    finally:
        connection.close()


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
        connection.close()


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
        assert reminders[0]["due_at"] == "2026-06-06"
    finally:
        connection.close()


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
        connection.close()


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
        assert "BSC cert" in col_names
        assert "BSC transcript" in col_names
        assert "SOP" in col_names
        assert "Linked documents" not in col_names
        assert "Attachments" not in col_names
        assert "Follow-up date" in col_names
        assert summary["sheet_count"] == 1
        assert summary["page_count"] == 1
    finally:
        connection.close()


def test_local_profile_seed_and_update(tmp_path):
    store, connection = make_store(tmp_path)
    try:
        profile = store.get_record("local_profiles", 1)
        assert profile["display_name"] == "Applicant"

        updated = store.update_record("local_profiles", 1, {"display_name": "Fahad", "email": "me@example.com"})

        assert updated["display_name"] == "Fahad"
        assert updated["email"] == "me@example.com"
    finally:
        connection.close()


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
        assert store.document_categories()
        assert all(item["slug"] != "writing-samples" for item in store.document_categories())
    finally:
        connection.close()
