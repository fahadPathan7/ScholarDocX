# SCHOLARDOCX-0112: Phase 0 — Split ProjectWorkspace.tsx

Status: Done

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2025-07-02

Planbook: [sheet-experience-upgrade.md](../../planbook/sheet-experience-upgrade.md)

## Summary

Mandatory foundation refactor: split the 1774-line `ProjectWorkspace.tsx` into
cohesive modules, each under 1000 lines. Zero behavior change. This must be
completed before any Phase 1+ sheet comfort features can begin.

## Business Context

Links:

- Business file: [product-goals.md](../../business/product-goals.md)

Business value: Enforce the project's file-size rule (CODE_RULES max 1000,
grace 1150). The current 1774-line monolith blocks all Phase 1–5 sheet work.

## Functional Context

Links:

- Functional file: [feature-project-workspace.md](../../functional/feature-project-workspace.md)

Requirements:

- FR-7 (all sub-items): no behavior change, pure structural split.

## Technical Context

Links:

- Technical file: [project-structure.md](../../technical/project-structure.md)
- Planbook: [sheet-experience-upgrade.md](../../planbook/sheet-experience-upgrade.md)

Technical notes:

- Four external consumers import from `ProjectWorkspace.tsx`:
  1. `App.tsx` → `ProjectWorkspace`, `ProjectNavigationTarget`
  2. `FullScreenSheet.tsx` → `ProjectWorkspace`
  3. `SheetRecordFields.tsx` → `ColumnDef` (type-only)
  4. `EmailConfigModal.tsx` → `ColumnDef`
- After split, types/constants move to `sheet/sheetModel.ts`; consumers update
  imports. A barrel re-export from `ProjectWorkspace.tsx` is acceptable during
  transition.

## Scope

In scope:

- Create `frontend/src/components/sheet/` directory
- Extract `sheetModel.ts` — types, constants, migrateColumns
- Extract `SheetTable.tsx` — grid render (headers, rows, cells, resize, scroll)
- Extract `SheetToolbar.tsx` — toolbar actions row
- Extract `ColumnEditor.tsx` — add/edit columns modal + SelectOptionsEditor
- Extract `useSheetPage.ts` — page load/persist/migrate state hook
- Slim `ProjectWorkspace.tsx` — navigation, project/sheet list, wiring
- Update all import paths for moved exports
- Verify identical runtime behavior

Out of scope:

- New features (sort, filter, search, etc.)
- Backend changes
- CSS changes (no visual change)

## Acceptance Criteria

- Each new file ≤ 1000 lines
- Slimmed `ProjectWorkspace.tsx` ≤ 1000 lines
- App compiles without errors (`npm run build`)
- All existing behavior preserved (manual visual check)
- All external consumers updated (App.tsx, FullScreenSheet.tsx, SheetRecordFields.tsx, EmailConfigModal.tsx)

## Implementation Plan

1. Create `sheet/sheetModel.ts` — ColumnType, ColumnDef, GROUP_COLORS, COLUMN_TYPES, migrateColumns, SheetPage type, ProjectNavigationTarget type
2. Create `sheet/useSheetPage.ts` — all state + effects for page load/persist/migrate + persistPage + saveEmailConfig + saveCellValue
3. Create `sheet/ColumnEditor.tsx` — SelectOptionsEditor, column form modal, edit-columns modal, column CRUD functions
4. Create `sheet/SheetToolbar.tsx` — toolbar actions row + record form modal
5. Create `sheet/SheetTable.tsx` — table render (thead/tbody), renderColumns logic, group toggle, resize handles
6. Slim `ProjectWorkspace.tsx` — keep project list render, project detail render, sheet card list, navigation/breadcrumbs, wiring
7. Update imports in App.tsx, FullScreenSheet.tsx, SheetRecordFields.tsx, EmailConfigModal.tsx

## Unit Test Plan

Unit tests needed:

- No (this is a pure structural refactor with zero behavior change; no new logic introduced)

If no unit tests are needed, explain why:

- Pure file extraction and import rewiring. No new functions, no changed logic, no new data transformations. Existing manual verification covers behavior preservation.

## File Size Check

Files expected to be edited:

- `frontend/src/components/ProjectWorkspace.tsx` (1774 → ~600 target)
- `frontend/src/components/sheet/sheetModel.ts` (NEW, ~80 lines)
- `frontend/src/components/sheet/useSheetPage.ts` (NEW, ~250 lines)
- `frontend/src/components/sheet/ColumnEditor.tsx` (NEW, ~350 lines)
- `frontend/src/components/sheet/SheetToolbar.tsx` (NEW, ~200 lines)
- `frontend/src/components/sheet/SheetTable.tsx` (NEW, ~250 lines)
- `frontend/src/App.tsx` (import path change)
- `frontend/src/components/FullScreenSheet.tsx` (import path change)
- `frontend/src/components/SheetRecordFields.tsx` (import path change)
- `frontend/src/components/EmailConfigModal.tsx` (import path change)

Line-count risk:

- Low (splitting a 1774-line file into 5–6 smaller files)

## Verification Plan

- `npm run build` passes with zero errors
- Manual visual check: project list, project detail, sheet table, add record, edit columns, email compose all work identically

## Completion Notes

Changed files:

- `frontend/src/components/sheet/sheetModel.ts` (NEW, 96 lines) — types, constants, migrateColumns
- `frontend/src/components/sheet/useSheetPage.ts` (NEW, 562 lines) — state hook, persistence, CRUD, compose
- `frontend/src/components/sheet/ColumnEditor.tsx` (NEW, 332 lines) — SelectOptionsEditor, AddColumnModal, EditColumnsModal
- `frontend/src/components/sheet/SheetToolbar.tsx` (NEW, 75 lines) — toolbar actions row
- `frontend/src/components/sheet/SheetTable.tsx` (NEW, 227 lines) — data grid render
- `frontend/src/components/sheet/RecordFormModal.tsx` (NEW, 69 lines) — record add/edit form
- `frontend/src/components/ProjectWorkspace.tsx` (1774 → 846 lines) — slimmed to wiring/navigation/project lists
- `frontend/src/components/SheetRecordFields.tsx` — import path updated
- `frontend/src/components/EmailConfigModal.tsx` — import path updated
- `AI-Context/technical/project-structure.md` — added sheet/ directory

Verification completed:

- `npx tsc --noEmit` — zero errors
- `npm run build` — production build passes (2.18s)
- All files under 1000 lines (largest: useSheetPage.ts at 562)

Unit tests added or updated:

- None (pure structural refactor, no new behavior)

Follow-ups:

- Phase 1 (SCHOLARDOCX-0113): Column sorting, quick search, per-column filters, hide/show columns, row actions, column reorder
