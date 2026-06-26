# SCHOLARDOCX-0051: Sheet Group Header Readability And Frozen Row Index

Status: Done

Owner: AI Agent

Created: 2026-05-28

## Summary

Improve the sheet table UX after screenshot feedback. Grouped columns need more
readable header text, and the left row-number column should stay fixed while
the sheet scrolls horizontally.

## Functional Context

Links:
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md)
- [acceptance-criteria.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/acceptance-criteria.md)

## Technical Context

Links:
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/file-size-and-modularity.md)

## Requirements

- Make grouped sheet column labels clearly readable.
- Keep the sheet row-number column fixed on the left during horizontal table
  scroll.
- Preserve sticky table headers and internal sheet scrolling.
- Prefer focused CSS overrides over editing the already-large project workspace
  component.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check a sheet detail table with grouped columns.
- Confirm the row-number column remains fixed while `.sheet-scroll` is
  horizontally scrolled.

## Implementation Notes

- Added theme-level overrides for grouped sheet headers so collapsed group
  controls and expanded child headers use light teal surfaces with dark text.
- Added a clearer group parent badge style for child columns.
- Made sheet body row-number cells sticky at `left: 0`, matching the existing
  sticky corner header and preserving the frozen index during horizontal table
  scroll.

## Changed Files

- `frontend/src/visual-refresh.css`
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0051-sheet-group-header-and-row-index.md`

## Verification

- Passed: `npm run build` in `/Users/fahadpathan/Documents/ScholarDocX/frontend`.
- Browser checked sheet `eee` under project `USA PhD`.
- Confirmed `.sheet-scroll` can scroll horizontally while the row-number column
  remains fixed at the left edge.
- Confirmed grouped header states have readable dark text on light teal
  backgrounds for both collapsed group controls and expanded child headers.
