# SCHOLARDOCX-0115: Phase 3 — Data In and Out

Status: In Progress

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-07-02

Planbook: [sheet-experience-upgrade.md](../../planbook/sheet-experience-upgrade.md)

## Summary

Add data import/export capabilities and template generation to the sheet workspace.

## Business Context

Links:

- Business file: [product-goals.md](../../business/product-goals.md)

Business value: Data portability is a fundamental spreadsheet expectation. Users must be able to export their views to standard tools and import data easily. Templates lower the barrier to entry for common workflows.

## Functional Context

Links:

- Functional file: [feature-project-workspace.md](../../functional/feature-project-workspace.md)

Requirements:

- FR-7.5: sheet editing
- FR-7.21: standard styled alert for row limits

## Technical Context

Links:

- Technical file: [project-structure.md](../../technical/project-structure.md)
- Planbook: [sheet-experience-upgrade.md](../../planbook/sheet-experience-upgrade.md)

Technical notes:

- CSV Export: Client-side CSV generation using `URL.createObjectURL(new Blob())`. Must respect current sort and filter.
- CSV Import: File picker, simple CSV parsing (`sheetCsv.ts`), and mapping modal. The modal shows existing columns and suggests creating new ones.
- Templates: Curated JSON templates (pre-defined columns) in `sheetModel.ts`. Local storage saved templates.

## Scope

In scope:

1. CSV Export (Current view)
2. CSV Import (Mapping preview UI, append single PATCH)
3. Sheet Templates ("New sheet from template", "Save current columns as template")

## Acceptance Criteria
- [x] CSV Export button downloads current `viewRows` (respects filters/sorts).
- [x] CSV Import button opens a file picker and reads the file.
- [x] Import Modal maps CSV headers to existing sheet columns.
- [x] Import Modal handles quota limits gracefully.
- [x] Sheet creation supports selecting curated templates (e.g., Professor Outreach, University Shortlist).
- [x] Users can save the current sheet's columns as a Custom Template to `localStorage`.

## Implementation Plan

## Description
Implement Phase 3 of the Sheet Experience Upgrade: Data In and Out.

## Implementation Notes
- `sheetCsv.ts`: Implemented regex-based parser that handles quoted commas and newlines properly without heavy dependencies.
- `CsvImportModal.tsx`: Added mapping UI allowing skipping, mapping to existing, or auto-creating new text columns.
- `sheetModel.ts`: Added predefined `SHEET_TEMPLATES` and local storage utilities for custom templates.
- `ProjectWorkspace.tsx`: Wired up `handleExportCsv` and `CsvImportModal`, updating the sheet creation flow to apply templates via a 2-step API process (create, then patch).
- Completed 2026-07-02. All TypeScript checks pass.

## Verification Plan

- `npm run build` passes with zero errors
- Export CSV matches visible rows.
- Import CSV parses correctly and enforces limits.
- Templates spawn new sheets with correct columns.

## Completion Notes

Changed files:

-

Verification completed:

-

Unit tests added or updated:

-

Follow-ups:

-
