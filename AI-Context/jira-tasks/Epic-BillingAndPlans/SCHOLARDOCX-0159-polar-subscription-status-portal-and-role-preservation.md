# SCHOLARDOCX-0159: Polar Subscription Status Badge, Portal Access, Disable Manual Option & Preserve Admin Roles

Status: Complete

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-21

## Summary

Enhance the ScholarDocX user profile billing section and Polar webhook handler to surface online subscription status tags, next billing cycle / cancellation dates, customer portal management buttons, disabled manual upgrade requests for online subscribers, read-only admin dashboard role controls for active Polar subscribers, and preservation of existing admin roles during Polar subscription updates.

## Business Context

Links:
- Business file: `AI-Context/business/monetization-model.md`

Business value:
Applicants subscribing via Polar require clear visibility into their active subscription status, renewal or cancellation dates, direct self-service portal management links, and protection of admin privileges.

## Functional Context

Links:
- Functional file: `AI-Context/functional/auth-and-user-profile.md`

Requirements:
- FR-1.1: Surface subscription status tags (Online Active, Canceling at Period End, Manual) and renewal/cancellation dates on the user profile.
- FR-1.2: Provide a "Manage Subscription" button linking to Polar customer portal for online subscribers.
- FR-1.3: Disable "Request Manual Upgrade" in the plan request modal when a user holds an active Polar subscription, allowing manual requests only after online cancellation.
- FR-1.4: Retain existing admin roles (e.g. `super_admin`, `system_admin`) when Polar webhooks grant or update user plan roles.
- FR-1.5: Restrict manual admin role/plan edits in the admin dashboard for active Polar subscribers, directing admins to manage cancellations or changes in the Polar dashboard.

## Technical Context

Links:
- Technical file: `AI-Context/technical/billing-and-payments.md`
- Technical file: `AI-Context/technical/api-boundaries.md`

Technical notes:
- Expose `polar_cancel_at_period_end` and `polar_current_period_end` on `/auth/me` user payload.
- Add `/auth/plans/portal` backend endpoint to generate Polar customer portal session URL via `POST /v1/customer-sessions/` or direct portal link fallback.
- In `handle_subscription_updated`, preserve non-plan roles (admin roles) when calculating new role list.
- In `AdminService.update_user_roles`, raise an error if an admin attempts to manually alter roles for a user with an active Polar subscription.

## Scope

In scope:
- User profile UI updates (status badge, renewal/cancellation date, manage subscription button).
- Request Plan Upgrade modal logic (disabling manual option for active Polar subscribers).
- Admin User Management UI & backend restrictions (read-only roles for active Polar subscribers).
- Backend role preservation in `webhooks.py` for admin roles.
- Customer portal endpoint / link generation.

Out of scope:
- Payment processor changes outside Polar.

## Acceptance Criteria

- [x] Online subscribers display a status badge (e.g. "ONLINE SUBSCRIPTION" / "CANCELING") in the profile.
- [x] Active subscription displays "Renews on: DD/MM/YYYY"; canceled subscription displays "Cancels on: DD/MM/YYYY".
- [x] Active online subscribers see a "Manage Subscription" button.
- [x] "Request Manual Upgrade" is disabled for active Polar subscribers with an informative hint.
- [x] Admins cannot manually modify plan roles for active Polar subscribers from the admin dashboard (read-only with informative note).
- [x] Admin roles (`super_admin`, `system_admin`, `admin`) are preserved when `handle_subscription_updated` runs.

## Implementation Plan

1. **Backend Role Preservation**: Update `handle_subscription_updated` in `webhooks.py` to extract existing admin/system roles before updating plan roles.
2. **Backend API Payload**: Include `polar_cancel_at_period_end` and `polar_current_period_end` in `/auth/me` user dict, and provide `/auth/plans/portal` route.
3. **Frontend Profile Billing Card**: Update `ProfileView.tsx` to render online subscription tag, renewal/cancellation date, and Manage Subscription button.
4. **Frontend Plan Request Modal**: Update `PlanRequestModal.tsx` to disable manual upgrade card for active Polar subscribers.

## Unit Test Plan

Unit tests needed:
- Yes

Planned tests:
- `test_subscription_updated_preserves_admin_roles` in `test_webhooks.py`.
- `test_admin_update_roles_blocks_active_polar_subscriber` in `test_webhooks.py`.

## File Size Check

Files expected to be edited:
- `backend/app/api/webhooks.py`
- `backend/app/api/auth.py`
- `backend/app/services/admin.py`
- `frontend/src/components/ProfileView.tsx`
- `frontend/src/components/admin/UsersTab.tsx`
- `backend/tests/unit/test_webhooks.py`

Line-count risk:
- Low

## Verification Plan

- Run unit test suite `pytest backend/tests/unit/test_webhooks.py`.
- Verify UI rendering of status badges, dates, portal button, and disabled manual option.

## Completion Notes

Changed files:
- `backend/app/api/webhooks.py`
- `backend/app/api/auth.py`
- `backend/app/services/admin.py`
- `frontend/src/components/ProfileView.tsx`
- `frontend/src/components/admin/UsersTab.tsx`
- `backend/tests/unit/test_webhooks.py`
- `AI-Context/technical/billing-and-payments.md`

Verification completed:
- All 13 unit tests passed in `test_webhooks.py`, including `test_subscription_updated_preserves_admin_roles` and `test_admin_update_roles_blocks_active_polar_subscriber`.

Follow-ups:
- None.
