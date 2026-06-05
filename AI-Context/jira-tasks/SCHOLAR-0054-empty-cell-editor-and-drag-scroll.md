# SCHOLAR-0054: Empty Cell Editing And Drag Scroll

Status: Done

Owner: AI Agent

Created: 2026-05-28

## Summary

Make every sheet cell, including empty cells, open the inline cell editor. The
editor should respect column type, including date/time inputs, boolean/select
controls, and local file attachment upload/selection. Also make horizontally
scrollable work areas support mouse left-click hold-and-drag scrolling.

## Functional Context

Links:
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-project-workspace.md)
- [acceptance-criteria.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/acceptance-criteria.md)

## Technical Context

Links:
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/file-size-and-modularity.md)

## Requirements

- Empty sheet cells are selectable from the grid and open the same cell editor.
- Saving from an empty cell writes only that clicked cell value.
- Date columns use date/datetime editing in the cell panel.
- Number, boolean, and select columns use type-aware controls.
- File columns use the existing local document picker/upload flow in the cell
  panel so users can attach or replace a file from the same dialog.
- File upload refreshes the available local file list before saving the cell.
- Horizontally scrollable surfaces support left-click hold-and-drag horizontal
  scrolling while preserving normal clicks on buttons, inputs, links, and text
  editing controls.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check opening an empty text cell, typing a value, saving, and seeing
  the preview update.
- Browser-check opening an empty date cell and seeing a typed date input.
- Browser-check a file cell opens the local document picker/upload affordance.
- Browser-check horizontal drag scrolling on the sheet table.

## Implementation Notes

- Empty cells now render the same full-cell clickable target as filled cells,
  with a quiet dash preview inside the clickable cell surface.
- The cell viewer no longer short-circuits blank values; it opens with an empty
  draft and persists through the existing single-cell save path.
- Date and datetime cells use the typed date input already used by the record
  form, including the picker affordance when the browser supports it.
- File cells render the existing `FilePickerField` inside the cell viewer, so
  users can search local documents, clear a linked file, upload a new local
  document, and save that selected value for only the active cell.
- Added a small global horizontal drag-scroll installer. It detects horizontal
  overflow ancestors, starts panning after a horizontal drag threshold, suppresses
  the accidental click after a drag, and ignores controls such as buttons,
  links, inputs, selects, textareas, file pickers, modal controls, resize
  handles, and reorder handles.

## Changed Files

- [SheetRecordFields.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/SheetRecordFields.tsx)
- [ProjectWorkspace.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/ProjectWorkspace.tsx)
- [horizontalDragScroll.ts](/Users/fahadpathan/Documents/ScholarDock/frontend/src/lib/horizontalDragScroll.ts)
- [main.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/main.tsx)
- [sheet-table-polish.css](/Users/fahadpathan/Documents/ScholarDock/frontend/src/sheet-table-polish.css)
- [visual-refresh.css](/Users/fahadpathan/Documents/ScholarDock/frontend/src/visual-refresh.css)
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-project-workspace.md)
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/frontend-visual-system.md)

## Verification

- Passed `npm run build`.
- Browser verified the `eee` sheet now exposes empty cells as clickable
  full-cell targets instead of dead dashes.
- Browser verified opening an empty Professor department cell shows an empty
  textarea editor in the cell panel.
- Browser verified opening an empty Scheduled send time cell shows a
  `datetime-local` input.
- Browser verified expanding the Attachments group and opening an empty SOP
  file cell shows the existing document picker/upload affordance in the cell
  panel.
- Browser verified left-click hold-and-drag on the sheet scroll surface moved
  horizontal `scrollLeft` from `1702` to `1962`, confirming horizontal panning.
