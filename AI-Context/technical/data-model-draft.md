# Data Model Draft

This is a draft model for planning. Implementation may refine it, but changes must update this file.

## Core Tables

## degree_workspaces

Purpose:

Track enabled degree-level workspaces.

Likely fields:

- id
- degree_type
- enabled
- display_name
- created_at
- updated_at

## universities

Purpose:

Store target institutions.

Likely fields:

- id
- name
- country
- region
- website_url
- notes
- created_at
- updated_at

## programs

Purpose:

Store programs under universities.

Likely fields:

- id
- university_id
- name
- degree_type
- department
- application_url
- funding_url
- notes
- created_at
- updated_at

## professors

Purpose:

Store potential advisors.

Likely fields:

- id
- university_id
- program_id
- name
- title
- email
- profile_url
- research_interests
- notes
- created_at
- updated_at

## applications

Purpose:

Central progress record.

Likely fields:

- id
- degree_workspace_id
- university_id
- program_id
- professor_id
- status
- intake_term
- application_url
- priority
- notes
- created_at
- updated_at

## deadlines

Purpose:

Track application, scholarship, test, interview, and follow-up dates.

Likely fields:

- id
- application_id
- deadline_type
- title
- due_at
- completed_at
- notes
- created_at
- updated_at

## documents

Purpose:

Track user-authored documents.

Likely fields:

- id
- document_type
- title
- owner_scope
- owner_id
- created_at
- updated_at

## document_versions

Purpose:

Track rich-text content variations.

Likely fields:

- id
- document_id
- version_label
- content_format
- content
- application_id
- created_at
- updated_at

## static_files

Purpose:

Track uploaded or registered secure files.

Likely fields:

- id
- display_name
- file_type
- relative_path
- mime_type
- size_bytes
- checksum
- created_at
- updated_at

## document_categories

Purpose:

Track user-manageable static-file categories used by the Documents view and
file upload flows.

Likely fields:

- id
- slug
- display_name
- sort_order
- created_at
- updated_at

Deleting a category deletes associated `static_files` records and their local
files. Renaming a category updates existing `static_files.file_type` values.

## sticky_notes

Purpose:

Track lightweight local notes and checklists.

Likely fields:

- id
- title
- body
- color
- is_bold
- is_checklist
- checklist_json
- created_at
- updated_at

## outreach

Purpose:

Track email drafts, sent messages, and follow-up state.

Likely tables:

- email_templates
- email_drafts
- outreach_logs
- reminders

## ai_records

Purpose:

Track AI conversations and saved research notes.

Likely tables:

- ai_conversations
- ai_messages
- research_notes

## advisor_atlas

Purpose:

Persist user-scoped supervisor discovery work and evidence.

Tables:

- `advisor_atlas_runs`: search inputs, profile, depth, status, progress, and
  persisted intelligence summary. Discovery summaries include mapped academic
  units, source coverage, and the three nested candidate-ID populations.
- `advisor_atlas_candidates`: normalized professor identity, lane, scores,
  recruitment state, shortlist, notes, save link, and `intelligence_json`.
  Candidate intelligence stores semantic-fit explanations, actual department
  relationship, semester-aware opportunity outlook, background, funding, lab
  members, academic profiles, and source gaps.
- `advisor_atlas_evidence`: claim-level source metadata and excerpts.
- `advisor_atlas_publications`: latest and relevant publications plus reading
  status.
- `advisor_atlas_dossiers`: structured research, lab, opportunity, readiness,
  risk, verification, and next-action sections.
- `advisor_atlas_watch_events`: meaningful changes found during refresh.

Usage accounting reuses the shared tables:

- `role_limits.advisor_atlas_searches_per_month`: monthly entitlement for each
  user tier.
- `user_usage_stats.advisor_atlas_searches_per_month`: per-user count shared by
  accepted new searches and evidence refreshes.

## identity

Purpose:

Track optional local profile and external identity links.

Likely tables if authentication is implemented:

- local_profiles
- external_identities
- oauth_tokens

Likely `local_profiles` fields:

- id
- display_name
- email
- preferences_json
- created_at
- updated_at

Likely `external_identities` fields:

- id
- local_profile_id
- provider
- provider_subject
- email
- display_name
- avatar_url
- connected_at
- disconnected_at

Only add `oauth_tokens` if the app needs to call Google APIs after signin.

## projects

Purpose:

Represent target workspaces created from the Targets area.

Likely tables:

- projects
- project_sheets
- project_pages
- notifications
- local_profiles

Pinned workspace fields:

- `projects.is_pinned`: keeps a project pinned at the top of project lists.
- `projects.pinned_to_dashboard`: surfaces a pinned project on the central dashboard.
- `project_sheets.is_pinned`: keeps a sheet pinned at the top of sheet lists.
- `project_sheets.pinned_to_dashboard`: surfaces a pinned sheet on the central dashboard.

Dashboard pinning depends on the local pin state in the UI. Unpinning an item
should also remove it from dashboard pinned items.

Likely `projects` fields:

- id
- name
- degree_type
- intake_term
- status
- description
- created_at
- updated_at

Likely `project_pages` fields:

- id
- project_id
- sheet_id
- name
- columns_json
- rows_json
- created_at
- updated_at

Likely `notifications` fields:

- id
- project_id
- title
- body
- notification_type
- preference_key
- due_at
- read_at
- created_at
- updated_at

Notes:

- `notification_type` remains the routing/display type used by existing
  workspace flows such as project-linked notifications.
- `preference_key` stores the user preference bucket for the notification,
  allowing both workspace events and admin-authored categories such as
  `system`, `billing`, `plans`, and `announcements`.

## plan_upgrade_requests

Purpose:

Track plan change requests for admin review.

Likely fields:

- id
- user_id
- request_type
- requested_plan
- billing_cycle
- message
- status
- reviewed_by
- reviewed_at
- created_at
- updated_at

Notes:

- `request_type` distinguishes a replacement upgrade from a renewal of the
  current plan.
- Renewal approvals should extend the deadline from approval time when the
  plan has already expired, or from the existing deadline when the plan is
  still active.

## password_reset_requests

Purpose:

Track admin-mediated forgot-password requests submitted from the login page.

Likely fields:

- id
- email
- user_id (FK users.id; the matched account, if any)
- status (`Pending` / `Completed` / `Dismissed`)
- ip_address
- reviewed_by (FK users.id)
- reviewed_at
- created_at
- updated_at

Notes:

- Created automatically via `Base.metadata.create_all` (no manual DDL).
- The endpoint never confirms whether an email is registered; the row is created
  only when the email matches a user, no pending request exists, and the IP
  rate limit has not been hit.
- `Completed` means an admin set a new password (the user's `token_version` is
  also bumped). `Dismissed` means an admin cleared the request without a reset.

## scholarship_search_feedback

Purpose:

Store local beta evidence about Scholarship Hunt query generation and user
refinement without adding remote analytics.

Fields:

- id
- user_id
- initial_query
- refined_query
- filters_json
- was_edited
- provider_status
- result_count
- created_at
- updated_at

Notes:

- Rows are user-scoped and deleted with the owning local user.
- Previewing does not create a row. A row is created when the user confirms a
  query, then updated with success/failure and result count.
