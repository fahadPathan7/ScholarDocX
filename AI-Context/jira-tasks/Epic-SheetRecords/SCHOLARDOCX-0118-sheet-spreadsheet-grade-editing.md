# SCHOLARDOCX-0118: Sheet Spreadsheet-Grade Editing, Performance, and Reliability

**Epic**: Epic-SheetRecords
**Status**: DONE
**Assignee**: AI Agent
**Related**: planbook/sheet-experience-upgrade.md (Phase 6), FR-7

## Objective

Make the project sheet a genuine Google Sheets/Excel replacement for application
tracking: fix the defects that make the current implementation unreliable in
daily use, add a fast inline-editing keyboard flow, and remove the render-time
performance cliffs.

## Defects found (root causes of "not working")

- D1: The page-load effect re-runs on `selectedPage.updated_at`, so **every
  persist wipes search, sort, filters, groupBy, and the undo history**. Sorting
  a column then editing one cell silently resets the whole view.
- D2: `sheetUndo` stores only pre-mutation snapshots; the newest state is never
  in history, so **redo restores the wrong state**.
- D3: A **single click on any cell opens the modal editor** (CellRenderer
  preview onClick), which fights the cell-focus model and makes editing slow.
- D4: The **date filter menu is a stub** — hardcoded "overdue" despite presets
  existing in `sheetFilters.ts`.
- D5: `formatTSV` quotes multiline values but `parseTSV` cannot parse quotes —
  **copy → paste round-trip corrupts rows**.
- D6: Paste/bulk append does not check `records_per_sheet` client-side; limit
  errors surface only as a generic toast (violates FR-7.21 styled alert).
- D7: `rows.indexOf(row)` per rendered row (O(n²)), a `ResizeObserver` +
  timeout per cell, and an unmemoized search→filter→sort pipeline recomputed on
  every render.
- D8: Select-all checkbox compares `selectedRows.size === viewRows.length`,
  wrong when selection includes rows outside the filtered view; single-row
  delete leaves stale selection indices.

## Scope

1. **Reliability**
   - Split load effect: full view-state + history reset only on page change;
     server sync on `updated_at` skips self-echo (last-saved JSON ref) and
     preserves view state and history for external changes.
   - Rewrite `useUndoRedo` as a pointer-into-history model (`record(next)`
     after mutation); update every call site incl. CSV import.
   - Quoted TSV parsing (shared delimiter parser with sheetCsv).
   - Client-side records limit check on paste/duplicate/import with styled
     dialog alert; selection map fixes; clear selection on structural changes.
2. **Performance**
   - `useMemo` for the view pipeline, render columns, row-index map.
   - Extract memoized `SheetTableRow`; stable callbacks.
   - Shared module-level ResizeObserver for cell overflow detection.
   - `content-visibility: auto` on sheet rows.
3. **Spreadsheet interaction**
   - Inline cell editor (text/number/url/date/select/bool) rendered in-cell:
     single click focuses, double-click / Enter / F2 / typing edits; Enter
     commits + moves down, Tab commits + moves right, Escape cancels.
   - Delete/Backspace clears the focused cell; Ctrl+C copies focused cell or
     selected rows (TSV); Ctrl+D fills down from the cell above.
   - Modal editor stays for file cells and via an expand control on the
     focused cell (long-text comfort, copy button).
   - Quick add row: append an empty row inline and start editing.
4. **Filters, bulk, visuals**
   - Date filter menu: Overdue / Next 3 / 7 / 30 days / custom From–To range
     (new `dateRange` filter kind).
   - Selection toolbar "Set value" bulk edit for one column.
   - Search: highlight matching cells, "X of Y" count, Escape clears.
   - Select options render as colored pills (stable color per option), bool as
     Yes/No pill.
5. **Tests**: introduce vitest (dev-only, local) with unit tests for
   `sheetFilters`, `sheetPaste`, `sheetUndo`, `sheetCsv`.

## Non-goals

Row virtualization/windowing (content-visibility covers secure personal workspace scale),
formula columns, cross-sheet references, realtime multi-user (planbook
non-goals unchanged).

## File-size plan

- `SheetTable.tsx` (672): extract `FilterMenu.tsx`, `SheetTableRow.tsx`,
  `InlineCellEditor.tsx` — stays well under 1000.
- `useSheetPage.ts` (885): extract pure helpers to `sheetViewState`/existing
  modules if it approaches 1000.

## Test plan

- vitest unit tests: comparators per type, filter predicates incl. dateRange,
  quoted TSV round-trip, undo/redo pointer semantics, CSV round-trip.
- `npm run build` green; manual flow: sort → edit cell → sort persists; undo →
  redo restores; paste from Google Sheets with multiline quoted cell.

## Completion notes

### Changed files

Frontend:
- `frontend/src/components/sheet/useSheetPage.ts` — load/sync split
  (self-echo skip via `lastSyncedRef`; view state + history reset only on
  page change), `record(next)` undo semantics at every mutation site,
  memoized `applyViewState` + `rowIndexMap`, `ensureRowCapacity` limit guard
  (paste/duplicate/add/quick-add), `bulkSetValue`, `quickAddRow`,
  view-aware `selectAll`, selection/focus cleared on delete.
- `frontend/src/components/sheet/sheetUndo.ts` — rewritten: pure
  `createHistory/recordHistory/undoHistory/redoHistory` + thin hook; the
  current state now lives in the stack so redo works.
