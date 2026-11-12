"""Connected apps: access keys, role gate, limits registry (SCHOLARDOCX-0258).

DB-backed tests use per-user rows only (cleaned up in ``finally``) and never
write to shared tables such as ``role_limits`` or ``app_settings``.
"""
import hashlib
import json

import pytest
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.auth.rate_limit import RATE_LIMIT_RULES
from app.db.connection import connect, get_engine
from app.services import connected_apps as apps
from app.services.admin import DEFAULT_ROLE_LIMITS
from tests.helpers import cleanup_user_records, make_settings, make_user


@pytest.fixture
def env(tmp_path):
    settings = make_settings(tmp_path)
    engine = get_engine(settings.database_target)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    created: list[str] = []

    def new_user(roles):
        user = make_user(settings, roles)
        created.append(user["email"])
        return {**user, "token_version": 1}

    yield settings, session, new_user
    session.rollback()
    session.close()
    with connect(settings.database_target) as db:
        for email in created:
            cleanup_user_records(db, email=email)
        db.commit()


# --- pure rules -------------------------------------------------------------

def test_generated_key_is_prefixed_random_and_hashed():
    raw, prefix, key_hash = apps.generate_key()
    assert raw.startswith("sdx_") and len(raw) > 40
    assert prefix == raw[:12]
    assert key_hash == hashlib.sha256(raw.encode()).hexdigest()
    assert apps.generate_key()[0] != raw


def test_role_limit_defaults_follow_the_owner_decision():
    def value(role):
        return dict((f, c) for f, c, _ in DEFAULT_ROLE_LIMITS[role])["can_use_mcp"]

    assert [value(r) for r in ("general_user", "pro_user", "max_user")] == [1, 1, 1]
    # Admins carry no access of their own; free is off.
    assert [value(r) for r in ("general_admin", "super_admin", "free_user")] == [0, 0, 0]


def test_new_rate_limit_rules_are_registered():
    keys = {rule["key"] for rule in RATE_LIMIT_RULES}
    assert {"mcp_call", "mcp_auth_failure", "connected_apps_manage"} <= keys


def test_suggest_allow_list_excludes_destructive_and_bulk_actions():
    allowed = apps.ALLOWED_SUGGEST_ACTIONS
    assert "add_rows" in allowed and "update_row" in allowed
    assert not any(a.startswith("delete_") for a in allowed)
    assert not ({"clear_sheet", "bulk_update_rows", "create_document", "log_outreach"} & allowed)


# --- keys in the database ---------------------------------------------------

def test_create_stores_only_the_hash_and_lists_without_the_key(env):
    _, session, new_user = env
    user = new_user(["pro_user"])
    created, raw = apps.create_app(session, user, "Claude Code", "read", 90)
    row = session.execute(text("SELECT key_hash, key_prefix FROM connected_apps WHERE id = :i"), {"i": created["id"]}).one()
    assert row.key_hash == apps.hash_key(raw) and raw not in json.dumps(row._asdict())
    listed = apps.list_apps(session, user["id"])
    assert [a["name"] for a in listed] == ["Claude Code"] and "key" not in listed[0]


def test_sixth_active_key_is_refused(env):
    _, session, new_user = env
    user = new_user(["pro_user"])
    for i in range(apps.MAX_ACTIVE_APPS):
        apps.create_app(session, user, f"app {i}", "read", 30)
    with pytest.raises(apps.ConnectedAppError) as err:
        apps.create_app(session, user, "one too many", "read", 30)
    assert err.value.status_code == 409


@pytest.mark.parametrize("name,scope,days", [("", "read", 90), ("x" * 61, "read", 90), ("ok", "admin", 90), ("ok", "read", 7)])
def test_create_validates_input(env, name, scope, days):
    _, session, new_user = env
    with pytest.raises(apps.ConnectedAppError) as err:
        apps.create_app(session, new_user(["pro_user"]), name, scope, days)
    assert err.value.status_code == 400


@pytest.mark.parametrize("role", ["general_user", "pro_user", "max_user"])
def test_allowed_plans_authenticate(env, role):
    _, session, new_user = env
    user = new_user([role])
    _, raw = apps.create_app(session, user, "Cursor", "read_suggest", 90)
    principal = apps.authenticate_key(session, raw)
    assert principal.user["id"] == user["id"] and principal.scope == "read_suggest"


