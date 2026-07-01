# SCHOLARDOCX-0046: Sticky Notes UX Refinement

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-05-28

## Summary

Refine Sticky Notes so the main page shows the board and a single create
button. Creating or editing a note should happen in a floating modal. Remove
the confusing bold control, focus the composer on checklist creation, and fix
long-note layout so dates do not overlap note content.

## Functional Context

Links:
- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

## Requirements

- Main Sticky Notes view should not show the full create form by default.
- A single create button opens the note modal.
- Edit uses the same floating modal.
- Remove bold styling controls from the UI.
- Checklist creation should be prominent and easy.
- Long note content should not overlap dates or action controls.

## Verification Plan

- Run frontend build.
- Browser-check Sticky Notes board, modal create/edit layout, and long note
  card layout.

## Implementation Notes

- Replaced the permanent left-side note composer with one board-level
  `Create note` button.
- Moved create and edit into a floating modal.
- Removed the bold control from the Sticky Notes UI.
- Made checklist mode the default in the create modal and kept the checklist
  control prominent.
- Reworked note cards into header, scrollable content, and footer rows so long
  notes/checklists cannot overlap the date.

## Changed Files

- `frontend/src/components/StickyNotesView.tsx`
- `frontend/src/components/sticky-notes.css`
- `AI-Context/functional/feature-sticky-notes.md`

## Verification

- Passed: `npm run build` in `frontend`.
- Browser checked the Sticky Notes board: only one create button is visible on
  the page, the modal opens from that button, bold is gone, checklist controls
  are visible, and long checklist content scrolls above the date footer.
