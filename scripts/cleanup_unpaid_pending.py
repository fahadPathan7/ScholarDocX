#!/usr/bin/env python3
"""Standalone runner for the pending-account cleanup (SCHOLARDOCX-0162).

Runs :func:`purge_expired_pending_accounts` against the configured database so
an operator can trigger a manual purge or wire it to a Render Cron Job / other
scheduler without going through the HTTP endpoint.

Usage (from repo root)::

    python scripts/cleanup_unpaid_pending.py

Reads ``DATABASE_URL`` from the environment, exactly like the app boot path.
Exits 0 on success and prints the number of deleted accounts. Exits non-zero
if the database is unreachable.
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
from app.services.registration_cleanup import (  # noqa: E402
    DEFAULT_PENDING_TTL_HOURS,
    purge_expired_pending_accounts,
)
from app.services.store import Store  # noqa: E402
from app.core.config import get_settings  # noqa: E402


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    settings = get_settings()
    database_url = settings.database_target
    if not database_url:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 1

    # Make sure the schema (including the pending_payment_since column) exists.
    initialize_database(database_url)

    with legacy_session(database_url) as conn:
        store = Store(conn)  # type: ignore[arg-type]
        deleted = purge_expired_pending_accounts(
            store, older_than_hours=DEFAULT_PENDING_TTL_HOURS
        )
    print(f"Deleted {deleted} unpaid pending account(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
