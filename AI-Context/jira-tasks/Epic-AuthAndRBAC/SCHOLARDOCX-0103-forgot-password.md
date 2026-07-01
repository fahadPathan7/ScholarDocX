# SCHOLARDOCX-0103: Forgot Password (admin-mediated reset)

Status: Done

Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-06-29

## Summary

Add a forgot-password flow: users submit their email from the login page, the
request lands in a new "Forget Pass Requests" admin tab, and an admin sets a new
password (or dismisses) for that user. The request endpoint never reveals whether
an email is registered and silently enforces max-1-pending-per-user and
1-request-per-IP-per-hour limits.

## Business Context

Links:

- [feature-authentication.md](../../functional/feature-authentication.md)
- [security-privacy.md](../../technical/security-privacy.md)

Business value:

- Users who forget their password have a recovery path without remote email
  infrastructure, consistent with the existing admin-mediated invite/appeal flows.

## Functional Context

Links:

- [feature-authentication.md](../../functional/feature-authentication.md)
- [acceptance-criteria.md](../../functional/acceptance-criteria.md)

Requirements:

- FR-6.15: Login page offers a "Forgot password?" entry that collects only the
  user's email and submits an admin-mediated reset request.
- FR-6.16: The request endpoint returns the same generic success message
  regardless of whether the email is registered or whether a request was created
  (no user enumeration).
- FR-6.17: At most one pending reset request exists per user; additional
  submissions are silently ignored.
- FR-6.18: Reset requests are rate-limited to one per client IP per hour.
- FR-6.19: A "Forget Pass Requests" admin tab lists pending/complete requests;
  an admin may set a new password for the user (resolving the request and
  invalidating prior sessions) or dismiss the request.

## Technical Context

Links:

- [authentication-and-identity.md](../../technical/authentication-and-identity.md)
- [data-model-draft.md](../../technical/data-model-draft.md)
- [api-boundaries.md](../../technical/api-boundaries.md)

Technical notes:

- New `password_reset_requests` table (email, user_id FK, status, ip_address,
  reviewed_by, reviewed_at, timestamps). Created automatically via
  `Base.metadata.create_all`.
- New admin permission `admin_manage_password_resets` registered in schema.py
  SEED_SQL, connection.py `admin_permission_defaults` + `canonical_features`
  set, and services/admin.py defaults dict.
- `POST /auth/forgot-password` (unauthenticated) always returns HTTP 200 with an
  identical message; rate limits are enforced by not creating a row.
- Admin endpoints `GET /admin/password-reset-requests` and
  `POST /admin/password-reset-requests/{id}/resolve` (set_password | dismiss).
- Setting a password increments the user's `token_version` (revokes sessions).
- Per-IP limit is in-memory (`defaultdict`), matching existing limiter style.

## Scope

In scope:

- Backend model, permission seeds, request endpoint, admin endpoints + service.
- Frontend login sub-form, new admin tab, AdminView wiring.
- Backend + frontend tests.

Out of scope:

- Email/SMS delivery of reset links (admin-mediated only).
- Splitting `AdminView.tsx` (pre-existing size debt).

## Acceptance Criteria

- Forgot-password returns identical generic message for registered and
  unregistered emails.
- Max 1 pending request per user; a 2nd submission creates no new row.
- 2nd submission from same IP within 1h creates no new row.
- Admin "Set password" updates the password, marks Completed, and invalidates
  prior sessions (token_version bump).
- Admin "Dismiss" marks Dismissed without changing the password.
- New admin tab is permission-gated and accepts `refreshTrigger`.

## Implementation Plan

- Backend: `db/models.py`, `db/schema.py`, `db/connection.py` (2 spots),
  `services/admin.py` (seed + 2 methods), `api/auth.py` (endpoint), `api/admin.py`
  (2 endpoints).
- Frontend: `components/LoginPage.tsx`, new `components/admin/PasswordResetRequestsTab.tsx`,
  `components/AdminView.tsx`.

## Unit Test Plan

- Backend: no-enumeration, max-1-pending, IP rate limit, admin resolve
  (password set + token_version, dismiss, permission gate). — DONE, 10 tests in
  `backend/tests/test_forgot_password.py`, all passing.
- Frontend: the mandatory `refreshTrigger` test is DEFERRED. Reason recorded: the
  frontend project currently ships with no test runner (no vitest/jest, zero
  existing test files), so the rule cannot be satisfied without first adding
  test infrastructure — a project-level decision that should not be introduced
  unilaterally mid-feature. The component implements `refreshTrigger` correctly
  (`useEffect(..., [refreshTrigger])`). Follow-up: adopt vitest + React Testing
  Library, then add the tab test.

## File Size Check

- `AdminView.tsx` already ~2200 lines (pre-existing debt over the 1150 limit);
  only ~5 lines added; new logic lives in its own `PasswordResetRequestsTab.tsx`.
- `services/admin.py` is ~900 lines after adding two cohesive methods — within
  the temporary grace limit.

## Verification Plan

- Backend pytest (DONE: 195 pass incl. 10 new; 2 pre-existing Advisor Atlas
  failures unrelated to this feature).
- Fresh-DB migration verified (DONE): table created, permission seeded for both
  admin roles, survives re-migration (not purged by `canonical_features`).
- Frontend `npx tsc -b --noEmit` (DONE: clean).
- Manual end-to-end: login forgot-password (same message for known/unknown
  email); admin tab set-password (old sessions invalidated) + dismiss; IP rate
  limit creates no 2nd row.

## Completion Notes

Changed files:

- `backend/app/db/models.py` — new `PasswordResetRequests` model.
- `backend/app/db/schema.py`, `backend/app/db/connection.py` (seed list +
  `canonical_features`), `backend/app/services/admin.py` (defaults dict) — new
  `admin_manage_password_resets` permission registered in all required spots.
- `backend/app/api/auth.py` — `POST /auth/forgot-password` (always-200 generic
  message; silent max-1-pending + 1/IP/hr limits).
- `backend/app/api/admin.py`, `backend/app/services/admin.py` —
  `GET /admin/password-reset-requests` + `POST .../resolve` (set_password |
  dismiss) with `token_version` bump on reset.
- `backend/app/services/admin.py` `get_dashboard_stats` — added
  `pending_password_resets` to `/admin/dashboard` counts so the admin dashboard
  can surface pending requests (highlightable "Needs Action" card that jumps to
  the tab), matching how Invite Requests are focused.
- `frontend/src/components/AdminView.tsx` `DashboardTab` — added a highlightable
  "Forget Pass Requests" stat card (pending count + "Needs Action" navigation).
- `frontend/src/components/LoginPage.tsx` — "Forgot password?" sub-form.
- `frontend/src/components/admin/PasswordResetRequestsTab.tsx` — new tab
  (accepts `refreshTrigger`, set-password modal, dismiss).
- `frontend/src/components/AdminView.tsx` — tab wiring.
- Context: functional + technical docs updated (see links above).
- `backend/tests/test_forgot_password.py` — 10 backend tests.

Follow-ups:

- Adopt a frontend test runner (vitest + RTL), then add the mandatory tab
  `refreshTrigger` test (currently deferred — reason recorded above).
- 2 pre-existing `test_advisor_atlas_limits.py` failures are unrelated to this
  task and should be addressed separately.
