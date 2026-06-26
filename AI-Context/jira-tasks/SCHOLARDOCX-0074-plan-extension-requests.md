# SCHOLARDOCX-0074 — Plan Extension Requests

Status: Review

Owner: AI Agent

Created: 2026-06-06

## Summary

Add a separate plan renewal flow so users can request more time on their
current plan without replacing the existing plan record, and expose a distinct
admin review tab for extension requests.

## Business Context

Links:

- Business file: [assumptions-and-risks.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/business/assumptions-and-risks.md)
- Business file: [decisions.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/business/decisions.md)

Business value:

- Lets users renew an already-owned plan instead of forcing a new upgrade
  request.
- Preserves local access lifecycle rules when a plan expires.
- Makes admin review more explicit by separating upgrades from extensions.

## Functional Context

Links:

- Functional file: [feature-authentication.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-authentication.md)
- Functional file: [requirements-index.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/requirements-index.md)

Requirements:

- FR-6.10: Users can request a renewal for their current plan using a monthly
  or yearly billing cycle without replacing the active or expired plan record.
- FR-6.11: Admin approval of a renewal must extend the current plan deadline
  from the approval timestamp when the existing plan has expired, or from the
  existing plan end date when it is still active.
- FR-6.14: Plan upgrade review and plan extension review should have separate
  admin permissions so either review surface can be managed independently.

## Technical Context

Links:

- Technical file: [authentication-and-identity.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/authentication-and-identity.md)
- Technical file: [data-model-draft.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/data-model-draft.md)
- Technical file: [api-boundaries.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/api-boundaries.md)

Technical notes:

- Add `request_type` to `plan_upgrade_requests`.
- Keep upgrade approvals as replacement changes.
- Keep renewal approvals as deadline extensions that preserve the existing plan
  role.
- If the current plan is already expired, the renewal deadline should start
  from the admin approval timestamp.

## Scope

In scope:

- User plan comparison UI requests renewal for the current plan.
- User plan comparison UI shows the current user's submitted plan requests and statuses.
- Expired user-tier accounts lose the main workspace sidebar tabs and fall back
  to Profile, Settings, About, and any non-user-role destinations they still
  own.
- Profile subscription summary card should show a warning state when the plan
  has 7 or fewer days remaining and an urgent expired state after the deadline.
- Admin panel shows a separate review tab for renewal requests.
- Admin role limits expose a dedicated extension-review permission that is
  enabled by default for both admin roles.
- Backend stores request type and applies renewal deadlines correctly.
- Tests cover active-plan and expired-plan renewal approval behavior.

Out of scope:

- Payment processing or invoice handling.
- Full subscription billing provider integration.
- Changing the existing upgrade semantics for a different plan tier.

## Acceptance Criteria

- A user on a plan can submit a renewal request for the same plan using
  monthly or yearly billing.
- A user can open a tab in the plan screen and see submitted plan changes,
  upgrades, and renewals with their current statuses.
- A user whose plan is expired no longer sees Dashboard, Projects, Documents,
  Sticky Notes, or Whiteboard in the sidebar.
- A user whose plan has 7 or fewer days left sees a warning-styled
  subscription summary prompting renewal/change.
- A user whose plan is expired sees an urgent subscription summary prompting
  renewal/change instead of the normal healthy-state styling.
- Renewal requests are stored separately from upgrade intent.
- Admins can view renewal requests in a dedicated tab.
- Admins can grant or remove extension-review access independently from upgrade
  request review access.
- Approving a renewal on an active plan extends the current deadline rather
  than replacing the plan start/end timestamps.
- Approving a renewal on an expired plan sets a new deadline from the approval
  time so the user regains access from that moment.
- Existing upgrade requests continue to work as replacement plan changes.

## Implementation Plan

- Add `request_type` to the request payload, schema, migration, and admin list
  response.
- Update the plan comparison screen so the current plan can submit a renewal
  request.
- Add a user-facing request-history tab backed by a current-user plan request endpoint.
- Update the app-shell navigation rule so expired user-tier plans no longer
  count as active workspace access.
- Update the profile subscription summary UI to react to active, warning, and
  expired plan windows using the same date semantics as the navigation gating.
- Split the admin review UI into upgrade and renewal tabs.
- Update admin service logic to branch between replacement upgrades and
  deadline extensions.
- Split admin permission checks so extension review no longer piggybacks on the
  generic plan-request permission.
