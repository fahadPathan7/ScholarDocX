# Planbook: Sheet Experience Upgrade

Status: Phases 1-5 complete; Phase 6 (spreadsheet-grade editing, performance,
reliability — SCHOLARDOCX-0118) in progress

Related: functional/feature-project-workspace.md (FR-7), Epic-SheetRecords

## Why

The sheet table is the core daily work surface. It already has a solid base:
eight column types (text, number, bool, file, date, select, url, group),
column resize with persisted widths, groups, per-column unique constraint,
full-cell viewer/editor, generated record form, date-proximity row coloring,
frozen index column, drag-to-scroll, Gmail/Outlook compose from rows, and
agent read/write actions. What it lacks is the *comfort layer* users expect
from a spreadsheet: sort, filter, search, bulk operations, keyboard flow,
undo, and data in/out.

## Current-State Constraints

- `frontend/src/components/ProjectWorkspace.tsx` is 1774 lines — already past
  the 1150 hard cap. CODE_RULES requires splitting it before the next feature.
- Rows live in `project_pages.rows_json` (JSON array); all row operations go
  through `PATCH /project_pages/{id}`, which enforces `records_per_sheet` and
  `total_records` (SCHOLARDOCX-0111). Any bulk paste/import path must reuse
  that route so limits keep holding.
- Sorting/filtering/search can be pure client-side view state at secure personal workspace
  scale (≤ a few hundred rows/sheet by plan limits). No backend changes needed
  for Phase 1–2 except optional persisted column metadata.
- Column-level persistence has a home already: `ColumnDef` in `columns_json`
  (width is stored there today; `hidden` fits the same pattern with the
  existing `migrateColumns` defaulting). Saved views store in browser
  localStorage first (secure personal workspace, per user, zero schema change).

## Phase 0 — Mandatory foundation (no behavior change)

Split `ProjectWorkspace.tsx` into cohesive modules, each under 1000 lines:

- `sheet/SheetTable.tsx` — the grid (headers, rows, cells, resize, scroll).
- `sheet/SheetToolbar.tsx` — actions row (add record/column, edit columns,
  future: search/filter/view controls).
- `sheet/ColumnEditor.tsx` — add/edit-columns modals + SelectOptionsEditor.
- `sheet/useSheetPage.ts` — page load/persist/migrate state hook.
- `sheet/sheetModel.ts` — ColumnDef/ColumnType, migrateColumns, shared consts.
- `ProjectWorkspace.tsx` keeps navigation, project/sheet lists, wiring.

Exit criteria: identical behavior, existing tests green, each file ≤ 1000.

## Phase 1 — Core grid comfort (highest daily value)

1. **Column sorting** — click header to cycle asc → desc → off. Type-aware
   comparators (number, date, bool, text; empty values last). View-state only;
   stored row order unchanged unless the user picks "apply order".
2. **Quick search** — toolbar input filtering rows across all visible columns
   with match count ("8 of 42") and highlight. Escape clears.
3. **Per-column filters** — header menu; controls by type: select/bool →
   value checklist, date → overdue / next N days / range, number → min–max,
   text → contains. Active-filter chips above the grid; one-click clear.
4. **Hide/show columns** — header menu toggle + "Columns" list in the
   toolbar; persisted as `hidden?: boolean` on ColumnDef.
5. **Row actions on hover** — duplicate row, delete row, open compose, open
   row form; replaces hunting through the edit modal for common actions.
6. **Drag-and-drop column reorder** directly on headers (today only
   up/down buttons inside the edit-columns modal).

## Phase 2 — Editing speed

1. **Keyboard navigation** — arrow keys/Tab move a cell cursor; Enter opens
   the existing full-cell editor; Escape closes; typing starts editing text
   cells. Visible focus ring consistent with the theme.
2. **Multi-row selection** — checkbox column + shift-click ranges; selection
   toolbar with bulk delete, bulk set-value for one column (select/bool/date
   first), bulk duplicate. Reuses the single PATCH persist path.
3. **Undo/redo** — bounded in-memory snapshot stack (columns+rows, ~50
   steps) with Ctrl+Z / Ctrl+Shift+Z and an "Undo" toast after destructive
   actions (row delete, bulk ops, clear).
4. **Copy/paste** — copy selected rows/cells as TSV; paste multi-line TSV as
   new rows mapped to visible column order (limit errors surface the standard
   styled alert per FR-7.21).

## Phase 3 — Data in and out

1. **CSV export** of the current sheet (respects active filters/sort toggle).
2. **CSV import** — file picker → column-mapping preview (map to existing
   columns or create new text columns) → single PATCH append. Limits enforced
   by the route; show remaining-quota hint in the preview.
3. **Sheet templates** — "New sheet from template": curated starters
   (Professor outreach, University shortlist, Scholarship tracker, Document
   checklist) plus "Save current columns as template" (localStorage).

## Phase 4 — Views and insight

1. **Saved views** — named combos of sort + filters + hidden columns +
   search (localStorage per sheet); a default "All rows" view.
2. **Group-by view** — collapse rows into sections by a select/bool column
   (e.g., by Status) with per-section counts.
3. **Footer summary bar** — row count (filtered/total), per-status chips for
   a chosen select column, next upcoming date, filled-percentage for a chosen
   column.
4. **Configurable date-color thresholds per project** — already flagged as
   future work in FR-7 date color rules; small settings panel writing to
   project record.
5. **Row peek panel** — side panel showing one row's full fields read-only
   with jump-to-edit, for scanning long rows without the modal.

## Phase 5 — AI glue (small, reuses existing agent)

1. **"Ask AI about this sheet"** toolbar action — opens the assistant
   pre-scoped with project/sheet names so read/analyze agent actions resolve
   without follow-up questions.
2. **Smart column suggestions** on sheet creation (local heuristics from the
   default-column catalog; no provider call).

## Phase 6 — Spreadsheet-grade editing, performance, reliability

Driven by defects found after Phases 1–5 shipped (see SCHOLARDOCX-0118 for the
defect list D1–D8). Highlights: persists no longer reset view state or undo
history; redo actually works; inline in-cell editing with full keyboard flow
(type-to-edit, Enter/Tab commit-and-move, Delete clears, Ctrl+C/Ctrl+D);
quoted-TSV paste round-trip; real date filter presets + range; bulk set-value;
search highlight; colored select pills; memoized view pipeline, memoized row
component, shared ResizeObserver, content-visibility rows; vitest unit tests
for the pure logic modules.

## Non-Goals (for this planbook)

- Realtime multi-user editing, cell-level change history (needs schema),
  formula columns, cross-sheet references, provider-side email scheduling.

## Test Plan Highlights

- Comparator unit tests per column type (sort) and filter predicates.
- Bulk ops + paste respect `records_per_sheet` (assert the styled alert).
- Undo restores exact columns/rows JSON after delete/bulk edit.
- CSV import mapping and quota preview; CSV export round-trip.
- Mandatory `refreshTrigger` prop test for any new tab-level component.

## Suggested Delivery Order

Phase 0 must come first (file-size rule). Phase 1 is the largest comfort win
per effort. Phase 2 next. Phases 3–5 can be scheduled per user preference.
Each phase becomes one Jira story in Epic-SheetRecords.
