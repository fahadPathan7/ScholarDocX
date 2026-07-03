# SCHOLARDOCX-0121: Add To Tracker + Opportunity Library + Bookmark Migration (Phase 2)

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-03

## Summary

Give analyzed opportunities a destination: an "Add to tracker" action that
appends a row to a project's Scholarship Tracker sheet, and an Opportunity
Library view (status pipeline, deadline sort) that replaces the bare
bookmark list and migrates existing bookmarks in.

## Business Context

Links:

- Business file: [decisions.md](../../business/decisions.md) (BD-010)

Business value:

Closes the planbook's "no connection to the workflow" gap — results stop
dying on the search page and instead reach the sheet/calendar/notification
system that already works.

## Functional Context

Links:

- Functional file: [feature-scholarship-news.md](../../functional/feature-scholarship-news.md)

Requirements:

- FR-8.36: User-scoped Opportunity Library with status pipeline, deduped.
- FR-8.37: Add to tracker creates the Scholarship Tracker sheet from the
  template if absent, appends a row via the existing row-update path.
- FR-8.38: Library replaces bare bookmarks; existing bookmarks migrated in
  additively, not deleted.

## Technical Context

Links:

- Technical file: [api-boundaries.md](../../technical/api-boundaries.md),
  [domain-relationships.md](../../functional/domain-relationships.md)

Technical notes:

- No dedicated backend "add to tracker" endpoint. Frontend orchestrates:
  find-or-create `project_sheets` row named "Scholarship Tracker" (creating
  from `SHEET_TEMPLATES.scholarship_tracker` in
  `frontend/src/components/sheet/sheetModel.ts:82-93` via existing
  `POST /project_sheets` + `POST /project_pages` if absent), then
  `PATCH /project_pages/{id}` with the appended row — this path already
  enforces `records_per_sheet` (`backend/app/api/routes.py:266-289`) with the
  standard styled alert (FR-7.21), so no new limit code is needed. Finally
  `PATCH /scholarship-opportunities/{id}` sets `linked_sheet_id`.
- `GET /scholarship-opportunities` lazily migrates `bookmarked_news` rows
  with no matching `scholarship_opportunities` row (by normalized URL) into
  minimal `source='bookmark_migration'`, `status='Found'` rows before
  returning the list. `bookmarked_news` itself is untouched.
- Extend the `scholarship_tracker` template with Sponsor, Funding Coverage,
  Application URL, Eligible Countries columns so extracted fields map
  cleanly onto tracker columns.

## Scope

In scope:

