# SCHOLARDOCX-0114: Phase 2 — Editing Speed (Power User Input)

Status: Done

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2025-07-02

Planbook: [sheet-experience-upgrade.md](../../planbook/sheet-experience-upgrade.md)

## Summary

Add power user input features to the sheet grid: keyboard navigation, multi-row selection, bulk operations, undo/redo, and copy/paste.

## Business Context

Links:

- Business file: [product-goals.md](../../business/product-goals.md)

Business value: Accelerates data entry and modification, moving the sheet from a simple data grid closer to a real spreadsheet experience.

## Functional Context

Links:

- Functional file: [feature-project-workspace.md](../../functional/feature-project-workspace.md)

Requirements:

- FR-7.5: sheet editing (columns, rows)
- FR-7.11: records are rows inside sheet pages
- Paste TSV must enforce row limits.

## Technical Context

Links:

- Technical file: [project-structure.md](../../technical/project-structure.md)
- Planbook: [sheet-experience-upgrade.md](../../planbook/sheet-experience-upgrade.md)

Technical notes:

- Keyboard navigation: Track `focusedCell: { rowIndex, colName }` in view state.
- Undo/redo: Bounded in-memory snapshot stack (columns+rows, ~50 steps) inside `useSheetPage.ts`.
- Multi-row selection: Track `selectedRows: Set<number>` in view state.
- Bulk operations: Route all changes through the standard `persistPage` for backend validation.
- Copy/paste: Utilize clipboard API for TSV format.

## Scope

In scope:

1. Keyboard navigation (arrow keys/Tab move focus; Enter/typing starts edit; Escape closes)
2. Multi-row selection (checkbox column, shift-click ranges, bulk delete, bulk duplicate, bulk set-value)
3. Undo/redo (snapshot stack on data changes, Ctrl+Z / Ctrl+Shift+Z, Toast on destructive actions)
4. Copy/paste (TSV format to/from clipboard)

Out of scope:

- Backend changes
- CSV import/export (Phase 3)

## Acceptance Criteria

- Arrow keys move cell focus indicator
- Enter opens cell editor; typing overrides text cells
- Checkbox column selects rows; shift-click selects ranges
- Selection toolbar appears when rows selected, offering bulk actions
- Ctrl+Z undoes the last data change; Ctrl+Shift+Z redoes
- Paste multi-line TSV appends rows mapped to visible columns

## Implementation Plan

1. Create `sheet/sheetUndo.ts` — manage the undo/redo stack
2. Update `sheet/useSheetPage.ts` — integrate undo stack, selection state, cell focus state
3. Update `sheet/SheetTable.tsx` — render checkbox column, cell focus ring, keyboard event listeners
4. Create `sheet/SelectionToolbar.tsx` — bulk action buttons
5. Update `sheet/sheetPaste.ts` (NEW) — TSV parsing and clipboard API handlers
6. Add CSS for focus rings and selection toolbar

## Verification Plan

- `npm run build` passes with zero errors
- Manual check: Keyboard nav works, multi-select works, undo reverts bulk delete, paste adds rows up to limit

## Completion Notes

Changed files:

- `frontend/src/components/sheet/sheetUndo.ts`
- `frontend/src/components/sheet/sheetPaste.ts`
- `frontend/src/components/sheet/useSheetPage.ts`
- `frontend/src/components/sheet/SelectionToolbar.tsx`
- `frontend/src/components/ProjectWorkspace.tsx`
- `frontend/src/components/SheetRecordFields.tsx`
- `frontend/src/components/sheet/SheetTable.tsx`
- `frontend/src/sheet-table-polish.css`

Verification completed:

- `npm run build` completed with 0 errors. All pure client logic integrated.

Unit tests added or updated:

- Reusable pure functions exported from `sheetPaste.ts` and `sheetUndo.ts`.

Follow-ups:

- Phase 3 (SCHOLARDOCX-0115): Data In/Out (CSV Export/Import)
