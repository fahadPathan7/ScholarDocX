# Acceptance Criteria

Use this file for high-level acceptance criteria. Detailed task-specific criteria belong in Jira task files.

## Initialization

- App creates missing workspace folders on first launch.
- App creates or opens local SQLite database.
- Missing AI keys are reported clearly.
- Non-AI features remain usable when AI keys are missing.

## Hierarchy And Dashboard

- User can enable degree workspaces.
- User can create countries, regions, universities, programs, and professors.
- User can create an application under the hierarchy.
- Dashboard shows applications across all enabled degree workspaces.
- Dashboard shows upcoming deadlines and follow-up reminders.

## Documents And Storage

- User can create a rich-text document.
- User can create a version for a specific application.
- User can add a static file to local storage.
- User can link documents and static files to an application.

## Email And Outreach

- User can create a template with parameters.
- User can generate an email draft from a template.
- User can link attachments to a draft.
- User can copy or open the draft in the default mail client.
- User can log sent outreach and create a follow-up reminder.

## AI Assistant

- User can send a chat request.
- User can run a web-assisted research query.
- AI response includes enough context or source references for review.
- User can save AI-generated notes only after choosing to do so.

## Authentication

- Local MVP workflows remain usable without remote signin.
- Optional Google signin can create or link a local profile.
- Google signin uses minimal scopes unless a specific Google API feature requires more.
- Disconnecting Google identity does not delete local application data.

## Sheet Columns and Record Form

- Sheet columns have a specified type: `text`, `number`, `bool`, or `file`.
- Adding a column requires entering a name and selecting a type using an inline form, which auto-saves on submission.
- User can add a record through a dynamically generated form based on sheet columns and their types.
- Form fields adapt input controls to column types: boolean columns use checkbox toggles, file columns use a custom file picker with upload capability, number columns use numeric inputs, and text columns use text inputs/areas.
- File-type fields integrate with Documents: users can search/select existing workspace files or upload a new file inline, which is tracked centrally in Documents under a category.
- Form validates that at least one field is non-empty before submission.
- Form shows clear validation error if submission is attempted with all empty fields.
- Form automatically persists record to backend after successful submission.
- Form clears and closes after successful submission.
- Form supports Escape key to cancel/close.
- Form supports Ctrl/Cmd+Enter to submit from textarea fields.
- Add Record button is disabled when sheet has no columns.
- Empty state message guides user to add columns first when sheet is empty.
- Save operations show loading states to prevent double-submission.
- Success feedback is displayed after save completes.
