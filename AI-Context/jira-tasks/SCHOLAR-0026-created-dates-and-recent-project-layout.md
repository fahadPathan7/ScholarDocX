# SCHOLAR-0026: Created Dates And Recent Project Layout

Status: Done

Owner: AI Agent

Created: 2026-05-27

## Summary

Show creation dates for projects and sheets. Cap central dashboard recent
projects at 5 and expand that section into the unused right-side space.

## Functional Context

Links:
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md)
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-project-workspace.md)

## Requirements

- Project cards show creation date.
- Sheet cards show creation date.
- Central dashboard Recent Projects has max 5 projects.
- Central dashboard Recent Projects fills the empty right-side area.

## Verification Plan

- Run frontend build: `npm run build`.
- Run backend tests: `.venv/bin/pytest`.
- Browser-check dashboard and project/sheet cards.

## Implementation Notes

- Added formatted creation dates to central Recent Projects, Projects list cards, and sheet cards.
- Capped central Recent Projects at 5 in the dashboard store query and added backend coverage.
- Expanded the central Recent Projects section into the available right-side dashboard space.

## Changed Files

- `backend/app/services/store.py`
- `backend/tests/test_store.py`
- `frontend/src/App.tsx`
- `frontend/src/components/ProjectWorkspace.tsx`
- `frontend/src/components/Section.tsx`
- `frontend/src/styles.css`
- `frontend/src/components/calendar.css`
- `AI-Context/functional/feature-dashboard-hierarchy.md`
- `AI-Context/functional/feature-project-workspace.md`

## Verification

- `.venv/bin/pytest` passed: 13 tests.
- `npm run build` passed.
- Browser check confirmed created dates on central dashboard, Projects list, and project workspace sheet card.
