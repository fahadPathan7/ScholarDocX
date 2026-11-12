"""Connected apps: suggestions lifecycle (SCHOLARDOCX-0258).

A suggestion is stored server-side and confirmed by id. Per-user rows only.
"""
import json

import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.db.connection import connect, get_engine
from app.services import connected_apps as apps
from app.services.ai_actions import AiActionService
from app.services.store import Store
from tests.helpers import cleanup_user_records, make_settings, make_user


@pytest.fixture
def env(tmp_path):
    settings = make_settings(tmp_path)
    session = sessionmaker(autocommit=False, autoflush=False, bind=get_engine(settings.database_target))()
    emails: list[str] = []

    def new_user(roles=("pro_user",)):
        user = make_user(settings, list(roles))
        emails.append(user["email"])
        return {**user, "token_version": 1}

    yield settings, session, new_user
    session.rollback()
    session.close()
    with connect(settings.database_target) as db:
        for email in emails:
            cleanup_user_records(db, email=email)
        db.commit()


def _principal(session, user, scope="read_suggest"):
    created, _ = apps.create_app(session, user, "Claude Code", scope, 30)
    return apps.Principal(user=user, app_id=created["id"], app_name="Claude Code", scope=scope)


def _plan(name="Suggested Project"):
    return {
        "status": "needs_confirmation",
        "message": "Create a project",
        "missing": [],
        "actions": [{"type": "create_project", "project": {"name": name}}],
        "summary": [f"Create project {name}"],
        "auto_execute": False,
    }


def _service(settings, session, user):
    return AiActionService(settings, Store(session, user["id"]))


def test_create_then_list_shows_the_app_and_readable_actions(env):
    _, session, new_user = env
    user = new_user()
    principal = _principal(session, user)
    apps.create_suggestion(session, principal, "Create a project", _plan())
    [item] = apps.list_suggestions(session, user["id"], "pending")
    assert item["app_name"] == "Claude Code" and item["actions"] == ["Create project Suggested Project"]


def test_confirm_runs_the_stored_plan_once(env):
    settings, session, new_user = env
    user = new_user()
    sid = apps.create_suggestion(session, _principal(session, user), "x", _plan("Only Once"))["id"]
    result = apps.confirm_suggestion(session, _service(settings, session, user), user, sid)
    assert result["status"] == "confirmed"
    names = [r[0] for r in session.execute(text("SELECT name FROM projects WHERE user_id = :u"), {"u": user["id"]}).all()]
    assert names.count("Only Once") == 1
    with pytest.raises(apps.ConnectedAppError) as err:  # a double click
        apps.confirm_suggestion(session, _service(settings, session, user), user, sid)
    assert err.value.status_code == 409
    names = [r[0] for r in session.execute(text("SELECT name FROM projects WHERE user_id = :u"), {"u": user["id"]}).all()]
    assert names.count("Only Once") == 1


def test_dismiss_removes_it_and_blocks_confirm(env):
    settings, session, new_user = env
    user = new_user()
    sid = apps.create_suggestion(session, _principal(session, user), "x", _plan())["id"]
    apps.dismiss_suggestion(session, user["id"], sid)
    assert apps.list_suggestions(session, user["id"], "pending") == []
    with pytest.raises(apps.ConnectedAppError):
        apps.confirm_suggestion(session, _service(settings, session, user), user, sid)


def test_expired_suggestions_cannot_be_confirmed(env):
    settings, session, new_user = env
    user = new_user()
    sid = apps.create_suggestion(session, _principal(session, user), "x", _plan())["id"]
    session.execute(text("UPDATE connected_app_suggestions SET expires_at = now() - interval '1 hour' WHERE id = :i"), {"i": sid})
    session.commit()
    with pytest.raises(apps.ConnectedAppError) as err:
        apps.confirm_suggestion(session, _service(settings, session, user), user, sid)
    assert err.value.status_code == 409
    assert apps.list_suggestions(session, user["id"], "expired")


def test_another_user_cannot_confirm_or_dismiss(env):
    settings, session, new_user = env
    owner, other = new_user(), new_user()
    sid = apps.create_suggestion(session, _principal(session, owner), "x", _plan())["id"]
    with pytest.raises(apps.ConnectedAppError):
        apps.confirm_suggestion(session, _service(settings, session, other), other, sid)
    with pytest.raises(apps.ConnectedAppError):
        apps.dismiss_suggestion(session, other["id"], sid)
    assert len(apps.list_suggestions(session, owner["id"], "pending")) == 1
    assert apps.list_suggestions(session, other["id"]) == []


def test_twenty_first_pending_suggestion_is_refused(env):
    _, session, new_user = env
    user = new_user()
    principal = _principal(session, user)
    for i in range(apps.MAX_PENDING_SUGGESTIONS):
        apps.create_suggestion(session, principal, f"s{i}", _plan(f"P{i}"))
    with pytest.raises(apps.ConnectedAppError) as err:
        apps.create_suggestion(session, principal, "one too many", _plan())
    assert err.value.status_code == 409


def test_failed_execution_is_recorded_and_reported(env):
    settings, session, new_user = env
    user = new_user()
    bad = _plan()
    bad["actions"] = [{"type": "update_row", "project_name": "No Such Project", "sheet_name": "No Sheet",
                       "row_index": 0, "updates": {"Status": "x"}}]
    sid = apps.create_suggestion(session, _principal(session, user), "x", bad)["id"]
    with pytest.raises(apps.ConnectedAppError) as err:
        apps.confirm_suggestion(session, _service(settings, session, user), user, sid)
    assert err.value.status_code == 400
    [failed] = apps.list_suggestions(session, user["id"], "failed")
    assert failed["result_message"]


def test_decided_history_is_bounded_newest_evicts_oldest(env, monkeypatch):
    _, session, new_user = env
    user = new_user()
    principal = _principal(session, user)
    monkeypatch.setattr(apps, "MAX_DECIDED_HISTORY", 3)
    for i in range(5):
        sid = apps.create_suggestion(session, principal, f"s{i}", _plan(f"P{i}"))["id"]
        apps.dismiss_suggestion(session, user["id"], sid)
    apps.create_suggestion(session, principal, "trigger", _plan())
    decided = session.execute(
        text("SELECT count(*) FROM connected_app_suggestions WHERE user_id = :u AND status <> 'pending'"), {"u": user["id"]}
    ).scalar_one()
    assert decided == 3


def test_stored_plan_cannot_be_altered_by_the_client(env):
    """Confirm takes only an id; the plan that runs is the one stored."""
    settings, session, new_user = env
    user = new_user()
    sid = apps.create_suggestion(session, _principal(session, user), "x", _plan("Stored Plan"))["id"]
    stored = json.loads(session.execute(text("SELECT plan_json FROM connected_app_suggestions WHERE id = :i"), {"i": sid}).scalar_one())
    assert stored["actions"][0]["project"]["name"] == "Stored Plan"
    import inspect
    assert list(inspect.signature(apps.confirm_suggestion).parameters) == ["session", "service", "user", "suggestion_id"]
