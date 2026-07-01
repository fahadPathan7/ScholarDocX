# SCHOLARDOCX-0081: Harden role-based guard enforcement and close auth bypasses

Status: Done

Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-06-26

## Summary

Close the gaps found in the role-based access-control audit: a critical
JWT-signing-secret bypass that defeated every role guard, a cross-user IDOR on
the scholarship bookmarks endpoint, and an unauthenticated leak of the role
limits matrix.

## Business Context

Links:

- Business file: N/A (no product-scope change)

Business value:

- Prevents full super_admin takeover and cross-user data exposure. The prior
  state meant "no way to skip the role guards" was false; this makes it true.

## Functional Context

Links:

- Functional file: N/A

Requirements:

- FR-1: A JWT signed with the committed placeholder secret must NOT
  authenticate, even for a seeded super_admin user id.
- FR-2: A logged-in user must never receive another user's bookmarked news.
- FR-3: `/auth/plans` must require an authenticated session.

## Technical Context

Links:

- Technical file: [AI-Context/technical/security-privacy.md](../../technical/security-privacy.md)
- Technical file: [AI-Context/technical/authentication-and-identity.md](../../technical/authentication-and-identity.md)

Technical notes:

- Removed the committed constant `jwt_secret_key` from `SEED_SQL`.
  `initialize_database()` now generates a per-install random secret
  (`secrets.token_hex(32)`) via `_ensure_jwt_secret()` and rotates any value
  still using the compromised `scholar-docx-local-first...` placeholder.
- Added `get_jwt_secret()` in `app/auth/dependencies.py`; `get_current_user`
  and `login` use it instead of falling back to the constant. A missing or
  compromised secret now raises HTTP 500 (it is always provisioned at startup).
- `GET /news/bookmarks` now uses `get_user_store` so `Store.list_records`
  applies the `user_id` scope (was `get_store`, which left `current_user_id`
  unset and returned every user's rows).
- `GET /auth/plans` now requires `Depends(get_current_user)`.
- `POST /workspace/init` was intentionally NOT admin-guarded: the frontend
  calls it on every app load for logged-in users (`App.tsx`) and guarding it
  would break non-admin sessions; it only re-runs idempotent migrations that
  already execute at startup and per `get_store` call. Tracked as an
  acceptable, low-severity follow-up.

Side effect: rotating the signing secret invalidates all previously issued
tokens, so every existing session is forced to re-login. This is the intended
remediation for a compromised secret.

## Scope

In scope:

- JWT secret hardening (seed, init, read sites).
- Bookmarks IDOR fix.
- `/auth/plans` authentication.
- Regression tests.

Out of scope:

- Admin-guarding `/workspace/init` (would break app load).
- Fixing pre-existing failing tests (`test_plan_requests.py` date logic,
  `test_admin_notifications.py` Python 3.10 syntax, stale root-level test
  files).
- Rotating the seeded super_admin password hash (operational follow-up).

## Acceptance Criteria

- A forged token signed with the placeholder secret returns 401 on a protected
  endpoint.
- The `app_settings.jwt_secret_key` value is non-empty and does not start with
  the compromised prefix.
- Legitimate login tokens still authenticate.
- User B cannot see user A's bookmarks.
- `/auth/plans` returns 401/403 without a token.

## Implementation Plan

- schema.py: drop the constant from the app_settings seed.
- connection.py: `_ensure_jwt_secret()` + call in `initialize_database`.
- dependencies.py: `get_jwt_secret()`; use in `get_current_user`.
- auth.py: use `get_jwt_secret()` in login; guard `/plans`.
- news.py: bookmarks dependency swap.
- tests: add five regression tests.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `test_jwt_secret_is_not_the_committed_constant`
- `test_forged_token_with_committed_constant_is_rejected`
- `test_valid_login_token_still_authenticates`
- `test_news_bookmarks_are_scoped_per_user`
- `test_plans_requires_authentication`

## File Size Check

Files expected to be edited:

- backend/app/db/schema.py
- backend/app/db/connection.py
- backend/app/auth/dependencies.py
- backend/app/api/auth.py
- backend/app/api/news.py
- backend/tests/test_api_auth.py

Line-count risk:

- Low (small, surgical edits)

## Verification Plan

- `pytest tests/test_api_auth.py tests/test_auth_jwt.py` -> 15 passed.
- Full `tests/` run: same 4 pre-existing failures as clean main, +5 new
  passing tests, no new regressions.

## Completion Notes

Changed files:

- backend/app/db/schema.py
- backend/app/db/connection.py
- backend/app/auth/dependencies.py
- backend/app/api/auth.py
- backend/app/api/news.py
- backend/tests/test_api_auth.py
- AI-Context/technical/security-privacy.md
- AI-Context/technical/authentication-and-identity.md

Verification completed:

- Yes (pytest, isolation comparison on clean main).

Unit tests added or updated:

- 5 new tests in tests/test_api_auth.py.

Follow-ups:

- Operationally rotate the seeded `admin@scholardocx.com` password and require
  a first-login change.
- Consider removing the redundant `/workspace/init` re-trigger or making the
  frontend not depend on it for dashboard load, then it can be admin-guarded.
- Fix the pre-existing date-logic failures in `test_plan_requests.py`.
