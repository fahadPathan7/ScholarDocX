# SCHOLARDOCX-0185: Manual Calendar Reminders + Done Checkbox for Today/Next 10 Days

Status: Completed

Owner: AI Agent

Epic: Epic-DashboardAndCalendar

Created: 2026-07-28

## Summary

Today the calendar (central Dashboard + per-project) only ever shows dates derived from sheet rows (`Store._calendar_items`). Users need to add their own manual dates — reminders or anything else not tied to a sheet row — from both the central Dashboard (general-purpose, no project link) and from within a specific project (scoped to that project, also rolls up into the central dashboard). Additionally, the Dashboard's "Today" and "Next 10 Days" sections need a checkbox so users can mark items as done, purely as a dashboard-side management aid — it must never write back to the underlying sheet row.

## Business Context

Business value:
- Not every important date lives in a sheet row (e.g. a personal reminder, a non-application deadline). Users need a lightweight way to add ad-hoc dates without creating a whole sheet row for it.
- A done/undone checkbox on the daily digest reduces "did I already handle this?" friction without requiring the user to edit sheet data.

## Functional Context

Requirements:
- FR-1: A user can add a manual calendar entry (title, date, optional note) from the central Dashboard. Central-added entries have no project link and only ever appear on the central Dashboard (never inside a project's own calendar).
- FR-2: A user can add a manual calendar entry from within a specific project. Project-added entries appear in that project's own calendar AND roll up into the central Dashboard's aggregated calendar (matching how sheet-row dates already aggregate).
- FR-3: The central Dashboard's "Today" and "Next 10 Days" lists show a checkbox on every item, including sheet-row-derived dates and manual reminders.
- FR-4: Checking an item marks it done (stays visible, does not disappear); checked items sort to the bottom of their section, unchecked items stay on top. A checked item's row becomes visually muted/non-interactive for navigation (the checkbox itself remains togglable).
- FR-5: Checking a sheet-row-derived item is dashboard-only bookkeeping — it must never modify the sheet row's actual column data.
- FR-6: This checkbox/done feature applies only to the central Dashboard's Today/Next 10 Days lists, not inside a project's own calendar view.
- FR-7: A user can delete a manual reminder they created.

## Technical Context

Technical notes:
- Sheet-row-derived calendar items are ephemeral (computed fresh from `project_pages.rows_json` on every request via `Store._calendar_items`) — they have no real DB row to attach a "done" flag to. Identity used for the done-state key is `(user_id, page_id, row_index, date_field)` — the specific date *cell*, not the date value — so editing the date later does not reset a user's checked state. This mirrors the existing key already used for React list `key=` props on these items.
- New tables (both new files, not touching the existing `app/db/models.py` which is already over the 1150-line hard cap — see File Size Check):
  - `calendar_reminders`: real user-created rows (`user_id`, `project_id` nullable, `title`, `note`, `reminder_date` text `YYYY-MM-DD`, `is_done`). Registered in the existing generic `_crud_routes` table-driven CRUD system (`app/api/routes.py`) — no bespoke create/update/delete endpoints needed for reminders themselves.
  - `sheet_calendar_item_marks`: dashboard-only completion bookkeeping for sheet-derived items, unique on `(user_id, page_id, row_index, date_field)`. Needs one bespoke endpoint (`POST /calendar/sheet-item-marks`) since there's no single-`id` row for the generic CRUD system to target.
- `app/services/calendar_service.py` (new): merges sheet-derived items (still computed by `Store._calendar_items`) with manual reminders into one list, attaches `is_done`/`id` to each, keeps `Store` itself from growing further (already over 1000 lines).
- Frontend: `App.tsx` is already well over the file-size hard cap (1748 lines before this task) — extracting `DashboardView` (and its calendar helper functions) into `components/DashboardView.tsx` as part of this task, per the "over 1150 → split as part of the same task" rule.

## Scope

In scope:
- `backend/app/db/calendar_models.py` (new): `CalendarReminders`, `SheetCalendarItemMarks` models.
- `backend/app/db/connection.py`: import the new models module so `create_all` registers the tables.
- `backend/app/services/calendar_service.py` (new): merge/attach/toggle logic.
- `backend/app/services/store.py`: register `calendar_reminders` in `MODEL_MAP`/`TABLE_COLUMNS`; `dashboard_summary`/`project_summary` call into `calendar_service` instead of returning raw `_calendar_items` output.
- `backend/app/api/routes.py`: add `"calendar_reminders"` to the generic CRUD table list.
- `backend/app/api/calendar.py` (new): `POST /calendar/sheet-item-marks`.
- `backend/app/main.py`: register the new calendar router.
- `frontend/src/components/DashboardView.tsx` (new, extracted from `App.tsx`): Today/Next 10 Days checkbox UI, Add Reminder form, sort-checked-to-bottom.
- `frontend/src/components/ProjectDashboard.tsx`: Add Reminder button scoped to the project.
- `AI-Context/functional/feature-dashboard-hierarchy.md`: document the new manual-entry + done-checkbox behavior.

Out of scope:
- Editing a manual reminder's title/date/note after creation (create + delete only for now).
- Any "done" checkbox inside a project's own calendar view (dashboard-only, per FR-6).
- Recurring reminders.

## Acceptance Criteria

- [x] Central Dashboard: "+ Add Reminder" creates a general (no project) entry; appears in the central calendar and Today/Next 10 Days when due.
- [x] Project Dashboard: "+ Add Reminder" creates a project-scoped entry; appears in that project's calendar and also in the central Dashboard's aggregated view.
- [x] Today/Next 10 Days: every item (sheet-derived and manual) has a checkbox.
- [x] Checking an item marks it done, keeps it visible, moves it to the bottom of its section; the row becomes non-interactive (checkbox stays interactive).
- [x] Checking a sheet-derived item does not alter `project_pages.rows_json`.
- [x] A manual reminder can be deleted.
- [x] Project's own calendar view shows no checkbox (dashboard-only feature).

## File Size Check

Files expected to be edited:
- `backend/app/services/store.py` (1105 lines before — kept minimal, logic moved to new `calendar_service.py`)
- `backend/app/api/routes.py` (648 lines before — one line added to the CRUD table tuple)
- `frontend/src/App.tsx` (1748 lines before — `DashboardView` extracted out, net reduction)

Line-count risk:
- `app/db/models.py` (1223 lines, already over the 1150 hard cap) — deliberately NOT edited; new models live in a separate file that still registers on the same `Base.metadata`.
- New files (`calendar_models.py`, `calendar_service.py`, `api/calendar.py`, `components/DashboardView.tsx`) start fresh, low risk.

## Verification Plan

- Manual: open Dashboard, add a general reminder for today → appears in "Today" with a checkbox; check it → moves to bottom, greys out; uncheck → moves back.
- Manual: open a project, add a project reminder → appears in that project's calendar; open central Dashboard → same reminder appears in the aggregated calendar and Today/Next 10 Days.
- Manual: check a sheet-row-derived item in Today; confirm the underlying sheet row is unchanged (open the sheet, no column data changed).
- Unit tests added for `calendar_service` merge/toggle logic — not run this session, per project policy (create/update tests, execute only when explicitly asked).

## Completion Notes

Changed files:
- `backend/app/db/calendar_models.py` (new): `CalendarReminders`, `SheetCalendarItemMarks`.
- `backend/app/db/connection.py`: import `calendar_models` so `create_all` registers the new tables.
- `backend/app/services/calendar_service.py` (new): reminder fetch/format, sheet-item completion attach, merge+sort, `set_sheet_item_done`.
- `backend/app/services/store.py`: registered `calendar_reminders` in `MODEL_MAP`/`TABLE_COLUMNS`/`DEFAULT_SORT`; `dashboard_summary`/`project_summary`/`project_meta` now call `calendar_service.build_calendar_items(...)` instead of returning raw `_calendar_items` output.
- `backend/app/api/routes.py`: added `"calendar_reminders"` to the generic CRUD table list.
- `backend/app/api/calendar.py` (new): `POST /calendar/sheet-item-marks`.
- `backend/app/main.py`: registered the new calendar router.
- `frontend/src/components/DashboardView.tsx` (new, extracted from `App.tsx`): Today/Next 10 Days checkbox UI (`EventRow`), done-sorts-to-bottom, Add Reminder button, toggle/delete handlers.
- `frontend/src/components/AddReminderModal.tsx` (new): shared create-reminder form used by both the central Dashboard and `ProjectDashboard`.
- `frontend/src/components/ProjectDashboard.tsx`: Add Reminder button scoped to the project; passes `projectId`/`onReminderChanged`.
- `frontend/src/components/ProjectWorkspace.tsx`: wired `projectId`/`onReminderChanged={() => refreshSummary()}` into `ProjectDashboard`.
- `frontend/src/App.tsx`: extracted `DashboardView` + its calendar helpers + the `List` helper (net ~280 lines removed); exported the `Dashboard` type; added `reloadDashboard()` and wired it as `onRefreshDashboard`.
- `frontend/src/styles.css`: `.upcoming-event-row`, `.upcoming-event-checkbox`, `.upcoming-event-delete`, `.done` state (strikethrough + muted + non-interactive).
- `backend/tests/unit/test_calendar_service.py` (new): reminder merge/scoping and sheet-item-done tests — see Unit Test Plan.
- `AI-Context/functional/feature-dashboard-hierarchy.md`: documented manual reminders + done-checkbox behavior.

Verification completed:
- `npx tsc --noEmit` → clean (no frontend type errors after the extraction + new components).
- Backend logic verified directly against the real database via a throwaway script (Store/calendar_service calls), then cleaned up — no test data left behind:
  - General reminder: create → appears in `dashboard_summary` → toggle `is_done` → delete → confirmed gone.
  - Project-scoped reminder: appears in its own project's `project_summary`, confirmed **absent** from a different project's summary, confirmed present in the central `dashboard_summary` aggregation with the correct `project_name`.
  - Sheet-row-derived item: toggled done via `calendar_service.set_sheet_item_done`, confirmed `project_pages.rows_json` byte-for-byte unchanged before/after, confirmed dashboard reflects the new state, reverted.
  - Found and fixed a real bug during this verification: the sheet-item-mark upsert passed a Python `bool` for an `INTEGER` column, which psycopg3 rejects (`DatatypeMismatch`) rather than silently coercing — fixed with `int(is_done)`. This would have made the checkbox 500 on every sheet-item toggle if not caught.
- Visual check: built a static HTML harness using the real `styles.css`/`visual-refresh.css` (couldn't log into the live app — no test account credentials available) to confirm the checkbox row, delete affordance on manual reminders only, and the checked/muted/strikethrough state all render correctly.
- Could not verify in the live browser end-to-end (no login credentials for any of the 4 real accounts) — the dev backend (`uvicorn --reload`) is live against the same production DB used throughout this session, so the code is deployed; ask the user to click through it once logged in.

Unit tests added or updated:
- `test_calendar_service.py`: `test_build_calendar_items_merges_reminders_and_sheet_items`, `test_project_scoped_reminder_excluded_from_other_projects`, `test_general_reminder_included_only_on_dashboard`, `test_set_sheet_item_done_upserts_and_does_not_touch_row`.
- Not run this session, per project policy (create/update tests, execute only when explicitly asked).

Follow-ups:
- Editing a manual reminder's title/date/note isn't supported yet (delete + re-add). Small addition if wanted later — the generic `PATCH /calendar_reminders/{id}` already accepts any of those fields; only a frontend edit form would be needed.
- Manual reminders currently have no recurrence support.
- Consider a small toast/confirmation on reminder delete (currently silent, immediate).
