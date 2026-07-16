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
import uuid

from app.core.config import Settings
from app.db.connection import connect, initialize_database


def make_settings(tmp_path: Path) -> Settings:
    """Build a Settings pointing at an ephemeral workspace under ``tmp_path``
    and initialize its Postgres database. Returns the configured Settings."""
    settings = Settings()
    # SCHOLARDOCX-0139: tests use the Postgres DATABASE_URL from the environment.
    # The workspace/media paths are still tmp-scoped for file isolation.
    settings.workspace_path = tmp_path / "workspace"
    settings.media_path = tmp_path / "workspace" / "media"
    initialize_database(settings.database_target)
    return settings


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def cleanup_user_records(connection, user_id: str | None = None, email: str | None = None) -> None:
    """Delete a test user and rows that directly reference it.

    The Postgres test target is shared between runs, so fixed UUID fixtures must
    be idempotent. Production FKs intentionally do not cascade user deletion;
    tests clean their own rows explicitly.
    """
    user_ids: set[str] = set()
    if user_id:
        user_ids.add(user_id)
    if email:
        rows = connection.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchall()
        user_ids.update(str(row["id"]) for row in rows)

    refs = connection.execute(
        """
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.constraint_schema = tc.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.constraint_schema = tc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_schema = 'public'
          AND ccu.table_name = 'users'
          AND kcu.table_schema = 'public'
        ORDER BY kcu.table_name, kcu.column_name
        """
    ).fetchall()

    for uid in user_ids:
        for ref in refs:
            table = str(ref["table_name"])
            column = str(ref["column_name"])
            if table == "users":
                continue
            if table == "invite_codes" and column == "created_by":
                # Invite codes belong to the fixture admin, while other test
                # users can retain them through registered_with_invite_id.
                # Break that second-level reference before removing the codes.
                connection.execute(
                    "UPDATE users SET registered_with_invite_id = NULL "
                    "WHERE registered_with_invite_id IN "
                    "(SELECT id FROM invite_codes WHERE created_by = ?)",
                    (uid,),
                )
            connection.execute(
                f"DELETE FROM {_quote_ident(table)} WHERE {_quote_ident(column)} = ?",
                (uid,),
            )
        connection.execute("DELETE FROM users WHERE id = ?", (uid,))

    if email:
        connection.execute("DELETE FROM users WHERE email = ?", (email,))


def make_user(settings: Settings, roles: list, email: str = None) -> dict[str, Any]:
    """Insert a user row and return a minimal user dict for auth/token code."""
    user_email = email or f"{roles[0]}-{roles[-1]}-{uuid.uuid4().hex[:8]}@test.local"
    with connect(settings.database_target) as db:
        cleanup_user_records(db, email=user_email)
        cur = db.execute(
            "INSERT INTO users (email, password_hash, display_name, roles, is_active, is_blocked) "
            "VALUES (?, 'x', 'Test', ?, 1, 0)",
            (user_email, json.dumps(roles)),
        )
        db.commit()
        uid = cur.lastrowid
    return {"id": uid, "roles": roles}


def set_model_price(settings: Settings, model_id: str, input_price: float, output_price: float) -> None:
    with connect(settings.database_target) as db:
        db.execute(
            "UPDATE ai_models SET input_price_per_1m = ?, output_price_per_1m = ? WHERE model_id = ?",
            (input_price, output_price, model_id),
        )
        db.commit()


def get_balance(settings: Settings, uid: str) -> dict[str, Any]:
    with connect(settings.database_target) as db:
        return dict(db.execute(
            "SELECT * FROM ai_token_balances WHERE user_id = ?", (uid,)
        ).fetchone())


def ledger_rows(settings: Settings, uid: str) -> list[dict[str, Any]]:
    with connect(settings.database_target) as db:
        return [dict(r) for r in db.execute(
            "SELECT * FROM ai_token_ledger WHERE user_id = ? ORDER BY id", (uid,)
        ).fetchall()]
