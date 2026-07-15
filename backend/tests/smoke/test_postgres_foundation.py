"""SCHOLARDOCX-0139: Postgres foundation smoke test.

Verifies the migrated plumbing layer — engine creation, schema creation, and
seeding — works end-to-end against the configured Postgres DATABASE_URL. This
is deliberately isolated from the main test suite (which still needs raw-SQL
SQLite->Postgres param conversion). Run it on its own:

    DATABASE_URL=postgresql://... pytest tests/smoke/test_postgres_foundation.py -v

Skipped automatically when DATABASE_URL is not set.
"""

from __future__ import annotations

import os

import pytest
from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="DATABASE_URL not set; Postgres foundation test requires a live DB",
)


def test_engine_connects():
    """The SQLAlchemy engine can reach the configured Postgres instance."""
    from app.db.connection import get_engine

    engine = get_engine(DATABASE_URL)
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version()")).fetchone()
    assert version is not None
    assert "postgres" in version[0].lower()


def test_initialize_database_creates_tables():
    """create_all builds the full schema (spot-check a few tables)."""
    from app.db.connection import get_engine, initialize_database

    initialize_database(DATABASE_URL)
    engine = get_engine(DATABASE_URL)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name IN "
                "('users', 'app_settings', 'role_limits', 'degree_workspaces', 'ai_models') "
                "ORDER BY table_name"
            )
        ).fetchall()
    table_names = {r[0] for r in rows}
    assert {"users", "app_settings", "role_limits", "degree_workspaces", "ai_models"} <= table_names


def test_seed_inserts_defaults():
    """SEED_SQL populated degree_workspaces, role_limits, app_settings, admin user."""
    from app.db.connection import get_engine

    engine = get_engine(DATABASE_URL)
    with engine.connect() as conn:
        degree_count = conn.execute(text("SELECT COUNT(*) FROM degree_workspaces")).fetchone()[0]
        role_count = conn.execute(text("SELECT COUNT(*) FROM role_limits")).fetchone()[0]
        admin = conn.execute(
            text("SELECT email FROM users WHERE email = 'admin@scholardocx.com'")
        ).fetchone()
        setting = conn.execute(
            text("SELECT value FROM app_settings WHERE key = 'jwt_expiration_days'")
        ).fetchone()
    assert degree_count >= 3  # bachelors, masters, phd
    assert role_count >= 50  # many role/feature combinations seeded
    assert admin is not None
    assert setting is not None and setting[0] == "30"


def test_jwt_secret_provisioned():
    """initialize_database provisioned a non-placeholder JWT signing secret."""
    from app.db.connection import get_engine, COMPROMISED_JWT_SECRET_PREFIX

    engine = get_engine(DATABASE_URL)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT value FROM app_settings WHERE key = 'jwt_secret_key'")
        ).fetchone()
    assert row is not None
    assert row[0].strip() != ""
    assert not row[0].startswith(COMPROMISED_JWT_SECRET_PREFIX)


def test_ai_models_and_packs_seeded():
    """The Postgres seed helpers populated ai_models and ai_token_packs."""
    from app.db.connection import get_engine

    engine = get_engine(DATABASE_URL)
    with engine.connect() as conn:
        models = conn.execute(text("SELECT COUNT(*) FROM ai_models")).fetchone()[0]
        packs = conn.execute(text("SELECT COUNT(*) FROM ai_token_packs")).fetchone()[0]
    assert models >= 10  # provider model lists
    assert packs >= 4  # small, medium, large, extra_large
