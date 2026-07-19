## Root cause

Opening a project calls `GET /projects/{id}/summary`, whose backend (`store.py:636 project_summary`) pulls **every page's full `rows_json`/`columns_json`** for every sheet, JSON-decodes them all, scans every row for dates (`_calendar_items`), and ships the full row data of all sheets to the browser — even though no sheet is open yet. The same heavy call is repeated after every cell save (`refreshSummary`). Separately, the Projects list fires one `/summary` per project just to show sheet counts (N+1).

The branch already has half-built scaffolding (`Store.project_meta`, `GET /projects/{id}/meta`, a `refreshMeta` param in `useSheetPage`) — this plan completes it.

## Scope (confirmed)
1. Fast project-open (don't load all sheets' row data)
2. Fast save-refresh (don't re-pull the whole summary after a cell edit)
3. Kill the Projects-list N+1

## Backend changes — `backend/app/services/store.py`, `backend/app/api/routes.py`

**1. Make `project_meta()` a complete lightweight replacement for `/summary` on project/dashboard/sheet-list views:**
- Add per-stub `row_count` (computed server-side as `json_array_length(rows_json)` — no row shipping) and total `row_count`.
- Add `calendar_items` (decode pages server-side to compute, ship only the resulting items — far smaller than all rows). Guard with an `include_calendar: bool = True` param so the post-save refresh can skip it.
- Stubs ship only `id, sheet_id, name, updated_at, row_count` — never `rows`/`columns`.
- Keep the existing fields (`sheets`, `notifications`, counts).

**2. Add `Store.get_project_page(page_id)`** — returns one fully decoded page (`columns`, `rows`, `email_config`) via the existing `_decode_page`. This is what the open sheet needs.

**3. Add routes:**
- `GET /project_pages/{page_id}` → `get_project_page` (distinct from the generic `GET /project_pages` list; no route collision).
- `GET /projects/{project_id}/meta?include_calendar=true|false` → already exists; wire the flag through.
- `GET /projects/sheet_counts` → returns `{"<project_id>": sheetCount}` from one grouped query (`GROUP BY project_id`), user-scoped. Replaces the N+1.

## Frontend changes — `frontend/src/components/ProjectWorkspace.tsx`, `frontend/src/components/sheet/useSheetPage.ts`

**4. `ProjectWorkspace`:**
- Project-open path (`useEffect` on `selectedProjectId`) and post-save refresh switch from `/summary` to `/meta` (with calendar on open; without on save).
- Keep `summary` state but populate from `/meta`; `pages` becomes `page_stubs` (carry `row_count`).
- Add `selectedPageData` state + effect: fetch `GET /project_pages/{selectedPageId}` when `selectedPageId` changes, and re-fetch when the matching stub's `updated_at` changes (external change). Pass `selectedPageData` (full) into `useSheetPage` as `selectedPage`. The existing `lastSyncedRef`/`contentSignature` guard in `useSheetPage` already no-ops our own save echo (identical content) and syncs only on real external changes — so this stays disruption-free.
- Sheet-card quota badge: read `stub.row_count` instead of `getSheetPage(sheetItem)?.rows.length`.
- `loadProjectSheetCounts`: replace the per-project `/summary` loop with one `GET /projects/sheet_counts`.
- `createSheet`, `saveSheetEdit`, `deleteSheet`, `updateSheetPin`: call `refreshMeta`.

**5. `useSheetPage`:** replace `refreshSummary()` calls in persist handlers with `refreshMeta()` (the param already exists in the diff). `selectedPage` passed in is now the full page from `selectedPageData`, so the existing load effect is unchanged.

## Tests — `backend/tests/smoke/test_store.py`
- `project_meta` returns stubs with `row_count` + `calendar_items`, and stubs contain **no** `rows`/`columns`.
- `project_meta(include_calendar=False)` omits/reduces calendar.
- `get_project_page` returns a decoded page (columns migrated, rows parsed, email_config present).

## Context / Jira (mandatory workflow)
- Create `AI-Context/jira-tasks/Epic-SheetRecords/SCHOLARDOCX-0121-sheet-load-speedup.md` (new task in existing Epic).
- Update `AI-Context/technical/api-boundaries.md` with the three endpoint behaviors (`/meta` flag, `/project_pages/{id}`, `/projects/sheet_counts`).
- Record changed files + follow-ups in the Jira task on completion.

## Notes / follow-ups
- `ProjectWorkspace.tsx` (1177) and `useSheetPage.ts` (1169) exceed the 1150 line limit — per AGENTS.md, flag as a split-before-next-feature follow-up; not splitting in this perf task to keep the diff focused.
- No user-facing copy mentions infrastructure names; no new external services; behavior-preserving.

## Verification
- `cd backend && .venv/bin/pytest` (new + existing store tests).
- `cd frontend && npm run build`.
- Browser smoke: open a project with multiple large sheets → dashboard/cards render fast and calendar works; open a sheet → loads; edit a cell → saves without re-fetching all sheets; Projects list loads without N requests.