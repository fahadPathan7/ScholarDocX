# SCHOLAR-0022: Dashboard Calendar Refinement

Status: Done

Owner: AI Agent

Created: 2026-05-27

Completed: 2026-05-27

## Summary

Refine the central dashboard after the row calendar launch. Highlight today's
date in the calendar, remove lower-value central dashboard sections, and add a
focused next-10-days event list sourced from row calendar events.

## Functional Context

Links:
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md)
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-project-workspace.md)

Requirements:
- Calendar cells for the current date must have distinct styling.
- Central dashboard should remove Follow-ups, Central inbox, and Recent applications.
- Central dashboard should show events whose dates are from today through the next 10 days.
- Clicking a next-10-days event should open the owning project sheet row, same as calendar side-panel events.

## Scope

In scope:
- Calendar `today` class and styling.
- Dashboard section removal.
- New upcoming 10-day row event section.

Out of scope:
- Backend schema changes.
- External calendar sync.

## Verification Plan

- Run frontend build: `npm run build`.
- Run backend tests if backend code changes.
- Browser-check dashboard calendar today styling and next-10-days list.

## Completion Notes

Changed files:
- [CalendarMonthView.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/CalendarMonthView.tsx) - Added today-state class and kept the default month anchored to the current date.
- [calendar.css](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/calendar.css) - Added distinct today styling.
- [App.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/App.tsx) - Removed central dashboard Follow-ups, Central inbox, and Recent applications sections; added next-10-days event filtering and navigation.
- [styles.css](/Users/fahadpathan/Documents/ScholarDock/frontend/src/styles.css) - Added next-10-days event list styles.
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md) - Documented current-date styling and simplified dashboard sections.

Verification completed:
- `npm run build` passes.
- Browser checked central dashboard: current date has `calendar-day today selected`, removed sections are gone, next-10-days list is visible, and clicking an event opens the owning sheet row.
