# SCHOLARDOCX-0119: Cell Text & Cell Formatting for Sheets

**Epic**: Epic-SheetRecords
**Status**: DONE
**Assignee**: AI Agent
**Related**: FR-7, planbook/sheet-experience-upgrade.md

## Objective

Add spreadsheet-grade cell formatting to the project sheet so users can
emphasize and organize data the way they can in Google Sheets / Excel:
bold / italic / underline / strikethrough, text color, cell background,
row background, alignment (L/C/R), font size presets, and a small curated
font family list. Formatting is applied via a compact in-cell format bar
that appears while a cell is being edited, with parity in the full-cell
viewer.

## Background / architecture (validated)

The sheet is a custom `<table>`. Rows are `Record<string, string>` persisted
as a JSON blob (`rows_json` on one `project_pages` row). The existing
reserved `_height` key proves `_`-prefixed metadata can ride along on rows
and round-trip through CSV/paste/undo/AI without any change to those paths:

- **CSV export / paste** (`sheetCsv.ts`, `sheetPaste.ts`) iterate over
  `columns` only, so `_`-prefixed keys never leak into exports.
- **Undo/redo** (`useUndoRedo`) snapshots the whole rows array, so style
  keys participate automatically.
- **AI row updates** (`ai_actions_execute.py:197`) use `row.update(...)`,
  which preserves existing `_cellStyles` on the row.
- **AI row creation** (`row_for_columns`) filters to column names, but new
  rows carry no styles anyway.

So cell formatting needs **zero backend changes** and no DB migration.

## Storage model

Stored as JSON-string values on reserved row keys (mirrors `_height`):

- `_cellStyles` → `JSON.stringify({ "University name": { bold: true, ... } })`
- `_rowStyle` → `JSON.stringify({ bg: "#eef" })`

**Style keys:** `bold`, `italic`, `underline`, `strike`, `color`, `bg`,
`align` (`"left"|"center"|"right"`), `fontSize` (`"sm"|"md"|"lg"|"xl"`),
`fontFamily` (`"sans"|"serif"|"mono"`).

## Scope

1. **Types & model** (`sheetModel.ts`): `CellStyle`, `FONT_SIZES`,
   `FONT_FAMILIES`, `cellStyleToCss()`, `parseCellStyles()`,
   `parseRowStyle()`, `applyCellStyle()`.
2. **State + persistence** (`useSheetPage.ts`): `saveCellStyle`,
   `saveRowStyle`; thread `_cellStyles`/`_rowStyle` through row clones.
3. **Format bar** (`CellStyleBar.tsx` — NEW): compact toolbar with toggles,
   color pickers (native + swatches), alignment, size, font, clear.
4. **Inline editing integration** (`SheetTableRow.tsx`): render the bar
   above the inline editor for non-file cells.
5. **Render application** (`SheetTableRow.tsx` `<td>`: align/bg/font;
   `SheetRecordFields.tsx` `<span>`: bold/italic/underline/strike/color).
6. **Full-cell viewer parity** (`SheetRecordFields.tsx`): same bar in the
   expand-to-view modal.
7. **Row color affordance**: small swatch control in per-row actions.
8. **CSS polish** (styles): `.cell-style-bar`, swatches, active states,
   dark-mode tokens.
9. **Tests**: unit tests for model helpers + round-trip safety.

## Non-goals

Per-cell borders, arbitrary font sizes/families (beyond presets), web fonts
(conflicts with local-first/offline), multi-cell range formatting,
conditional formatting rules.

## Test plan

- vitest unit tests: `cellStyleToCss` mapping, `applyCellStyle`
  toggle-on/off/clear, `parseCellStyles` handles missing/empty/invalid JSON.
- Integration: `saveCellStyle` writes `_cellStyles`, persists, undoable.
- Round-trip: CSV export of a styled sheet contains no `_cellStyles` column.
- `npm run build` green.

## Completion notes

### Changed files

Frontend (new):
- `frontend/src/components/sheet/CellStyleBar.tsx` — NEW compact in-cell
  format bar (bold/italic/underline/strike, text color, cell bg, alignment,
  font size, font family, clear). Toggle buttons, native color pickers with
  swatch popovers, dropdowns for size/font.
