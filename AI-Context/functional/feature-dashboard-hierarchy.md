# Feature: Dashboard And Hierarchy

Requirement group: FR-2

## Goal

Users can organize application targets in a flexible hierarchy while still seeing one global progress view.

## Hierarchy

Primary structure:

Degree level -> country -> state or region -> university -> program -> professor.

Professor is optional because not every application is professor-led.

## Degree Workspaces

Supported degree levels:

- Bachelor's
- Master's
- PhD

Users can enable or disable each degree workspace.

## Application Statuses

Initial Kanban status candidates:

- Researching
- Drafting
- Waiting for documents
- Ready to submit
- Submitted
- Interviewing
- Accepted
- Rejected
- Archived

Final statuses should be configurable only if the implementation task explicitly includes that scope.

## Dashboard Must Aggregate

- Active applications
- Upcoming deadlines
- Application statuses
- Pending document work
- Pending email follow-ups
- Recent activity
- Project row calendar events across all projects

## Timeline Must Include

- Application deadlines
- Scholarship deadlines
- Test dates
- Interview dates
- Email follow-up reminders

## Calendar UX

The central dashboard should show a month calendar that aggregates row-linked
calendar events from all projects. Each day cell displays a count of events for
that date. Selecting a date opens a side panel for that day. Selecting an event
opens the owning project sheet and focuses the source row.

The current date should have a distinct visual treatment in calendar cells,
separate from the selected date and event-count badge.

The central dashboard should prioritize active planning surfaces. It should not
show the older Follow-ups, Central inbox, or Recent applications sections on the
main dashboard. Instead, it should include a row-calendar-derived section that
lists events due from today through the next 10 days.

The central dashboard calendar should use a compact summary panel by default,
matching the project dashboard calendar pattern. Clicking it should open the
full calendar in a floating panel focused on the next featured row date.

The central dashboard Recent Projects section should show at most 5 projects
and include project creation dates.

Users should be able to pin projects and sheets in their own lists. When an
item is pinned, the UI should also offer a separate dashboard pin action. Only
items pinned to the dashboard should appear in the central dashboard pinned
items section. Dashboard pinned items should be grouped by type so projects and
sheets are easy to scan.

Alerts should not be surfaced as project-level dashboard metrics. They belong
in the central Alerts tab. The Alerts tab should support mark-all-read, delete
one alert, and delete all read alerts. Alert items should show clear title and
body text. When an alert can be mapped to a source project, sheet row, or
calendar event, clicking it should navigate to that source. Alerts without a
linked source should show a toast-style message on click instead of navigating.

The application shell should use separate scrolling regions for the left
navigation and right workspace. The main workspace header should remain fixed
while the workspace content scrolls.

The fixed main workspace header should have a clearly distinct visual treatment
from the scrolling content so users can understand that it remains anchored.

## Important UX Rule

Nested organization must not hide urgent work. The dashboard should surface time-sensitive items across all folders.

## Visual UX Direction

The workspace should feel like an interactive application command center, not a
plain admin template. Dashboard and project surfaces should use strong visual
hierarchy, rich but restrained cards, clear hover states, smooth floating
panels, and a distinctive sidebar/header treatment while preserving scanability
for repeated planning work. The fixed header should be compact and readable, so
it anchors the workspace without taking attention away from the active content.
