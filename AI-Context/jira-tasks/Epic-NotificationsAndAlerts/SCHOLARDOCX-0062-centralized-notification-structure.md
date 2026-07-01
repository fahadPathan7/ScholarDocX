# SCHOLARDOCX-0062 — Centralized Notification Structure And Strict Types

Status: Done


Owner: AI Agent

Epic: Epic-NotificationsAndAlerts

Created: 2026-05-31

## Summary
Centralize notification event definitions and templates, enforce only approved notification kinds, and ensure every emitted notification is controlled by choice settings.

## Functional Context
Links:

- Functional file: `AI-Context/functional/feature-project-workspace.md`

Requirements:

- FR-7.17: Notification events must be emitted only from a central notification definition list.
- FR-7.18: Notification messages should use centralized templates with variable interpolation.
- FR-7.19: Every emitted notification event must map to a user-controllable notification setting key.

## Technical Context
Links:

- Technical file: `AI-Context/technical/coding-standards.md`

Technical notes:

- Add a central frontend notification catalog for event keys, templates, and metadata.
- Refactor notification creation calls to use catalog event keys and variables.
- Keep storage schema unchanged (`notifications` table).

## Verification Plan

- `npm --prefix frontend run build`

## Completion Notes
Changed files:

- `frontend/src/config/notificationCatalog.ts`
- `frontend/src/config/notificationLabels.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/components/ProjectWorkspace.tsx`
- `frontend/src/components/WhiteboardView.tsx`
- `AI-Context/functional/feature-project-workspace.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0062-centralized-notification-structure.md`

Verification completed:

- `npm --prefix frontend run build`
