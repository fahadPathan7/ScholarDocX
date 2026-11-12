# SCHOLARDOCX-0259: Free-form projects and blank lettered sheets

Status: Review

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-11-13

## Summary

Projects stop being degree-labelled application campaigns and become free-form
containers. New sheets start as a blank grid with lettered columns (A, B, C…)
that the user renames in place. The grid gains direct column manipulation and
sheet tabs so nothing basic needs a modal.

## Business Context

Links:

- Business file: [business/decisions.md](../../business/decisions.md)

Business value: users track more than degree applications (visas, housing,
budgets, reading lists). A mandatory Bachelors/Masters/PhD label and a
30-column application tracker on every new sheet made anything else awkward.

## Functional Context

Links:

- Functional file: [functional/feature-project-workspace.md](../../functional/feature-project-workspace.md)

Requirements:

- FR-7.25: A project needs only a name. No degree type is asked for or shown.
- FR-7.26: A new sheet is blank by default: lettered text columns, no rows.
- FR-7.27: Templates are optional and chosen from a gallery at creation.
- FR-7.28: Columns are renamed, added, retyped, moved, hidden and deleted
  directly from the grid header.
- FR-7.29: Sheets of the open project are switchable, creatable and renamable
  from a tab strip under the grid.

## Technical Context

Links:

- Technical file: [technical/project-structure.md](../../technical/project-structure.md)

Technical notes:

- No schema change. `projects.degree_type` is already nullable; it is kept for
  existing rows and no longer written by the UI.
- `POST /projects/{id}/sheets` accepts optional `template` (`blank` |
  `application`) and `columns`. Default changes from the degree tracker to
  `blank`.
- Lumi (AI actions) keeps the application tracker for projects that carry a
  legacy degree, and uses a blank sheet otherwise. It no longer invents a
  degree for a project when the user gave none.

## Scope

In scope:

- Project create/edit form, project list, dashboard project line.
- Sheet creation (blank default, template gallery, one request).
- Grid header: inline rename, add column, column menu.
- Click-to-type empty rows under the data.
- Sheet tab strip.
- Splitting `ProjectWorkspace.tsx` (1449 lines before this task).

Out of scope:

- Dropping the `degree_type` column or the `degree_workspaces` table.
- Formulas, cell ranges, multi-cell selection.
- Moving saved views / colour rules when a column is renamed (they key on the
  column name today; unchanged).

## Acceptance Criteria

- Creating a project asks for a name and an optional description only.
- The project list is one grid, pinned first, with no degree grouping.
- "Create sheet" with no choices made yields columns A–E and zero rows.
- Double-clicking a header renames the column; cell values and cell formatting
  follow the new name; a duplicate or empty name is refused with a message.
- The `+` header adds the next unused letter column in one click.
- Clicking an empty row creates a record and starts editing the clicked cell.
- The tab strip opens another sheet, creates a blank one, and renames one.
- Existing projects and sheets open unchanged.

## Implementation Plan

- Backend: `blank_sheet_columns`, `template`/`columns` on sheet creation, AI
  degree defaults.
- Frontend pure helpers in `sheet/sheetColumns.ts`; hook
  `sheet/useColumnQuickEdits.ts`; `ColumnHeaderCell`, `SheetTabsBar`.
- Extract `projects/ProjectsHome.tsx`, `projects/ProjectSheetsSection.tsx`,
  `projects/CreateSheetModal.tsx` from `ProjectWorkspace.tsx`.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `frontend/src/components/sheet/__tests__/sheetColumns.test.ts`
- `backend/tests/unit/test_blank_sheets.py`
- Update `backend/tests/smoke/test_store.py` (default is now blank).

## File Size Check

Files expected to be edited:

- `frontend/src/components/ProjectWorkspace.tsx` (1449 → split)
- `frontend/src/components/sheet/SheetTable.tsx` (762)
- `frontend/src/components/sheet/useSheetPage.ts` (1227, already over)
- `backend/app/services/store.py` (1219, already over)

Line-count risk:

- High

`useSheetPage.ts` and `store.py` were over the limit before this task. New
logic goes into new files; each of those two gains only wiring.

