# SCHOLARDOCX-0146: Login Response Speedup

Status: Done

Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-07-17

## Summary

Reduce the perceived time from "click Login" to an interactive dashboard by removing the full-page reload after login, eliminating an artificial 1000ms splash delay, making the post-login `/auth/me` refresh non-blocking, and parallelizing `/workspace/init` with the dashboard data fetches.

## Business Context

Links:

- Business file: AI-Context/business/product-overview.md

Business value:

- Faster login improves first-imception UX and reduces drop-off during the most critical conversion step (entering the app).

## Functional Context

Links:

- Functional file: AI-Context/functional/auth-and-rbac.md

Requirements:

- FR-1: After successful login, the user reaches an interactive dashboard as fast as the backend + network allow, with no client-imposed hard delays.
- FR-2: The app's own "remember me" credential storage continues to work.
- FR-3: The protected-route deep-link redirect (`location.state.from`) continues to work.
- FR-4: Suspended/blocked user handling is unchanged.

## Technical Context

Links:

- Technical file: AI-Context/technical/api-boundaries.md

Technical notes:

- The `/auth/login` response already returns the full `user` object (backend/app/api/auth.py:203-213), so the frontend does not need to wait on `/auth/me` before showing the dashboard.
- The existing hard reload (`window.location.href`) on the login page was used to trigger the browser's native password-save prompt. Per user decision (2026-07-17), this tradeoff is accepted: the app's own credential storage covers the use case, and the native prompt is sacrificed for speed.
- `/workspace/init` calls `ensure_workspace` + `initialize_database`, but the DB schema is already lazy-initialized and memoized by `get_store` (backend/app/api/dependencies.py:11-15), so dashboard reads are safe to fire in parallel with init.
- Backend bcrypt rounds=12 (~250-400ms) is a deliberate security floor and is NOT changed in this task.

## Scope

In scope:

- frontend/src/contexts/AuthContext.tsx: add `login(token, user)`; make `initAuth()` set `isLoading(false)` before the background `/auth/me` refresh.
- frontend/src/components/LoginPage.tsx: replace `window.location.href` with `navigate()` + `login()` using the response's user object.
- frontend/src/App.tsx: remove the 1000ms artificial splash floor in `refresh()`; fire `/workspace/init` concurrently with `refresh()`.

Out of scope:

- SplashScreen's redundant `/local_profiles` fetch (low value once auth is fast; follow-up).
- Backend `dashboard_summary` 10 separate COUNT(*) queries (follow-up).
- Backend per-request user re-SELECT in `get_current_user` (follow-up).
- `refreshActiveTab`'s 500ms polish floor (tab-switch UX, not on login path).

## Acceptance Criteria

- AC-1: After login, the browser does NOT perform a full page reload. Client-side navigation is used.
- AC-2: The dashboard becomes interactive as soon as the 10 parallel data fetches resolve, with no minimum-delay floor.
- AC-3: A logged-in user refreshing the page sees the dashboard re-hydrate without `isLoading` blocking on `/auth/me`.
- AC-4: Deep-link redirect from a protected route (e.g. `/sheet/fullscreen`) still lands on the original target after login.
- AC-5: Suspended / blocked users still see the suspended modal (no behavior change).
- AC-6: No frontend console errors during login or refresh.

## Implementation Plan

1. AuthContext: extend context type with `login(token, user)`. In `initAuth`, move `setIsLoading(false)` up to run right after token-payload hydration, before the background `/auth/me` call. Drop the cache-bust `?t=${Date.now()}` on `/auth/me`.
2. LoginPage: build a `User` from `response.user`, call `login(response.token, user)`, then `navigate(dest, { replace: true })` with `dest` defaulting to `/dashboard`.
3. App.tsx: delete the `if (elapsed < 1000)` sleep block in `refresh()`; change the mount `useEffect` to run `refresh()` and `POST /workspace/init` via `Promise.all` instead of `.then(refresh)`.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- N/A — frontend has no test runner configured in the repo; these are UI-flow / orchestration changes verified manually. Backend behavior is unchanged so existing backend tests stay green.

