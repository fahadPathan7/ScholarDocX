# SCHOLARDOCX-0243: Sticky Notes and Documents polish (second pass)

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Changes

New `frontend/src/notes-docs-polish.css` (after `dashboard-polish.css`), CSS only. Sticky Notes: warm board, serif title, richer note colours, deeper shadow. Documents: restrained paper cards, serif titles, teal links, paper file rows (the first, heavier attempt was rejected).

## Verification

Playwright screenshots (mocked data) at 1440x900 before and after; `make guard-css` passes. Not exercised: note composer/viewer, archived and overdue notes, checklist notes, many notes, the Documents modals, narrow widths.
