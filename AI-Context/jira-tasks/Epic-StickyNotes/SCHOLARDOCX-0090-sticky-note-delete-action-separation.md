# SCHOLARDOCX-0090: Sticky Note Delete Action Separation

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Move the delete action in the Sticky Notes focused view away from the Cancel
and Edit buttons so users are less likely to misclick the destructive action.

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Reduces accidental destructive actions in a high-frequency note review flow.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: Sticky note focused views should keep destructive actions visually
  separated from primary actions.

## Technical Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Technical notes:

- The focused note modal footer lives in `frontend/src/components/StickyNotesView.tsx`.
- The current delete button sits between Cancel and Edit and should be moved
  into a separate row or otherwise visually detached.

## Scope

In scope:

- Reposition the delete button in the focused note modal.
- Keep the edit and cancel actions together.

Out of scope:

- Changing delete confirmation behavior.
- Changing note-card delete actions.

## Acceptance Criteria

- Delete is no longer adjacent to the primary action cluster.
- Cancel and Edit remain grouped together.
- The focused view feels safer to use on pointer devices.

## Implementation Plan

- Rework the focused note footer layout into separate action groups.
- Place delete away from the main action cluster.
- Verify the frontend build.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- No dedicated frontend test harness exists in this repo; verify with the
  frontend build.

If no unit tests are needed, explain why:

- This is a presentation-only layout change with existing delete behavior.

## File Size Check

Files expected to be edited:

- `frontend/src/components/StickyNotesView.tsx`
- `frontend/src/components/sticky-notes.css`
- `AI-Context/functional/feature-sticky-notes.md`

Line-count risk:

- Low

If any file exceeds 1000 lines, explain why.

- None expected.

## Verification Plan

- `npm run build` in `frontend`

## Completion Notes

Changed files:

- `frontend/src/components/StickyNotesView.tsx`
- `frontend/src/components/sticky-notes.css`
- `AI-Context/functional/feature-sticky-notes.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0090-sticky-note-delete-action-separation.md`

Verification completed:

- `npm run build` in `frontend`

Unit tests added or updated:

- None

Follow-ups:

- Delete now sits on its own row below the Cancel/Edit cluster in the focused view.
