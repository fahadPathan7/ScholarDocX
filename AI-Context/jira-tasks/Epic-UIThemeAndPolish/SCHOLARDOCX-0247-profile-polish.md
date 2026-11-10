# SCHOLARDOCX-0247: Profile page polish

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Changes

New `frontend/src/profile-polish.css`, scoped to `.profile-page:not(#admin-view-root)`: teal-ink hero (was navy/purple), serif hero name, paper section cards, serif section headings, firmer action rows with hover, teal subscription card, red logout.

## Verification

Playwright screenshot (mocked API) of Profile at 1440x900 before and after; Admin page not re-checked (selectors exclude it). Not exercised: the profile modals, narrow widths, expired/warning plan states.
