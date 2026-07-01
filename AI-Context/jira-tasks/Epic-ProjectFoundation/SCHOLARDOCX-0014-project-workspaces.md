# SCHOLARDOCX-0014: Project Workspaces, Sheet Pages, Notifications, And Layout

Status: Done

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-05-27

## Summary

Add the missing project workspace model: users create projects from Targets, each project has its own dashboard and multiple sheet-like pages with editable columns/rows. Add central notifications, profile page, collapsible left panel, and top-right collapsible AI assistant.

## Business Context

Links:

- [product-vision.md](../../business/product-vision.md)

Business value:

Projects make ScholarDocX usable as a campaign workspace instead of only a set of disconnected target records.

## Functional Context

Links:

- [feature-project-workspace.md](../../functional/feature-project-workspace.md)
- [feature-email-outreach.md](../../functional/feature-email-outreach.md)
- [feature-ai-assistant.md](../../functional/feature-ai-assistant.md)

Requirements:

- FR-7.1 through FR-7.10

## Technical Context

Links:

- [data-model-draft.md](../../technical/data-model-draft.md)
- [api-boundaries.md](../../technical/api-boundaries.md)

Technical notes:

- Store sheet columns and rows as JSON in SQLite for MVP flexibility.
- Open Gmail/Outlook compose URLs client-side.
- Store scheduled send time as local notification, not provider-side scheduled email.

## Scope

In scope:

- Project, project page, notification, and local profile tables.
- API CRUD support for those tables.
- Project workspace UI with editable sheet columns/rows.
- Per-project dashboard summary.
- Central notifications UI.
- Profile page UI.
- Collapsible left navigation.
- Top-right AI assistant panel.

Out of scope:

- Automatic attachment upload into Gmail/Outlook.
- Gmail API or Microsoft Graph send/schedule integration.
- Multi-user authentication.

## Acceptance Criteria

- User can create a project from Targets.
- User can create/select pages inside a project.
- User can add columns and rows.
- User can edit cells and save the sheet.
- Project dashboard shows page/row/notification counts.
- User can open Gmail or Outlook compose with email fields.
- Notifications show centrally.
- Left panel collapses.
- AI assistant opens from top-right and expands/collapses.
- Profile page saves local profile data.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Project page JSON persistence.
- Notification aggregation.
- Profile persistence.

## File Size Check

Line-count risk:

- Medium

Mitigation:

- Add project/profile/assistant components instead of expanding `App.tsx` only.

## Verification Plan

- Backend unit tests.
- Frontend build.
- Browser smoke test for project creation, sheet edit, notifications/profile, assistant panel.

## Completion Notes

Changed files:

- [backend/app/db/schema.py](../../../backend/app/db/schema.py)
- [backend/app/services/store.py](../../../backend/app/services/store.py)
- [backend/app/api/routes.py](../../../backend/app/api/routes.py)
- [backend/tests/test_store.py](../../../backend/tests/test_store.py)
- [frontend/src/App.tsx](../../../frontend/src/App.tsx)
- [frontend/src/components/ProjectWorkspace.tsx](../../../frontend/src/components/ProjectWorkspace.tsx)
- [frontend/src/components/FloatingAssistant.tsx](../../../frontend/src/components/FloatingAssistant.tsx)
- [frontend/src/components/NotificationsView.tsx](../../../frontend/src/components/NotificationsView.tsx)
- [frontend/src/components/ProfileView.tsx](../../../frontend/src/components/ProfileView.tsx)
- [frontend/src/lib/email.ts](../../../frontend/src/lib/email.ts)
- [README.md](../../../README.md)

Verification completed:

- `.venv/bin/pytest`: 11 passed.
- `npm run build`: passed.
- API health endpoint returned ok.
- Browser smoke check loaded Projects workspace and rendered project/page controls.

Unit tests added or updated:

- Project page JSON persistence test.
- Notification aggregation test.
- Local profile seed/update test.

Follow-ups:

- Add row delete/reorder and column delete/reorder controls.
- Add provider API integration only if automatic attachments or real scheduled sending become required.
- Add frontend component tests for sheet editing after UI stabilizes.
