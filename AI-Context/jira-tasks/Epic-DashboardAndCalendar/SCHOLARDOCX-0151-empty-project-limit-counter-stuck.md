# SCHOLARDOCX-0151: Empty Project Sheet-Count Counter Stuck on Loading

Status: Done

Owner: AI Agent

Epic: Epic-DashboardAndCalendar

Created: 2026-07-19

## Summary

On the Projects list, each project card shows a "X / Y sheets" usage counter driven by `/projects/sheet_counts`. For a project with **no sheets**, the counter was stuck on its "loading" state (`...`) forever, while projects with at least one sheet showed their number correctly. Root cause: a SQL `GROUP BY project_id` on `project_sheets` silently omits projects with zero rows, so the empty project's ID was never a key in the returned dict, and the frontend treated "missing key" as "still loading".

## Business Context

Links:

- Business file: AI-Context/business/product-overview.md

Business value:

- Newly created projects (which start empty) looked broken in the dashboard — the sheet-count counter spun forever, undermining trust in the limits/quota UI at the exact moment a user is exploring a fresh project.

## Functional Context

Links:

- Functional file: AI-Context/technical/api-boundaries.md

Requirements:

- FR-1: Every project card shows a sheet-count counter, including projects with zero sheets (which must show `0 / <max>`).

## Technical Context

Links:

- Technical file: AI-Context/technical/api-boundaries.md

Technical notes — root cause:

- `Store.project_sheet_counts` (`backend/app/services/store.py`) ran `SELECT project_id, COUNT(*) FROM project_sheets ... GROUP BY project_id`. A project with no rows in `project_sheets` produces no output row, so its ID was absent from the returned dict.
- The card (`frontend/src/components/ProjectWorkspace.tsx:609-611`) did `const count = projectSheetCounts[id]; const isLoading = count === undefined;` — so the missing key meant `isLoading = true` forever.
- The per-project `/summary` endpoint was NOT affected (it returns `sheet_count: 0` correctly); only the bulk `sheet_counts` endpoint had this gap.

Fix (two layers):

- **Backend (`store.py`):** rewrote `project_sheet_counts` to `LEFT JOIN projects p LEFT JOIN project_sheets s ON s.project_id = p.id`, so empty projects emit `{project_id: 0}`. Now the endpoint honors its docstring ("Sheet counts for every project owned by the current user").
- **Frontend (`ProjectWorkspace.tsx`):** `loadProjectSheetCounts` now seeds every known project ID with `0` before the fetch resolves, then merges the real values. This avoids any pre-fetch flash and is a defensive guard against future endpoint regressions.

## Scope

In scope:

- `backend/app/services/store.py` — `project_sheet_counts` LEFT JOIN.
- `frontend/src/components/ProjectWorkspace.tsx` — seed counts with 0 before fetch.
- `backend/tests/smoke/test_store.py` — regression test for empty projects.

Out of scope:

- Per-project `/summary` (already correct).
- Role-limit computation (`sheets_per_project` comes from `useUsage`, unaffected).

## Acceptance Criteria

- AC-1: A project with zero sheets shows `0 / <max>` in its card, not `...`.
- AC-2: A project with sheets continues to show its correct count.
- AC-3: `store.project_sheet_counts()` returns a key for every project the user owns, with `0` for empty ones.
- AC-4: `npm run build` passes.
- AC-5: `test_project_sheet_counts_includes_empty_projects` passes.

## Implementation Plan

1. `store.py`: `LEFT JOIN projects` → `project_sheets`, `COUNT(s.id)`, `GROUP BY p.id`.
2. `ProjectWorkspace.tsx`: seed `projectSheetCounts` with `{[id]: 0}` for every project before the fetch.
3. Add `test_project_sheet_counts_includes_empty_projects` asserting the empty project key exists with value 0.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `test_project_sheet_counts_includes_empty_projects` (smoke): asserts the empty project's ID is a key in the returned dict with value 0.

## File Size Check

Files edited: `store.py` (small), `ProjectWorkspace.tsx` (small), `test_store.py` (small). All well under the 1000-line limit.

## Verification Plan

- `pytest tests/smoke/test_store.py -k project_sheet_counts -v`.
- `npm run build` in `frontend/`.
- Manual: create a new project (no sheets) → counter shows `0 / <max>` immediately, no perpetual spinner.

## Completion Notes

Changed files:

- `backend/app/services/store.py` — `project_sheet_counts` now uses `LEFT JOIN projects p LEFT JOIN project_sheets s ... GROUP BY p.id` so empty projects return count 0.
- `frontend/src/components/ProjectWorkspace.tsx` — `loadProjectSheetCounts` seeds every known project with 0 before the fetch, then merges real values.
- `backend/tests/smoke/test_store.py` — added `test_project_sheet_counts_includes_empty_projects`.
- `AI-Context/technical/api-boundaries.md` — documented the rule.

Verification completed:

- `pytest tests/smoke/test_store.py::test_project_sheet_counts_groups_by_project tests/smoke/test_store.py::test_project_sheet_counts_includes_empty_projects -v` → 2 passed.
- `npm run build` in `frontend/` → passes (tsc + vite).
- Manual check left for the user: create a project with no sheets → counter shows `0 / <max>`.

Unit tests added or updated:

- `backend/tests/smoke/test_store.py::test_project_sheet_counts_includes_empty_projects` (new).

Follow-ups:

- None.
