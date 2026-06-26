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
- FR-6.7: Authenticated users should be able to explicitly log out from the Profile view.
- FR-6.8: Admin role limit/permission settings should support reset-to-default per role.
- FR-6.9: Users with only admin roles and no user-tier role should see user-tier usage limits as zero in usage summaries.
- FR-6.10: Users can request a renewal for their current plan using a monthly or yearly billing cycle without replacing the active or expired plan record.
- FR-6.11: Admin approval of a renewal must extend the current plan deadline from the approval timestamp when the existing plan has expired, or from the existing plan end date when it is still active.
- FR-6.12: Users whose user-tier plan has expired should lose the main workspace navigation tabs and fall back to the limited sidebar set used for non-user access, while still keeping Profile, Settings, About, and plan management reachable.
- FR-6.13: The profile subscription card should visually warn users when a plan has 7 days or fewer remaining, and switch to an urgent expired state with renewal guidance once the plan has ended.

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
- FR-7.17: Notification events must come from a centralized, code-defined event registry so only approved notification kinds are emitted.
- FR-7.18: Notification titles and bodies should use centralized templates with variable interpolation.
- FR-7.19: Every emitted notification event must map to a user-controllable notification preference key.
- FR-7.20: Admin dashboard should provide a read-only tab showing notification text previews by category.
- FR-7.21: When role-based permissions or limits block an action, the UI should show a clear, styled alert explaining why the action failed and what to do next.
- FR-7.22: Admin user-management filters should show live user counts for each available role, plan-status, and account-status option based on the currently selected complementary filters.
- FR-7.23: Admins can send notifications with a title, body, and category to all users, the currently filtered user subset, or specific individual users.
- FR-7.24: Admin-sent notifications must respect each recipient's notification preferences, except for the mandatory `system` category which users cannot disable.

## FR-8: Scholarship Hunt

- FR-8.1: Users can run Scholarship Hunt with structured academic and funding filters.
- FR-8.2: Named scholarships use canonical names and aliases rather than UI display labels.
- FR-8.3: Named-scholarship results must mention the selected scholarship or an accepted alias.
- FR-8.4: Generic results must remain scholarship or academic-funding focused.
- FR-8.5: Tavily result cards are normalized and displayed for the approved query.
- FR-8.6: Successful Search-click previews consume role-based daily and monthly usage.
- FR-8.7: Tavily credentials remain backend-only.
- FR-8.8: The filter panel uses accessible accordions and visible selection counts.
- FR-8.9: Dense filter subcategories can collapse independently.
- FR-8.10: Main filter categories follow user-intent priority.
- FR-8.11: Broad level filters produce useful scholarship web queries.
- FR-8.12: One submitted search uses at most one one-credit Tavily Search call.
- FR-8.13: Scholarship Hunt search remains isolated from AI chat web research.
- FR-8.14: Tavily results retain the existing news-card and bookmark contract.
- FR-8.15: Queries prioritize open and upcoming current/future application cycles.
- FR-8.16: Explicitly closed and past-deadline exclusions are included in the query.
- FR-8.17: Tavily result order is preserved after normalization.
- FR-8.18: UI copy describes scholarship opportunities rather than generic news.
- FR-8.19: Query dates and cycles update from the backend's local date per search.
- FR-8.20: Visible branding uses Scholarship Hunt while internal news contracts stay stable.
- FR-8.21: Selected filter dimensions are mandatory AND constraints with OR inside each dimension.
- FR-8.22: Region means study destination, not nationality, eligibility, source, or sponsor location.
- FR-8.23: Usage quotas and Admin role-limit labels use Scholarship Hunt terminology while internal quota keys stay stable.
- FR-8.24: Users review and optionally edit the generated query before search.
- FR-8.25: Generated and approved queries are stored locally with filters and outcome.
- FR-8.26: Preview uses no Tavily request but does consume one Scholarship Hunt quota unit; confirmation uses one Tavily request without spending a second unit.
- FR-8.31: Repeated searches show a visible preparing/searching state before new results replace the previous result set.
- FR-8.27: Hard destination/named-scholarship validation is combined with evidence-based relevance scoring for snippet-limited filters.

## FR-9: Advisor Atlas

See
[feature-advisor-atlas.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-advisor-atlas.md)
for the complete workflow and requirements.

- FR-9.1: Add the Advisor Atlas navigation workspace.
- FR-9.2: Support department discovery and professor-specific search.
- FR-9.3: Build a reviewable student research profile.
- FR-9.4: Support Quick Map, Deep Atlas, and Focused Dossier.
- FR-9.5: Discover and deduplicate public professor profiles.
- FR-9.6: Enrich research, lab, student, publication, funding, and recruitment data.
- FR-9.7: Provide sourced latest-publication fallbacks.
- FR-9.8: Use a visible multi-pass intelligence workflow.
- FR-9.9: Preserve claim-level evidence.
- FR-9.10: Separate match, confidence, and recruitment.
- FR-9.11: Use five evidence-based recruitment states.
- FR-9.12: Do not equate funding with confirmed recruitment.
- FR-9.13: Produce structured advisor dossiers and next actions.
- FR-9.14: Expose coverage, conflicts, and missing information.
- FR-9.15: Provide decision lanes and comparison.
- FR-9.16: Persist user-scoped runs and results locally.
- FR-9.17: Support stop, revisit, refresh, and resume.
- FR-9.18: Produce a student action center.
- FR-9.19: Confirm before saving into core professor records.
- FR-9.20: Respect public access restrictions.
- FR-9.21: Provide responsive and accessible workflow states.
- FR-9.53: Enforce and display tiered monthly Advisor Atlas search/refresh
  quotas: General 3, Pro 10, Max 30.
