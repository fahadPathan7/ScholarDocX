"""Central in-memory rate limiting for ScholarDocX.

Single source of truth for every request-rate limit in the app. Replaces the
inline ``defaultdict(list)`` implementations that used to live in
``app/api/auth.py`` and extends coverage to expensive endpoints
(AI chat/research, scholarship deep hunt, advisor atlas, news search, ...).

Design notes:

- Buckets are in-memory (``dict[str, list[float]]``) keyed by ``(rule_key,
  identity)``. Identity is normally the client IP for unauthenticated endpoints
  and the user id for authenticated ones. This is intentionally not shared
  across processes — the app is a local-first single-process deployment.
- All mutating ops take a module-level :class:`threading.Lock` because FastAPI
  runs sync handlers on a threadpool, so two requests can race.
- :meth:`RateLimiter.check` only *tests* the limit (does not consume a slot);
  :meth:`RateLimiter.record` appends an attempt; and
  :meth:`RateLimiter.check_and_record` does both atomically for endpoints that
  want to count every hit.

Rule registry
-------------

Every limit is declared once in :data:`RATE_LIMIT_RULES`. The registry is also
the data source for the admin ``GET /admin/info/rate-limits`` endpoint, so it
serves as both enforcement config and human-readable catalog.
"""

from __future__ import annotations

import threading
import time
from typing import Any

from fastapi import HTTPException, Request


def _human_window(seconds: int) -> str:
    """Render a window length in seconds as a friendly label."""
    if seconds >= 3600 and seconds % 3600 == 0:
        hours = seconds // 3600
        return f"{hours} hour{'s' if hours != 1 else ''}"
    if seconds >= 60 and seconds % 60 == 0:
        minutes = seconds // 60
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    return f"{seconds} second{'s' if seconds != 1 else ''}"


