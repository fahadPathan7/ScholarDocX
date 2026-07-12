# SCHOLARDOCX-0134: Dashboard — remove Local Time and reorder Next 10 Days / Pinned sections

Status: Done

Owner: AI Agent

Epic: Epic-DashboardAndCalendar

Created: 2026-07-12

## Summary

Remove the Local Time (digital clock) section from the dashboard and reorder the remaining sections so "Next 10 Days" takes the prominent top slot formerly held by the clock + pinned sheets + pinned docs, while "Pinned Sheets" and "Pinned Docs" move to the bottom (where Next 10 Days used to be).

## Business Context

Links:

- Business file: n/a (UX refinement)

Business value:

- The clock is low-value chrome and makes an external IP-geolocation network request (`get.geojs.io`), which conflicts with the privacy-first, local-first product stance. Removing it declutters the dashboard and removes an external data call. Promoting "Next 10 Days" surfaces time-sensitive application deadlines and row dates where the user's eye lands first.

## Functional Context

Links:

- Functional file: AI-Context/functional/ (dashboard)

Requirements:

- The dashboard remains the landing tab for signed-in users. The Workspace Snapshot, Project Calendar, and Pinned Projects sections stay in place.

## Technical Context

Links:

- Technical file: AI-Context/technical/frontend-visual-system.md
- File: frontend/src/App.tsx

Technical notes:

- `DigitalClock` (App.tsx ~574-647) is the Local Time section. It uses `useEffect`/`useState` (still used elsewhere in App.tsx, so imports stay) and fetches `https://get.geojs.io/v1/ip/geo.json`. It is referenced exactly once (App.tsx:677 inside `DashboardView`). Safe to delete wholesale.
- Current `DashboardView` section order (App.tsx:676-809):
  1. DigitalClock (Local Time)
  2. Workspace Snapshot
  3. Project Calendar
  4. Pinned Projects
  5. Pinned Sheets
  6. Pinned Docs
  7. Next 10 Days
- Target order:
  1. Workspace Snapshot
  2. Project Calendar
  3. Pinned Projects
  4. Next 10 Days  (moved up)
  5. Pinned Sheets (moved down)
  6. Pinned Docs   (moved down)
- No data model, API, or CSS-class changes — purely JSX reorder + component deletion. The clock's CSS rules in the stylesheet become unused but harmless; leaving them avoids risk and they can be cleaned later.

## Scope

In scope:

- Delete the `DigitalClock` component definition and its `<DigitalClock />` usage in `DashboardView`.
- Reorder the Section blocks so Next 10 Days precedes Pinned Sheets and Pinned Docs.

Out of scope:

- No backend, API, or data changes.
- No CSS removal (orphan clock styles are harmless).
- No changes to ProjectDashboard.tsx (per-project view, unrelated).

## Acceptance Criteria

- Dashboard no longer renders a Local Time / digital clock section.
- No network request to `geojs.io` is made from the dashboard.
- Section order is: Workspace Snapshot → Project Calendar → Pinned Projects → Next 10 Days → Pinned Sheets → Pinned Docs.
- Frontend builds without type or lint errors.

## Implementation Plan

- [ ] Delete the `DigitalClock` function from App.tsx.
- [ ] Remove `<DigitalClock />` and the reorder, within `DashboardView`'s JSX.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- Pure presentational reorder + dead-component removal. No data transformation, validation, persistence, or integration boundary is touched. Verified by build + visual check.

## File Size Check

Files expected to be edited:

- frontend/src/App.tsx

Line-count risk:

- Low (net reduction in lines after removing the ~75-line DigitalClock; App.tsx is ~1527 lines but will shrink).

## Verification Plan

- `npm run build` (or typecheck) succeeds.
- `grep DigitalClock frontend/src/App.tsx` returns no hits.

## Completion Notes

Changed files:

- frontend/src/App.tsx — deleted the `DigitalClock` component (~75 lines incl. the `geojs.io` IP-geolocation fetch) and its `<DigitalClock />` usage; reordered `DashboardView` sections so "Next 10 Days" now sits above "Pinned Sheets" and "Pinned Docs".
- frontend/src/styles.css — updated `.dashboard-grid` placement rules so Next 10 Days occupies the full right column (col3, rows 1-3) while Pinned Sheets and Pinned Docs move to row 3 (col1, col2). Also removed ~180 lines of dead clock CSS (`.digital-clock-container`, `.digital-clock`, `.clock-*`, `blink`/`pulseDot` keyframes, `.timezone-pill`, `.tz-offset`, `.tz-name`) and the orphan `.dashboard-clock` rule.
- frontend/src/visual-refresh.css — removed the dead clock overrides (`.digital-clock`, `.clock-time`, `.clock-digit.seconds`, `.clock-date`, `.dashboard-clock .section-body`).

Verification completed:

- `grep -rn "DigitalClock\|dashboard-clock\|digital-clock\|clock-time\|clock-digit\|clock-colon\|clock-sec-ampm\|clock-ampm\|clock-divider\|clock-bottom\|clock-date\|clock-location\|clock-dot\|clock-spacer\|clock-footer\|timezone-pill\|tz-offset\|tz-name\|Local Time" frontend/src/App.tsx styles.css visual-refresh.css` → no matches.
- `npm run build` → ✓ built in 2.29s, exit 0. CSS bundle dropped from 358.66 kB to 355.77 kB (~3 kB / ~180 lines removed).
- Visual grid placement now: Snapshot spans col1 rows1-2; Calendar col2 row1; Pinned Projects col2 row2; Next 10 Days spans col3 rows1-3; Pinned Sheets col1 row3; Pinned Docs col2 row3.

Unit tests added or updated:

- None. Pure presentational reorder + dead-component/CSS removal; no data/logic change to test. Per scholardocx-test-cases guidance, UI-only changes with no behavior/data/validation/persistence boundary do not require unit tests.

Follow-ups:

- The `geojs.io` external request is fully gone (privacy-positive side effect of removing the clock).
- Mobile breakpoint in styles.css still lists `.dashboard-pinned-empty` in its full-width reset; harmless, left in place.
