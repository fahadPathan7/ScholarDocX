# SCHOLAR-0024: Central Calendar Compact Focus

Status: Done

Owner: AI Agent

Created: 2026-05-27

Completed: 2026-05-27

## Summary

Apply the compact-calendar interaction pattern to the central dashboard. The
full calendar should open in a floating panel and focus the next featured row
date. Project dashboard full calendar should also focus the next featured row
date.

## Functional Context

Links:
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md)
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-project-workspace.md)

## Requirements

- Central dashboard should show compact calendar summary by default.
- Clicking central compact calendar opens full calendar modal.
- Central full calendar focuses the next featured event date.
- Project full calendar also focuses the next featured event date.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check compact central calendar, central full calendar focus, project full calendar focus.

## Completion Notes

Changed files:
- [App.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/App.tsx) - Replaced central dashboard full calendar with compact summary plus full calendar modal focused on the next featured event.
- [CalendarMonthView.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/CalendarMonthView.tsx) - Added optional `focusDate` support so full calendars can open on a featured event date.
- [ProjectDashboard.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/ProjectDashboard.tsx) - Passed the next project event date into the full calendar modal.
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md) - Documented compact central calendar and focused full calendar behavior.

Verification completed:
- `npm run build` passes.
- Browser checked central dashboard compact calendar; opening it focused June 6, 2026, the next featured date.
- Browser checked project dashboard compact calendar; opening it also focused June 6, 2026, the next featured project date.
