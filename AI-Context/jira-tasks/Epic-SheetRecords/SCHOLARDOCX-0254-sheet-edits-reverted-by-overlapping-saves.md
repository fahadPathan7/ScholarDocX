# SCHOLARDOCX-0254: Sheet edits reverted by overlapping saves

Status: Done

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-11-12

## Summary

Typing into a sheet cell and then clearing it did not stick: the text came back,
and the next Delete keypress did nothing. Root cause: overlapping full-sheet
saves and their post-save reloads.

## Business Context

Links:

- Business file: N/A (data-integrity bug in an existing feature)

Business value:

- A sheet must keep exactly what the user last entered.

## Functional Context

Links:

- Functional file: AI-Context/functional (sheet records)

Requirements:

- The latest edit always wins, however quickly edits follow each other.

## Technical Context

Technical notes:

- Every save PATCHes the whole sheet, then `refreshMeta` → stub `updated_at`
  changes → `getSelectedPageData` reloads the page → `useSheetPage`'s sync
  effect compares it with `lastSyncedRef`.
- Bug 1: a reload taken before the user's latest edit differed from
  `lastSyncedRef`, so it was treated as an external change: rows were
  overwritten with the old value, history reset, and focus cleared (so Delete
  had no focused cell).
- Bug 2: two in-flight PATCHes could commit out of order and persist the older
  sheet.
- Bug 3: `persistPage` returned early while `isSaving`, silently dropping row
  add/delete, column, bulk-edit and undo/redo saves made during another save.
- Fix: `sheetWriteQueue.ts` sends sheet writes one at a time and records the
  server `updated_at` of each; the sync effect ignores a reload while a write
  is in flight or when it is older than the newest confirmed write. All nine
  full-sheet PATCH sites in `useSheetPage` use it; the `isSaving` early return
  is gone.

## Scope

In scope:

- frontend/src/components/sheet/useSheetPage.ts, sheetWriteQueue.ts, tests.

Out of scope:

- Email-config save (separate field, still guarded by `isSaving`).
- Server-side optimistic concurrency (would need a version column).

## Acceptance Criteria

- Type a value, Enter, immediately Delete: the cell stays empty after all saves
  and reloads settle.
- A change from another tab or an agent (newer `updated_at`) still syncs in.

## Implementation Plan

- As in technical notes.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `sheet/__tests__/sheetWriteQueue.test.ts`: ordering, failure does not block,
  stale reload rejected in flight and after, newer snapshot accepted, reset.

## File Size Check

Files expected to be edited:

- useSheetPage.ts (+~20 lines), new sheetWriteQueue.ts (~60).

Line-count risk:

- Low

## Verification Plan

- tsc; the new vitest file.

## Completion Notes

Changed files:

- frontend/src/components/sheet/useSheetPage.ts
- frontend/src/components/sheet/sheetWriteQueue.ts (new)
- frontend/src/components/sheet/__tests__/sheetWriteQueue.test.ts (new)

Verification completed:

- `tsc --noEmit` passes; sheetWriteQueue tests 5/5 pass. Not yet exercised in
  the running app.

Unit tests added or updated:

- sheetWriteQueue.test.ts

Follow-ups:

- Consider server-side optimistic concurrency so two tabs cannot overwrite each
  other's whole-sheet saves.
