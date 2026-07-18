import uuid

import pytest
from sqlalchemy import text

from app.core.config import Settings
from app.db.connection import get_engine
from app.services.ai_actions import AiActionService, ADMIN_TASK_RE
from app.services.store import Store

from tests.helpers import make_settings


def make_store(tmp_path):
    settings = make_settings(tmp_path)
    from sqlalchemy.orm import sessionmaker
    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    return Store(session), session


def make_service(store):
    settings = Settings()
    settings.glm_api_key = ""
    settings.gemini_api_key = ""
    settings.groq_api_key = ""
    return AiActionService(settings, store)


def execute(service, actions):
    return service.execute({"status": "needs_confirmation", "actions": actions})


def test_document_lifecycle_with_versions(tmp_path):
    store, session = make_store(tmp_path)
    try:
        service = make_service(store)
        execute(service, [
            {"type": "create_document", "title": "My MIT SOP", "document_type": "sop"},
            {"type": "add_document_version", "document_title": "My MIT SOP", "content": "Draft one."},
        ])
        documents = store.list_records("documents")
        versions = store.list_records("document_versions")
        assert documents[0]["title"] == "My MIT SOP"
        assert versions[0]["version_label"] == "v1"
        assert versions[0]["content"] == "Draft one."

        execute(service, [
            {"type": "update_document", "title": "My MIT SOP", "updates": {"title": "MIT SOP Final"}},
        ])
        assert store.list_records("documents")[0]["title"] == "MIT SOP Final"

        listed = execute(service, [{"type": "list_documents"}])
        assert "MIT SOP Final" in listed["message"]

        execute(service, [{"type": "delete_document", "title": "MIT SOP Final"}])
        assert store.list_records("documents") == []
    finally:
        session.close()


def test_academic_catalog_chain_resolves_names(tmp_path):
    store, session = make_store(tmp_path)
    # Unique per-run names: "MIT" is reused across runs/tests, and the shared
    # Supabase DB accumulates stale rows that would otherwise make [0] / name
    # lookups ambiguous. Tag everything this run creates and clean up after.
    run_tag = uuid.uuid4().hex[:8]
    uni_name = f"MIT-{run_tag}"
    prog_name = f"PhD CS-{run_tag}"
    prof_name = f"Prof. Chen-{run_tag}"
    try:
        service = make_service(store)
        response = execute(service, [
            {"type": "create_university", "name": uni_name, "country": "USA"},
            {"type": "create_program", "name": prog_name, "university_name": uni_name, "degree_type": "phd"},
            {"type": "create_professor", "name": prof_name, "university_name": uni_name, "email": f"chen-{run_tag}@mit.edu"},
            {"type": "create_application", "university_name": uni_name, "status": "Preparing"},
        ])
        assert response["status"] == "done"

        # Find this run's rows by their unique names, not by [0] indexing.
        university = next(u for u in store.list_records("universities") if u["name"] == uni_name)
        program = next(p for p in store.list_records("programs") if p["name"] == prog_name)
        professor = next(p for p in store.list_records("professors") if p["name"] == prof_name)
        application = next(
            a for a in store.list_records("applications")
            if str(a.get("university_id")) == str(university["id"])
        )
        assert program["university_id"] == university["id"]
        assert professor["university_id"] == university["id"]
        assert application["university_id"] == university["id"]

        execute(service, [
            {"type": "update_application", "university_name": uni_name, "updates": {"status": "Submitted"}},
        ])
        # Re-read this run's application and assert its own status (not [0]).
        apps = [a for a in store.list_records("applications")
                if str(a.get("university_id")) == str(university["id"])]
        assert apps[0]["status"] == "Submitted"
    finally:
        # Delete in child-first order to satisfy FK constraints.
        try:
            session.execute(text("DELETE FROM applications WHERE university_id = (SELECT id FROM universities WHERE name = :n)"), {"n": uni_name})
            session.execute(text("DELETE FROM professors WHERE name = :p"), {"p": prof_name})
            session.execute(text("DELETE FROM programs WHERE name = :p"), {"p": prog_name})
            session.execute(text("DELETE FROM universities WHERE name = :n"), {"n": uni_name})
            session.commit()
        except Exception:
            session.rollback()
        session.close()