- `frontend/src/cell-formatting.css` — NEW styles for the format bar,
  swatches, popovers, and row-color affordance. Dedicated file to keep
  `sheet-table-polish.css` (already near limit) manageable.
- `frontend/src/components/sheet/__tests__/sheetCellFormat.test.ts` — NEW
  24 vitest unit tests for the formatting model helpers.

Frontend (edited):
- `frontend/src/components/sheet/sheetModel.ts` — `CellStyle`/`RowStyle`
  types, `FONT_SIZES`/`FONT_FAMILIES`/`ROW_BG_COLORS` presets,
  `parseCellStyles`/`parseRowStyle` safe-JSON parsers,
  `applyCellStyle`/`clearCellStyle`/`applyRowStyle` immutable mutators,
  `textStyleToCss`/`cellBoxToCss` style→CSS mappers.
- `frontend/src/components/sheet/useSheetPage.ts` — `saveCellStyle`,
  `clearCellFormatting`, `saveRowStyle` (persist + undo); exposed in return.
- `frontend/src/components/sheet/SheetTableRow.tsx` — render the bar above
  the inline editor; apply `cellBoxToCss` to `<td>`; apply `rowStyle.bg` to
  `<tr>`; pass `cellStyle` + style callbacks to `CellRenderer`; NEW
  `RowColorButton` in per-row actions.
- `frontend/src/components/sheet/SheetTable.tsx` — thread
  `onCellStyle`/`onCellClearFormatting`/`onRowStyle` props → row callbacks.
- `frontend/src/components/SheetRecordFields.tsx` — `cellStyle` +
  `onCellStyle`/`onCellClearFormatting` props on `CellRenderer`; apply
  `textStyleToCss` to the inner preview span; render the bar in the viewer.
- `frontend/src/components/ProjectWorkspace.tsx` — pass the three new
  callbacks from `useSheetPage` into `SheetTable`.
- `frontend/src/components/sheet/RowPeekPanel.tsx` — apply cell text style
  (`textStyleToCss`) and cell/row background to the read-only "Record
  Details" preview, so formatting set in the grid also shows in the Peek
  panel.
- `frontend/src/main.tsx` — import `cell-formatting.css`.

Backend: none.

AI-Context:
- `technical/data-model-draft.md` — documented `_cellStyles`/`_rowStyle`
  reserved row keys.
- `technical/frontend-visual-system.md` — format-bar interaction contract.
- `functional/feature-project-workspace.md` — new Cell Formatting section.

### Verification

- `cd frontend && npm test` → 59/59 vitest pass (35 pre-existing + 24 new
  for formatting helpers: parse guards incl. arrays, apply/clear/toggle,
  text vs box CSS mapping, immutability).
- `cd frontend && npm run build` → clean (only pre-existing chunk-size and
  dynamic-import warnings, unrelated to this change).

### Decisions

- Stored styles as JSON-string reserved row keys (`_cellStyles`,
  `_rowStyle`) mirroring `_height` — zero backend/schema changes, and
  confirmed safe across CSV/paste (column-only iteration), undo (whole-row
  snapshots), and AI updates (`.update()` preserves keys).
- Split text-level CSS (bold/italic/color) onto the inner span and
  layout-level CSS (align/bg/font) onto the `<td>` so the whole cell area
  reflects alignment/background/font without distorting the inner content.
- Curated system fonts only (Sans/Serif/Mono) — no web fonts, to honor the
  local-first/offline constraint and avoid layout shift.
- Dedicated `cell-formatting.css` instead of appending to
  `sheet-table-polish.css` (1030 lines) to respect the file-size rule.

### File-size notes

All sheet modules remain within limits. `SheetRecordFields.tsx` grew by
~12 lines (still well under 1000). `SheetTableRow.tsx` grew by ~90 lines
due to `RowColorButton` + style plumbing (still well under 1000).

### Known limitations / follow-ups

- No rectangular multi-cell range formatting (planbook non-goal).
- Format bar appears only in inline-edit mode and the full-cell viewer —
  there is no always-visible format toolbar (by design, to preserve the
  native-spreadsheet feel).
- AI agents do not create or modify formatting themselves, but they
  preserve it when updating rows that already carry it.
