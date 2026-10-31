from pathlib import Path
import sys

import pytest
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# SCHOLARDOCX-0139: load the repo-root .env so DATABASE_URL (and Supabase
# Storage keys) are available to every test, including unit tests that build
# Settings directly via make_settings. WARNING: most tests CREATE and DELETE
# users/projects/rows, so they mutate whatever DATABASE_URL points at.
#
# SCHOLARDOCX-0209: prefer a dedicated test database so the suite never
# touches the production/Supabase DATABASE_URL. If .env.test exists (a local,
# gitignored file — copy .env.test.example), it is loaded with override=True
# so its DATABASE_URL wins over the prod value from .env. The canonical
# throwaway DB is brought up by `make test-db-start` (docker-compose.test.yml,
# Postgres + pgvector on port 5433). If .env.test is absent, behavior is
# unchanged: the suite uses .env's DATABASE_URL as before.
load_dotenv(ROOT.parent / ".env")
TEST_ENV = ROOT.parent / ".env.test"
if TEST_ENV.exists():
    load_dotenv(TEST_ENV, override=True)


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Clear in-memory rate-limit buckets before each test.

    The rate limiter (app.auth.rate_limit.rate_limiter) is a module-level
    singleton keyed by IP / user id. Many tests hit the auth endpoints from the
    same 127.0.0.1 client, so without a reset the sliding-window counters
    accumulate across tests and falsely trip the 5-attempt-per-5-min login /
    register limits. This fixture keeps each test isolated.
    """
    from app.auth.rate_limit import rate_limiter

    rate_limiter.reset()
    yield
    rate_limiter.reset()


# ---------------------------------------------------------------------------
# Test-data isolation
#
# All tests share the same Postgres DATABASE_URL (Supabase).  To prevent test
# rows from leaking into the live database we run a two-layer sweep:
#
#  1. Function-scope fixture (_cleanup_after_test) — runs after EVERY test.
#     Deletes rows whose user_id IS NULL (the pattern that leaked 61 orphaned
#     projects today) and any remaining test-email users.
#
#  2. Session-scope fixture (cleanup_test_users) — runs once at session start
#     and once at session end as a belt-and-suspenders safety net.
# ---------------------------------------------------------------------------

# Tables that can accumulate NULL user_id orphans from tests that insert rows
# without a real user row (e.g. create_record called with no user in context).
# Order matters: children before parents to satisfy FK constraints.
# SCHOLARDOCX-0150: added the record-domain tables (document_versions,
# applications, professors, programs, universities) — previously missing, so
# stale rows from test_ai_actions_records.py accumulated across runs and made
# count/[0]-index assertions flake on the shared Supabase DB.
_NULLABLE_USER_TABLES = [
    "notifications",
    "project_pages",
    "project_sheets",
    "projects",
    "sticky_notes",
    "static_files",
    "whiteboards",
    "document_versions",  # child of documents/applications
    "documents",
    "scholarship_deep_hunt_runs",
    "advisor_atlas_runs",
    "saved_scholarship_queries",
    "scholarship_opportunities",
    "bookmarked_news",
    "outreach_logs",  # references email_drafts, applications, professors
    "email_drafts",   # references email_templates, applications, professors
    "email_templates",
    "research_notes",  # references applications, professors, universities
    "reminders",       # references applications, outreach_logs
    "deadlines",       # references applications
    "applications",    # references universities, programs, professors
    "professors",      # references universities, programs
    "programs",        # references universities
    "universities",
]

# Test-email patterns whose users (and all their FK-cascading rows) should be
# purged after every test.
_TEST_EMAIL_PATTERNS = [
    "%@test.local",
    "%@example.com",
    "%@localhost",
]


def _do_cleanup(db):
    """Delete all test-generated data from the shared Postgres DB.

    Receives an open ``legacy_session`` connection.  Idempotent — safe to
    call multiple times.
    """
    from tests.helpers import cleanup_user_records

    # Ensure we start from a clean transaction state.
    try:
        db.rollback()
    except Exception:
        pass

    # 1. Delete NULL-user_id orphan rows in dependency order.
    for table in _NULLABLE_USER_TABLES:
        try:
            db.execute(f'DELETE FROM "{table}" WHERE user_id IS NULL')
            db.commit()
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass

    # 2. Delete test-email users and all their referenced rows.
    all_ids: list[str] = []
    for pattern in _TEST_EMAIL_PATTERNS:
        try:
            rows = db.execute(
                "SELECT id FROM users WHERE email LIKE ?", (pattern,)
            ).fetchall()
            all_ids.extend(str(r["id"]) for r in rows)
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass

    for uid in all_ids:
        try:
            cleanup_user_records(db, user_id=uid)
            db.commit()
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass

    # 3. Remove orphaned invite codes left by IDOR / auth tests.
    try:
        db.execute(
            "DELETE FROM invite_codes WHERE code LIKE 'INVITE_IDOR_%' "
            "OR code LIKE 'TEST_%'"
        )
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


@pytest.fixture(autouse=True)
def _cleanup_after_test():
    """Wipe test data after every test so nothing leaks to the live DB."""
    yield  # run the test first
    try:
        from app.core.config import Settings
        from app.db.connection import connect

        settings = Settings()
        with connect(settings.database_target) as db:
            _do_cleanup(db)
    except Exception as exc:
        import sys
        print(f"\n[_cleanup_after_test] Warning: post-test cleanup failed: {exc}", file=sys.stderr)


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_users():
    """Belt-and-suspenders session-level sweep.

    Runs once before the session (in case a previous run crashed before
    cleanup) and once after (catches anything the per-test fixture missed).
    """
    from app.core.config import Settings
    from app.db.connection import connect

    settings = Settings()

    def do_cleanup():
        try:
            with connect(settings.database_target) as db:
                _do_cleanup(db)
        except Exception as exc:
            import sys
            print(f"\n[cleanup_test_users] Warning: session cleanup failed: {exc}", file=sys.stderr)

    do_cleanup()
    yield
    do_cleanup()


