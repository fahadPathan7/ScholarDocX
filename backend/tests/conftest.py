from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


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

