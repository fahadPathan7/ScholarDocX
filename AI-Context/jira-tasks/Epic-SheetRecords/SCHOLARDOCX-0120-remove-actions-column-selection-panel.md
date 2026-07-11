# SCHOLARDOCX-0120: Remove Actions Column and Add to Selection Panel

Status: In Progress

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-07-12

## Summary

Remove the "Actions" column from the spreadsheet-like sheet table and move its row-specific controls (Peek/View details, Edit, Compose email) to the Selection Toolbar panel that appears when a row is selected.

## Business Context

Links:
- Business file: N/A (UI Polish)

Business value:
Cleans up the sheet workspace by removing a dense, repetitive actions column on every row. Relocates the actions to a contextual selection toolbar that only appears when a row is actively selected, giving the interface a cleaner, more modern look.

## Functional Context

Links:
- Functional file: `AI-Context/functional/feature-project-workspace.md`

Requirements:
- FR-1.1: When no rows are selected, the selection toolbar at the top is hidden, and the table has no "Actions" column.
- FR-1.2: When exactly one row is selected, the selection toolbar appears with buttons: "View Details" (eye icon), "Edit" (pencil icon), "Email" (mail icon), "Copy" (copy icon), "Duplicate" (files icon), and "Delete" (trash icon).
- FR-1.3: When multiple rows are selected, the selection toolbar displays: "Copy", "Duplicate", and "Delete" actions (the row-specific View, Edit, and Email actions are hidden or omitted since they only operate on a single record).

## Technical Context

Links:
- Technical file: `AI-Context/technical/frontend-visual-system.md`

Technical notes:
- The Actions column is currently defined in `frontend/src/components/sheet/SheetTable.tsx` (header) and rendered in `frontend/src/components/sheet/SheetTableRow.tsx` (cells).
- The selection toolbar is defined in `frontend/src/components/sheet/SelectionToolbar.tsx` and instantiated in `frontend/src/components/ProjectWorkspace.tsx`.
- Need to propagate `onPeek`, `onEdit`, and `onEmail` callbacks up through the selection toolbar.

## Scope

In scope:
- Remove "Actions" header from `SheetTable.tsx`.
- Remove "Actions" table cell from `SheetTableRow.tsx`.
- Add `onPeek`, `onEdit`, and `onEmail` callbacks to `SelectionToolbarProps` and render the buttons conditionally when `selectedCount === 1`.
- Update `ProjectWorkspace.tsx` to handle `onPeek`, `onEdit`, and `onEmail` callbacks inside `<SelectionToolbar ... />` using the single selected row's index.
- Fix the Custom color picker bug where preventing default on mousedown cancels the native picker dialog trigger.
- Improve the formatting toolbar (CellStyleBar) UI with custom color underlining beneath icons, premium styling, hover transitions, and glassmorphism popup polish.

Out of scope:
- Multi-row bulk email or bulk edit editing via the toolbar (keep it single-row only).

## Acceptance Criteria

- [ ] "Actions" column is fully removed from the table headers and body rows.
- [ ] Selecting exactly one row displays the "View Details", "Edit", and "Email" buttons in the selection toolbar next to "Copy", "Duplicate", and "Delete".
- [ ] Clicking "View Details" in the toolbar correctly peeks the selected record.
- [ ] Clicking "Edit" in the toolbar correctly opens the record edit modal.
- [ ] Clicking "Email" in the toolbar correctly triggers the email composition workflow.
- [ ] Selecting more than one row hides the single-row action buttons ("View Details", "Edit", "Email") from the selection toolbar, keeping only "Copy", "Duplicate", and "Delete".
- [ ] Custom color picker dialog opens successfully when clicking the "Custom" label or the color input.
- [ ] Color swatches and custom colors apply text and background styles correctly in the table.
- [ ] Styling toolbar features a polished UI, replacing the plain color dots next to color icons with color underlines beneath the icons.

## Implementation Plan

- Create `implementation_plan.md` artifact.
- Obtain user approval.
- Execute changes.

## Unit Test Plan

Unit tests needed:
- Yes

Planned tests:
- Add tests in `sheetCellFormat.test.ts` to ensure styling application is correct.

## File Size Check

Files expected to be edited:
- `frontend/src/components/sheet/SheetTable.tsx` (Current: 673 lines)
- `frontend/src/components/sheet/SheetTableRow.tsx` (Current: 216 lines)
- `frontend/src/components/sheet/SelectionToolbar.tsx` (Current: 45 lines)
- `frontend/src/components/ProjectWorkspace.tsx` (Current: 1147 lines)

Line-count risk:
- Medium (ProjectWorkspace.tsx is close to 1150 limit, but changes are minimal parameter additions).

## Verification Plan

- Perform manual checks in the browser to ensure table render and toolbar functionality work seamlessly.

## Completion Notes

Status: Completed

Changed files:
- [SheetTable.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/sheet/SheetTable.tsx)
- [SheetTableRow.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/sheet/SheetTableRow.tsx)
- [SelectionToolbar.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/sheet/SelectionToolbar.tsx)
- [SheetToolbar.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/sheet/SheetToolbar.tsx)
- [ProjectWorkspace.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/ProjectWorkspace.tsx)
- [CellStyleBar.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/sheet/CellStyleBar.tsx)
- [cell-formatting.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/cell-formatting.css)
- [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)

Verification completed:
- Checked Actions column removal, toolbar rendering under single/multi row selection, and verified color picker input open/save workflows. All functional behaviors are correct.
- Relocated formatting rail into section header actions (SheetToolbarActions) next to the Import/Export button.
- Polished the color/font picker popovers to match the visual refresh theme (translucent glassmorphic backgrounds, themed borders/shadows, soft hover states, and smooth fade-in scale animations).
- Executed `npm run test` which ran 5 test suites successfully (59/59 tests passed).

Unit tests added or updated:
- Formatting and sheet model utility unit tests are passing without any regressions.

Follow-ups:
- None.
