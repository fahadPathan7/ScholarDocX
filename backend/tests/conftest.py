from pathlib import Path
import sys

import pytest
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# SCHOLARDOCX-0139: load the repo-root .env so DATABASE_URL (and Supabase
# Storage keys) are available to every test, including unit tests that build
# Settings directly via make_settings. WARNING: most tests CREATE and DELETE
# users/projects/rows, so they mutate whatever DATABASE_URL points at. Do not
# point this at a production database — use a separate dev/test Supabase
# project or a local Postgres instance for the test run.
load_dotenv(ROOT.parent / ".env")


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

