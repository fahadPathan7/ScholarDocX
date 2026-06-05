# SCHOLAR-0033: Eye-Soothing Theme And Smaller Dashboard Type

Status: Done

Owner: AI Agent

Created: 2026-05-27

## Summary

Soften the current visual theme because the palette feels harsh and the header
and dashboard type are still too large.

## Functional Context

Links:
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md)

## Technical Context

Links:
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/file-size-and-modularity.md)

## Requirements

- Make the app color theme calmer and easier on the eyes.
- Reduce the main header font size further.
- Reduce dashboard heading, metric, and card typography scale.
- Avoid bright orange/gold accents and strong decorative background patterns.
- Keep broad visual changes in `frontend/src/visual-refresh.css`.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check dashboard header, metric cards, sidebar, and overflow.

## Implementation Notes

- Replaced the warm/orange-heavy theme with a muted sage, fog, and soft slate
  palette.
- Reduced decorative background pattern intensity and softened shadows.
- Removed bright warm section and metric accents in favor of low-saturation
  sage accents.
- Reduced fixed header spacing and lowered the dashboard H1 scale.
- Reduced dashboard section headings, list text, metric cards, and metric
  numbers.

## Changed Files

- `frontend/src/visual-refresh.css`
- `AI-Context/technical/frontend-visual-system.md`

## Verification

- `npm run build` passed in `frontend`.
- Browser checked Dashboard after reload.
- Confirmed no horizontal overflow, fixed header renders around 100px high at
  1280px width, dashboard H1 renders at 22px, section headings at 18px, and
  metric numbers at 24px.
