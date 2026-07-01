# SCHOLARDOCX-0031: Visual System Refresh

Status: Done

Owner: AI Agent

Created: 2026-05-27

## Summary

Refresh the whole ScholarDocX UI so the dashboard, projects area, sidebar,
header, floating panels, profile, documents, calendars, and sheets feel more
distinctive, interactive, and smooth.

## Functional Context

Links:
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-dashboard-hierarchy.md)
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md)
- [feature-about-profile.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-about-profile.md)

## Technical Context

Links:
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/file-size-and-modularity.md)
- [coding-standards.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/coding-standards.md)

## Requirements

- Apply a cohesive, high-impact visual refresh across the app.
- Improve sidebar, fixed top header, dashboard sections, project/sheet cards,
  tables, profile, documents, calendars, notifications, assistant panel, and
  modals.
- Add smooth but useful motion for panels, cards, rows, and focus states.
- Do not add external font/CDN dependencies.
- Avoid expanding the oversized legacy stylesheet with broad new rules.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check dashboard, Projects root, project detail/sheets, Profile,
  Documents, notification panel, AI panel, and modal surfaces.

## Implementation Notes

- Added a dedicated `visual-refresh.css` override layer instead of expanding
  the oversized legacy stylesheet.
- Updated global visual tokens, local font stack, warm patterned workspace
  canvas, sidebar, sticky header, cards, buttons, lists, project/sheet cards,
  calendar surfaces, tables, profile, documents, modals, notifications, and AI
  assistant styling.
- Added panel/card/page motion with reduced-motion support.
- Fixed the AI panel positioning issue caused by fixed positioning inside the
  blurred sticky header.
- Added a mid-width responsive profile layout so fields do not crowd on laptop
  viewports.

## Changed Files

- `frontend/src/main.tsx`
- `frontend/src/visual-refresh.css`
- `AI-Context/functional/feature-dashboard-hierarchy.md`
- `AI-Context/functional/feature-project-workspace.md`
- `AI-Context/technical/README.md`
- `AI-Context/technical/frontend-visual-system.md`

## Verification

- `npm run build` passed in `frontend`.
- Browser smoke checked dashboard, Projects root, project detail, Documents,
  Profile, notification panel, and AI assistant panel.
- Confirmed no horizontal overflow in checked views and AI panel opens inside
  the viewport.