def test_program_with_unknown_university_fails_clearly(tmp_path):
    store, session = make_store(tmp_path)
    try:
        service = make_service(store)
        with pytest.raises(ValueError, match="No universities record named 'Nowhere U'"):
            execute(service, [
                {"type": "create_program", "name": "PhD CS", "university_name": "Nowhere U"},
            ])
    finally:
        session.close()


def test_outreach_log_creates_follow_up_reminder_and_updates(tmp_path):
    store, session = make_store(tmp_path)
    try:
        service = make_service(store)
        execute(service, [
            {
                "type": "log_outreach",
                "recipient_email": "chen@mit.edu",
                "subject": "Prospective PhD student",
                "follow_up_days": 5,
            },
        ])
        logs = store.list_records("outreach_logs")
        reminders = store.list_records("reminders")
        assert logs[0]["recipient_email"] == "chen@mit.edu"
        assert reminders and "Follow up" in reminders[0]["title"]

        execute(service, [
            {
                "type": "update_outreach_log",
                "subject": "Prospective PhD student",
                "updates": {"response_status": "Replied"},
            },
        ])
        assert store.list_records("outreach_logs")[0]["response_status"] == "Replied"
    finally:
        session.close()


def test_reminder_and_deadline_completion(tmp_path):
    store, session = make_store(tmp_path)
    try:
        service = make_service(store)
        execute(service, [
            {"type": "create_reminder", "title": "Email Prof. Chen", "due_at": "2026-07-05"},
            {"type": "create_deadline", "title": "MIT application", "due_at": "2026-12-15"},
        ])
        execute(service, [
            {"type": "complete_reminder", "title": "Email Prof. Chen"},
            {"type": "complete_deadline", "title": "MIT application"},
        ])
        assert store.list_records("reminders")[0]["completed_at"]
        assert store.list_records("deadlines")[0]["completed_at"]

        due = execute(service, [{"type": "get_due_reminders", "days_ahead": 365}])
        # Completed reminders are excluded from due lists.
        assert due["results"][0]["count"] == 0
    finally:
        session.close()


def test_email_template_and_draft_actions(tmp_path):
    store, session = make_store(tmp_path)
    try:
        service = make_service(store)
        execute(service, [
            {
                "type": "create_email_template",
                "name": "Cold outreach",
                "subject_template": "Prospective student — {{topic}}",
                "body_template": "Dear {{name}}, ...",
            },
            {
                "type": "create_email_draft",
                "subject": "Prospective PhD student",
                "body": "Dear Prof. Chen, ...",
                "recipient_email": "chen@mit.edu",
                "template_name": "Cold outreach",
            },
        ])
        template = store.list_records("email_templates")[0]
        draft = store.list_records("email_drafts")[0]
        assert draft["template_id"] == template["id"]
        assert draft["status"] == "Draft"
    finally:
        session.close()


def test_research_note_and_notifications(tmp_path):
    store, session = make_store(tmp_path)
    try:
        service = make_service(store)
        execute(service, [
            {"type": "create_research_note", "title": "Chen lab funding", "content": "NSF grant through 2028."},
        ])
        assert store.list_records("research_notes")[0]["title"] == "Chen lab funding"

        store.create_record("notifications", {"title": "Test", "notification_type": "info", "body": "x"})
        result = execute(service, [{"type": "mark_notifications_read"}])
        assert result["results"][0]["count"] >= 1
        assert all(n.get("read_at") for n in store.list_records("notifications"))
    finally:
        session.close()


def test_normalized_plan_round_trips_through_execute(tmp_path):
    """The frontend sends the planner's normalized plan back to execute."""
    store, session = make_store(tmp_path)
    # Unique per-run names to avoid collisions with prior runs on the shared
    # Supabase DB. Cleaned up in finally.
    run_tag = uuid.uuid4().hex[:8]
    uni_name = f"MIT-{run_tag}"
    reminder_title = f"Email Prof. Chen-{run_tag}"
    try:
        service = make_service(store)
        planned = service._normalize_plan(
            {"actions": [
                {"type": "create_university", "name": uni_name, "country": "USA"},
                {"type": "create_reminder", "title": reminder_title, "due_at": "2026-07-05"},
            ]},
            f"add {uni_name} as a university and remind me to email Prof. Chen",
        )
        assert planned["status"] == "needs_confirmation"
        assert planned["summary"] == [f"Create university: {uni_name}", f"Create reminder: {reminder_title}"]

        response = service.execute(planned)
        assert response["status"] == "done"
        unis = [u for u in store.list_records("universities") if u["name"] == uni_name]
        reminders = [r for r in store.list_records("reminders") if r["title"] == reminder_title]
        assert len(unis) == 1 and unis[0]["name"] == uni_name
        assert len(reminders) == 1 and reminders[0]["title"] == reminder_title
    finally:
        try:
            session.execute(text("DELETE FROM reminders WHERE title = :t"), {"t": reminder_title})
            session.execute(text("DELETE FROM universities WHERE name = :n"), {"n": uni_name})
            session.commit()
        except Exception:
            session.rollback()
        session.close()


