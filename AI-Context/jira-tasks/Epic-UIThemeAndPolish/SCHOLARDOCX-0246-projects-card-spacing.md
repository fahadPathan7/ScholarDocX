# SCHOLARDOCX-0246: Project and sheet cards were too congested

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Changes

CSS only, appended to `frontend/src/projects-polish.css`: card grid columns 320px minimum with a 24px gap, card padding 22/24px, larger gaps inside cards (title row, chips, actions), 36px between degree groups, and the empty scrollbar track on project/sheet section bodies removed (overflow auto, padded body).

## Verification

Playwright screenshot (mocked API) of the project list at 1440x900 after the change. Not exercised: the sheet cards on the project page, very long names, narrow widths.