- Add tests for extension timing and request-type persistence.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Backend service test for renewal approval on an active plan.
- Backend service test for renewal approval on an expired plan.
- API test for submitting a renewal request with `request_type`.
- API test for listing the current user's plan requests.
- UI build verification for the plan comparison and admin tab updates.
- UI build verification for expired-plan sidebar gating.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `backend/app/api/auth.py`
- `backend/app/services/admin.py`
- `backend/app/db/schema.py`
- `backend/app/db/connection.py`
- `frontend/src/components/PlanComparisonView.tsx`
- `frontend/src/components/plan/*`
- `frontend/src/App.tsx`
- `frontend/src/lib/auth.ts`
- `frontend/src/components/AdminView.tsx`
- `frontend/src/components/ProfileView.tsx`
- `frontend/src/components/admin/*` new extract(s)
- `backend/tests/*`

Line-count risk:

- High

If any file exceeds 1000 lines, explain why.

- `frontend/src/components/AdminView.tsx` is already oversized, so the plan
  review UI should be extracted into focused components instead of expanded
  inline.

## Verification Plan

- Run targeted backend tests for plan request submission and approval logic.
- Run the frontend build.
- Browser-check the plan comparison and admin requests surfaces.

## Completion Notes

Changed files:

- `AI-Context/functional/feature-authentication.md`
- `AI-Context/functional/requirements-index.md`
- `AI-Context/technical/api-boundaries.md`
- `AI-Context/technical/authentication-and-identity.md`
- `AI-Context/technical/data-model-draft.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0074-plan-extension-requests.md`
- `backend/app/api/auth.py`
- `backend/app/db/connection.py`
- `backend/app/db/schema.py`
- `backend/app/services/admin.py`
- `backend/tests/test_plan_requests.py`
- `frontend/src/components/AdminView.tsx`
- `frontend/src/components/PlanComparisonView.tsx`
- `frontend/src/components/plan/PlanRequestHistoryTab.tsx`
- `frontend/src/App.tsx`
- `frontend/src/lib/auth.ts`
- `frontend/src/components/ProfileView.tsx`
- `frontend/src/components/WhiteboardView.tsx`
- `frontend/src/components/admin/PlanRequestsTab.tsx`
- `backend/app/api/admin.py`

Verification completed:

- `pytest backend/tests/test_plan_requests.py -q` passed.
- `npm run build` in `frontend/` passed after fixing an unrelated `WhiteboardView.tsx` typo that blocked TypeScript compilation.
- Follow-up `pytest backend/tests/test_plan_requests.py -q` passed after adding the current-user request-history endpoint coverage.
- Follow-up `npm run build` in `frontend/` passed after adding the user-facing request-history tab.
- Follow-up `npm run build` in `frontend/` passed after updating expired-plan sidebar gating.
- Follow-up `npm run build` in `frontend/` passed after adding warning and expired plan states to the profile subscription summary card.
- `pytest backend/tests/test_api_auth.py -q` and `pytest backend/tests/test_api_admin.py -q` currently fail during app initialization with an unrelated SQLite schema error: `no such column: user_id`.

Unit tests added or updated:

- Added `backend/tests/test_plan_requests.py` to cover request-type persistence, current-user request-history listing, active-plan renewal extension, expired-plan renewal restart, and replacement upgrade approval.
- No additional unit test was added for the expired-plan sidebar gating because the frontend does not currently have a focused test runner in place for shell navigation rules; verification was the production frontend build.

Follow-ups:

- Investigate the existing SQLite initialization error surfaced by `backend/tests/test_api_auth.py` and `backend/tests/test_api_admin.py`.

## Follow-up Scope Note

- Add a dedicated `admin_manage_plan_extensions` role-limit permission for both
  admin roles, default it to enabled, and gate the extension tab/API review
  flow independently from upgrade requests.

## Follow-up Completion Notes

- Added a separate `admin_manage_plan_extensions` permission for both admin
  roles and defaulted it to enabled in schema seeds, migration defaults, and
  canonical role-limit handling for existing databases.
- Split admin UI gating so `Plan Requests` still uses
  `admin_manage_plan_requests`, while `Plan Extensions` now uses the dedicated
  extension permission.
- Updated admin plan-request APIs so extension listing and review enforce the
  extension permission independently from upgrade review.

## Follow-up Verification

- `pytest backend/tests/test_plan_requests.py -q` passed.
- `npm run build` in `frontend/` passed.
- Browser verification was not run in this follow-up turn.