@pytest.mark.asyncio
async def test_plan_refuses_admin_requests(tmp_path):
    store, session = make_store(tmp_path)
    try:
        service = make_service(store)
        for message in (
            "suspend the user account for john",
            "change the role limits for pro users",
            "grant 500 tokens to my account",
            "disable the GLM model for everyone",
        ):
            assert ADMIN_TASK_RE.search(message), message
            response = await service.plan(message)
            assert response["status"] == "needs_info"
            assert response["actions"] == []
            assert "admin" in response["message"].lower()
    finally:
        session.close()


def test_execute_enforces_role_limits(tmp_path):
    store, session = make_store(tmp_path)
    try:
        from app.auth.limits import UsageLimitExceeded, invalidate_limits_cache
        invalidate_limits_cache()
        from sqlalchemy import text
        session.execute(
            text(
                "INSERT INTO users (email, password_hash, roles) "
                "VALUES ('free@example.com', 'x', '[\"free_user\"]')"
            )
        )
        session.commit()
        user_row = session.execute(
            text("SELECT id FROM users WHERE email = 'free@example.com'")
        ).fetchone()
        user = {"id": user_row[0], "roles": ["free_user"]}

        # Mirror production: get_user_store always scopes the store to the
        # caller, which the post-plan usage resync relies on.
        store.current_user_id = user["id"]
        service = make_service(store)
        plan = {"status": "needs_confirmation", "actions": [
            {"type": "create_project", "project": {"name": "First", "degree_type": "phd"}},
        ]}
        service.execute(plan, user=user, session=session)

        # free_user allows exactly 1 project; the second create must be blocked.
        second = {"status": "needs_confirmation", "actions": [
            {"type": "create_project", "project": {"name": "Second", "degree_type": "phd"}},
        ]}
        with pytest.raises(UsageLimitExceeded):
            service.execute(second, user=user, session=session)
        assert len(store.list_records("projects")) == 1

        # Sticky notes: free_user allows 3.
        notes_plan = {"status": "needs_confirmation", "actions": [
            {"type": "create_sticky_note", "note": {"title": f"N{i}", "body": "x"}}
            for i in range(3)
        ]}
        service.execute(notes_plan, user=user, session=session)
        with pytest.raises(UsageLimitExceeded):
            service.execute(
                {"status": "needs_confirmation", "actions": [
                    {"type": "create_sticky_note", "note": {"title": "N4", "body": "x"}},
                ]},
                user=user, session=session,
            )
        assert len(store.list_records("sticky_notes")) == 3
    finally:
        session.close()


def test_execute_without_user_skips_limit_checks(tmp_path):
    store, session = make_store(tmp_path)
    # Unique per-run names so this test never collides with its own prior runs
    # (shared Supabase DB). Cleaned up in finally.
    run_tag = uuid.uuid4().hex[:8]
    names = [f"P{run_tag}-{i}" for i in range(3)]
    try:
        service = make_service(store)
        plan = {"status": "needs_confirmation", "actions": [
            {"type": "create_project", "project": {"name": names[i], "degree_type": "phd"}}
            for i in range(3)
        ]}
        response = service.execute(plan)
        assert response["status"] == "done"
        # Assert only the rows this run created (not the whole table — stale
        # rows from other tests/runs in the shared DB make total counts flaky).
        created = [
            p for p in store.list_records("projects") if p["name"] in names
        ]
        assert len(created) == 3
    finally:
        for name in names:
            try:
                session.execute(
                    text("DELETE FROM projects WHERE name = :n"),
                    {"n": name},
                )
                session.commit()
            except Exception:
                session.rollback()
        session.close()
