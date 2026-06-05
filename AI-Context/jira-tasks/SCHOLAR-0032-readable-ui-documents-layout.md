# SCHOLAR-0032: Readable UI And Documents Layout Tuning

Status: Done

Owner: AI Agent

Created: 2026-05-27

## Summary

Tune the visual refresh so ScholarDock is more readable and work-focused, with
a smaller header, calmer colors, clearer text, and a Documents view where the
upload panel does not stretch and the uploaded file list can scroll.

## Functional Context

Links:
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md)
- [feature-documents-storage.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-documents-storage.md)

## Technical Context

Links:
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/file-size-and-modularity.md)

## Requirements

- Reduce the global header size and use a more readable local font stack.
- Adjust colors and label treatments so important text is easier to understand.
- Keep the Documents upload panel content-height instead of stretched.
- Give the uploaded documents pane an internal vertical scroller when needed.
- Preserve the existing local-first/no-CDN constraint.
- Avoid broad additions to the oversized legacy stylesheet.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check dashboard/header readability and Documents split-panel layout.

## Implementation Notes

- Replaced the heavier display font stack with a native readable sans stack.
- Reduced the global header size and weight so it stays compact on laptop
  width.
- Softened the visual refresh colors and label styling to improve readability.
- Added explicit Documents section hooks for the upload and uploaded-file panes.
- Kept the upload pane content-height and made the uploaded documents list own
  an internal vertical scroller.
- Prevented the Ask AI action label from wrapping.

## Changed Files

- `frontend/src/App.tsx`
- `frontend/src/visual-refresh.css`
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/functional/feature-dashboard-hierarchy.md`
- `AI-Context/functional/feature-documents-storage.md`

## Verification

- `npm run build` passed in `frontend`.
- Browser checked Dashboard, Documents, and Profile.
- Confirmed header font size renders at 26px on a 1280px viewport, Ask AI stays
  on one line, Documents uploaded-file pane has `overflow-y: auto`, and no
  horizontal overflow was detected.
