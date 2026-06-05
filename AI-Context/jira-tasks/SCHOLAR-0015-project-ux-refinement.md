# SCHOLAR-0015: Project UX Refinement

Status: Done

Owner: AI Agent

Created: 2026-05-27

## Summary

Refine the project workspace UX so Projects only creates/views/opens projects. Move sheet creation and editing inside an opened project. Add sheets with default pages, editable add/delete rows and columns, calendar-focused project dashboard, About page, and move workspace path to Profile.

## Functional Context

Links:

- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-project-workspace.md)
- [feature-about-profile.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-about-profile.md)

Requirements:

- FR-7.1 through FR-7.10
- FR-8.1 through FR-8.4

## Scope

In scope:

- Projects root create/list/open only.
- Project dashboard inside selected project.
- Project sheets with default pages.
- Add/edit/delete rows and columns.
- Calendar-oriented project dashboard widgets.
- About page.
- Workspace path shown in Profile.
- Remove MVP/local wording from work screens.

Out of scope:

- Gmail API/Microsoft Graph automatic attachments.
- Provider-side scheduled sending.
- Full spreadsheet formula engine.

## Acceptance Criteria

- Root Projects page does not show sheet editor until a project is opened.
- Opening a project shows dashboard and sheets.
- Creating a sheet creates default pages/tabs.
- Users can add/delete columns and add/delete rows.
- Main dashboard shows basic project counts.
- Workspace path appears in Profile, not sidebar/dashboard.
- About page contains product/system details.
- Tests and build pass.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Sheet creation/default pages.
- Existing project summary still works with sheets/pages.

## Verification Plan

- Backend unit tests.
- Frontend build.
- Browser smoke test for Projects root, project open, sheet page controls, Profile/About.

## Completion Notes

Changed files:

- [backend/app/db/schema.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/db/schema.py)
- [backend/app/db/connection.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/db/connection.py)
- [backend/app/services/store.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/services/store.py)
- [backend/app/api/routes.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/api/routes.py)
- [backend/tests/test_store.py](/Users/fahadpathan/Documents/ScholarDock/backend/tests/test_store.py)
- [frontend/src/App.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/App.tsx)
- [frontend/src/components/ProjectWorkspace.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/ProjectWorkspace.tsx)
- [frontend/src/components/ProfileView.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/ProfileView.tsx)
- [frontend/src/components/AboutView.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/AboutView.tsx)
- [frontend/src/styles.css](/Users/fahadpathan/Documents/ScholarDock/frontend/src/styles.css)
- [README.md](/Users/fahadpathan/Documents/ScholarDock/README.md)

Verification completed:

- `.venv/bin/pytest`: 12 passed.
- `npm run build`: passed.
- Browser smoke test: Projects root create/list/open flow verified.
- Browser smoke test: opened project dashboard, sheets, default pages, Profile, and About verified.

Unit tests added or updated:

- Added default sheet/page creation test.
- Existing project page/profile/notification tests still pass.

Follow-ups:

- Add drag/reorder for columns and rows if needed.
- Add richer calendar UI for project dashboards.
