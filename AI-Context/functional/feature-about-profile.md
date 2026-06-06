# Feature: Profile And About

Requirement group: FR-8

## Goal

Keep user-facing work screens focused on work. Product/system details such as local-first storage, workspace path, version, and privacy notes belong in Profile or About, not the main dashboard header.

## FR-8: Profile And About

- FR-8.1: The main dashboard should not show "MVP", "local-first", workspace path, or implementation wording.
- FR-8.2: Profile should show user identity preferences and workspace path/status.
- FR-8.3: About should explain product purpose, privacy/local storage, AI integrations, and current limitations.
- FR-8.4: Workspace path should not be shown in the sidebar or central dashboard.
- FR-8.5: Profile avatar selection should be presented as a labeled visual picker with clear selected-state feedback and a dedicated initials fallback option.
- FR-8.6: Profile avatar options may use local static image assets bundled with the app (for example under frontend public media assets), while still storing only the selected avatar ID in profile data.
- FR-8.7: Timezone selection should use a dropdown with readable GMT offset
  labels, for example `GMT+06:00 - Asia/Dhaka`.
- FR-8.8: Profile should include a clear `Logout` action that signs out the
  current user session without changing local project/workspace data.
- FR-8.9: Profile email is read-only for users and cannot be edited from the
  profile form.
- FR-8.10: Settings root page should use compact action buttons/cards rather
  than rendering all settings sections inline.
- FR-8.11: Settings detail sections such as usage limits and notification
  preferences should open in modals with blurred main-content backdrop.
- FR-8.12: Notification preferences should separate workspace activity
  notifications from admin-sent notification categories so users can manage
  them independently.
- FR-8.13: The `system` admin notification category must stay enabled for every
  user and cannot be unchecked from the settings UI.

## About Page UX

The About page should use the full workspace width instead of a narrow centered
column. It should explain ScholarDock's purpose, local-first privacy model, AI
boundaries, document storage, and outreach support in a visually engaging but
work-focused way. Subtle motion is acceptable when it helps the page feel alive
without distracting from the app's calm planning theme. Utility cards inside
About, such as the system clock, should feel like polished status instruments
rather than placeholder or debug-style widgets.
