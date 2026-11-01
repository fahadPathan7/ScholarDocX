# SCHOLARDOCX-0219: Deadline notifications for saved opportunities (audit batch 3)

Status: Review

Owner: AI Agent

Epic: Epic-AuditRemediation

Created: 2026-11-01

## Summary

The deadline-notification path is dead code today: the
`scholarship_deadline_approaching` notification preference and the
`last_deadline_notified_at` column are never read, and no notification is
ever generated for a deadline. Build the scan that turns saved Opportunity
Library entries with upcoming deadlines into user notifications, scheduled
via the existing internal-cron pattern.

## Business Context

Links:

- Business file: [../business/product-vision.md](../../business/product-vision.md)

Business value:

- Core product promise ("never miss a deadline") becomes real: users with 50 saved opportunities no longer have to eyeball the library daily.

## Functional Context

Links:

- Functional file: [../functional/feature-calendar.md](../../functional/feature-calendar.md) (if present; otherwise notifications feature file)

Requirements:

- A saved opportunity whose nearest upcoming deadline is within the lead window (7 days) produces ONE notification per opportunity, once.
- Users who disabled the `scholarship_deadline_approaching` preference (or notifications entirely) get nothing.
- Copy is plain language: opportunity name + date + "due in N days".

## Technical Context

Links:

- Technical file: [../technical/api-boundaries.md](../../technical/api-boundaries.md) (internal endpoints)

Technical notes:

- Reuse the internal-cron pattern from `/internal/downgrade-expired-plans` (secret-gated) — see `app/api/internal.py` and `services/plan_expiry.py`.
- `deadlines_json` on `scholarship_opportunities` rows holds the dates; `last_deadline_notified_at` (existing, currently dead column) is the once-only guard.
- Notifications rows are user-scoped and already render in FloatingNotifications — no frontend work needed for display.

## Scope

In scope:

- `services/deadline_notifications.py` (or similar): scan + notify, once-per-opportunity, respecting prefs.
- Secret-gated internal endpoint + GitHub Actions scheduling (extend the existing cron workflow if one exists for plan expiry; otherwise the keep-alive workflow's schedule).
- Unit tests for the scan logic and endpoint auth.

Out of scope:

- Reminders in the Calendar tab, sticky-note due_at reminders, recurring deadlines, email delivery.

## Acceptance Criteria

- An opportunity with a deadline 0–7 days out yields exactly one notification (repeat scans create nothing more).
- Disabled preference ⇒ no notification. Past deadlines ⇒ nothing.
- Endpoint requires the internal secret (503 unset / 401 wrong, mirroring plan expiry).
- Workflow file schedules the scan.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Scan creates one notification inside the window; idempotent on second run (last_deadline_notified_at guard).
- Outside window / past deadline / disabled preference / notifications off ⇒ nothing.
- Internal endpoint auth matrix (unset secret → 503, wrong → 401, right → 200).

## File Size Check

Files expected to be edited:

- backend: new `services/deadline_notifications.py`, `api/internal.py`, `.github/workflows/*`, tests.

Line-count risk:

- Low (new small service; internal.py grows slightly).

## Verification Plan

- `python -m compileall -q app`; guard scripts; workflow YAML sanity.

## Completion Notes

Status: Review (implemented on branch `fix/audit-remediation-0217`; tests written but NOT executed per CODE_RULES).

Changed files:

- `backend/app/services/deadline_notifications.py` (new) — `run_deadline_notification_scan(store, user_id=None)`: mirrors the client radar exactly (tracker-linked only, nearest deadline within 7 days = `DEADLINE_RADAR_THRESHOLD_DAYS` kept in sync with `OpportunityCard.tsx`, `scholarship_deadline_approaching` preference checked BEFORE claiming so a re-enabled pref can still notify, day-granularity dedupe). The claim is a conditional UPDATE (`last_deadline_notified_at IS NULL OR < start-of-today-UTC`), so client scan, login pass, and cron can never double-notify. Free-text deadlines are skipped conservatively. Notification copy: "Deadline approaching: {name}" / "Due {date} (in N days). Check the Opportunity Library for details."
- `backend/app/api/internal.py` — `POST /internal/deadline-notifications`, same `X-Cleanup-Token`/`CLEANUP_SECRET` gate as the other internal crons; returns `{status, notified}`.
- `backend/app/api/auth.py` — lazy per-user scan at login (best-effort try/except; never blocks login). Also corrected the now-stale comment on the 0217 plan-expiry lazy hook (marker was removed).
- `.github/workflows/deadline-notifications.yml` (new) — daily 07:00 UTC cron + workflow_dispatch; requires `BACKEND_URL` and `CLEANUP_SECRET` repo secrets (same as the other cron workflows; note the downgrade workflow currently ships with its schedule disabled — this one is enabled because the feature is pointless unscheduled).
- `backend/tests/unit/test_deadline_notifications.py` (new) — 8 tests.
- Context: `functional/feature-scholarship-news.md` + `functional/requirements-index.md` (FR-8.42a), `technical/api-boundaries.md` (endpoint).

Verification completed:

- `python -m compileall -q app` + py_compile tests: OK. YAML parses.
- `check-provider-call-billing.py` / `check-context-drift.py`: ok.
- No pytest execution (CODE_RULES).

Unit tests added or updated:

- `test_deadline_notifications.py`: notify-once-then-idempotent (exact title/body/type/preference_key asserted); outside-window + past + unlinked skipped; disabled pref skipped WITHOUT claiming (column stays NULL); already-notified-today skipped; per-user scope vs full scan; free-text deadline skipped; endpoint auth matrix 503/401/200 (scan monkeypatched for the 200 so the shared DB is untouched).

Follow-ups:

- Sticky-note `due_at` reminders and Calendar-tab reminders remain out of scope (SCHOLARDOCX-0201's deferred piece).
- Recurring deadlines / lead-time customization not modeled (single 7-day window, matching the client radar).
- Residual tiny race: the client radar claims AFTER its day-check, so a login/cron scan firing in the same instant a user opens the Library tab could theoretically double-notify — the server claim makes this a one-in-a-race window; acceptable.
- Owner action: ensure `BACKEND_URL` + `CLEANUP_SECRET` secrets exist (also needed by the existing cron workflows) or the workflow fails visibly.
