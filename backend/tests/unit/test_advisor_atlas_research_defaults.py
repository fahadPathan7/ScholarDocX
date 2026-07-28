"""SCHOLARDOCX-0189: Advisor Atlas research defaults (interests, degree
target, intended intake) — an explicit, user-managed profile edited from a
"Research defaults" entry point inside Advisor Atlas itself, stored on the
existing ``local_profiles`` row as ``advisor_profile_json``.

Deliberately unlike the removed Hunt Profile (SCHOLARDOCX-0178): there is no
setup gate before starting a search. There is also no separate per-search
copy of these fields — the search form reads this saved JSON directly at
submit time.
"""
from __future__ import annotations

import json

from sqlalchemy.orm import sessionmaker

from app.db.connection import connect, get_engine
from app.services.store import Store

from tests.helpers import cleanup_user_records, make_settings, make_user


def make_store(tmp_path, user_id):
    settings = make_settings(tmp_path)
    engine = get_engine(settings.database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    return Store(session, user_id), session, settings


def test_advisor_profile_json_round_trips_through_store(tmp_path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    uid = user["id"]
    store, session, _ = make_store(tmp_path, uid)
    try:
        defaults = {
            "interests": ["Human-computer interaction", "Accessibility"],
            "degree_target": "PhD",
            "intake_term": "Fall 2027",
        }
        created = store.create_record(
            "local_profiles",
            {"email": user["email"], "advisor_profile_json": json.dumps(defaults)},
        )
        assert json.loads(created["advisor_profile_json"]) == defaults

        rows = store.list_records("local_profiles")
        assert len(rows) == 1
        assert json.loads(rows[0]["advisor_profile_json"]) == defaults
    finally:
        session.close()
        with connect(settings.database_target) as db:
            cleanup_user_records(db, user_id=uid, email=user["email"])
            db.commit()


def test_local_profiles_defaults_to_empty_json_object(tmp_path):
    """A profile row created without advisor_profile_json (e.g. identity-only
    edits from the existing Profile form) must still read back as valid,
    empty-collection JSON — never null or a parse error."""
    settings = make_settings(tmp_path)
    user = make_user(settings, ["general_user"])
    uid = user["id"]
    store, session, _ = make_store(tmp_path, uid)
    try:
        created = store.create_record(
            "local_profiles", {"email": user["email"], "display_name": "Jane Doe"}
        )
        assert json.loads(created["advisor_profile_json"]) == {}
    finally:
        session.close()
        with connect(settings.database_target) as db:
            cleanup_user_records(db, user_id=uid, email=user["email"])
            db.commit()