# Each rule describes one throttled endpoint.
#   key            — stable identifier used in code (`check_and_record(key, ...)`)
#   label          — human-readable endpoint name for the Info tab
#   description    — one-line summary of what the endpoint does (Info tab)
#   method         — HTTP method
#   path           — route path (without the /api prefix)
#   max_requests   — how many attempts are allowed within the window
#   window_seconds — sliding window length in seconds
#   scope          — "ip" (unauthenticated) or "user" (authenticated)
#   message        — 429 detail string (kept in sync with prior wording for
#                    the four original auth limits)
RATE_LIMIT_RULES: list[dict[str, Any]] = [
    {
        "key": "auth_login",
        "label": "Login",
        "description": "Authenticate a user with email and password to obtain a session token.",
        "method": "POST",
        "path": "/auth/login",
        "max_requests": 5,
        "window_seconds": 300,
        "scope": "ip",
        "message": "Too many login attempts. Please try again later.",
    },
    {
        "key": "auth_register",
        "label": "Register",
        "description": "Create a new user account using an invite code.",
        "method": "POST",
        "path": "/auth/register",
        "max_requests": 5,
        "window_seconds": 300,
        "scope": "ip",
        "message": "Too many registration attempts. Please try again later.",
    },
    {
        "key": "auth_invite_request",
        "label": "Invite Request",
        "description": "Request an invite code to register on the platform.",
        "method": "POST",
        "path": "/auth/invite-request",
        "max_requests": 1,
        "window_seconds": 86400,
        "scope": "ip",
        "message": "You can only request one invite code every 24 hours. Please try again later.",
    },
    {
        # forgot-password never raises 429 (returns a generic 200 to avoid
        # email enumeration); the rule still exists so it is counted and
        # surfaced in the Info tab. Enforce it via check()/record(), not
        # check_and_record().
        "key": "auth_forgot_password",
        "label": "Forgot Password",
        "description": "Submit a password-reset request for an email (admin-reviewed).",
        "method": "POST",
        "path": "/auth/forgot-password",
        "max_requests": 1,
        "window_seconds": 3600,
        "scope": "ip",
        "message": "Too many password reset attempts. Please try again later.",
    },
    {
        "key": "auth_contact_admin",
        "label": "Contact Admin / Suspension Appeal",
        "description": "Send a message or suspension appeal to the administrator.",
        "method": "POST",
        "path": "/auth/contact-admin",
        "max_requests": 3,
        "window_seconds": 1800,
        "scope": "ip",
        "message": "Too many messages submitted. Please try again later.",
    },
    {
        "key": "ai_chat",
        "label": "AI Chat",
        "description": "Send a message to an AI model and get a response (metered by tokens).",
        "method": "POST",
        "path": "/ai/chat",
        "max_requests": 20,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many AI chat requests. Please slow down.",
    },
    {
        "key": "ai_research",
        "label": "AI Research",
        "description": "Run an AI research query with optional web-search augmentation.",
        "method": "POST",
        "path": "/ai/research",
        "max_requests": 10,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many AI research requests. Please slow down.",
    },
    {
        "key": "ai_summarize",
        "label": "AI Summarize",
        "description": "Generate an AI summary of a block of text.",
        "method": "POST",
        "path": "/ai/summarize",
        "max_requests": 10,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many summarize requests. Please slow down.",
    },
    {
        "key": "scholarship_deep_hunt_run",
        "label": "Scholarship Deep Hunt — Start Run",
        "description": "Kick off a background scholarship deep-hunt run (search, crawl, extract).",
        "method": "POST",
        "path": "/scholarship-deep-hunt/runs",
        "max_requests": 5,
        "window_seconds": 600,
        "scope": "user",
        "message": "Too many deep hunt runs. Please wait before starting another.",
    },
    {
        "key": "advisor_atlas_run",
        "label": "Advisor Atlas — Start Run",
        "description": "Start an Advisor Atlas background run to discover and research professors.",
        "method": "POST",
        "path": "/advisor-atlas/runs",
        "max_requests": 5,
        "window_seconds": 600,
        "scope": "user",
        "message": "Too many advisor atlas runs. Please wait before starting another.",
    },
    {
        "key": "news_search",
        "label": "Scholarship News — Search",
        "description": "Run a confirmed Tavily scholarship-news search against the approved query.",
        "method": "POST",
        "path": "/news/search",
        "max_requests": 10,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many news searches. Please slow down.",
    },
    {
        "key": "news_query_preview",
        "label": "Scholarship News — Query Preview",
        "description": "Generate a preview search query (AI-built) before running a news search.",
        "method": "POST",
        "path": "/news/query-preview",
        "max_requests": 20,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many query preview requests. Please slow down.",
    },
    {
        # AI action planner: same cost class as /ai/chat (one model round-trip
        # producing a structured plan). Mirrors the chat budget.
        "key": "ai_action_plan",
        "label": "AI Action — Plan",
        "description": "Ask the AI to propose a structured action plan for a task.",
        "method": "POST",
        "path": "/ai/actions/plan",
        "max_requests": 20,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many AI action plan requests. Please slow down.",
    },
    {
        # AI action execute carries out every step of a plan and can issue many
        # writes/AI calls per request, so it gets a tighter budget than plan.
        "key": "ai_action_execute",
        "label": "AI Action — Execute",
        "description": "Execute the steps of an approved AI action plan.",
        "method": "POST",
        "path": "/ai/actions/execute",
        "max_requests": 10,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many AI action execute requests. Please slow down.",
    },
    {
        # Opportunity analyze runs AI extraction (scholarship_extraction) plus a
        # possible fetch; grouped with the other expensive AI calls.
        "key": "scholarship_analyze",
        "label": "Scholarship Opportunity — Analyze",
        "description": "Extract structured scholarship details from a source via AI.",
        "method": "POST",
        "path": "/scholarship-opportunities/analyze",
        "max_requests": 10,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many analyze requests. Please slow down.",
    },
    {
        # Candidate refresh re-runs the Advisor Atlas research pipeline for one
        # professor (AI + search). Same cadence as a run start.
        "key": "advisor_atlas_candidate_refresh",
        "label": "Advisor Atlas — Refresh Candidate",
        "description": "Re-run research for a single saved professor candidate (AI + search).",
        "method": "POST",
        "path": "/advisor-atlas/candidates/{candidate_id}/refresh",
        "max_requests": 5,
        "window_seconds": 600,
        "scope": "user",
        "message": "Too many candidate refreshes. Please wait before retrying.",
    },
    {
        # Catalog cycle check performs one Tavily search per call.
        "key": "scholarship_catalog_check_cycle",
        "label": "Scholarship Catalog — Check Cycle",
        "description": "Check the current application cycle of a catalog scholarship via search.",
        "method": "POST",
        "path": "/scholarship-catalog/{catalog_id}/check-cycle",
        "max_requests": 10,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many cycle-check requests. Please slow down.",
    },
    {
        # File upload writes to disk and charges the byte quota. Moderate budget
        # lets normal bulk imports through while capping runaway loops.
        "key": "files_upload",
        "label": "File Upload",
        "description": "Upload a document file to local storage (metered by byte quota).",
        "method": "POST",
        "path": "/files/upload",
        "max_requests": 30,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many file uploads. Please slow down.",
    },
    {
        # Password change: like login, record only on a *failed* current-password
        # check so brute-forcing the current password is throttled but legit
        # changes are never blocked. Mirrors the login lockout.
        "key": "auth_password_change",
        "label": "Change Password",
        "description": "Change the current user's password after verifying the old one.",
        "method": "POST",
        "path": "/auth/me/password",
        "max_requests": 5,
        "window_seconds": 300,
        "scope": "user",
        "message": "Too many password change attempts. Please try again later.",
    },
    {
        "key": "research_paper_upload",
        "label": "Research Expert — Paper Upload",
        "description": "Upload a PDF research paper, extract text, and generate vector embeddings.",
        "method": "POST",
        "path": "/research/papers/upload",
        "max_requests": 10,
        "window_seconds": 300,
        "scope": "user",
        "message": "Too many paper upload requests. Please wait a few minutes.",
    },
    {
        "key": "research_paper_analyze",
        "label": "Research Expert — Paper Analyze",
        "description": "Run AI analysis on a research paper using vector similarity search.",
        "method": "POST",
        "path": "/research/papers/{paper_id}/analyze",
        "max_requests": 15,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many paper analysis requests. Please slow down.",
    },
    {
        "key": "research_paper_save_analysis",
        "label": "Research Expert — Save Analysis",
        "description": "Persist an analysis output for later review (max 10 per paper).",
        "method": "POST",
        "path": "/research/papers/{paper_id}/analyses",
        "max_requests": 30,
        "window_seconds": 60,
        "scope": "user",
        "message": "Too many save requests. Please slow down.",
    },
    {
        "key": "research_paper_retry",
        "label": "Research Expert — Paper Retry",
        "description": "Retry processing and vector re-indexing for a research paper in error state.",
        "method": "POST",
        "path": "/research/papers/{paper_id}/retry",
        "max_requests": 10,
        "window_seconds": 300,
        "scope": "user",
        "message": "Too many paper retry requests. Please wait a few minutes.",
    },
]

