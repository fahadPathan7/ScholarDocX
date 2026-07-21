#!/usr/bin/env python3
"""Standalone runner for downgrading expired user plans (SCHOLARDOCX-0166).

Runs :func:`downgrade_expired_user_plans` against the configured database so
an operator can trigger a manual run or wire it to a Render Cron Job / other
scheduler without going through the HTTP endpoint.

Usage (from repo root)::

    python scripts/downgrade_expired_users.py

Reads ``DATABASE_URL`` from the environment. Exits 0 on success and prints the
number of downgraded users.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure the backend package is importable when run as a standalone script.
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from dotenv import load_dotenv  # noqa: E402

from app.db.connection import initialize_database  # noqa: E402
from app.db.legacy_db import legacy_session  # noqa: E402
from app.services.plan_expiry import downgrade_expired_user_plans  # noqa: E402
from app.services.store import Store  # noqa: E402
from app.core.config import get_settings  # noqa: E402


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    settings = get_settings()
    database_url = settings.database_target
    if not database_url:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 1

    initialize_database(database_url)

    with legacy_session(database_url) as conn:
        store = Store(conn.db)
        downgraded = downgrade_expired_user_plans(store)
    print(f"Downgraded {downgraded} expired user plan(s) to free_user.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