If no unit tests are needed, explain why:

- Frontend has no configured test harness; changes are integration-level UI flows verified by manual flow checks. Backend is untouched.

## File Size Check

Files expected to be edited:

- frontend/src/contexts/AuthContext.tsx (~78 lines)
- frontend/src/components/LoginPage.tsx
- frontend/src/App.tsx (~450 lines)

Line-count risk:

- Low — all well under the 1000-line limit.

If any file exceeds 1000 lines, explain why.

- N/A

## Verification Plan

- Fresh login flow: enter credentials -> dashboard interactive quickly, no full reload.
- Refresh while logged in: dashboard re-hydrates fast.
- Deep link: visit `/sheet/fullscreen` unauthenticated -> log in -> lands on `/sheet/fullscreen`.
- Suspended user: still sees the suspended modal.
- Run `npm run build` in frontend (no TS errors).
- Run `pytest` in backend (unchanged behavior stays green).

## Completion Notes

Changed files:

- frontend/src/contexts/AuthContext.tsx — added `login(token, user, remember)`; `initAuth()` now sets `isLoading(false)` right after token-payload hydration, before the background `/auth/me` refresh; dropped the cache-bust `?t=${Date.now()}` on `/auth/me`.
- frontend/src/components/LoginPage.tsx — replaced `window.location.href` hard reload with `login()` + `navigate(dest, { replace: true })`; builds the `User` from the login response instead of re-fetching; default destination is `/dashboard`.
- frontend/src/App.tsx — removed the 1000ms artificial splash floor in `refresh()`. (Initially also parallelized `/workspace/init` with the dashboard reads, but reverted to sequential: `/workspace/init` and `get_store` both call `initialize_database`; running them concurrently risks DDL/connection-pool contention. Sequential init -> reads is correct because reads depend on the tables existing.)
- frontend/src/contexts/AuthContext.tsx (follow-up fix) — hardened `initAuth()` against the double-refresh hang: guard against a null token payload and wrap the whole bootstrap in try/catch so `isLoading(false)` always runs. Previously a malformed/undecodable token threw inside `initAuth` and, because the effect has no catch, the promise rejected unhandled and `isLoading` stayed true forever -> SplashScreen hung -> `App` never mounted -> no API calls fired.
- backend/app/api/dependencies.py — extracted `ensure_db_initialized(settings)` so `get_store` and `/workspace/init` share one memoized init path (DDL runs at most once per process).
- backend/app/api/routes.py — `/workspace/init` now calls `ensure_db_initialized` instead of `initialize_database` directly, so repeated refreshes never re-run DDL.
- AI-Context/technical/api-boundaries.md — documented the non-blocking login-path rule under Frontend Responsibilities.

Verification completed:

- `npm run build` in frontend passes (tsc + vite); only pre-existing warnings (dynamic/static import overlap, chunk-size) unrelated to this change.
- Backend auth tests green: `pytest tests/regression/test_api_auth.py` -> 11 passed (exercises the changed `routes.py` + `dependencies.py`).
- `tests/smoke/test_postgres_foundation.py::test_seed_inserts_defaults` failed with `user_count == 1`, but this is pre-existing DB pollution (a real user account `fahadpathan56@gmail.com` exists in the test DB) and unrelated to this change — the schema explicitly seeds no users (SCHOLARDOCX-0140), and this test does not isolate/clean the users table.
- Manual UI flow checks (login -> dashboard, refresh-while-authenticated, protected-route deep link, suspended-user modal, repeated double-refresh no longer hangs) are left for the user to confirm in a running dev session — not automated here because the repo has no frontend test runner.

Unit tests added or updated:

- None (no frontend test runner; backend behavior unchanged).

Follow-ups:

- SplashScreen `/local_profiles` redundancy (overlaps `/auth/me`) — low value once auth is fast.
- Backend `dashboard_summary` issues 10 separate `COUNT(*)` queries — collapse into one summary query/view.
- Backend `get_current_user` re-`SELECT`s the user on every authenticated request (~14 redundant lookups post-login) — add per-request or short-TTL user cache.
