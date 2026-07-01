# SCHOLARDOCX-0098: Sticky Card Date Font Size

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Slightly increase the font size of the date in the sticky card preview footer to improve legibility.

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Improves the readability of the card date in the sticky notes overview.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: Card preview metadata should remain clear and legible.

## Technical Context

Technical notes:

- `.sticky-card-date` in `sticky-notes.css` has `font-size: 11px;`.
- Increase this slightly to `12px` for better legibility.

## Scope

In scope:

- Adjust `font-size` of `.sticky-card-date` in `sticky-notes.css`.

Out of scope:

- Modifying formatting of dates.
- Changing focused modal date styles.

## Acceptance Criteria

- The font size of the date on the sticky card preview is slightly larger and easier to read.

## Implementation Plan

- Modify `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/sticky-notes.css` to change `.sticky-card-date` `font-size` from `11px` to `12px`.
- Verify the frontend build.

## Unit Test Plan

- Presentation-only CSS change; no new unit tests are needed.

## File Size Check

Files expected to be edited:

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/sticky-notes.css`

Line-count risk:

- Low

## Verification Plan

- `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`

## Completion Notes

Changed files:

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/sticky-notes.css`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/jira-tasks/SCHOLARDOCX-0098-sticky-card-date-font-size.md`

Verification completed:

- `npm run build` completed successfully.

Unit tests added or updated:

- None.

Follow-ups:

- None.
