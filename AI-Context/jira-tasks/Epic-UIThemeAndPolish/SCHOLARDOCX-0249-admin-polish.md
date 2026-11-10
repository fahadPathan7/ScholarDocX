# SCHOLARDOCX-0249: Admin panel polish

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Changes

`admin.css`: indigo colors remapped to teal. New `admin-polish.css` (scoped to `#admin-view-root`): tab strip and active pill, paper cards/panels/stat cards, serif headings and values, table header and row hover, Tailwind indigo utility overrides, primary button.

## Verification

Playwright screenshots (mocked API) of Dashboard, Users and Role Limits tabs at 1440x900; an invisible active-tab icon was caught and fixed. Not exercised: Requests, Invites, Settings, Audit, Info, Notification Texts tabs; admin modals; narrow widths.
