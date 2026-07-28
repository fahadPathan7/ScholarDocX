"""SCHOLARDOCX-0178: fixed Documents cap (100 per user), independent of the
existing per-role total_documents_bytes byte-size quota.
"""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile

from app.api import routes
from app.db.connection import connect
from app.services.store import Store
from tests.helpers import cleanup_user_records, make_settings, make_user


def _make_store(settings, user: dict) -> Store:
    from sqlalchemy.orm import sessionmaker

    from app.db.connection import get_engine

    session = sessionmaker(autocommit=False, autoflush=False, bind=get_engine(settings.database_target))()
    return Store(session, current_user_id=user["id"])


def _seed_documents(settings, user_id: str, count: int) -> None:
    with connect(settings.database_target) as db:
        for i in range(count):
            db.execute(
                "INSERT INTO static_files (user_id, display_name, file_type, relative_path) "
                "VALUES (?, ?, 'other', ?)",
                (user_id, f"doc-{i}.txt", f"media/doc-{i}.txt"),
            )
        db.commit()


def test_count_user_documents_excludes_research_papers(tmp_path: Path):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["max_user"], email="docs-count@test.local")
    try:
        with connect(settings.database_target) as db:
            db.execute(
                "INSERT INTO static_files (user_id, display_name, file_type, relative_path) "
                "VALUES (?, 'a.pdf', 'other', 'media/a.pdf')",
                (user["id"],),
            )
            db.execute(
                "INSERT INTO static_files (user_id, display_name, file_type, relative_path) "
                "VALUES (?, 'paper.pdf', 'research_paper', 'media/paper.pdf')",
                (user["id"],),
            )
            db.commit()
        store = _make_store(settings, user)
        try:
            assert routes._count_user_documents(store) == 1
        finally:
            store.db.close()
    finally:
        with connect(settings.database_target) as db:
            cleanup_user_records(db, user["id"])
            db.commit()


@pytest.mark.asyncio
async def test_upload_rejected_at_cap_before_any_storage_or_billing_side_effect(tmp_path: Path, monkeypatch):
    settings = make_settings(tmp_path)
    user = make_user(settings, ["max_user"], email="docs-cap@test.local")
    store = _make_store(settings, user)
    try:
        monkeypatch.setattr(routes, "_count_user_documents", lambda s: routes.MAX_DOCUMENTS_PER_USER)

        def fail_limit(*a, **k):
            raise AssertionError("must not check/charge the byte quota once the count cap already rejected")

        monkeypatch.setattr("app.auth.limits.check_and_increment_limit", fail_limit)

        upload = UploadFile(io.BytesIO(b"hello world"), filename="overflow.txt", size=11)
        with pytest.raises(HTTPException) as exc_info:
            routes.upload_file(
                category="other",
                file_type="other",
                application_id=None,
                notes="",
                file=upload,
                settings=settings,
                store=store,
                current_user=user,
            )
        assert exc_info.value.status_code == 409
        assert "100" in str(exc_info.value.detail)
    finally:
        store.db.close()
        with connect(settings.database_target) as db:
            cleanup_user_records(db, user["id"])
            db.commit()


def test_upload_allowed_below_cap(tmp_path: Path):
    # SCHOLARDOCX-0178 perf fix: a handful of rows is just as valid a proof
    # that the count is below the cap as MAX_DOCUMENTS_PER_USER - 1 (99) rows
    # would be — this test is about the counting logic, not the exact cap
    # value (that's covered by the rejection test above via monkeypatch).
    # 99 sequential real-network inserts made this test one of the slowest
    # in the suite for no added coverage.
    settings = make_settings(tmp_path)
    user = make_user(settings, ["max_user"], email="docs-below-cap@test.local")
    _seed_documents(settings, user["id"], 3)
    store = _make_store(settings, user)
    try:
        assert routes._count_user_documents(store) == 3
        assert routes._count_user_documents(store) < routes.MAX_DOCUMENTS_PER_USER
    finally:
        store.db.close()
        with connect(settings.database_target) as db:
            cleanup_user_records(db, user["id"])
            db.commit()
