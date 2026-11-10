# SCHOLARDOCX-0227: Never clip page content (Profile Logout unreachable, short-screen clipping)

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

On a laptop-height viewport the Profile page's Logout button was unreachable:
`.profile-page` was `flex: 1; min-height: 0; overflow: hidden` inside
`.tab-container`, so content taller than the viewport was cut off with no
scrollbar. The same family of rule (old "shell fixed, no page scroll" design)
also clipped the Dashboard cards and the sidebar nav on short screens.

## Scope (frontend/src/visual-refresh.css, appended block)

- `.profile-page`: `flex: 0 0 auto; min-height: auto; overflow: visible` —
  grows to content; `.tab-container` owns the scrollbar.
- `.page-grid, .project-home, .project-detail, .sticky-notes-view`:
  `overflow-y: auto` safety net (scroll instead of clip).
- `.page-grid.dashboard-grid`: rows `minmax(min-content, 1fr)` — fill the
  viewport when there is room, never shrink below content.
- `.sidebar`: `overflow-y: auto` (visual-refresh had overridden it to hidden).

## Verification

Playwright audit with a mocked API and a synthetic session (no real data) at
1440x700, 1280x600, 390x700, 1920x1100: Profile and Dashboard scroll with no
clipped containers; mobile unchanged. Pages only checked with empty data —
Projects/Documents/Sticky Notes with many items were not exercised.

## Rule going forward

A page root must never combine `overflow: hidden` with `min-height: 0` unless
it contains its own scroller. See AGENTS.md "Layout freedom".
