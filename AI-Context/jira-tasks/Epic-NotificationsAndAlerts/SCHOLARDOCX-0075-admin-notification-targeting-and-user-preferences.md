# SCHOLARDOCX-0075 — Admin Notification Targeting And User Preferences

## Status
Review

Owner: AI Agent

Created: 2026-06-06

## Summary
Add live user counts to admin user filters, let admins send categorized notifications to all, filtered, or specific users, and add user settings controls for admin notification categories with a mandatory `system` type.

## Functional Context
Links:

- `AI-Context/functional/feature-project-workspace.md`
- `AI-Context/functional/feature-about-profile.md`

Requirements:

- FR-7.22: Admin user-management filters should show live user counts for each available role, plan-status, and account-status option based on the currently selected complementary filters.
- FR-7.23: Admins should be able to send notifications with a title, body, and category to all users, the currently filtered user subset, or specific individual users from the user-management surface.
- FR-7.24: Admin-sent notifications must respect recipient notification preferences, except for the mandatory `system` category which cannot be disabled by users.
- FR-8.12: Notification preferences should separate workspace activity notifications from admin-sent notification categories so users can manage them independently.
- FR-8.13: The `system` admin notification category must stay enabled for every user and cannot be unchecked from the settings UI.

## Technical Context
Links:

- `AI-Context/technical/api-boundaries.md`
- `AI-Context/technical/data-model-draft.md`

Technical notes:

- Add a backend notification preference helper so frontend and backend logic share the same category defaults and `system` enforcement behavior.
- Add a notifications send endpoint under `/api/admin` for all-user, filtered-user, and explicit-recipient sends.
- Persist a notification preference key on notification rows so the UI can show admin-notification categories and the backend can respect user opt-outs.
- Extract new admin UI from the oversized `frontend/src/components/AdminView.tsx` instead of adding more logic directly into that file.

## Scope
In scope:

- Live counts on the Users tab role/plan/status filters.
- Admin compose UI for broadcast and per-user notifications.
- Admin notification categories and user settings tab for them.
- Backend persistence and delivery filtering for admin notifications.
- Focused backend tests for notification preference enforcement and admin sends.

Out of scope:

- Push/email delivery outside the local app notification list.
- Editing existing historical notifications after creation.
- Rich-text notification bodies.

## Implementation Plan

1. Add context-backed notification preference constants and schema/migration support for notification preference keys.
2. Add backend admin notification send service and API route with recipient preference enforcement.
3. Extract the Users tab into a focused admin component and add live filter counts plus compose flows.
4. Update settings notification UI to separate workspace activity and admin categories, keeping `system` locked on.
5. Run focused backend tests and frontend build verification.

## Verification Plan

- `cd /Users/fahadpathan/Documents/ScholarDocX/backend && pytest tests/test_admin_notifications.py -q`
- `cd /Users/fahadpathan/Documents/ScholarDocX/frontend && npm run build`

## Test Decision

- Backend tests are required because this feature adds persistence rules, preference enforcement, and a new admin API/service workflow.
- No frontend unit tests are planned unless an existing harness cleanly supports the extracted admin component; otherwise frontend verification will rely on build plus UI inspection.

## Completion Notes

Changed files:

- `backend/app/api/admin.py`
- `backend/app/core/notifications.py`
- `backend/app/db/connection.py`
- `backend/app/db/schema.py`
- `backend/app/services/admin.py`
- `backend/app/services/store.py`
- `backend/tests/test_admin_notifications.py`
- `frontend/src/components/AdminView.tsx`
- `frontend/src/components/FloatingNotifications.tsx`
- `frontend/src/components/NotificationsView.tsx`
- `frontend/src/components/SettingsView.tsx`
- `frontend/src/components/admin/UsersTab.tsx`
- `frontend/src/config/notificationCatalog.ts`
- `frontend/src/config/notificationLabels.ts`
- `AI-Context/functional/feature-project-workspace.md`
- `AI-Context/functional/feature-about-profile.md`
- `AI-Context/functional/requirements-index.md`
- `AI-Context/technical/api-boundaries.md`
- `AI-Context/technical/data-model-draft.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0075-admin-notification-targeting-and-user-preferences.md`

Verification completed:

- `cd /Users/fahadpathan/Documents/ScholarDocX/backend && pytest tests/test_admin_notifications.py -q`
- `cd /Users/fahadpathan/Documents/ScholarDocX/frontend && npm run build`

Implementation notes:

- The Users tab was extracted from the oversized `AdminView.tsx` file before adding new filter-count and notification-send logic.
- Admin broadcasts currently support two scopes in the UI: all users and the currently filtered user subset. Per-user sends are available from each user row.
- `send_to_all` includes admin accounts as recipients when their notification preference allows the selected category.

Follow-ups:

- Browser-level verification of the new admin modal flow and settings tabs is still recommended.
