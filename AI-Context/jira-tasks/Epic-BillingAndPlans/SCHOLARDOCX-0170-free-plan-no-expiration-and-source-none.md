# SCHOLARDOCX-0170: Free Plans Must Not Carry an Expiration Date; Plan Source Is "none"

Status: Completed

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-23

## Summary

Free plans (`free_user` role) are subscription-free and therefore never expire. Today several admin paths (role update, user creation, plan-request resolution) still set a `plan_ends_at` for free plans, and the `plan_source` derivation marks them `admin_set`. This task ensures free plans only ever carry a `plan_started_at` (no end date) and always derive `plan_source = "none"` ("not subscribed"), across the admin Users tab, user creation, and plan-request approval flows.

## Business Context

Links:
- Business file: [AI-Context/business/business-overview.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/business/business-overview.md)

Business value:
- Free plans have no billing cycle, so an expiration date is misleading and can cause the daily cron (`SCHOLARDOCX-0166`) and runtime fallback to churn free users unnecessarily.
- Showing `plan_source = none` ("not subscribed") for free plans reflects reality and keeps the admin plan-source filter meaningful.

## Functional Context

Links:
- Functional file: [AI-Context/functional/user-roles-permissions.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/user-roles-permissions.md)

Requirements:
- FR-1: When an admin sets a user's tier to `free_user`, `plan_ends_at` must be `NULL`; only `plan_started_at` is recorded.
- FR-2: When an admin creates a user with the `free_user` role, `plan_ends_at` must be `NULL`.
- FR-3: When a plan request resolves to `free_user`, `plan_ends_at` must be `NULL`.
- FR-4: `plan_source` must resolve to `none` for any row whose `roles` contains `free_user`, regardless of `signup_method` or a stale `plan_ends_at`.
- FR-5: The admin UI must hide plan-duration / custom-date controls when `free_user` is the selected tier.

## Technical Context

Links:
- Technical file: `backend/app/services/admin.py`, `frontend/src/components/admin/UsersTab.tsx`

Technical notes:
- Free plan is identified by `"free_user"` in the `users.roles` JSON array (no dedicated `status`/`source` column).
- `plan_source` is derived at read time in `AdminService.list_users()`, not persisted.
- `plan_expiry.py` only downgrades paid tiers, so free rows with stray end dates are harmless today — but eliminating those end dates removes the ambiguity entirely.

## Scope

In scope:
- `backend/app/services/admin.py`: `update_user_roles`, `create_user`, `resolve_plan_request`, `plan_source` derivation.
- `frontend/src/components/admin/UsersTab.tsx`: edit-roles modal, create-user modal, `handleSaveRoles`, `handleCreateUser`, `getPlanSource`.
- `backend/tests/unit/test_api_admin.py`: update/add tests.

Out of scope:
- Invite-code registration (`auth.py`) and Google sign-up (`auth_google.py`) — already set `plan_ends_at = NULL` for free users.
- Polar webhook revoke path (`webhooks.py`) — `plan_ends_at = now` is a cancellation boundary, not an admin free-plan assignment.

## Acceptance Criteria

- [x] Admin setting a user to `free_user` results in `plan_ends_at = NULL`, `plan_started_at` set.
- [x] Admin creating a `free_user` results in `plan_ends_at = NULL`.
- [x] Plan request resolving to `free_user` results in `plan_ends_at = NULL`.
- [x] `plan_source` is `none` for any `free_user` row.
- [x] Admin UI hides Duration / Custom controls when `free_user` is selected.
- [x] Paid tiers (`general_user`/`pro_user`/`max_user`) retain custom-date / duration behavior.
- [x] Unit tests pass.

## Implementation Plan

1. Backend `update_user_roles`: branch on `is_free_plan`; set `plan_ends_at = NULL`.
2. Backend `create_user`: when role is `free_user`, set `plan_ends_at = NULL`.
3. Backend `resolve_plan_request`: guard `requested_plan == "free_user"` → `plan_ends_at = NULL`.
4. Backend `plan_source` derivation: `free_user` in roles → `none` before `admin_set` checks.
5. Frontend: hide duration UI + omit duration payload for `free_user` in edit and create flows; mirror rule in `getPlanSource`.
6. Tests: split/rewrite `plan_source` tests; add free-plan write tests.

## Unit Test Plan

Unit tests needed:
- Yes

Planned tests:
- `update_user_roles(["free_user"])` → `plan_ends_at` is None, `plan_started_at` set.
- `update_user_roles(["pro_user"])` → `plan_ends_at` set (regression guard).
- `create_user(["free_user"])` → `plan_ends_at` is None.
- `plan_source` for free admin-created user → `none`.
- `plan_source` for paid admin-created user → `admin_set`.

## File Size Check

Files expected to be edited:
- `backend/app/services/admin.py`
- `frontend/src/components/admin/UsersTab.tsx`
- `backend/tests/unit/test_api_admin.py`

Line-count risk:
- Low

## Verification Plan

- `cd backend && python -m pytest tests/unit/test_api_admin.py -q`
- Manual: admin Users tab → set user to `free_user` → duration hidden, source badge shows "none", no end date.

## Completion Notes

Changed files:
- `backend/app/services/admin.py` — `update_user_roles`, `create_user`, `resolve_plan_request` now set `plan_ends_at = NULL` for `free_user`; `list_users` `plan_source` derivation resolves `free_user` → `none`.
- `frontend/src/components/admin/UsersTab.tsx` — edit-roles & create-user modals hide Duration/Custom controls for `free_user` and show a "no expiration" note; `handleSaveRoles` / `handleCreateUser` omit duration payload for free plans; `getPlanSource` fallback mirrors the new rule.
- `backend/tests/unit/test_api_admin.py` — split `plan_source` admin-created test into free (`none`) + paid (`admin_set`); added free/paid write-behavior tests for `update_user_roles` and `create_user`.
- `AI-Context/technical/billing-and-payments.md` — documented the free-plan-no-expiration rule and `plan_source = none` derivation.

Verification completed:
- `cd backend && python -m pytest tests/unit/test_api_admin.py -q` → 21 passed.
- `cd frontend && npx tsc --noEmit` → clean; `npm run build` → success (2.48s, only pre-existing chunk-size warnings).

Unit tests added or updated:
- `test_plan_source_none_for_admin_created_free_user` (free admin user → `none`).
- `test_plan_source_admin_set_for_admin_created_paid_user` (paid admin user → `admin_set`).
- `test_update_user_roles_free_plan_sets_no_end_date` / `test_update_user_roles_paid_plan_sets_end_date`.
- `test_create_user_free_plan_sets_no_end_date` / `test_create_user_paid_plan_sets_end_date`.

Follow-ups:
- Polar revoke path (`webhooks.py`) intentionally keeps `plan_ends_at = now` as the cancellation boundary marker — not changed. If the product later wants revoked-then-free users to show no end date, revisit.
