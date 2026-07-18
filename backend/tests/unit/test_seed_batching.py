"""SCHOLARDOCX-0149: tests for the batched DB seeders and the init memo.

Two layers:

1. Pure unit tests (no DB) for ``ensure_db_initialized`` idempotency and the
   thread-safety of the memo flag.
2. DB-backed tests (skipped without DATABASE_URL) that assert the batched
   seeders insert the expected row counts and are idempotent (ON CONFLICT).
"""

from __future__ import annotations

import os
import threading
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()

_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
# Mirror the smoke-test gate: these assertions need a live Postgres instance.
_db_required = pytest.mark.skipif(
    not _DATABASE_URL,
    reason="DATABASE_URL not set; seeder row-count tests need a live DB",
)


# ── ensure_db_initialized memo (pure unit tests, no DB) ──────────────────────


@pytest.fixture
def _reset_init_flag():
    """Save/restore the module-level _db_initialized flag around each test."""
    import app.api.dependencies as deps

    original = deps._db_initialized
    deps._db_initialized = False
    yield
    deps._db_initialized = original


def test_ensure_db_initialized_runs_initialize_once(_reset_init_flag):
    """The memo flag prevents initialize_database from running more than once."""
    import app.api.dependencies as deps

    settings = SimpleNamespace(database_target="postgresql://stub")
    with patch.object(deps, "initialize_database") as mock_init, \
         patch.object(deps, "ensure_workspace") as mock_ws:
        deps.ensure_db_initialized(settings)
        deps.ensure_db_initialized(settings)
        deps.ensure_db_initialized(settings)

    assert mock_init.call_count == 1
    assert mock_ws.call_count == 1


def test_ensure_db_initialized_skips_when_already_set(_reset_init_flag):
    """If the flag is already True (boot ran init), neither helper runs."""
    import app.api.dependencies as deps

    deps._db_initialized = True
    with patch.object(deps, "initialize_database") as mock_init, \
         patch.object(deps, "ensure_workspace") as mock_ws:
        deps.ensure_db_initialized(SimpleNamespace(database_target="postgresql://stub"))

    mock_init.assert_not_called()
    mock_ws.assert_not_called()


def test_init_flag_is_thread_safe(_reset_init_flag):
    """A concurrent cold-start burst must not run initialize_database twice.

    Two threads race past the fast-path check and block on _db_init_lock. The
    second one to acquire the lock must observe the flag set by the first and
    bail out before running DDL. We patch the module attr once (before thread
    start) so both threads share the same mock and we count its calls.
    """
    import app.api.dependencies as deps

    settings = SimpleNamespace(database_target="postgresql://stub")
    barrier = threading.Barrier(2)

    with patch.object(deps, "initialize_database") as mock_init, \
         patch.object(deps, "ensure_workspace"):
        def _worker():
            barrier.wait()
            deps.ensure_db_initialized(settings)

        threads = [threading.Thread(target=_worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    # Exactly one thread won the lock and ran init.
    assert mock_init.call_count == 1, (
        f"initialize_database ran {mock_init.call_count} times under contention"
    )
    assert deps._db_initialized is True


# ── Batched seeders (DB-backed) ──────────────────────────────────────────────


@_db_required
def test_seed_role_limits_inserts_all_rows(tmp_path):
    """_seed_role_limits seeds every (role, feature) tuple in DEFAULT_ROLE_LIMITS."""
    from app.db.connection import get_engine, _seed_role_limits
    from app.services.admin import DEFAULT_ROLE_LIMITS

    expected = sum(len(features) for features in DEFAULT_ROLE_LIMITS.values())

    engine = get_engine(_DATABASE_URL)
    with engine.begin() as conn:
        _seed_role_limits(conn)
        actual = conn.execute(text("SELECT COUNT(*) FROM role_limits")).scalar()

    assert actual >= expected


@_db_required
def test_seed_ai_token_defaults_inserts_all_rows(tmp_path):
    """_seed_ai_token_defaults seeds every provider model plus the 4 token packs."""
    from app.db.connection import get_engine, _seed_ai_token_defaults
    from app.services.ai import (
        DEFAULT_GEMINI_MODELS,
        DEFAULT_GLM_MODELS,
        DEFAULT_GROQ_MODELS,
        DEFAULT_MISTRAL_MODELS,
    )

    expected_models = (
        len(DEFAULT_GLM_MODELS)
        + len(DEFAULT_GEMINI_MODELS)
        + len(DEFAULT_GROQ_MODELS)
        + len(DEFAULT_MISTRAL_MODELS)
        + 1  # the single "openrouter" entry
    )

    engine = get_engine(_DATABASE_URL)
    with engine.begin() as conn:
        _seed_ai_token_defaults(conn)
        models = conn.execute(text("SELECT COUNT(*) FROM ai_models")).scalar()
        packs = conn.execute(text("SELECT COUNT(*) FROM ai_token_packs")).scalar()

    assert models >= expected_models
    assert packs >= 4  # small, medium, large, extra_large


@_db_required
def test_seed_role_limits_is_idempotent(tmp_path):
    """Running _seed_role_limits twice does not add rows (ON CONFLICT DO NOTHING)."""
    from app.db.connection import get_engine, _seed_role_limits

    engine = get_engine(_DATABASE_URL)
    with engine.begin() as conn:
        _seed_role_limits(conn)
        before = conn.execute(text("SELECT COUNT(*) FROM role_limits")).scalar()
        _seed_role_limits(conn)
        after = conn.execute(text("SELECT COUNT(*) FROM role_limits")).scalar()

    assert before == after


@_db_required
def test_seed_ai_token_defaults_is_idempotent(tmp_path):
    """Running _seed_ai_token_defaults twice does not add rows."""
    from app.db.connection import get_engine, _seed_ai_token_defaults

    engine = get_engine(_DATABASE_URL)
    with engine.begin() as conn:
        _seed_ai_token_defaults(conn)
        models_before = conn.execute(text("SELECT COUNT(*) FROM ai_models")).scalar()
        packs_before = conn.execute(text("SELECT COUNT(*) FROM ai_token_packs")).scalar()
        _seed_ai_token_defaults(conn)
        models_after = conn.execute(text("SELECT COUNT(*) FROM ai_models")).scalar()
        packs_after = conn.execute(text("SELECT COUNT(*) FROM ai_token_packs")).scalar()

    assert models_before == models_after
    assert packs_before == packs_after
