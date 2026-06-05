# SCHOLAR-0027: Pinned Dashboard And Fixed Header

Status: In Progress

Owner: AI Agent

Created: 2026-05-27

## Summary

Make the fixed main header visually distinct. Add local pinning for projects
and sheets, with a separate dashboard pin option for pinned items. Show
dashboard-pinned projects and sheets in a central dashboard pinned section
instead of stretching Recent Projects into empty space.

## Functional Context

Links:
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md)
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-project-workspace.md)

## Technical Context

Links:
- [data-model-draft.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/data-model-draft.md)
- [api-boundaries.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/api-boundaries.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/file-size-and-modularity.md)

## Requirements

- Fixed top workspace header has a distinct anchored/sticky visual style.
- Project cards can be pinned in the Projects list.
- Sheet cards can be pinned in the project Sheets list.
- Pinned project/sheet cards expose a dashboard pin toggle.
- Dashboard only shows items explicitly pinned to dashboard.
- Recent Projects remains capped at 5 and no longer stretches to fill the old empty area.

## Verification Plan

- Run backend tests: `.venv/bin/pytest`.
- Run frontend build: `npm run build`.
- Browser-check header styling, project pin/dashboard pin, sheet pin/dashboard pin, and dashboard pinned items.

## Completion Notes

**Bug fixed (pinned sheets not appearing on dashboard):**

Root cause: The dashboard SQL query required `is_pinned = 1 AND pinned_to_dashboard = 1`.
The frontend `onToggleDashboard` only sent `{ pinned_to_dashboard: true }` — if the user
had never separately toggled the local pin, `is_pinned` remained 0 and the WHERE clause
excluded the row.

Changed files:
- [store.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/services/store.py)
  – Removed `is_pinned = 1` from both `pinned_projects` and `pinned_sheets` queries.
    `pinned_to_dashboard = 1` is now the sole authoritative flag.
- [ProjectWorkspace.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/ProjectWorkspace.tsx)
  – `onToggleDashboard` for both projects and sheets now sends
    `{ pinned_to_dashboard: true, is_pinned: true }` when enabling, so the
    local pin is also set (defensive, in case the query is ever tightened back).

Verification: `backend/.venv/bin/pytest` — 14 passed. `npm run build` — ✓ 934ms.
