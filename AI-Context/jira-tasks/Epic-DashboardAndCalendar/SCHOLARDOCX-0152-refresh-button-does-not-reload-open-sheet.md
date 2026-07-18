# SCHOLARDOCX-0152: Refresh Button Does Not Reload Open Sheet

Status: Done

Owner: AI Agent

Epic: Epic-DashboardAndCalendar

Created: 2026-07-19

## Summary

The top-bar "Refresh data" button (`App.tsx:518`) did not actually refresh the Projects tab when a sheet was open. It bumped `refreshTrigger`, which made `ProjectWorkspace` reload the project list and the `/meta` stubs, but it never re-fetched the **open sheet's rows/columns** (`selectedPageData`) nor the **per-project sheet-count badges**. Net effect: clicking Refresh visibly spun but left the open grid stale, and the "X / Y sheets" counters went stale after add/remove sheet.

## Business Context

Links:

- Business file: AI-Context/business/product-overview.md

Business value:

- Refresh is the user's manual "pull" for changes made out-of-band (Lumi agent in another tab, a backend update, multi-tab edits). When it silently no-ops, users lose trust in the whole workspace and may believe their data is lost or the app is broken.

## Functional Context

Links:

- Functional file: AI-Context/technical/api-boundaries.md

Requirements:

- FR-1: Clicking Refresh while a sheet is open reloads that sheet's rows and columns from the backend.
- FR-2: Clicking Refresh reloads the per-project sheet-count badges (so add/remove sheet is reflected).
- FR-3: No regression to the "skip our own echo" guard in `useSheetPage` (local edits must not be clobbered by their own save echo).

## Technical Context

Links:

- Technical file: AI-Context/technical/api-boundaries.md

Technical notes — root cause:

- `App.tsx:refreshActiveTab` for the `"projects"` tab is empty; it relies entirely on bumping `refreshTrigger`.
- `ProjectWorkspace.tsx`'s `refreshTrigger` effect (was lines 214-221) called only `refreshProjects()` + `refreshSummary()` (the latter hits `/projects/:id/meta` — page stubs + calendar, NOT the full rows).
- The open sheet's full rows/columns live in `selectedPageData` and are only fetched by `getSelectedPageData(pageId)`, which the effect never called.
- Separately, `loadProjectSheetCounts()` was wired only to `projects.length` change, so the "X / Y sheets" badges never refreshed on add/remove sheet.

Secondary guard (intentional, not a bug): `useSheetPage.ts:186` skips applying an incoming payload whose serialized columns+rows match `lastSyncedRef.current`. This correctly prevents our own save echo from clobbering local edits. The fix does NOT bypass this guard — if external data changed, the signature differs and the refresh applies; if nothing changed, the skip is correct.

Fix: extend the `refreshTrigger` effect to also call `loadProjectSheetCounts()` and `getSelectedPageData(selectedPageId)`.

## Scope

In scope:

- `frontend/src/components/ProjectWorkspace.tsx` — `refreshTrigger` effect now also reloads sheet counts + open sheet data.

Out of scope:

- The `useSheetPage` contentSignature guard (intentional; left as-is).
- Adding a separate refresh button inside the sheet toolbar (the top-bar button is the canonical refresh).
- Backend changes (none needed).

## Acceptance Criteria

- AC-1: With a sheet open, clicking the top-bar Refresh reloads that sheet's rows/columns from the backend.
- AC-2: Clicking Refresh updates the per-project sheet-count badges (e.g. after adding a sheet in another tab).
- AC-3: Local edits in the open sheet are not clobbered by the Refresh if the backend data is identical (contentSignature guard preserved).
- AC-4: `npm run build` passes.

## Implementation Plan

1. In `ProjectWorkspace.tsx`, extend the `refreshTrigger` effect to also invoke `loadProjectSheetCounts()` and, when `selectedPageId` is set, `getSelectedPageData(selectedPageId)`.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- N/A — frontend has no test runner; verified via build + manual flow checks.

## File Size Check

Files edited: `ProjectWorkspace.tsx` (small change to one effect). Well under the 1000-line limit.

## Verification Plan

- `npm run build` in `frontend/`.
- Manual: open a sheet → change its rows via a second tab/Lumi → click Refresh → open grid updates; add a sheet in another tab → click Refresh → "X / Y" badge updates.

## Completion Notes

Changed files:

- `frontend/src/components/ProjectWorkspace.tsx` — `refreshTrigger` effect now calls `loadProjectSheetCounts()` and `getSelectedPageData(selectedPageId)` in addition to `refreshProjects()` + `refreshSummary()`, so Refresh actually reloads the open sheet's rows/columns and the sheet-count badges.
- `AI-Context/technical/api-boundaries.md` — documented the rule.

Verification completed:

- `npm run build` in `frontend/` → passes (tsc + vite).
- Manual flow checks left for the user: open sheet → external change → Refresh → grid updates; add sheet elsewhere → Refresh → badge updates.

Unit tests added or updated:

- None (no frontend test runner; backend unchanged).

Follow-ups:

- Consider a dedicated visible Refresh control inside the sheet toolbar for discoverability (currently only the top-bar button exists).
