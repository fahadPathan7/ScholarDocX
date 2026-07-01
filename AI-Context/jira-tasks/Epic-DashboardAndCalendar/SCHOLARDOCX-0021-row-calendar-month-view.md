# SCHOLARDOCX-0021: Row Calendar Month View

Status: Done

Owner: AI Agent

Created: 2026-05-27

Completed: 2026-05-27

## Summary

Replace the list-style project calendar with a real month calendar. Calendar
items should be derived from sheet row date fields, shown as per-day counts,
and selectable through a side panel that can navigate back to the source row.
The central dashboard should aggregate row calendar events from all projects.

## Functional Context

Links:
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md)
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-dashboard-hierarchy.md)

Requirements:
- Project calendar is project-scoped.
- Central dashboard calendar aggregates all projects.
- Calendar cells show counts, not repeated list cards.
- Selecting a date shows that day's events in a side panel.
- Selecting an event opens the owning sheet row.
- Calendar events come from sheet row dates, not duplicated notification records.

## Technical Context

Links:
- [project-structure.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/project-structure.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/file-size-and-modularity.md)

Technical notes:
- `ProjectWorkspace.tsx` and `styles.css` exceed the 1150-line threshold before this work starts.
- Extract the calendar UI into a focused component and stylesheet instead of adding more code to the large workspace file.
- Backend summary payloads should include row source metadata: project, sheet/page, row index, date field, and normalized date.

## Scope

In scope:
- Backend row calendar item metadata for project and dashboard summaries.
- Shared month calendar component.
- Project dashboard calendar with row navigation.
- Central dashboard all-project calendar with row navigation.
- Avoid duplicate scheduled-email alert creation when compose is opened repeatedly for the same scheduled row.

Out of scope:
- Drag-and-drop event editing.
- Provider-side email scheduling.
- External calendar sync.

## Acceptance Criteria

- Project dashboard renders a month calendar with event counts per date.
- Selecting a date shows events in a side panel.
- Selecting an event opens the source sheet and focuses the source row.
- Central dashboard shows the same calendar pattern across all projects.
- Project calendar events do not include other projects.
- Notifications/alerts do not create extra calendar entries.
- Frontend build and backend tests pass.

## Verification Plan

- Run backend unit tests: `pytest`.
- Run frontend production build: `npm run build`.
- Open the app in the browser and verify dashboard/project calendar layout.

## Completion Notes

Changed files:
- [store.py](/Users/fahadpathan/Documents/ScholarDocX/backend/app/services/store.py) - Added row-derived calendar items with project/page/sheet/row metadata for project and central dashboard summaries.
- [test_store.py](/Users/fahadpathan/Documents/ScholarDocX/backend/tests/test_store.py) - Added row calendar assertions for project and central summaries.
- [CalendarMonthView.tsx](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/CalendarMonthView.tsx) - Added reusable month calendar with per-day counts and selected-day event side panel.
- [ProjectDashboard.tsx](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/ProjectDashboard.tsx) - Extracted project dashboard and project-scoped calendar.
- [SheetRecordFields.tsx](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/SheetRecordFields.tsx) - Extracted sheet cell and record field helpers from the oversized workspace component.
- [ProjectWorkspace.tsx](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/ProjectWorkspace.tsx) - Added event navigation to source sheet rows and de-duplicated scheduled-email alerts.
- [App.tsx](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/App.tsx) - Replaced central upcoming-date list with all-project row calendar and wired event navigation into Projects.
- [calendar.css](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/calendar.css) and [file-picker.css](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/file-picker.css) - Split component styles from the oversized global stylesheet.
- [styles.css](/Users/fahadpathan/Documents/ScholarDocX/frontend/src/styles.css) - Added full-width calendar section placement and row focus styling.
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md), [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-dashboard-hierarchy.md), and [project-structure.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/project-structure.md) - Documented row calendar behavior and new component structure.

Verification completed:
- `npm run build` passes.
- `.venv/bin/pytest` passes.
- `pytest tests/test_store.py` passes in the ambient Python environment.
- Ambient full `pytest` has async plugin failures in `tests/test_ai.py`; the backend virtualenv includes `pytest-asyncio` and passes the full suite.
- Browser checked against a temporary workspace: central dashboard showed all-project row counts, project dashboard showed project-only row counts, and event click opened and highlighted the source sheet row.
