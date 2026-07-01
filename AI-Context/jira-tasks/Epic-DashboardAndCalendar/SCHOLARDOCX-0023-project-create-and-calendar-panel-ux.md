# SCHOLARDOCX-0023: Project Create And Calendar Panel UX

Status: Done

Owner: AI Agent

Epic: Epic-DashboardAndCalendar

Created: 2026-05-27

Completed: 2026-05-27

## Summary

Refine project workspace UX so add/create actions open floating panels instead
of rendering inline forms. Hide the default sheet name field until the user
chooses to create a sheet. Replace the large project dashboard calendar with a
compact calendar panel beside dashboard metrics; clicking the compact panel
opens the full calendar view.

## Functional Context

Links:
- [feature-project-workspace.md](../../functional/feature-project-workspace.md)
- [feature-dashboard-hierarchy.md](../../functional/feature-dashboard-hierarchy.md)

Requirements:
- New Project opens a floating form panel, not an inline same-page section.
- Create Sheet opens a floating form panel, and no sheet name field is shown by default.
- Project dashboard should show compact calendar summary beside the metrics.
- Full project calendar opens only after clicking the compact calendar panel.

## Scope

In scope:
- Project create modal.
- Sheet create modal.
- Compact project dashboard calendar panel and full calendar modal.

Out of scope:
- Backend data model changes.
- Central dashboard calendar changes.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check project creation panel, sheet creation panel, compact project calendar, and full project calendar modal.

## Completion Notes

Changed files:
- [ProjectWorkspace.tsx](../../../frontend/src/components/ProjectWorkspace.tsx) - Converted New Project and Create Sheet into floating modal panels; removed the always-visible sheet-name field and default sheet-name display.
- [ProjectDashboard.tsx](../../../frontend/src/components/ProjectDashboard.tsx) - Replaced the always-open full project calendar with a compact calendar summary panel and a full calendar modal.
- [styles.css](../../../frontend/src/styles.css) - Added compact project calendar and modal sizing styles; kept central dashboard calendar full-width only.
- [feature-project-workspace.md](../../functional/feature-project-workspace.md) - Documented floating create panels and compact project calendar behavior.

Verification completed:
- `npm run build` passes.
- Browser checked: Projects page no longer shows inline create project form; New Project opens a floating panel; project Sheets section no longer shows the sheet-name input by default; Create sheet opens a floating panel; project dashboard shows compact calendar beside metrics; clicking compact calendar opens the full calendar modal.
