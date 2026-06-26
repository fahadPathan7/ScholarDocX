# SCHOLARDOCX-0053: Inline Cell Viewer Editing

Status: Done

Owner: AI Agent

Created: 2026-05-28

## Summary

Let users edit a single sheet cell directly from the full-cell viewer. The
viewer should remain focused on one cell, save only that cell value, and update
the table preview after save.

## Functional Context

Links:
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md)
- [acceptance-criteria.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/acceptance-criteria.md)

## Technical Context

Links:
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/file-size-and-modularity.md)

## Requirements

- Full-cell viewer supports editing the selected cell value.
- Saving updates only that cell in the current sheet row.
- Saving persists the sheet page and updates the grid preview.
- Keep Copy and Close behavior.
- Preserve compact grid previews, row height, and full-cell click behavior.
- Text cell editing should expand naturally with multi-line input up to 10
  visible text lines, then scroll inside the editor.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check opening a cell viewer, editing a value, saving, and seeing the
  table preview update.
- Confirm only the clicked cell changes.

## Implementation Notes

- The full-cell viewer now opens as an edit-focused dialog for the selected
  cell, with typed controls where practical: number, date/time, boolean, select,
  and a textarea for longer text/file values.
- Save calls a single-cell persistence path that rebuilds the current sheet
  rows with only the clicked row/column changed, patches the selected page, and
  refreshes the project summary.
- Copy and Close remain available. Cancel closes without saving. Escape closes,
  and Ctrl/Cmd+Enter saves from the editor.
- Empty cells still render as quiet dashes and do not open the viewer.
- Multi-line textarea editors now auto-grow from a compact starting height up
  to 10 visible text lines, then scroll internally so long content does not
  keep enlarging the modal.

## Changed Files

- [ProjectWorkspace.tsx](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/ProjectWorkspace.tsx)
- [SheetRecordFields.tsx](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/SheetRecordFields.tsx)
- [sheet-table-polish.css](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/sheet-table-polish.css)
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md)
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)

## Verification

- Passed `npm run build`.
- Browser verified on the live local app: opened a sheet cell, edited its value
  in the viewer, saved, confirmed the table preview changed, reopened the cell,
  reverted the temporary value, and confirmed the original cell value was
  restored.
- Browser verified the textarea sizing with an existing 11-line Professor
  interests cell: the editor rendered at the 10-line cap, used internal
  scrolling, and kept the modal height controlled.
- Confirmed the edit path is scoped to the clicked cell and preserves the
  compact sheet preview layout.

## Follow-ups

- `ProjectWorkspace.tsx` remains above the target file-size limit and should be
  split before starting the next feature that touches this workspace surface.
