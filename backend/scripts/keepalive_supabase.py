"""Run a single trivial query against the configured database.

SCHOLARDOCX-0216: Supabase pauses free-tier projects after ~7 days of low user
database activity. One real query is enough to count as activity, so this
script (and the scheduled GitHub Action doing the same) keeps the project
alive without writing or deleting anything.

Resolves the connection the same way the backend does (root ``.env``
included), so from the repo root::

    python backend/scripts/keepalive_supabase.py

Exit code 0 = the database answered; 1 = it did not (bad env, network, or the
Supabase project is paused and needs a manual "Resume project" in the
dashboard).
"""
import sys
from pathlib import Path

# Add backend to PYTHONPATH so imports work correctly
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv(backend_dir.parent / ".env")

from sqlalchemy import text

from app.core.config import get_settings
from app.db.connection import get_engine


def main() -> None:
    engine = get_engine(get_settings().database_target)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT 1 AS ok, now() AS server_time")
            ).fetchone()
        print(f"Database is awake and answering (server time: {row.server_time}).")
    except Exception as exc:
        print(f"ERROR: could not query the database: {exc}")
        sys.exit(1)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
