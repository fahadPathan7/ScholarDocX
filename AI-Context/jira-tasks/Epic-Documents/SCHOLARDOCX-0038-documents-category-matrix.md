# SCHOLARDOCX-0038: Documents Category Matrix

Status: Done

Owner: AI Agent

Epic: Epic-Documents

Created: 2026-05-28

## Summary

Refine the Documents view so category groups render as a matrix of contained
panels. Each category panel should scroll independently, avoiding full-page
right-side overflow when one category has many documents.

## Functional Context

Links:
- [feature-documents-storage.md](../../functional/feature-documents-storage.md)

## Requirements

- Use a matrix-like UI for document categories.
- Keep document rows readable inside each category panel.
- Give each category panel its own vertical scroll when needed.
- Avoid forcing the whole Documents content area to scroll just because a
  category has many documents.
- Preserve the floating upload panel and date-only file metadata.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check the Documents page at desktop width for contained matrix
  panels, independent category scrolling, and no bottom overflow.

## Implementation Notes

- Converted the Documents category area into a bounded matrix grid.
- Kept the upload button in a fixed row above the category matrix.
- Made each category panel own its internal scroll through the section body.
- Reworked document rows into compact card-like tiles that fit inside category
  panels without forcing the whole content area to scroll.

## Changed Files

- `frontend/src/visual-refresh.css`
- `AI-Context/functional/feature-documents-storage.md`

## Verification

- Passed: `npm run build` in `frontend`.
- Browser checked Documents page at 1280x720: category grid renders in three
  columns and two rows, the right-side main content does not scroll, and
  categories with extra files scroll inside their own panel body.
