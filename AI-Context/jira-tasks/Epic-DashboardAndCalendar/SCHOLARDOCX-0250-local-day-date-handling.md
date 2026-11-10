# SCHOLARDOCX-0250: Local-day date handling and timezone wording

Status: Done

Owner: AI Agent

Epic: Epic-DashboardAndCalendar

Created: 2026-11-10

## Summary

Instants (created/updated/reminder timestamps) stay UTC in the database. Date-only deadlines
("2026-12-01") are calendar days and must be read, compared and shown as local days. Several
frontend spots parsed them with `new Date("YYYY-MM-DD")` (UTC midnight) or took the UTC date for
"today", so deadline colours, radar windows, date filters and displayed dates could be off by one
day depending on the user's timezone. The About footnote also claimed "All system dates and
deadlines follow UTC", which is wrong for what users see.

## Business Context

Business value: deadlines are the core of the product; an off-by-one day on a deadline is a
visible correctness bug.

## Functional Context

Requirements:

- Timestamps are stored as UTC instants and rendered in the viewer's local timezone.
- Date-only values are plain calendar days: never shifted by timezone, compared against the
  viewer's local "today".

## Technical Context

- `frontend/src/lib/date.ts` is the single place for local-day helpers (`parseLocalDate`,
  `startOfLocalDay`, new `localDateKey`, `daysUntilLocal`).
- Backend: timestamps already UTC (`datetime.now(timezone.utc)`); the dashboard summary returns
  raw dates and the client buckets them by local day. Server-side deadline notification scan and
  billing cycles intentionally stay on the UTC day (dedupe/billing boundaries, not display).

## Scope

In scope:

- Fix `deadlineTone`, radar threshold and `todayKey` (Opportunity library/cards).
- Fix sheet row due colouring (`rowClass`) and date preset/range filters.
- Fix `FloatingNotifications.dateKey` to use the local date, `BuyTokensView.formatDate`.
- Correct the About footnote.

Out of scope:

- Per-user timezone override and optional deadline-time zones (follow-up).
- Server-side `date.today()` in AI actions (Render runs UTC; no user timezone is sent).
- Billing allowance reset dates, which are UTC cycle boundaries and stay labelled as such.

## Acceptance Criteria

- A date-only deadline shows the same calendar day in every timezone.
- "Due today / in N days" tones agree with the viewer's local calendar day.
- About footnote describes the real behaviour.

## Unit Test Plan

Unit tests needed: Yes

Planned tests: `date.test.ts` for `localDateKey` and `daysUntilLocal` (date-only, datetime,
invalid); existing `sheetFilters` tests stay green.

## File Size Check

Files expected to be edited: date.ts, OpportunityCard.tsx, OpportunityLibrary.tsx,
SheetRecordFields.tsx, sheetFilters.ts, FloatingNotifications.tsx, BuyTokensView.tsx,
AboutView.tsx. Line-count risk: Low.

## Completion Notes

Changed files: `lib/date.ts` (+`localDateKey`, `daysUntilLocal`, `toLocalInstant`), `OpportunityCard.tsx`,
`OpportunityLibrary.tsx`, `SheetRecordFields.tsx` (`rowClass`), `sheetFilters.ts` (date preset/range),
`FloatingNotifications.tsx`, `BuyTokensView.tsx`, `AboutView.tsx` (footnote), `lib/__tests__/date.test.ts`.

Verification: `tsc --noEmit` clean; full vitest suite 379/379 under TZ=UTC, America/Los_Angeles,
Asia/Dhaka and Pacific/Kiritimati. Not browser-checked.

Follow-ups: per-user timezone override; optional deadline time + zone; server `date.today()` in AI
actions still uses the server day.
