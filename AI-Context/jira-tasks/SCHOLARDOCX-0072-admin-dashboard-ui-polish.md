# SCHOLARDOCX-0072 — Admin Dashboard UI Polish

## Status

Done

## Request

Fix the Admin Dashboard dashboard tab UI after screenshot review.

## Context

- Technical visual system: [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)


## Scope

- Apply ScholarDocX UI/UX rules to the admin dashboard tab.
- Improve stat card hierarchy, table panels, spacing, responsive behavior, and loading/empty states.
- Keep the change UI-only with no API, database, permissions, or role-limit behavior changes.

## Out Of Scope

- Refactoring the oversized `AdminView.tsx` file.
- Changing admin permissions, dashboard counts, audit behavior, or invite workflows.
- Adding new dashboard metrics.

## Acceptance Criteria

- Dashboard metrics are scan-friendly, balanced, and visually aligned across desktop widths.
- Recent registrations and recent logins panels have polished headers, row density, empty states, and stable layout.
- The dashboard has no incoherent overlap or horizontal overflow at desktop and mobile sizes.
- Browser verification is completed for the admin dashboard.

## File-Size Risk

`frontend/src/components/AdminView.tsx` starts above the file-size limit. This task should avoid adding substantial logic to that file and prefer focused CSS or later extraction.

Final note: `AdminView.tsx` remains oversized after this UI-only change. The dashboard edits added class hooks and empty states only; the next admin feature should extract admin tabs into focused components before adding more behavior.

## Test Plan

- Run the frontend build when practical.
- Browser-check the admin dashboard at desktop and mobile widths.
- Unit tests are not planned because this is visual presentation polish without behavior, persistence, validation, or API changes.

## Changed Files

- `frontend/src/components/AdminView.tsx`
- `frontend/src/admin.css`
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0072-admin-dashboard-ui-polish.md`

## Implementation Notes

- Applied the ScholarDocX UI/UX wrapper rules.
- Imported the existing dedicated admin stylesheet from `AdminView.tsx`; it was not previously wired.
- Replaced dashboard-tab utility-heavy markup with stable admin dashboard class hooks.
- Added stat-card tone variants, count pills, polished activity tables, loading state, and empty states.
- Hid the decorative admin hero inside the admin view so the dashboard content starts with the tab strip and metric cards.
- Made the admin tab strip a single scroll-safe row instead of wrapping.
- Reduced stat value typography after screenshot feedback so dashboard numbers read as compact metrics instead of oversized display text.
- Added top spacing above the admin tab strip after screenshot feedback so it does not collide visually with the global header.

## Verification

- `cd frontend && npm run build` passed.
- Follow-up build after stat value scale adjustment also passed.
- Follow-up build after admin tab-strip spacing adjustment also passed.
- Browser-rendered via Chrome DevTools against `http://localhost:5174/` with the local backend and a temporary local JWT for the active super admin.
- Desktop check at `1549x650`: admin dashboard rendered, hero hidden, 4 stat cards rendered in one row, 2 activity panels visible, page `scrollWidth` matched `clientWidth`.
- Mobile check at `390x780`: admin dashboard rendered, body `scrollWidth` matched `clientWidth`; tabs use intentional horizontal scrolling.
- Screenshots captured for local QA:
  - `/tmp/scholardocx-admin-dashboard-desktop.png`
  - `/tmp/scholardocx-admin-dashboard-mobile.png`

## Follow-Ups

- Extract `AdminView.tsx` into focused tab components before the next admin feature.
- Consider a broader responsive pass for the overall app shell on narrow mobile widths; this task only fixed the admin dashboard surface.
