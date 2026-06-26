# Feature: Project Workspace And Sheet Pages

Requirement group: FR-7

## Goal

Targets should be organized as projects. The Projects root screen should only help users create projects and view/open existing projects. Editing sheets and rows happens inside a selected project.

## FR-7: Projects And Pages

- FR-7.1: Users can create projects from the Targets area.
- FR-7.2: Each project has its own dashboard.
- FR-7.3: Each project can contain multiple sheets.
- FR-7.4: Each sheet is one detail page with one editable table.
- FR-7.5: A sheet can have editable, addable, and deletable columns and rows.
- FR-7.6: Users can open Gmail or Outlook web compose flows from a row.
- FR-7.7: Central notifications should aggregate follow-ups, deadlines, scheduled email reminders, and project events.
- FR-7.17: Notification events must come from a centralized, code-defined event
  registry so only approved notification kinds are emitted.
- FR-7.18: Notification titles/bodies should use centralized templates with
  variable text interpolation.
- FR-7.19: Each emitted notification event must map to a user-toggle setting.
- FR-7.20: Admin dashboard should provide a read-only tab showing notification
  text templates by category.
- FR-7.21: When role-based permissions or limits block an action, the UI should
  show a clear, styled alert explaining why the action failed and what to do
  next.
- FR-7.22: Admin user-management filters should show live user counts for each
  available role, plan-status, and account-status option based on the
  currently selected complementary filters.
- FR-7.23: Admins should be able to send notifications with a title, body, and
  category to all users, the currently filtered user subset, or specific
  individual users from the user-management surface.
- FR-7.24: Admin-sent notifications must respect recipient notification
  preferences, except for the mandatory `system` category which cannot be
  disabled by users.
- FR-7.8: Left navigation is collapsible.
- FR-7.9: AI assistant appears as a collapsible/expandable top-right panel similar to browser Copilot.
- FR-7.10: Users have a profile page for local identity and preferences.
- FR-7.11: Records are rows inside sheet pages, not a separate navigation area.
- FR-7.12: Users add records from a sheet page using a form generated from the current columns.
- FR-7.13: Outreach tracking is stored on sheet records, not a separate Outreach tab.
- FR-7.14: Rows can track email sent status, follow-up sent status, response status, central application status, and important dates.
- FR-7.15: Rows should be colored based on configurable due-date thresholds.
- FR-7.16: Rows can link uploaded documents/files.
- FR-7.17: Record form validates that at least one field is non-empty before submission.
- FR-7.18: Record form auto-saves to backend after successful submission.
- FR-7.19: Record form supports keyboard shortcuts (Escape to close, Ctrl/Cmd+Enter to submit from textareas).
- FR-7.20: Add Record button is disabled when sheet has no columns, with helpful empty state message.

## Projects Root UX

The Projects root should show:

- New project action that opens a floating form panel.
- Existing project list/cards.
- Basic project metadata.
- Sheet count for each project, written with a clear label such as "3 sheets".
- Project creation date.
- Project pin action, plus a dashboard pin action once pinned.
- Open project action.

The Projects root should not show project dashboard, sheet creation, or sheet table editing until a project is opened.

There should be no separate Records or Outreach nav tabs. Records and outreach live inside project sheets.

Clicking the left sidebar Projects tab should always return to the Projects
root screen, even if the user previously had a project or sheet open. Opening a
specific project should only happen from project cards, dashboard recent/pinned
items, alerts, notifications, or calendar-linked navigation.

## Project Dashboard UX

Inside a project, the dashboard should focus on calendar-like planning and active work.

Recommended widgets:

- A compact project calendar summary beside the dashboard metrics.
- The compact calendar opens the full month calendar in a floating panel.
- A month calendar that shows counts on dates that have sheet-row date values.
- A selected-day side panel listing that day's row-linked events.
- The full calendar should still render when there are no row date events,
  focused on the current date, with an empty selected-day panel.
- Event clicks should open the owning sheet and focus the matching row.
- Recent sheet activity.
- Counts for sheets, rows, and notifications.

Project calendars must be scoped to the currently opened project only. Calendar
items come from date-like values stored on sheet rows, such as scheduled send
time, follow-up date, email sent date, or generic date fields. Notifications
and alerts are not calendar items unless they are backed by a row date.

## Sheet UX

Inside a project, the user should only see:

- Project dashboard.
- Create sheet action that opens a floating form panel.
- Sheet list/cards.
- Sheet creation date on each sheet card.
- Sheet pin action, plus a dashboard pin action once pinned.

