# SCHOLARDOCX-0100: Sticky Card Date Revert

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Revert the sticky card preview footer to display only the updated date without any prefix labels (like "Created:" or "Updated:").

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Keeps the card preview footer simple, clean, and uncluttered.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: The sticky card preview should display only the updated timestamp without labels.

## Technical Context

Technical notes:

- Modify `NoteCard` in `StickyNotesView.tsx` to remove the double date layout and revert to a single date element showing `note.updated_at` without prefix text.

## Scope

In scope:

- Revert card footer date markup in `StickyNotesView.tsx`.

Out of scope:

- Modifying focused view modal footer.

## Acceptance Criteria

- The card preview footer shows only the updated date (e.g., `Jun 28`), without any label.

## Implementation Plan

- Edit `StickyNotesView.tsx` inside the `NoteCard` component:
  - Replace the flexbox column of two dates with a single `<small className="sticky-card-date">` showing the formatted updated date.
- Verify the frontend build.

## Unit Test Plan

- Presentation-only change; no new unit tests are needed.

## File Size Check

Files expected to be edited:

- `frontend/src/components/StickyNotesView.tsx`

Line-count risk:

- Low

## Verification Plan

- `npm run build` in `frontend`

## Completion Notes

Changed files:

- `frontend/src/components/StickyNotesView.tsx`
- `AI-Context/jira-tasks/SCHOLARDOCX-0100-sticky-card-date-revert.md`

Verification completed:

- `npm run build` completed successfully.

Unit tests added or updated:

- None.

Follow-ups:

- None.
