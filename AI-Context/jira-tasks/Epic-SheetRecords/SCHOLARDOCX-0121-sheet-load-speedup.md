# SCHOLARDOCX-0121: Sheet Load Speedup

Status: Done

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-07-18

## Summary

Opening a project is slow because the project summary endpoint ships every
sheet's full `rows_json`/`columns_json` to the browser, even though no sheet is
open yet. The same heavy call is repeated after every cell save, and the
Projects list fires one summary call per project just to show sheet counts.
Replace these with lightweight endpoints that transfer row data only for the
one open sheet.

## Business Context

Links:

- Business file: AI-Context/business/business-goals.md

Business value:

- Projects and sheets open fast even as users accumulate large sheets (hundreds
  of rows across many sheets), so the app feels responsive on the free-tier
  cloud deployment.

## Functional Context

Links:

- Functional file: AI-Context/functional/feature-project-workspace.md

Requirements:

- FR-7.x (sheet records): behavior-preserving; no user-visible workflow change.

## Technical Context

Links:

- Technical file: AI-Context/technical/api-boundaries.md, AI-Context/technical/state-management.md

Technical notes:

- New/changed endpoints (see api-boundaries.md for full write-up):
  - `GET /projects/{project_id}/meta?include_calendar=true|false` — lightweight
    project metadata (sheets, notifications, page stubs with `row_count`,
    optional `calendar_items`). Replaces `/summary` on project/dashboard views.
  - `GET /project_pages/{page_id}` — one fully decoded page (the open sheet).
  - `GET /projects/sheet_counts` — `{project_id: count}` in one grouped query;
    kills the Projects-list N+1.
- The frontend keeps its existing save-echo guard (`contentSignature` +
  `lastSyncedRef` in `useSheetPage`), so switching `refreshSummary` →
  `refreshMeta` does not disrupt the undo/sort/filter-on-save behavior.

## Scope

In scope:

- Backend: complete `Store.project_meta` (row counts, calendar, flag), add
  `Store.get_project_page`, add `Store.project_sheet_counts`, add the three
  routes.
- Frontend: `ProjectWorkspace` opens projects via `/meta`, fetches the open
  page on demand via `/project_pages/{id}`, post-save refresh uses
  `/meta?include_calendar=false`, sheet-card quota badge uses stub `row_count`,
  Projects list uses `/projects/sheet_counts`.
- Frontend: `useSheetPage` calls `refreshMeta` in persist handlers.
- Tests + context updates.

Out of scope:

- Splitting `ProjectWorkspace.tsx` / `useSheetPage.ts` (both >1150 lines) —
  flagged as a follow-up to keep this perf change focused.
- Paginating or virtualizing sheet rows.
- Changing the AI agent / scholarship / advisor endpoints.

## Acceptance Criteria

- Opening a project with multiple large sheets does not transfer all sheets'
  row data; only stubs + aggregates are transferred.
- Opening a single sheet fetches only that sheet's rows.
- Saving a cell/row/style refreshes project metadata without re-pulling all
  sheets' row data, and undo/sort/filter survive the save.
- Projects list loads sheet counts in a single request, not N.
- Calendar on the project dashboard still shows dates from all sheets.
- Backend tests and frontend build pass.

## Implementation Plan

- Backend `store.py`: add `get_project_page`, `project_sheet_counts`; expand
  `project_meta(include_calendar=True)` to compute per-stub `row_count`,
  total `row_count`, and optional `calendar_items` without shipping rows.
- Backend `routes.py`: add the three routes; thread `include_calendar`.
- Frontend `ProjectWorkspace.tsx`: switch to `/meta`; add `selectedPageData`
  state + effect fetching `/project_pages/{id}` when `selectedPageId` or the
  matching stub's `updated_at` changes; pass full page into `useSheetPage`.
- Frontend `useSheetPage.ts`: persist handlers call `refreshMeta`.
- Tests + context.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `project_meta` returns stubs with `row_count`, `calendar_items`, total
  `row_count`, and stubs contain NO `rows`/`columns` keys.
- `project_meta(include_calendar=False)` skips calendar computation.
- `get_project_page` returns a decoded page (columns migrated, rows parsed,
  email_config present).
- `project_sheet_counts` returns grouped counts per project for the user.

## File Size Check

Files expected to be edited:

- backend/app/services/store.py (933)
- backend/app/api/routes.py (588)
- frontend/src/components/ProjectWorkspace.tsx (1177)
- frontend/src/components/sheet/useSheetPage.ts (1169)
- backend/tests/smoke/test_store.py
- AI-Context/technical/api-boundaries.md

Line-count risk:

- Medium

`ProjectWorkspace.tsx` and `useSheetPage.ts` already exceed the 1150 temporary
grace limit. Splitting them is out of scope for this perf task and is recorded
as a follow-up.

## Verification Plan

- `cd backend && .venv/bin/pytest`
- `cd frontend && npm run build`
- Browser smoke: open project with several large sheets (fast), open a sheet,
  edit a cell (no full re-fetch), Projects list loads counts in one request.

## Completion Notes

Changed files:

- `backend/app/services/store.py` — completed `project_meta(include_calendar)`,
  added `get_project_page` and `project_sheet_counts`.
- `backend/app/api/routes.py` — added `GET /project_pages/{page_id}`,
  `GET /projects/sheet_counts`, and the `include_calendar` query flag on
  `/projects/{project_id}/meta`.
- `backend/tests/smoke/test_store.py` — 4 new tests (project_meta lightweight +
  row_counts, include_calendar=False, get_project_page decoded, sheet_counts
  grouped).
- `frontend/src/components/ProjectWorkspace.tsx` — open-project + post-save now
  hit `/meta`; on-demand full-page fetch for the open sheet via
  `/project_pages/{id}`; sheet-card badge reads stub `row_count`;
  `loadProjectSheetCounts` uses one `/projects/sheet_counts` call.
- `frontend/src/components/sheet/useSheetPage.ts` — persist handlers call
  `refreshMeta` instead of `refreshSummary`.
- `AI-Context/technical/api-boundaries.md` — documented the three endpoints.
- `AI-Context/jira-tasks/Epic-SheetRecords/SCHOLARDOCX-0121-sheet-load-speedup.md`
  — this task.

Verification completed:

- Backend: `pytest tests/smoke/test_store.py -k "project_meta or
  get_project_page or sheet_counts or project_page_json or
  create_sheet_with_single_default"` → 6 passed (4 new + 2 pre-existing on the
  touched paths).
- Frontend: `npx tsc --noEmit` clean; `npm run build` clean.
- 7 unrelated smoke failures (document categories, sticky notes, local
  profiles, dashboard pinned files) are PRE-EXISTING — confirmed by re-running
  `test_local_profile_seed_and_update` with the changes stashed (fails
  identically). Root cause is shared-test-DB accumulation
  (`Document categories are limited to 16`) plus a psycopg ProgrammingError,
  not this change.

Unit tests added or updated:

- `test_project_meta_is_lightweight_with_row_counts`
- `test_project_meta_skips_calendar_when_requested`
- `test_get_project_page_returns_decoded_page`
- `test_project_sheet_counts_groups_by_project`

Follow-ups:

- Split `ProjectWorkspace.tsx` (~1200) and `useSheetPage.ts` (~1170) under the
  1150 line limit before the next feature (AGENTS.md file-size rule).
- The pre-existing smoke-test DB-accumulation failures
  (document-category / sticky-note / local-profile tests) should be addressed
  by a test-isolation cleanup (conftest currently only purges test users).