When the user opens a sheet, navigate to that sheet detail view. Do not show all sheet details on the project dashboard page.

Each sheet is one page only. There are no separate default pages/tabs inside a sheet.

## Project UI Direction

Project cards, sheet cards, sheet tables, pin controls, and floating create/edit
panels should feel interactive and polished. The UI should make primary actions
obvious, use motion and depth sparingly to communicate clickability, and keep
spreadsheet-heavy surfaces dense enough for serious planning work.

## Sheet Table UX

The sheet table is the primary project work surface and should feel like a
polished spreadsheet/data grid:

- Table typography should be compact, readable, and consistent across headers,
  row numbers, and cells.
- Rows should keep a stable default preview height. Long cell content should be
  clipped to a readable preview instead of forcing the whole row taller.
- Long unbroken words, emails, and URLs must wrap or clip inside their own cell
  and must never bleed into neighboring columns.
- Horizontal scrolling should keep the row-number/index column frozen on the
  left.
- Users should be able to inspect full cell content from the grid without
  opening edit mode. Clipped cell previews should open a readable full-cell
  viewer, while the grid itself continues to prioritize scanning and comparison.
- Clickable cell previews should consume the full visible cell area. Avoid
  inner pills, chip-like borders, browser tooltips, or zoom-style cursors that
  make a value look like a separate control inside the cell.
- The full-cell viewer should allow editing and saving only that cell's value,
  without opening the whole row form or changing neighboring cells.
- The full-cell text editor should grow with multi-line input up to 10 visible
  text lines, then scroll internally so the dialog remains easy to control.
- Empty cells should be selectable from the grid and open the same full-cell
  editor so users can fill one cell without opening the whole row form.
- The full-cell editor should respect column type. Date columns use date/time
  inputs, boolean/select columns use constrained controls, and file columns use
  the same local document picker/upload flow as the generated record form.
- Wide sheet work areas and other horizontal scrollers should support mouse
  left-click hold-and-drag horizontal scrolling, while preserving normal clicks
  and text/file editing interactions inside controls.

## Column Types and Record Form UX

Each column in a sheet has a specified type:
- `text`: Renders as standard text input or textarea in the form, and a plain text input/cell in the sheet table.
- `number`: Renders as a numeric input, restricting inputs to numbers.
- `bool`: Renders as a clean boolean checkbox/toggle switch in the form.
- `file`: Renders as a custom searchable file picker, allowing the user to select any file previously uploaded under "Documents" or upload a new file inline (which automatically registers in the central Document list under a selected category).

The Add Record form should:
- Layout fields vertically in a single-column scrollable container to prevent horizontal page overflow.
- Render specialized inputs tailored to the column's type.
- Validate that at least one field contains non-empty content before submission.
- Show a clear validation error message if all fields are empty.
- Automatically persist the record to the backend after successful submission (no manual Save required).
- Clear the form and close after successful submission.
- Support Escape key to close/cancel the form.
- Support Ctrl/Cmd+Enter to submit from textarea fields.
- Be disabled when the sheet has no columns, with an empty state message guiding users to add columns first.
- Show loading states during save operations to prevent double-submission.
- Display success feedback after save completes.

## Default Sheet Columns

Initial sheets should support columns such as:

- University name
- Professor name
- University rank
- Local rank
- Professor email
- Professor department
- Professor interests
- Google Scholar URL
- Profile URL
- Email subject
- Email body
- Attachments
- Email provider
- Scheduled send time
- Email sent
- Email sent date
- Follow-up sent
- Follow-up date
- Response status
- Response notes
- Centrally applied
- Application status
- Linked documents
- Status
- Notes

## Date Color Rules

Rows should be visually highlighted by date proximity. MVP default thresholds:

- Due within 3 days: urgent color.
- Due within 7 days: warning color.
- Due within 10 days: watch color.

Future customization should allow users to edit thresholds and colors per project.

## Email Compose Limitation

Browser links can open Gmail or Outlook compose screens with recipient, subject, and body prefilled.

Local attachments cannot be automatically attached to Gmail/Outlook web compose through ordinary browser links. To support real automatic attachments later, ScholarDocX would need a deeper provider integration such as Gmail API or Microsoft Graph with explicit OAuth scopes.

MVP behavior:

- Open Gmail or Outlook compose URL with to/subject/body.
- Show attachment names/paths for the user to attach manually.
- Store scheduled send time as a local reminder/notification, not as automatic provider scheduling.

Opening compose from a row should not create duplicate calendar entries. The
row's date fields are the calendar source of truth; alerts/reminders are a
separate notification surface.
