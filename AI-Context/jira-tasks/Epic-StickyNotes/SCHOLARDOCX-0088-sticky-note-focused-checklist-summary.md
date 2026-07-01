# SCHOLARDOCX-0088: Sticky Note Card Checklist Summary

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Add a checklist summary line to Sticky Notes cards so users can see the total
checklist count and how many items are done at a glance.

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Makes checklist-heavy sticky notes easier to scan on the board.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: Sticky note cards should present checklist-focused notes with a clear
  completion summary.

## Technical Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Technical notes:

- The sticky note card rendering lives in `frontend/src/components/StickyNotesView.tsx`.
- The summary can be derived from the existing parsed checklist data already
  used by the card.
- The summary is styled as a compact metadata badge so it does not read like
  note body text.

## Scope

In scope:

- Show one summary line on the checklist sticky note card.
- Keep the summary local to sticky notes.

Out of scope:

- New checklist behaviors or persistence changes.

## Acceptance Criteria

- A checklist note card shows a single summary line.
- The summary line includes total checklist items and completed items.
- Notes without checklists are unaffected.

## Implementation Plan

- Compute checklist totals in the sticky note card.
- Render a compact summary line near the checklist items.
- Verify the frontend build.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- No dedicated frontend test harness exists in this repo; verify with the
  frontend build.

If no unit tests are needed, explain why:

- This is a presentation-only change with existing derived state.

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
- `AI-Context/jira-tasks/SCHOLARDOCX-0088-sticky-note-focused-checklist-summary.md`

Verification completed:

- `npm run build` in `frontend`

Unit tests added or updated:

- None

Follow-ups:

- Summary is shown in the sticky-note card header as a badge so it stays visible and distinct from note text.