## Verification Plan

- `tsc` type check of the frontend.
- Python byte-compile of touched backend files.
- Tests written, not run (repo rule: run only on request).

## Completion Notes

Decisions made while building:

- `quickAddRow` no longer waits for its save before returning the new row
  index. Clicking an empty row opens the editor at once; the save is still
  queued ahead of the cell edit that follows.
- The application tracker now includes its attachment file columns (CV, SOP,
  transcripts, LORs). The old code built that list and never appended it, so
  the Attachments group was always empty; `test_create_sheet_with_single_default_table`
  had been asserting the intended behaviour.
- The `+` header is pinned to the right edge, so the grid's 1200px minimum
  width is dropped for tables that have it (otherwise the pinned cell sat on
  top of real columns).
- Creating a project or a sheet opens it straight away.
- Sheet starting-column code moved to `backend/app/services/sheet_templates.py`
  so `store.py` ends smaller than it started (1219 -> 1143).

Changed files:

- Backend: `app/services/sheet_templates.py` (new), `app/services/store.py`,
  `app/api/routes.py`, `app/services/ai_actions.py`,
  `app/services/ai_actions_workspace.py`, `app/services/ai_actions_execute.py`,
  `app/services/ai_actions_catalog.py`
- Frontend (new): `components/projects/ProjectsHome.tsx`,
  `ProjectSheetsSection.tsx`, `CreateSheetModal.tsx`, `projectIdentity.ts`,
  `useLockMainScroll.ts`; `components/sheet/sheetColumns.ts`,
  `useColumnQuickEdits.ts`, `ColumnHeaderCell.tsx`, `SheetTabsBar.tsx`,
  `sheet-columns.css`; `projects-free.css`
- Frontend (edited): `components/ProjectWorkspace.tsx` (1449 -> 1012),
  `components/sheet/SheetTable.tsx`, `SheetTableRow.tsx`, `useSheetPage.ts`,
  `sheetGrid.ts`, `components/DashboardView.tsx`, `main.tsx`
- Context: `functional/feature-project-workspace.md`, `business/decisions.md`
  (BD-015), `technical/project-structure.md`,
  `technical/frontend-visual-system.md`, `technical/api-boundaries.md`

File sizes over the 1000-line target after this task:

- `components/sheet/useSheetPage.ts` 1243 (was 1227; +16 lines of wiring for
  the new hook). Over the 1150 grace before this task; splitting it is the
  follow-up below, not done here.
- `components/ProjectWorkspace.tsx` 1012, `backend/app/services/store.py` 1143:
  both smaller than they started.

Verification completed:

- `tsc --noEmit` clean; `vite build` succeeds.
- Touched backend files byte-compile; the pure functions in
  `sheet_templates.py` were exercised directly.
- `make guards` (billing, context drift, CSS) all ok.
- Rendered in headless Chrome from a temporary harness with mock data (since
  removed): project list, sheet list, create-sheet gallery, grid, header
  rename, column menu, add column, click-to-type row, tab rename.
- NOT verified: the full app against a real backend and database. Nothing was
  clicked through end to end, and no test suite was run.

Unit tests added or updated (written, not run, per the repo rule):

- `frontend/src/components/sheet/__tests__/sheetColumns.test.ts` (new)
- `frontend/src/components/projects/__tests__/projectIdentity.test.ts` (new)
- `backend/tests/unit/test_blank_sheets.py` (new)
- `backend/tests/smoke/test_store.py` (blank default, supplied columns, and
  the tracker test now asks for `template="application"`)
- No `refreshTrigger` test for the new components: they take data as props and
  the refresh still runs in `ProjectWorkspace`, which owns the fetches.

Follow-ups:

- Split `useSheetPage.ts` (formatting and selection are natural seams).
- Saved views and colour rules key on column names and do not follow a rename
  (true of the column editor before this task as well).
- Lumi's planner prompt still shows a PhD-flavoured example project; it now
  only sets a degree when the user names one.
- `docs/screenshots/projects.png` and `sheet.png` show the old screens.
- Existing projects keep `degree_type` in the database, hidden; decide later
  whether to drop the column.
