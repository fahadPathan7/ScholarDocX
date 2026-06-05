# SCHOLAR-0017: Single Sheet Detail Flow

Status: Done

Owner: AI Agent

Created: 2026-05-27

## Summary

Refine project navigation so project pages show only dashboard plus create/view/open sheets. Each sheet opens into its own detail view with one editable table. Remove default pages/tabs inside sheets.

## Scope

In scope:

- Project view shows dashboard and sheet cards only.
- Sheet detail view opens after clicking a sheet.
- Each sheet has one editable table.
- Remove Pages section from UI.
- Update sheet creation backend to create one page/table per sheet.

Out of scope:

- Formula engine.
- Multi-table sheets.

## Acceptance Criteria

- Inside a project, sheet detail table is not shown until a sheet is opened.
- A sheet is one detail page only.
- No default page tabs are shown.
- Dashboard counts sheets and rows, not pages.
- Tests/build pass.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Sheet creation creates one default table/page.
- Project summary row counts still work.

## Verification Plan

- Backend unit tests.
- Frontend build.
- Browser smoke test for project -> sheet detail.

## Completion Notes

Changed files:

- `backend/app/services/store.py`
- `backend/tests/test_store.py`
- `frontend/src/App.tsx`
- `frontend/src/components/ProjectWorkspace.tsx`
- `frontend/src/styles.css`
- `AI-Context/functional/feature-project-workspace.md`
- `AI-Context/functional/requirements-index.md`

Verification completed:

- Backend unit tests: `cd backend && .venv/bin/pytest`
- Frontend build: `cd frontend && npm run build`
- Browser smoke: opened Projects, opened a project, confirmed the project view shows dashboard plus sheet create/list only, then opened a sheet and confirmed the editable table appears only in sheet detail.

Unit tests added or updated:

- Updated store test for one table/page per created sheet.