# Quick lookup by key. Raising on a missing key surfaces programmer error
# immediately rather than silently allowing the request through.
_RULES_BY_KEY: dict[str, dict[str, Any]] = {r["key"]: r for r in RATE_LIMIT_RULES}


class RateLimiter:
    """Thread-safe in-memory sliding-window rate limiter."""

    def __init__(self) -> None:
        # (rule_key, identity) -> list of attempt timestamps
        self._buckets: dict[tuple[str, str], list[float]] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ helpers
    def _prune(self, key: str, identity: str, window: int, now: float) -> list[float]:
        """Drop expired timestamps for a bucket and return the survivors."""
        bucket = self._buckets.get((key, identity))
        if not bucket:
            return []
        survivors = [ts for ts in bucket if now - ts < window]
        self._buckets[(key, identity)] = survivors
        return survivors

    # ------------------------------------------------------------------- public
    def check(self, key: str, identity: str) -> None:
        """Raise ``HTTPException(429)`` if ``identity`` is at/over the limit.

        Does *not* record an attempt — pair with :meth:`record` when you want
        to count only certain outcomes (e.g. failed logins), or use
        :meth:`check_and_record` for the common "count every hit" case.
        """
        rule = _RULES_BY_KEY.get(key)
        if rule is None:
            raise KeyError(f"Unknown rate-limit rule: {key!r}")
        with self._lock:
            survivors = self._prune(key, identity, rule["window_seconds"], time.time())
            if len(survivors) >= rule["max_requests"]:
                raise HTTPException(status_code=429, detail=rule["message"])

    def record(self, key: str, identity: str) -> None:
        """Append an attempt timestamp for ``identity`` under ``key``."""
        if key not in _RULES_BY_KEY:
            raise KeyError(f"Unknown rate-limit rule: {key!r}")
        now = time.time()
        with self._lock:
            bucket = self._buckets.setdefault((key, identity), [])
            bucket.append(now)

    def check_and_record(self, key: str, identity: str) -> None:
        """Atomically check the limit and then record an attempt.

        Use this for endpoints that should count every incoming request
        (register, contact-admin, AI, hunt, atlas, news, ...). For endpoints
        that should count only failures, call :meth:`check` up front and
        :meth:`record` on the failure branch.
        """
        rule = _RULES_BY_KEY.get(key)
        if rule is None:
            raise KeyError(f"Unknown rate-limit rule: {key!r}")
        now = time.time()
        with self._lock:
            survivors = self._prune(key, identity, rule["window_seconds"], now)
            if len(survivors) >= rule["max_requests"]:
                raise HTTPException(status_code=429, detail=rule["message"])
            survivors.append(now)
            self._buckets[(key, identity)] = survivors

    def catalog(self) -> list[dict[str, Any]]:
        """Return the rule registry for the admin Info tab (read-only view)."""
        result: list[dict[str, Any]] = []
        for rule in RATE_LIMIT_RULES:
            window_s = rule["window_seconds"]
            result.append(
                {
                    "rule_key": rule["key"],
                    "label": rule["label"],
                    "description": rule["description"],
                    "method": rule["method"],
                    "path": rule["path"],
                    "max_requests": rule["max_requests"],
                    "window_seconds": window_s,
                    "window_label": _human_window(window_s),
                    "scope": rule["scope"],
                }
            )
        return result

    def clear_attempts(self, key: str, identity: str) -> None:
        """Clear all attempts for a specific key and identity."""
        with self._lock:
            self._buckets.pop((key, identity), None)

    # ----------------------------------------------------------- test convenience
    def reset(self) -> None:
        """Clear all buckets. Intended for unit tests only."""
        with self._lock:
            self._buckets.clear()


def client_ip_from_request(request: Request) -> str:
    """Extract the client IP from a Starlette request, with a safe fallback."""
    return request.client.host if request.client else "unknown"


def user_identity(user: dict | None) -> str:
    """Stable identity string for an authenticated user (for user-scoped limits)."""
    if not user:
        return "anonymous"
    return f"user:{user.get('id', 'unknown')}"


# Module-level singleton imported across the app.
rate_limiter = RateLimiter()
