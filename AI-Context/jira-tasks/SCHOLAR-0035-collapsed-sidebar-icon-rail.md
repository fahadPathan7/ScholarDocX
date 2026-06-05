# SCHOLAR-0035: Collapsed Sidebar Icon Rail

Status: Done

Owner: AI Agent

Created: 2026-05-28

## Summary

Fix the collapsed left sidebar so navigation icons remain readable and centered
instead of shrinking inside the narrow rail.

## Functional Context

Links:
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md)

## Technical Context

Links:
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/file-size-and-modularity.md)

## Requirements

- Collapsed sidebar should show readable, centered icons.
- Brand icon and navigation icons should not shrink below intended size.
- Active-state marker should not overlap or crowd the icon.
- Hidden labels should remain accessible through button labels or tooltips.
- Keep broad visual changes in `frontend/src/visual-refresh.css`.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check collapsed sidebar dimensions and visible icon sizing.

## Implementation Notes

- Added explicit collapsed sidebar rail styles in `visual-refresh.css`.
- Reduced collapsed rail width to a stable 78px and centered the rail content.
- Set fixed brand and nav icon dimensions so SVGs do not shrink inside narrow
  flex containers.
- Set collapsed nav buttons to 46x44px with zero padding.
- Moved the active marker so it does not squeeze or overlap icons.
- Added ARIA labels and collapsed-state titles to sidebar nav buttons.

## Changed Files

- `frontend/src/App.tsx`
- `frontend/src/visual-refresh.css`
- `AI-Context/technical/frontend-visual-system.md`

## Verification

- `npm run build` passed in `frontend`.
- Browser checked collapsed sidebar after reload.
- Confirmed rail width is 78px, nav buttons are 46x44px, nav icons render at
  20x20px, brand icon renders at 22x22px, labels/titles are present, and no
  horizontal overflow was detected.
