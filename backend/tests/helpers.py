"""Shared test helpers for the backend suite.

Historically, helpers like ``make_settings`` and ``make_user`` were copy-pasted
into many test files, and ``test_openrouter_cost.py`` imported them from
``test_ai_tokens`` via a bare ``from test_ai_tokens import ...``. That bare
import breaks once test files move into category subfolders
(``unit/``, ``regression/``, ``smoke/``), because cross-folder module imports
require the source to be on ``sys.path`` as a package.

This module centralizes those helpers so any test can import them with
``from tests.helpers import ...`` regardless of which subfolder it lives in.

Only the helpers needed by more than one file are extracted here; per-file
helpers stay where they are.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.db.connection import connect, initialize_database


def make_settings(tmp_path: Path) -> Settings:
    """Build a Settings pointing at an ephemeral workspace under ``tmp_path``
    and initialize its database. Returns the configured Settings."""
    settings = Settings()
    settings.workspace_path = tmp_path / "workspace"
    settings.database_path = settings.workspace_path / "db" / "app.db"
    settings.media_path = settings.workspace_path / "media"
    initialize_database(settings.database_path)
    return settings


def make_user(settings: Settings, roles: list, email: str = None) -> dict[str, Any]:
    """Insert a user row and return a minimal user dict for auth/token code."""
    with connect(settings.database_path) as db:
        cur = db.execute(
            "INSERT INTO users (email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (?, 'x', 'Test', ?, 1, 0)",
            (email or f"{roles[0]}-{roles[-1]}@test.local", json.dumps(roles)),
        )
        db.commit()
        uid = cur.lastrowid
    return {"id": uid, "roles": roles}


def set_model_price(settings: Settings, model_id: str, input_price: float, output_price: float) -> None:
    with connect(settings.database_path) as db:
        db.execute(
            "UPDATE ai_models SET input_price_per_1m = ?, output_price_per_1m = ? WHERE model_id = ?",
            (input_price, output_price, model_id),
        )
        db.commit()


def get_balance(settings: Settings, uid: int) -> dict[str, Any]:
    with connect(settings.database_path) as db:
        return dict(db.execute(
            "SELECT * FROM ai_token_balances WHERE user_id = ?", (uid,)
        ).fetchone())


def ledger_rows(settings: Settings, uid: int) -> list[dict[str, Any]]:
    with connect(settings.database_path) as db:
        return [dict(r) for r in db.execute(
            "SELECT * FROM ai_token_ledger WHERE user_id = ? ORDER BY id", (uid,)
        ).fetchall()]
