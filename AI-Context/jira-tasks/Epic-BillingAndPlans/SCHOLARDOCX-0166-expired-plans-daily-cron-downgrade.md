# SCHOLARDOCX-0166: Daily Cron Job to Move Expired Users to Free Plan

Status: Completed

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-21

## Summary

Implement a daily cron job and service function that identifies users with expired plans (`plan_ends_at < NOW()`) and downgrades their plan role to `free_user`. It modifies only user tier roles (`general_user`, `pro_user`, `max_user`) and strictly preserves any admin roles (`general_admin`, `super_admin`) intact.

## Business Context

Links:
- Business file: [AI-Context/business/business-overview.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/business/business-overview.md)

Business value:
- Ensures users whose paid subscriptions or manual plans have expired are automatically transitioned to the free plan tier in the database.
- Keeps database role states consistent for reporting, limit enforcement, and admin management while maintaining strict security around admin privileges.

## Functional Context

Links:
- Functional file: [AI-Context/functional/user-roles-permissions.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/user-roles-permissions.md)

Requirements:
- FR-1: Identify users where `plan_ends_at` is set and strictly prior to current time (`NOW()`).
- FR-2: Replace any paid user tier role (`general_user`, `pro_user`, `max_user`) in the user's `roles` list with `free_user`.
- FR-3: Preserve all admin roles (`general_admin`, `super_admin`) without modification.
- FR-4: Run automatically once per day via a GitHub Actions cron workflow (`0 0 * * *`) and provide an authenticated internal API route (`POST /api/internal/downgrade-expired-plans`) gated by `CLEANUP_SECRET`.
- FR-5: Provide a CLI runner script (`scripts/downgrade_expired_users.py`) for manual execution.

## Scope

In scope:
- Service function `downgrade_expired_user_plans(store: Store)` in `app/services/plan_expiry.py`.
- Internal API route `POST /api/internal/downgrade-expired-plans` in `app/api/internal.py`.
- CLI script `scripts/downgrade_expired_users.py`.
- GitHub Actions workflow `.github/workflows/downgrade-expired-users.yml`.
- Unit tests in `backend/tests/unit/test_plan_expiry.py`.

Out of scope:
- Modifying admin roles or revoking admin access.

## Acceptance Criteria

- [x] Expired paid users are downgraded to `free_user`.
- [x] Admin roles on expired accounts are preserved intact.
- [x] Unexpired users and already free users are unchanged.
- [x] Internal API endpoint and GitHub Actions workflow execute successfully.
- [x] Unit test suite passes.

## Implementation Plan

1. Create `backend/app/services/plan_expiry.py` with `downgrade_expired_user_plans`.
2. Add route `POST /internal/downgrade-expired-plans` in `backend/app/api/internal.py`.
3. Create script `scripts/downgrade_expired_users.py`.
4. Create workflow `.github/workflows/downgrade-expired-users.yml` with `cron: "0 0 * * *"`.
5. Add unit tests in `backend/tests/unit/test_plan_expiry.py`.

## Completion Notes

Changed files:
- `backend/app/services/plan_expiry.py` — core downgrade function `downgrade_expired_user_plans(store)`.
- `backend/app/api/internal.py` — internal endpoint `POST /api/internal/downgrade-expired-plans` gated by `CLEANUP_SECRET`.
- `scripts/downgrade_expired_users.py` — CLI script for manual or standalone cron execution.
- `.github/workflows/downgrade-expired-users.yml` — daily GitHub Actions cron workflow scheduled at `0 0 * * *` (midnight UTC).
- `frontend/src/components/admin/InfoTab.tsx` — added System Cron Jobs & Automated Maintenance table displaying schedule, route, script, auth, and action.
- `backend/tests/unit/test_plan_expiry.py` — unit tests for downgrade logic and endpoint auth.
- `AI-Context/technical/frontend-visual-system.md` — updated visual system docs.

Verification completed:
- `pytest tests/unit/test_plan_expiry.py` passed (2/2 tests passed in 5.37s).
- `npm run build` passed (0 errors in 2.38s).

Unit tests added or updated:
- `test_downgrade_expired_user_plans`: verifies expired paid users downgrade to `free_user` and admin roles (`super_admin`, `general_admin`) are strictly preserved.
- `test_downgrade_internal_endpoint_auth`: verifies header authentication (`CLEANUP_SECRET`) and response format.

