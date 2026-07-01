# SCHOLARDOCX-0064 — Role/Limit Failure Alerts

## Status
Completed

Owner: AI Agent

Created: 2026-05-31

## Summary
Ensure users always see clear, styled alerts when actions fail due to role permissions or plan limits, so blocked actions are understandable.

## Functional Context
Links:

- Functional file: `AI-Context/functional/feature-project-workspace.md`
- Technical file: `AI-Context/technical/api-boundaries.md`

Requirements:

- FR-7.21: Role/limit blocked actions should show explicit reason + next-step guidance.

## Scope
In scope:

- Mount global UI error alert listener.
- Add centralized access-error message mapping for 403/429 API responses.
- Keep messages action-oriented with admin/reset guidance.

Out of scope:

- Rework all existing non-access validation dialogs.

## Verification Plan

- `npm --prefix /Users/fahadpathan/Documents/ScholarDocX/frontend run build`

## Completion Notes
Changed files:

- `frontend/src/lib/accessErrors.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/components/GlobalErrorAlerts.tsx`
- `frontend/src/App.tsx`
- `AI-Context/functional/feature-project-workspace.md`
- `AI-Context/technical/api-boundaries.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0064-role-limit-failure-alerts.md`

Verification completed:

- `npm --prefix /Users/fahadpathan/Documents/ScholarDocX/frontend run build`
