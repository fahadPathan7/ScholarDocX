# SCHOLARDOCX-0089: Sticky Note Checklist Footer Cleanup

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Remove the extra overflow strip and progress bar from checklist sticky-note
cards so the bottom of the card stays clean.

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Makes checklist cards feel cleaner and prevents visual clutter in the board.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: Sticky note cards should present checklist-focused notes cleanly
  without unnecessary footer affordances.

## Technical Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Technical notes:

- The checklist card footer lives in `frontend/src/components/StickyNotesView.tsx`.
- The extra white strip comes from the `sticky-more` overflow hint and the
  checklist progress bar block.

## Scope

In scope:

- Remove the checklist overflow strip from card previews.
- Remove the checklist progress bar from card previews.

Out of scope:

- Changing the note body content rendering.
- Changing the focused full-note view.

## Acceptance Criteria

- Checklist cards no longer show a white strip or progress bar at the bottom.
- The card still shows the checklist summary badge and visible checklist items.
- Text notes continue to render as before.

## Implementation Plan

- Remove the checklist overflow hint block from the card preview.
- Remove the progress bar block from the card preview.
- Verify the frontend build.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- No dedicated frontend test harness exists in this repo; verify with the
  frontend build.

If no unit tests are needed, explain why:

- This is a presentation-only change with no new logic path.

## File Size Check

Files expected to be edited:

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/StickyNotesView.tsx`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-sticky-notes.md`

Line-count risk:

- Low

If any file exceeds 1000 lines, explain why.

- None expected.

## Verification Plan

- `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`

## Completion Notes

Changed files:

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/StickyNotesView.tsx`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-sticky-notes.md`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/jira-tasks/SCHOLARDOCX-0089-sticky-note-checklist-footer-cleanup.md`

Verification completed:

- `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`

Unit tests added or updated:

- None

Follow-ups:

- Checklist cards now end cleanly after the visible items and summary badge.
