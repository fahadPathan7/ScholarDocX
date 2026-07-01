# SCHOLARDOCX-0052: Sheet Table Density And Cell Preview Polish

Status: Done

Owner: AI Agent

Created: 2026-05-28

## Summary

Improve the sheet table as the heart of the project workspace. The table should
look more refined, preserve a stable scan-friendly row rhythm, and prevent large
or long cell values from overflowing into nearby columns.

## Functional Context

Links:
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md)
- [acceptance-criteria.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/acceptance-criteria.md)

## Technical Context

Links:
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/file-size-and-modularity.md)

## Requirements

- Improve sheet table font size, weight, spacing, and overall polish.
- Prevent long text from automatically expanding row height.
- Keep cell content as a clipped preview suitable for scanning.
- Let users view the full cell value from the grid without entering edit mode.
- Make each clickable cell preview consume the whole visible cell area instead
  of rendering as a chip inside the cell.
- Ensure long unbroken words, emails, and URLs do not bleed into neighboring
  cells.
- Preserve internal table scrolling, sticky headers, and frozen row index.
- Use a focused stylesheet instead of growing oversized legacy CSS files.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check a sheet with long text, long words, grouped columns, and
  horizontal scrolling.
- Confirm long content remains inside its cell, rows keep stable visual height,
  and the sheet remains readable.

## Implementation Notes

- Added a dedicated `sheet-table-polish.css` imported after the broad legacy and
  visual refresh styles, so future sheet polish can stay isolated.
- Added a `sheet-cell-preview` class to rendered cell values and file badges,
  with native `title` text for full-value hover inspection.
- Replaced the ambiguous clipped-cell fade block with a clickable cell preview
  that opens a full-cell viewer with copy support.
- Removed the zoom-in cursor, browser tooltip, and inner-pill hover treatment so
  values read as part of the cell, not controls inside the cell.
- Set compact table typography, tabular numerals, stronger header weight, and a
  stable 64px row preview rhythm.
- Clamped cell previews to three lines and forced long words, emails, and URLs
  to wrap/clip inside their own cell.
- Preserved sticky headers, horizontal sheet scrolling, grouped-header contrast,
  and the frozen row-number column.

## Changed Files

- `frontend/src/main.tsx`
- `frontend/src/components/SheetRecordFields.tsx`
- `frontend/src/sheet-table-polish.css`
- `AI-Context/functional/feature-project-workspace.md`
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0052-sheet-table-density-polish.md`

## Verification

- Passed: `npm run build` in `/Users/fahadpathan/Documents/ScholarDocX/frontend`.
- Browser checked sheet `eee` under project `USA PhD`.
- Confirmed row heights remain stable at 64px in the table preview.
- Confirmed long cell previews do not leak right or downward outside their
  parent cells.
- Confirmed clicking a populated cell opens the full-cell viewer and exposes the
  complete cell value.
- Confirmed populated cell previews consume the visible cell surface without an
  inner chip or browser tooltip.
- Browser re-check confirmed cell previews use pointer cursor, no `title`
  tooltip, and the preview surface fills the cell content area while still
  opening the full-cell viewer.
- Confirmed the old clipped-cell fade CSS no longer applies.
- Confirmed the row-number column remains fixed while `.sheet-scroll` is
  horizontally scrolled.
- Unit tests not added because this task is CSS/markup presentation polish;
  behavior was verified through build and browser layout checks.
