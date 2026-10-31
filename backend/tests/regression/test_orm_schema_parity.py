"""SCHOLARDOCX-0211: ORM models must stay queryable against real databases.

Regression: commit b95ff60 (Polar integration) copy-pasted
``polar_product_id`` onto the ``DocumentCategories`` and ``AiModels`` models.
``Base.metadata.create_all`` never alters existing tables and no ``_add_*``
migration added the column, so against any database created before that
commit every ORM SELECT on those tables failed with UndefinedColumn. The
user-visible symptom was a 500 on ``POST /files/upload`` —
``routes.upload_file`` calls ``Store.ensure_document_category`` (an ORM
select on ``document_categories``) before the file is even saved.

These tests pin the two invariants that were broken:

1. Every ORM model column exists in the configured database (parity).
2. The exact column sets of the two fixed tables stay as migrated — adding
   a model column requires an ``_add_*`` migration in
   ``app/db/connection.py`` so pre-existing databases keep up.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import text

from app.db.connection import get_engine
from app.db.models import Base
from tests.helpers import cleanup_user_records, make_settings, make_user

# Column sets guaranteed by create_all + the _add_* migrations for databases
# that predate the Polar integration. If a feature genuinely needs a new
# column on either table, update this snapshot AND add an idempotent
# ``_add_*_column`` helper to initialize_database so existing databases get it.
DOCUMENT_CATEGORIES_COLUMNS = {
    "id",
    "user_id",
    "slug",
    "display_name",
    "sort_order",
    "created_at",
    "updated_at",
}
AI_MODELS_COLUMNS = {
    "id",
    "provider",
    "model_id",
    "display_name",
    "input_price_per_1m",
    "output_price_per_1m",
    "is_active",
    "sort_order",
    "created_at",
    "updated_at",
}


def test_document_categories_columns_match_migrated_schema():
    from app.db.models import AiModels, DocumentCategories

    assert set(DocumentCategories.__table__.columns.keys()) == DOCUMENT_CATEGORIES_COLUMNS
    assert set(AiModels.__table__.columns.keys()) == AI_MODELS_COLUMNS


def test_every_model_column_exists_in_configured_database(tmp_path: Path):
    """No ORM model may declare a column the configured database lacks.

    Catches the create_all-vs-migration drift class in general: a model
    column that no migration adds works on fresh databases but 500s on every
    pre-existing one (how SCHOLARDOCX-0211 shipped).
    """
    settings = make_settings(tmp_path)
    engine = get_engine(settings.database_target)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT table_name, column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public'"
                )
            ).fetchall()
    finally:
        engine.dispose()

    live: dict[str, set[str]] = {}
    for table_name, column_name in rows:
        live.setdefault(table_name, set()).add(column_name)

    drift: list[str] = []
    for table in Base.metadata.tables.values():
        db_columns = live.get(table.name)
        if db_columns is None:
            drift.append(f"{table.name}: table missing from database")
            continue
        missing = set(table.columns.keys()) - db_columns
        if missing:
            drift.append(
                f"{table.name}: model declares columns absent from the database: "
                f"{sorted(missing)} — add an _add_* migration in "
                f"app/db/connection.py or drop them from the model"
            )
    assert not drift, "ORM/DB schema drift:\n" + "\n".join(drift)


def test_ensure_document_category_queries_without_undefined_column(tmp_path: Path):
    """The exact call path that 500'd on /files/upload (SCHOLARDOCX-0211)."""
    from sqlalchemy.orm import sessionmaker

    from app.db.connection import connect
    from app.services.store import Store

    settings = make_settings(tmp_path)
    user = make_user(settings, ["free_user"], email="orm-parity@test.local")
    session = sessionmaker(autocommit=False, autoflush=False, bind=get_engine(settings.database_target))()
    store = Store(session, current_user_id=user["id"])
    try:
        row = store.ensure_document_category("other")
        assert row["slug"] == "other"
    finally:
        store.db.close()
        with connect(settings.database_target) as db:
            cleanup_user_records(db, user["id"])
            db.commit()
