# SCHOLARDOCX-0099: Sticky Card Two Dates

Status: Done

Owner: AI Agent

Created: 2026-06-28

## Summary

Display both the creation date and the updated date in the sticky card preview footer, while keeping only the updated date in the focused sticky note modal footer.

## Business Context

Links:

- [feature-sticky-notes.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-sticky-notes.md)

Business value:

- Allows users to quickly see both when a note was originally created and when it was last edited directly from the overview dashboard.

## Functional Context

Links:

- [feature-sticky-notes.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-sticky-notes.md)

Requirements:

- FR-8: The sticky card preview should display both creation and update timestamps.

## Technical Context

Technical notes:

- `note.created_at` and `note.updated_at` are both returned by the backend store.
- Update `NoteCard` in `StickyNotesView.tsx` to group both dates in a flex column layout on the right side of the card footer.
- The focused modal footer already displays only the updated timestamp (`viewingNote.updated_at`), which aligns with requirements.

## Scope

In scope:

- Update `NoteCard` component markup to render both `created_at` and `updated_at`.
- Ensure appropriate labeling ("Created" and "Updated").

Out of scope:

- Changing backend data schema.
- Changing focused modal footer layout.

## Acceptance Criteria

- The card preview footer shows both "Created: [date]" and "Updated: [date]".
- The focused view modal continues to show only the updated date/time.

## Implementation Plan

- Edit `StickyNotesView.tsx` inside the `NoteCard` component:
  - Replace the single `<small>` tag for date with a flexbox column wrapping both dates.
- Verify the frontend build.

## Unit Test Plan

- Presentation-only frontend layout change; no new unit tests are needed.

## File Size Check

Files expected to be edited:

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/StickyNotesView.tsx`

Line-count risk:

- Low

## Verification Plan

- `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`

## Completion Notes

Changed files:

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/StickyNotesView.tsx`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/jira-tasks/SCHOLARDOCX-0099-sticky-card-two-dates.md`

Verification completed:

- `npm run build` completed successfully.

Unit tests added or updated:

- None.

Follow-ups:

- None.
