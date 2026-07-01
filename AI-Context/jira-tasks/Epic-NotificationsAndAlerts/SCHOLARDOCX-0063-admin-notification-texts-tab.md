# SCHOLARDOCX-0063 — Admin Notification Texts Tab

Status: Done


Owner: AI Agent

Epic: Epic-NotificationsAndAlerts

Created: 2026-05-31

## Summary
Add a new Admin Dashboard tab where admins can view notification texts (title/body previews) for each notification category.

## Functional Context
Links:

- Functional file: `AI-Context/functional/feature-project-workspace.md`

Requirements:

- FR-7.20: Admin dashboard should include a notification-texts view that lists per-category notification messages from the central notification structure.

## Scope
In scope:

- New Admin tab in frontend.
- Read-only view of notification text previews by category.

Out of scope:

- Editing templates in UI.

## Verification Plan

- `npm --prefix frontend run build`

## Completion Notes
Changed files:

- `frontend/src/components/AdminView.tsx`
- `AI-Context/functional/feature-project-workspace.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0063-admin-notification-texts-tab.md`

Verification completed:

- `npm --prefix frontend run build`