- `frontend/src/components/sheet/sheetCsv.ts` — generic `parseDelimited`
  (quotes open only at field start, so `5" tablet` stays literal).
- `frontend/src/components/sheet/sheetPaste.ts` — quoted TSV parsing via
  `parseDelimited`; copy→paste now round-trips multiline cells.
- `frontend/src/components/sheet/sheetFilters.ts` — `dateRange` filter kind,
  `DATE_PRESET_LABELS`, `filterSummary` chip labels.
- `frontend/src/components/sheet/SheetTable.tsx` — rewritten orchestrator:
  memoized renderColumns/view positions, view-order keyboard navigation,
  inline-edit state, type-to-edit (seed only for text/url/number),
  Delete-clears-cell, Ctrl+C (cell or selected rows TSV), Ctrl+D fill-down,
  Tab wraps / ArrowRight stops, quick-add row, filter chips with summaries,
  select/bool checklist from options ∪ row values (fixes bool true/false vs
  Yes/No mismatch).
- `frontend/src/components/sheet/SheetTableRow.tsx` — NEW memoized row
  (editing one cell re-renders one row).
- `frontend/src/components/sheet/InlineCellEditor.tsx` — NEW in-cell editor;
  Enter commits+down, Tab commits+right, Escape cancels, blur commits;
  select/bool commit on change.
- `frontend/src/components/sheet/FilterMenu.tsx` — NEW (extracted); full
  date presets + custom From–To range (old menu hardcoded "overdue").
- `frontend/src/components/sheet/SelectionToolbar.tsx` — "Set value" bulk
  edit popover (typed inputs per column type; files/groups excluded).
- `frontend/src/components/sheet/SheetToolbar.tsx` — Escape clears search,
  proper X clear icon, "X of Y" match-count chip.
- `frontend/src/components/sheet/SheetFooter.tsx` — bool completion counts
  Yes/true/1 (was only 'true', which the UI never stores).
- `frontend/src/components/SheetRecordFields.tsx` — `openOnClick` prop
  (grid single-click focuses instead of opening the modal; file cells keep
  click-to-open), colored select pills + Yes/No bool pills, one shared
  module-level ResizeObserver instead of two observers per cell.
- `frontend/src/components/ProjectWorkspace.tsx` — wiring: limit param,
  rowIndexMap/searchQuery/quickAddRow props, `record` after CSV import.
- `frontend/src/sheet-table-polish.css` — focus ring, search highlight,
  pills, inline editor, expand button, quick-add row, match chip, set-value
  popover, `content-visibility: auto` on rows (safe: table-layout is fixed).
- `frontend/package.json` — vitest devDependency + `npm test` script.

Backend (pre-existing bug found during runtime verification):
- `backend/app/api/routes.py`, `backend/app/services/ai_actions_execute.py`
  — `fetchone()[0]` on `legacy_connection` raises NoSuchColumnError, so ANY
  user with a finite `sheets_per_project` limit (general_user!) could not
  create sheets at all (500). Fixed with `COUNT(*) AS sheet_count` + named
  access in both the route and the agent action path.

### Verification

- `cd frontend && npm test` → 35/35 vitest unit tests pass (comparators,
  filter predicates incl. dateRange, quoted TSV round-trip, undo/redo
  pointer semantics + MAX_HISTORY cap, CSV round-trip).
- `cd frontend && npm run build` → clean.
- `cd backend && .venv/bin/pytest -k "sheet or limit or record"` → 45 pass.
- End-to-end Playwright drive against the real app (isolated
  SCHOLARDOCX_WORKSPACE, registered general_user): 16/16 checks — login →
  create project → create sheet from University Shortlist template →
  quick-add rows with type-to-edit → select pill render → sort survives
  cell edit → Ctrl+Z/Ctrl+Shift+Z → search chip/highlight/Escape → select
  filter chip → date preset menu → bulk Set value on 2 rows → quoted
  multiline TSV paste → Delete clears cell → reload persistence.

### Decisions

- No row virtualization: `content-visibility: auto` + memoized rows covers
  secure personal workspace scale (≤ a few hundred rows) without breaking grouped headers
  or sticky columns.
- View loads/switches are not undo steps and don't persist hidden flags by
  themselves (next persist carries them).
- `saveCellValue` no longer throws when a save is in flight — rapid inline
  commits queue as full-payload PATCHes (last-write-wins, local backend).
- Type-to-edit seeds only text/url (and digits for number); select/bool/date
  just open their constrained editor.

### File-size notes

- All sheet modules ≤ 974 lines. `ProjectWorkspace.tsx` 1092 (pre-existing,
  within grace), `sheet-table-polish.css` 1030 (within grace) — split
  candidates before the next sheet feature.

### Known limitations / follow-ups

- Quick-add row appends at the end; with an active search/filter the new
  empty row may be hidden by the current view (data is safe; footer count
  shows it).
- Cell-level copy covers the focused cell / selected rows; no rectangular
  multi-cell range selection (planbook non-goal).
- Undo/redo of column deletes restores data via full-snapshot persist —
  intended, but agent-side edits between undo steps are overwritten
  (single-user secure app, acceptable).
- Root repo still carries `extract.py`, `split.py`, `fix_imports.py`,
  `fix_portal.py`, `extracted.json` from the Phase-0 split commit — look
  like leftover one-off scripts; flagged for the user to delete.