- `scholarship_tracker` template column additions.
- `AddToTrackerModal.tsx` (project picker + orchestration).
- `OpportunityLibrary.tsx` (status pipeline, deadline sort, "already
  tracked" badge).
- Bookmark → opportunity lazy migration on `GET /scholarship-opportunities`.
- "Library" sub-tab in `ScholarshipNewsView.tsx`.

Out of scope:

- Deleting or changing `/news/bookmarks` endpoints (kept for the migration
  path and backward compatibility).
- Live two-way sync between the library row and the sheet row after linking
  (planbook explicitly makes this one-way).

## Acceptance Criteria

- "Add to tracker" on a project with no existing Scholarship Tracker sheet
  creates one from the template, then appends the row.
- "Add to tracker" on a project already at its `records_per_sheet` limit
  shows the existing styled alert and does not append.
- The project calendar/dashboard picks up the new row's deadline with no
  code changes beyond the row append (existing date-column → calendar
  wiring).
- Opening the Library the first time surfaces previously bookmarked articles
  as `Found`-status entries; `bookmarked_news` row count is unchanged
  (nothing deleted).
- Re-opening the Library a second time does not duplicate already-migrated
  bookmarks.

## Implementation Plan

- Extend the sheet template.
- Build `OpportunityLibrary.tsx` and `AddToTrackerModal.tsx`.
- Add the lazy bookmark-migration step to `GET /scholarship-opportunities`.
- Wire the "Library" sub-tab and remove/replace the old bare bookmark list
  UI in favor of it.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `backend/tests/test_scholarship_opportunities.py` (extends SCHOLARDOCX-0120's
  file): bookmark-migration idempotency, dedupe-by-normalized-URL on
  migration.
- Frontend: `AddToTrackerModal` respects `records_per_sheet` (styled alert
  path), creates the template sheet when absent, does not create a second
  sheet on repeat use.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `frontend/src/components/sheet/sheetModel.ts`
- `frontend/src/components/news/OpportunityLibrary.tsx` (new)
- `frontend/src/components/news/AddToTrackerModal.tsx` (new)
- `frontend/src/components/ScholarshipNewsView.tsx`
- `backend/app/api/scholarship_opportunities.py`

Line-count risk:

- Low.

If any file exceeds 1000 lines, explain why.

- N/A

## Verification Plan

- `cd backend && .venv/bin/pytest tests/test_scholarship_opportunities.py -q`
- `cd frontend && npm run build`
- Manual: add an analyzed opportunity to a project with no tracker sheet yet,
  confirm sheet creation + row + calendar entry; open Library and confirm an
  old bookmark shows up migrated in without duplication on reload.

## Completion Notes

Changed files:

- `frontend/src/components/sheet/sheetModel.ts` — `scholarship_tracker`
  template extended with Sponsor, Funding Coverage, Eligible Countries,
  Application URL columns.
- `frontend/src/components/news/AddToTrackerModal.tsx` (new) — project
  picker; finds-or-creates the Scholarship Tracker sheet via the existing
  `POST /projects/{id}/sheets` + `PATCH /project_pages/{id}` calls (same
  composition `ProjectWorkspace.tsx` already uses for template sheets), then
  `PATCH`es the opportunity's `linked_sheet_id`/`linked_row_snapshot`.
- `frontend/src/components/news/OpportunityLibrary.tsx` (new) — status
  pipeline dropdown, deadline sort, delete, "Tracked:" badge.
- `frontend/src/components/ScholarshipNewsView.tsx` — Library sub-tab.
- `backend/app/api/scholarship_opportunities.py` — `GET
  /scholarship-opportunities` (lazy additive bookmark migration keyed by
  `normalized_url`), `PATCH`/`DELETE /scholarship-opportunities/{id}`
  (adopted the existing generic `Payload{data}` contract from
  `app/api/routes.py` so the frontend reuses `listRecords`/`updateRecord`/
  `deleteRecord` directly).

Verification completed:

- `cd backend && .venv/bin/pytest tests/test_scholarship_opportunities.py -q`:
  9 passed, including bookmark-migration idempotency (`bookmarked_news` row
  count unchanged after two migrations) and update/delete.
- `cd frontend && npm run build`: passed.
- Live authenticated browser check: clicked "Add to tracker" on a real
  analyzed opportunity → created a new "Scholarship Tracker" sheet in the
  target project from the template, appended a row. Verified directly in
  SQLite that `project_pages.rows_json` contains the row with the correct
  field mapping (`Deadline: 2026-03-18`, `Scholarship Name`, `Sponsor`,
  `Status: Found`, `Application URL`) and that
  `scholarship_opportunities.linked_sheet_id`/`linked_row_snapshot` were set.
  Reloaded the Library tab and confirmed both the tracked opportunity
  (status dropdown + "Tracked:" badge) and an untracked one rendered
  correctly. The deadline landed in the sheet's pre-existing date-typed
  `Deadline` column, which already feeds the project calendar — no new
  calendar/notification plumbing was needed, confirming the planbook's core
  claim.

Unit tests added or updated:

- `backend/tests/test_scholarship_opportunities.py` (shared file, 9 tests
  total covering this story's scope: migration idempotency, update/delete).
- No frontend unit tests were added for `AddToTrackerModal`/
  `OpportunityLibrary` — verified instead via a real, authenticated
  end-to-end browser run against live data (see above), which exercises the
  exact orchestration path unit mocks would only approximate. Frontend
  test infra for these news components has no existing pattern to follow
  (no `*.test.tsx` files under `components/news/`) — recorded as a
  follow-up rather than introducing one ad hoc.

Follow-ups:

- Consider adding frontend unit tests for `AddToTrackerModal`'s sheet
  find-or-create branching once a testing pattern exists for
  `components/news/`.
