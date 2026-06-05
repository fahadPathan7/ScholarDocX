# Functional Requirements Index

## FR-1: Local Environment And Initialization

- FR-1.1: On first launch, create the local workspace folder structure.
- FR-1.2: Use environment variables for optional AI/search provider keys:
  `GLM_API_KEY`, `GEMINI_API_KEY`, and `TAVILY_API_KEY`.
- FR-1.3: Validate required configuration on backend startup.
- FR-1.4: Keep missing AI keys from blocking non-AI core workflows unless a later decision requires otherwise.

## FR-2: Dashboard And Organizational Hierarchy

- FR-2.1: Users can enable or disable workspaces for Bachelor's, Master's, and PhD.
- FR-2.2: Users can create hierarchy folders by country, state or region, and university.
- FR-2.3: Users can track programs and professors under institutions.
- FR-2.4: Users can view a global Kanban board across all active applications.
- FR-2.5: Users can view a chronological timeline or calendar of deadlines.

## FR-3: Document Playground And Storage

- FR-3.1: Users can draft rich-text academic documents in the browser.
- FR-3.2: Users can save document variations for different applications.
- FR-3.3: Users can upload or register static files such as PDFs.
- FR-3.4: Static files are stored in the local workspace media directory.
- FR-3.5: Applications can link to relevant documents and files.

## FR-4: Email And Outreach Manager

- FR-4.1: Users can create parameterized email templates.
- FR-4.2: Users can link attachments to email drafts.
- FR-4.3: Users can send through mailto/copy flow or optional local SMTP configuration.
- FR-4.4: Users can log sent outreach and set follow-up reminders.

## FR-5: AI Assistant Module

- FR-5.1: Users can access a persistent or sliding chatbot interface.
- FR-5.2: The backend can combine Tavily web search with configured AI summarization.
- FR-5.3: AI can use current document or email draft context when the user explicitly requests it.
- FR-5.4: AI actions should show enough context for user review before saving changes.
- FR-5.5: AI can prepare project, sheet, row, and sticky-note actions, but only execute them after user confirmation.

## FR-6: Authentication And Identity

- FR-6.1: The app can run without remote signup/signin.
- FR-6.2: A local profile may store user display preferences.
- FR-6.3: Google signin may be added as an optional provider.
- FR-6.4: Google signin must not be required for local data access unless a later business decision changes the product.
- FR-6.5: OAuth scopes must be minimal and purpose-specific.
- FR-6.6: Disconnecting Google identity must not delete local application data.

## FR-7: Projects, Sheet Pages, Notifications, And Layout

- FR-7.1: Users can create projects from Targets.
- FR-7.2: Each project has its own dashboard.
- FR-7.3: Each project can contain multiple sheets.
- FR-7.4: Each sheet is one detail page with one editable table.
- FR-7.5: Users can add, edit, and delete sheet columns and rows.
- FR-7.6: Users can open Gmail or Outlook web compose links from a row.
- FR-7.7: Central notifications aggregate follow-ups, deadlines, scheduled email reminders, and project events.
- FR-7.8: Left navigation is collapsible.
- FR-7.9: AI assistant is a collapsible/expandable top-right panel.
- FR-7.10: Users have a local profile page.
- FR-7.11: Records are rows inside sheet pages, not a separate nav tab.
- FR-7.12: Users add records through a sheet-generated form.
- FR-7.13: Outreach status is tracked on sheet records.
- FR-7.14: Rows track email sent, follow-up sent, response, central application, and date fields.
- FR-7.15: Rows are colored by configurable due-date thresholds.
- FR-7.16: Rows can link uploaded documents/files.
