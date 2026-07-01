# SCHOLARDOCX-0093: Sticky Note Footer Action Simplification

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Remove the Cancel button from the sticky-note focused view footer and convert
Delete to an icon-only action.

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Reduces footer clutter and makes the destructive action less visually noisy.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: Sticky note focused view actions should be concise and visually clear.

## Technical Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Technical notes:

- The footer actions live in `frontend/src/components/StickyNotesView.tsx`.
- The current footer still includes a Cancel button and a labeled Delete button.

## Scope

In scope:

- Remove the Cancel footer button.
- Make Delete icon-only with an accessible label.

Out of scope:

- Changing delete confirmation behavior.
- Changing note editing behavior.

## Acceptance Criteria

- The focused note footer no longer shows a Cancel button.
- Delete is icon-only but still accessible.
- Edit remains available.

## Implementation Plan

- Update the sticky-note footer action layout.
- Add an icon-only delete button style if needed.
- Verify the frontend build.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- No dedicated frontend test harness exists in this repo; verify with the
  frontend build.

If no unit tests are needed, explain why:

- This is a presentation-only footer simplification.

## File Size Check

Files expected to be edited:

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/StickyNotesView.tsx`
- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/sticky-notes.css`
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
- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/sticky-notes.css`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-sticky-notes.md`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/jira-tasks/SCHOLARDOCX-0093-sticky-note-footer-action-simplification.md`

Verification completed:

- `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`

Unit tests added or updated:

- None

Follow-ups:

- Cancel removed; Delete is now icon-only with an accessible label.
