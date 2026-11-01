"""Per-user TTL cache for external search results (SCHOLARDOCX-0220).

Purpose: stop re-paying Brave/Tavily for identical queries within a short
window — chiefly Deep Hunt re-runs of a saved watchlist query and repeated
Ask-AI research questions.

Billing rule (see AI-Context/technical/billing-contract.md): a cached result
is NOT a provider call, so it must NOT be charged. The charge stays at the
call site that talks to the provider; callers use cache_get/cache_put around
that call and skip their charge when the cache hit made the provider call
unnecessary.

Design notes:
- In-process dict keyed by an opaque string the caller builds (include the
  user id, service name, normalized query, and any result-shaping params).
  Never share entries across users — both for privacy comfort and because
  billing fairness is per user.
- Bounded: MAX_ENTRIES, evicting expired entries first, then oldest inserted
  (insertion-order FIFO via dict ordering). No external dependencies.
- Single-process semantics (Render free tier runs one worker). Safe under the
  asyncio loop; not locked for threads (the app is async single-threaded).
"""
from __future__ import annotations

import time
from typing import Any, Optional

CACHE_TTL_SECONDS = 15 * 60  # 15 minutes
MAX_ENTRIES = 256

_cache: dict[str, tuple[float, Any]] = {}


def make_key(*parts: Any) -> str:
    """Build a cache key from the given parts (user id, service, query, params).

    Parts are stringified and joined with a separator that cannot appear in a
    normalized query's parts list separator; query strings themselves are the
    caller's responsibility to normalize (strip/casefold) before passing.
    """
    return "\x1f".join(str(p) for p in parts)


def cache_get(key: str) -> Optional[Any]:
    """Return the cached value for `key`, or None when absent/expired.

    Expired entries are dropped on read (lazy expiry) — no background sweep.
    """
    entry = _cache.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if expires_at <= time.monotonic():
        _cache.pop(key, None)
        return None
    return value


def cache_put(key: str, value: Any, ttl_seconds: float = CACHE_TTL_SECONDS) -> None:
    """Store `value` under `key` for `ttl_seconds` (default 15 minutes).

    Evicts expired entries first; if still at capacity, drops the
    oldest-inserted entry.
    """
    now = time.monotonic()
    if len(_cache) >= MAX_ENTRIES:
        expired = [k for k, (exp, _v) in _cache.items() if exp <= now]
        for k in expired:
            _cache.pop(k, None)
        while len(_cache) >= MAX_ENTRIES:
            _cache.pop(next(iter(_cache)), None)
    _cache[key] = (now + ttl_seconds, value)


def clear_cache() -> None:
    """Test helper: drop everything."""
    _cache.clear()
