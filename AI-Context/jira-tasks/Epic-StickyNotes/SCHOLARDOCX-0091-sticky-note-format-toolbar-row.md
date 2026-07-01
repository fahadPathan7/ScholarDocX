# SCHOLARDOCX-0091: Sticky Note Format Toolbar Row

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Keep the sticky-note font style and font size controls in the same toolbar row
so the formatting tools read as one group instead of wrapping apart.

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Makes the note composer easier to scan and reduces friction while formatting
  note appearance.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: Sticky note composer formatting controls should stay grouped together in
  one row where possible.

## Technical Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Technical notes:

- The sticky note toolbar lives in `frontend/src/components/StickyNotesView.tsx`.
- The font style and size controls are currently separate flex items, which
  allows the toolbar to wrap between them.

## Scope

In scope:

- Group the font style and font size controls together.
- Keep the existing color, checklist, and sketch controls intact.

Out of scope:

- Redesigning the entire sticky-note composer.
- Changing note data or persistence.

## Acceptance Criteria

- Font style and font size controls appear on the same row.
- The toolbar still wraps sensibly on narrow layouts.
- Other composer controls remain functional.

## Implementation Plan

- Wrap the font style and font size controls in a shared row container.
- Adjust the toolbar CSS so the grouped controls behave as one unit.
- Verify the frontend build.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- No dedicated frontend test harness exists in this repo; verify with the
  frontend build.

If no unit tests are needed, explain why:

- This is a presentation-only layout change.

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
- `AI-Context/jira-tasks/SCHOLARDOCX-0091-sticky-note-format-toolbar-row.md`

Verification completed:

- `npm run build` in `frontend`

Unit tests added or updated:

- None

Follow-ups:

- Font style and font size are grouped in one toolbar row inside the sticky-note composer.
