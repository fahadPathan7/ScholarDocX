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

## Workspace Snapshot Feature Library Counts

Alongside Projects/Sheets/Documents/Sticky notes/White boards/Calendar
dates, the Workspace Snapshot section also shows each AI feature's stored
item count against its cap: Advisor Atlas research history (100), Scholarship
Hunt Opportunity Library (100) and Previous Searches (10, FIFO-evicted),
and Research Expert library (role-based, e.g. 20 on Pro/Max by default,
admin-editable via Role Limits). A count shown as `count/max` turns red once
the user is at or over that cap, matching the same fixed caps documented in
the admin Info tab.

## Manual Calendar Reminders

Not every important date comes from a sheet row. Users can add manual
calendar entries (reminders or any other date) from two places:

- The central Dashboard: general-purpose, no project link. A general entry
  only ever appears on the central Dashboard — never inside any project's
  own calendar.
- A specific project's dashboard: scoped to that project. It appears in that
  project's own calendar and also rolls up into the central Dashboard's
  aggregated calendar, the same way sheet-row dates already aggregate
  across all projects.

A manual entry has a title, a date, and an optional note. Users can delete a
manual entry they created. Editing an entry after creation is not supported
yet (delete and re-add instead).

## Today / Next 10 Days Done Checkbox

Every item in the central Dashboard's "Today" and "Next 10 Days" sections
(both sheet-row-derived dates and manual reminders) has a checkbox. This is
a dashboard-only management aid:

- Checking an item marks it done. It stays visible but moves to the bottom
  of its section (unchecked items stay on top, in date order). The row
  becomes visually muted and no longer opens its source on click; the
  checkbox itself remains clickable to undo.
- Checking a sheet-row-derived item never modifies the underlying sheet
  row — the "done" state is tracked separately from the row's own data.
- This checkbox only appears on the central Dashboard's Today/Next 10 Days
  lists. A project's own calendar view does not show it.

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
