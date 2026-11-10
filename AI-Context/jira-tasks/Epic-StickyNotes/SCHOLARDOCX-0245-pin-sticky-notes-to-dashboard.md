# SCHOLARDOCX-0245: Pin sticky notes to the dashboard

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-11-10

## Summary

Users can add up to 5 sticky notes to the dashboard. They appear in the third column after "Next 7 Days", one block per note. With none pinned, nothing is rendered.

## Requirements

- New per-note flag `pinned_to_dashboard` (default 0), separate from the existing `is_pinned` (pin to top of the board).
- Maximum 5 dashboard notes per user, enforced on the backend (HTTP 400 with a plain message) and in the UI.
- Archived notes never show on the dashboard; archiving a dashboard note clears the flag.
- Dashboard summary returns `pinned_notes` (non-archived, flagged, newest change first, max 5).
- Dashboard: no section when `pinned_notes` is empty.

## Technical

- `models.StickyNotes.pinned_to_dashboard`; idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `connection.py`; `store.TABLE_COLUMNS`; `Store.update_record` guard; `dashboard_summary` query.
- Frontend: NoteCard action button, StickyNotesView handler, `Dashboard` type, DashboardView third-column cards.

## Unit test plan

Add backend tests for the limit guard and summary query under `backend/tests/unit/`. Not run (project rule).

## Completion Notes

Changed files: `backend/app/db/models.py`, `db/connection.py` (idempotent column), `services/store.py` (TABLE_COLUMNS, cap guard, `pinned_notes` in `dashboard_summary`), `api/routes.py` (ValueError -> 400 on PATCH), `tests/smoke/test_store.py` (new cap/archive test, written but NOT run); frontend `NoteCard.tsx`, `StickyNotesView.tsx`, `App.tsx` (Dashboard type), `DashboardView.tsx`, `dashboard-polish.css`; context: functional/feature-sticky-notes.md, technical/data-model.md.

Verification: `tsc --noEmit` and `npm run build`; Playwright screenshot of the dashboard with two pinned notes (mocked API) showing blocks after Next 7 Days. The backend module imports cleanly. NOT verified: the backend guard and migration against a real database, the pin button in the Sticky Notes UI, the cap toast.

Known gap: the AI assistant's sticky-note actions do not set `pinned_to_dashboard`.

## Follow-ups (same day)

- The running backend must be restarted to pick up the new column and guard (it has no auto-reload); until then the pin silently did not save.
- The dashboard stays mounted and only loaded on boot/refresh, so a pin did not show until a manual reload. Sticky Notes now calls `emitDashboardChanged()` after pin/unpin, archive/restore, item ticks and edits or deletes of a dashboard note; `App.tsx` re-fetches the dashboard summary. Not verified in a browser with real data.
