# SCHOLARDOCX-0240: Projects tab polish

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Changes

- `ProjectWorkspace.tsx`: project card meta is now structured (degree chip, intake, status chip, created date) and the card
  gets a `degree-<type>` class; no behaviour change.
- New `frontend/src/projects-polish.css` (imported in `main.tsx` after `tools-polish.css`): section cards, degree-grouped
  headings with a dot, project and sheet cards with accent edge, layered shadow and hover lift, status/degree chips, serif
  titles, stronger sheet-count pill and pin buttons, teal primary buttons, breadcrumb bar, project-dashboard stat cards.

## Verification

Playwright screenshots (mocked API) of the project list and project detail at 1440x900 before and after; sheet editor
screenshot reviewed (left as is). Not exercised: real created dates, long names/descriptions, the quota bar with a real limit,
narrow widths, the full sheet table with many rows.
