# SCHOLARDOCX-0108: Projects Grid UI and Polish

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-11

## Summary

Polish the Projects tab program layout grid, category cards, and card toolbar action buttons. The design will be made highly compact, utilizing quiet neutral hovers, subtle button borders, and organic grid row heights instead of rigid, tall box limits.

## Business Context

Links:
- Business file: None

Business value:
- Improves layout readability and reduces eye-strain on the home dashboard view.

## Functional Context

Links:
- Functional file: None

Requirements:
- Compact card padding and height.
- Low-contrast, clean action buttons (Pin, Dashboard, Edit, Delete).
- Highlighted focus outline rings for keyboard accessibility.

## Technical Context

Links:
- Technical file: [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/frontend-visual-system.md)

Technical notes:
- Remove hardcoded row heights in `.project-card-grid`.
- Adjust `.project-card` padding, heights, and border accents.
- Re-style pin buttons, edit/delete actions, and primary action buttons for flat layout.

## Scope

In scope:
- Overhaul project grid row and column structures in `visual-refresh.css`.
- Update `.project-card` base layout, typography, description heights, and actions.
- Improve spacing and buttons within cards.

Out of scope:
- Back-end SQLite and endpoint changes.

## Acceptance Criteria

- Cards fit their contents naturally with standard padding and a neat minimum height limit.
- Toolbar buttons display as borderless flat icons when inactive, showing soft highlights only on hover/active states.
- The global layout compiles correctly.

## Implementation Plan

- Update grid and card layout styles in `visual-refresh.css`.
- Verify build with Vite.

## Unit Test Plan

Unit tests needed:
- No (pure CSS visual layout presentation polish).

## File Size Check

Files expected to be edited:
- `frontend/src/visual-refresh.css`

Line-count risk:
- Low

## Verification Plan

- Run Vite compile check: `npx vite build` in `frontend/`.

## Completion Notes

Changed files:
- `frontend/src/visual-refresh.css`
- `AI-Context/technical/frontend-visual-system.md`

Verification completed:
- Vite production build successfully compiled.
- Overhauled card layouts to use auto heights instead of fixed `190px` row grid auto rows.
- Re-styled `.project-card` padding to compact `14px 16px` and minimum height to `128px`.
- Removed vertical left highlight indicator lines to align with visual refresh principles.
- Cleaned up Pin, Dashboard, Edit, and Delete action buttons to be borderless icon buttons when inactive, showing soft background overlays on hover/active states.
- Cleaned up titles, metadata labels, and description text typography.
- Verified build and compatibility checks.

Unit tests added or updated:
- None (pure visual styling presentation changes).

Follow-ups:
- None.
- None.
