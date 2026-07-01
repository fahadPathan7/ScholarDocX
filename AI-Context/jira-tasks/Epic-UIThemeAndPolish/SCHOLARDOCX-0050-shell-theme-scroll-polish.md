# SCHOLARDOCX-0050: Shell Theme And Internal Scroll Polish

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-05-28

## Summary

Refresh the visible theme and shell behavior after screenshot review. The UI
should feel calmer, more polished, and more exciting while keeping the left
navigation, header, and floating side panels fixed in the viewport.

## Functional Context

Links:
- [acceptance-criteria.md](../../functional/acceptance-criteria.md)
- [feature-dashboard-hierarchy.md](../../functional/feature-dashboard-hierarchy.md)
- [feature-documents-storage.md](../../functional/feature-documents-storage.md)
- [feature-project-workspace.md](../../functional/feature-project-workspace.md)

## Technical Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)
- [file-size-and-modularity.md](../../technical/file-size-and-modularity.md)

## Requirements

- Judge and improve the current dashboard, projects, and documents UI from the
  screenshots.
- Make the theme more eye-soothing while adding enough contrast and energy to
  avoid a washed-out appearance.
- Keep the left navigation and right floating panels from becoming whole-panel
  scrollers.
- Preserve internal scrolling for content sections, sheet tables, chat bodies,
  and notification lists.
- Keep project card rows capped at four cards on wide screens. Card widths
  should remain fluid, not fixed; only height should stay stable for scanning.
- Keep broad styling work in `frontend/src/visual-refresh.css`.
- Avoid editing oversized source files unless behavior requires it.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check Dashboard, Projects, and Documents at desktop viewport.
- Verify the document/page shell does not scroll, the sidebar does not scroll,
  and scrollable content is delegated to section bodies/lists.

## Implementation Notes

- Refreshed the visual system toward a cooler mist canvas, deep pine sidebar,
  teal primary actions, restrained blue accents, and subtle warm accent states.
- Locked `html`, `body`, app shell, sidebar, main region, and floating side
  panels to viewport height with hidden whole-panel overflow.
- Kept long content scroll delegated to section bodies, project lists, document
  category grids, notification content, chat messages, and sheet tables.
- Tightened dashboard section chrome and clock sizing so simple cards do not
  clip at shorter desktop heights.
- Fixed the AI assistant panel sizing so the panel itself stays fixed while
  messages scroll internally and the input remains visible.
- Increased the AI assistant height cap so the chat can use more vertical
  screen space while preserving internal message scrolling.
- Capped the Projects card grid at four fluid-width cards on wide screens,
  kept card height stable, and added responsive fallbacks for narrower
  viewports.
- Recorded the accepted UI choice: maximum four project cards per row is
  preferred, but card width should stay fluid rather than fixed.
- Added a calmer blue focus-visible outline to replace the harsh default focus
  ring.

## Changed Files

- `frontend/src/visual-refresh.css`
- `frontend/src/documents-refresh.css`
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0050-shell-theme-scroll-polish.md`

## Verification

- Passed: `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`.
- Browser checked Dashboard at `http://localhost:5173`: body, app shell, main,
  and sidebar all remain fixed with hidden overflow; dashboard list sections
  scroll internally.
- Browser checked Projects: project list scrolls within the section body while
  the page shell and sidebar remain fixed.
- Browser checked Documents: document category grid scrolls internally while
  the page shell and sidebar remain fixed.
- Browser checked Notifications: right panel remains fixed with internal
  notification-list scrolling.
- Browser checked AI Assistant: right panel remains fixed with internal chat
  scrolling and visible input row.
- Follow-up browser check: AI Assistant renders taller with the panel fixed,
  message area scrolling internally, and input row visible.
- Follow-up browser check: Projects renders fluid-width cards with no more than
  four cards per row on wide desktop; narrower desktop viewports step down to
  three cards.
- Unit tests not added because this task only changes CSS layout and visual
  styling; behavior was verified with build and browser layout checks.
