# SCHOLARDOCX-0039: Documents Category Card Modal

Status: Done

Owner: AI Agent

Epic: Epic-Documents

Created: 2026-05-28

## Summary

Refine the Documents view so the main page shows only category summary cards.
Individual document files should be hidden until the user opens a category.

## Functional Context

Links:
- [feature-documents-storage.md](../../functional/feature-documents-storage.md)

## Requirements

- Show document categories as cards with category name and document count.
- Do not show direct file rows in the main Documents page.
- Do not use scrollbars inside category cards.
- Open a modal when the user clicks a category card.
- Show the category's file rows and actions inside the modal.
- Let the modal content scroll when that category has many files.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check Documents main view for category-only cards.
- Browser-click a category card and verify files appear in a scrollable modal.

## Implementation Notes

- Replaced main-page category file lists with clickable category summary cards.
- Kept main Documents view free of direct file rows and category scrollbars.
- Added a category modal that shows the selected category's document rows and
  existing pin, dashboard pin, edit, and delete actions.
- Kept modal file content independently scrollable.

## Changed Files

- `frontend/src/App.tsx`
- `frontend/src/visual-refresh.css`
- `AI-Context/functional/feature-documents-storage.md`

## Verification

- Passed: `npm run build` in `frontend`.
- Browser checked Documents main view: category cards show counts and no direct
  file rows.
- Browser opened a category card: selected files render in a modal and the
  modal content uses its own scroll area.
