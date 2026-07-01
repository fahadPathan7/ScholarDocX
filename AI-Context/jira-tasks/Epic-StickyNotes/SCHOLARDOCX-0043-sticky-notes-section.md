# SCHOLARDOCX-0043: Sticky Notes Section

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-05-28

## Summary

Add a new Sticky Notes section after Documents. Users should be able to create,
edit, delete, color, bold, and use checklist-style notes in a friendly local
workspace panel.

## Functional Context

Links:
- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

## Requirements

- Add persistent local sticky notes.
- Add Sticky Notes navigation after Documents.
- Let users create, edit, and delete sticky notes.
- Support note colors.
- Support bold styling.
- Support checklist-style notes with completion toggles.
- Keep the UI friendly, clear, and easy to use.

## Verification Plan

- Run backend focused tests.
- Run frontend build.
- Browser-check sticky note create/edit/check/delete workflow.

## Implementation Notes

- Added persistent `sticky_notes` records to the local SQLite schema.
- Added sticky notes to the generic local CRUD API at `/sticky_notes`.
- Added a Sticky Notes navigation item after Documents.
- Added a dedicated `StickyNotesView` component with color swatches, bold mode,
  text notes, checklist notes, edit, delete, and checklist completion toggles.
- Added a dedicated sticky-note stylesheet so the new UI stays isolated from
  Documents and Projects styling.
- Added sticky note count to the central dashboard snapshot.

## Changed Files

- `backend/app/db/schema.py`
- `backend/app/services/store.py`
- `backend/app/api/routes.py`
- `backend/tests/test_store.py`
- `frontend/src/App.tsx`
- `frontend/src/components/StickyNotesView.tsx`
- `frontend/src/components/sticky-notes.css`
- `AI-Context/functional/feature-sticky-notes.md`
- `AI-Context/technical/api-boundaries.md`
- `AI-Context/technical/data-model-draft.md`
- `AI-Context/technical/project-structure.md`

## Verification

- Passed: `npm run build` in `frontend`.
- Passed: `pytest tests/test_store.py tests/test_workspace.py` in
  `backend`.
- Browser checked the Sticky Notes tab renders after Documents and shows the
  composer, color controls, bold/checklist controls, and note board.
- API smoke-created text and checklist notes, confirmed they rendered in the
  browser, then deleted the temporary smoke notes.