@pytest.mark.parametrize("roles", [["free_user"], ["super_admin"], ["general_admin"]])
def test_free_and_admin_only_accounts_are_refused(env, roles):
    _, session, new_user = env
    user = new_user(roles)
    _, raw = apps.create_app(session, user, "x", "read", 30)  # key can exist; use is gated
    with pytest.raises(apps.AuthFailure) as err:
        apps.authenticate_key(session, raw)
    assert err.value.status_code == 403


def test_admin_with_a_paid_user_role_is_allowed(env):
    _, session, new_user = env
    user = new_user(["super_admin", "pro_user"])
    _, raw = apps.create_app(session, user, "x", "read", 30)
    assert apps.authenticate_key(session, raw).user["id"] == user["id"]


@pytest.mark.parametrize("bad", ["", "nope", "sdx_" + "0" * 43, "eyJhbGciOiJIUzI1NiJ9.e30.sig"])
def test_unknown_or_non_key_tokens_are_rejected(env, bad):
    _, session, _ = env
    with pytest.raises(apps.AuthFailure) as err:
        apps.authenticate_key(session, bad)
    assert err.value.status_code == 401


def test_expired_revoked_suspended_and_version_bumped_keys_fail(env):
    _, session, new_user = env
    user = new_user(["pro_user"])
    created, raw = apps.create_app(session, user, "x", "read", 30)

    session.execute(text("UPDATE connected_apps SET expires_at = now() - interval '1 day' WHERE id = :i"), {"i": created["id"]})
    session.commit()
    with pytest.raises(apps.AuthFailure) as err:
        apps.authenticate_key(session, raw)
    assert err.value.status_code == 401
    session.execute(text("UPDATE connected_apps SET expires_at = now() + interval '30 days' WHERE id = :i"), {"i": created["id"]})

    session.execute(text("UPDATE users SET token_version = token_version + 1 WHERE id = :u"), {"u": user["id"]})
    session.commit()
    with pytest.raises(apps.AuthFailure) as err:  # password change / admin reset / revocation
        apps.authenticate_key(session, raw)
    assert err.value.status_code == 401 and "revoked" in err.value.detail
    session.execute(text("UPDATE users SET token_version = token_version - 1 WHERE id = :u"), {"u": user["id"]})

    session.execute(text("UPDATE users SET is_active = 0 WHERE id = :u"), {"u": user["id"]})
    session.commit()
    with pytest.raises(apps.AuthFailure) as err:
        apps.authenticate_key(session, raw)
    assert err.value.status_code == 403
    session.execute(text("UPDATE users SET is_active = 1 WHERE id = :u"), {"u": user["id"]})
    session.commit()

    assert apps.delete_app(session, user["id"], created["id"]) is True  # revoke
    with pytest.raises(apps.AuthFailure):
        apps.authenticate_key(session, raw)


def test_a_user_cannot_revoke_another_users_key(env):
    _, session, new_user = env
    owner, other = new_user(["pro_user"]), new_user(["pro_user"])
    created, raw = apps.create_app(session, owner, "x", "read", 30)
    assert apps.delete_app(session, other["id"], created["id"]) is False
    assert apps.authenticate_key(session, raw).user["id"] == owner["id"]


# --- direct-write permission (read_write) -----------------------------------

def test_direct_write_scope_is_a_known_scope_and_needs_an_acknowledgement(env):
    from pydantic import ValidationError

    from app.api.connected_apps import CreateAppPayload

    assert "read_write" in apps.SCOPES
    with pytest.raises(ValidationError):
        CreateAppPayload(name="x", scope="read_write")  # no acknowledgement
    assert CreateAppPayload(name="x", scope="read_write", acknowledge_direct=True).scope == "read_write"
    assert CreateAppPayload(name="x", scope="read_suggest").acknowledge_direct is False

    _, session, new_user = env
    created, raw = apps.create_app(session, new_user(["pro_user"]), "Direct", "read_write", 30)
    assert created["scope"] == "read_write"
    assert apps.authenticate_key(session, raw).scope == "read_write"
