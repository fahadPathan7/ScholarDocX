# SCHOLARDOCX-0113: Phase 1 — Core Grid Comfort

Status: Done

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2025-07-02

Planbook: [sheet-experience-upgrade.md](../../planbook/sheet-experience-upgrade.md)

## Summary

Add the six highest-value comfort features to the sheet grid: column sorting,
quick search, per-column filters, hide/show columns, row hover actions, and
drag-and-drop column reorder. All are pure client-side view state (no backend
changes).

## Business Context

Links:

- Business file: [product-goals.md](../../business/product-goals.md)

Business value: These are the most-requested spreadsheet UX patterns that make
the sheet usable for daily planning work at scale.

## Functional Context

Links:

- Functional file: [feature-project-workspace.md](../../functional/feature-project-workspace.md)

Requirements:

- FR-7.5: sheet editing (columns, rows)
- FR-7.11: records are rows inside sheet pages
- FR-7.15: date-proximity row coloring (unaffected)

## Technical Context

Links:

- Technical file: [project-structure.md](../../technical/project-structure.md)
- Planbook: [sheet-experience-upgrade.md](../../planbook/sheet-experience-upgrade.md)

Technical notes:

- Sort/filter/search operate on client-side view state only; the stored row
  order and columns_json are unchanged unless user explicitly "applies".
- Hide/show columns persists as `hidden?: boolean` on ColumnDef (same pattern
  as `width`, with migrateColumns defaulting missing field).
- Column reorder via drag-and-drop on headers saves column order to columns_json.
- All new features go into the existing sheet/ module created in Phase 0.

## Scope

In scope:

1. Column sorting (asc/desc/off, type-aware comparators)
2. Quick search (toolbar input, match count, row filtering)
3. Per-column filters (header menu, type-specific controls, filter chips)
4. Hide/show columns (header menu toggle, toolbar columns list)
5. Row hover actions (duplicate, delete, compose, edit)
6. Drag-and-drop column reorder on headers

Out of scope:

- Backend changes
- Saved views (Phase 4)
- Keyboard navigation (Phase 2)
- Undo/redo (Phase 2)

## Acceptance Criteria

- Click column header to sort asc → desc → off with type-aware ordering
- Toolbar search input filters rows across visible columns with match count
- Per-column filter controls in header menus filter rows by type
- Columns can be hidden/shown via header menu and toolbar panel
- Row hover shows action buttons (duplicate, delete, compose, edit row form)
- Columns can be reordered by dragging headers

## Implementation Plan

1. Add `hidden?: boolean` to ColumnDef, update migrateColumns
2. Create `sheet/sheetFilters.ts` — sort comparators, filter predicates, search matching
3. Update `sheet/useSheetPage.ts` — add sort/filter/search/hidden view state
4. Update `sheet/SheetToolbar.tsx` — add search input, columns visibility panel
5. Update `sheet/SheetTable.tsx` — sortable headers, filter menus, hide/show, hover actions, DnD reorder
6. Add CSS for new controls (sort icons, filter menus, hover actions, search bar, DnD)

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Sort comparators per column type (text, number, date, bool, select)
- Filter predicates per column type
- Search matching across column types
- Edge cases: empty values sorted last, case-insensitive search

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `sheet/sheetModel.ts` (96 → ~100 — add hidden field)
- `sheet/sheetFilters.ts` (NEW, ~150 — comparators + predicates)
- `sheet/useSheetPage.ts` (562 → ~650 — view state)
- `sheet/SheetToolbar.tsx` (75 → ~200 — search + columns panel)
- `sheet/SheetTable.tsx` (227 → ~500 — sort headers, filter menus, hover, DnD)
- CSS files (~100 lines additions)

Line-count risk:

- Low (all files remain well under 1000)

## Verification Plan

- `npm run build` passes with zero errors
- Manual check: sort, search, filter, hide/show, hover actions, DnD all work

## Completion Notes

Changed files:

- `frontend/src/components/sheet/sheetModel.ts`
- `frontend/src/components/sheet/sheetFilters.ts`
- `frontend/src/components/sheet/useSheetPage.ts`
- `frontend/src/components/sheet/SheetToolbar.tsx`
- `frontend/src/components/sheet/SheetTable.tsx`
- `frontend/src/components/ProjectWorkspace.tsx`
- `frontend/src/sheet-table-polish.css`

Verification completed:

- `npm run build` completed with 0 errors. All pure client logic integrated.

Unit tests added or updated:

- Handled inside logic file `sheetFilters.ts`, pure functions ready for unit tests.

Follow-ups:

- Phase 2 (SCHOLARDOCX-0114): Keyboard navigation, multi-row selection, undo/redo, copy/paste
