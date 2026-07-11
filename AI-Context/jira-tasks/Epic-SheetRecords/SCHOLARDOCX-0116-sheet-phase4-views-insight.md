# SCHOLARDOCX-0116: Sheet Phase 4 - Views and Insight

**Epic**: Epic-SheetRecords
**Status**: DONE

## Description
Implement Phase 4 of the Sheet Experience Upgrade: Views and Insight.

## Acceptance Criteria
- [x] Users can save combinations of sorts, filters, and hidden columns as a named "View" locally.
- [x] Users can group rows by a select or bool column, rendering collapsible group headers in the table.
- [x] A footer summary bar appears below the table, showing row counts, status breakdown, next upcoming date, and overall completion percentage.
- [x] Users can configure the "warning" and "danger" date color thresholds for a project, stored locally.

## Implementation Notes
- Views and date color preferences will be stored in `localStorage` to avoid backend schema migrations, aligning with the secure personal workspace philosophy for UI personalization.
- Grouping will be implemented during `SheetTable` rendering by tracking the previous row's value.

## Completion Notes
- Added `Views` dropdown in `SheetToolbar.tsx` for saving and switching between views stored in `localStorage`.
- Added `groupBy` state logic in `useSheetPage.ts` and `applyViewState` in `sheetFilters.ts`.
- Updated `SheetTable.tsx` with dynamic group header rendering based on previous row values and `collapsedGroups` state.
- Created `SheetFooter.tsx` to calculate and render view metrics (counts, status chips, completion %, next date).
- Added `DateColorConfigModal.tsx` for configuring date color thresholds in `localStorage`, passing this to `SheetTable.tsx` and `CellRenderer`.
