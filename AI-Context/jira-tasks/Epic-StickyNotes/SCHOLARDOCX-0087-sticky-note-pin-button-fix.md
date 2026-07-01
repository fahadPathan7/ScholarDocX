# SCHOLARDOCX-0087: Sticky Note Pin Button Fix

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Fix the Sticky Notes card pin button so clicking the pin actually toggles the
local pinned state.

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Makes the Sticky Notes board sorting and pin affordance work as shown in the UI.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: Sticky Notes cards should support clear edit and delete actions and
  keep local note organization usable.

## Technical Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Technical notes:

- The pin action lives in `frontend/src/components/StickyNotesView.tsx`.
- The bug is caused by the card component not receiving the `togglePin`
  handler even though the click handler calls it.

## Scope

In scope:

- Wire the Sticky Notes card pin button to the real toggle handler.
- Keep the button accessible for icon-only use.

Out of scope:

- Sticky note data model changes.
- Dashboard pinning behavior changes.

## Acceptance Criteria

- Clicking the Sticky Notes pin button toggles the local pinned state.
- Pinned notes remain sorted ahead of unpinned notes.
- The button keeps an accessible label for screen readers.

## Implementation Plan

- Inspect the note card props and handler wiring.
- Patch the card component so the pin handler is available in scope.
- Verify the frontend build still passes.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- No dedicated frontend test harness exists in this repo; verify with the
  frontend build.

If no unit tests are needed, explain why:

- The regression is a single React prop wiring bug, and the available
  verification path is the TypeScript frontend build.

## File Size Check

Files expected to be edited:

- `frontend/src/components/StickyNotesView.tsx`

Line-count risk:

- Low

If any file exceeds 1000 lines, explain why.

- None expected.

## Verification Plan

- `npm run build` in `frontend`

## Completion Notes

Changed files:

- `frontend/src/components/StickyNotesView.tsx`
- `AI-Context/jira-tasks/SCHOLARDOCX-0087-sticky-note-pin-button-fix.md`

Verification completed:

- `npm run build` in `frontend`

Unit tests added or updated:

- None

Follow-ups:

- No dedicated frontend test harness was available for this regression.
