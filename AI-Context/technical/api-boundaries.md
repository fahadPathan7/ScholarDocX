# API Boundaries

## Boundary Rule

The frontend should call local backend APIs. The backend should own persistence, file system access, and external provider calls.

When no explicit frontend API base is configured, the browser client should
derive the backend host from the current page host and use port 8000. This
avoids `localhost` versus `127.0.0.1` or LAN-host mismatches during local
development.

## Frontend Responsibilities

- Render dashboards, forms, editors, timelines, and assistant UI.
- Manage local UI state.
- Call backend APIs.
- Show validation errors and configuration state.
- Ask user confirmation before AI saves or document overwrites.
- Convert API authorization/limit failures into user-friendly alerts through a
  centralized UI-error mapping layer instead of component-by-component parsing.

## Backend Responsibilities

- Initialize workspace.
- Validate environment variables.
- Read and write SQLite data.
- Manage file uploads and local storage.
- Validate paths and file types.
- Call GLM and Tavily APIs.
- Provide API responses optimized for UI workflows.

## Service Layer Responsibilities

- Application workflow logic.
- Document versioning logic.
- Deadline aggregation.
- Outreach logging and reminder creation.
- AI research orchestration.

## Avoid

- Business logic inside UI components.
- Raw SQL scattered across route handlers.
- File system operations in route handlers without a storage service.
- Provider-specific AI code mixed into generic assistant code.

## Future API Areas

- `/health`
- `/workspace`
- `/settings`
- `/degree-workspaces`
- `/projects`
- `/projects/{project_id}/summary`
- `/projects/{project_id}/sheets`
- `/project_sheets`
- `/project_pages`
- `/notifications`
- `/local_profiles`
- `/universities`
- `/programs`
- `/professors`
- `/applications`
- `/deadlines`
- `/documents`
- `/document_categories`
- `/files`
- `/sticky_notes`
- `/email-templates`
- `/email-drafts`
- `/outreach`
- `/reminders`
- `/ai/chat`
- `/ai/research`
- `/news/search` makes one dedicated Tavily basic web-search request for the
  approved Scholarship Hunt query and normalizes returned pages into news cards
  without using the AI-chat research flow or manual post-search filtering
- `/news/query-preview` uses at most one backend-only OpenRouter Free request to
  generate the Scholarship Hunt query, falls back locally when needed, never
  contacts Tavily, and consumes one Scholarship Hunt usage unit when the
  preview succeeds
- confirmed `/news/search` requests accept both the exact preview shown to the
  user and the approved query, then persist both to user-scoped SQLite feedback
  storage before returning normalized results
- `/news/bookmarks`
- `/auth/google/start` if optional Google signin is implemented
- `/auth/google/callback` if optional Google signin is implemented
- `/auth/session` if optional signin or local profile sessions are implemented
- `/auth/plans/request` accepts upgrade and renewal requests with a
  `request_type` field
- `/auth/plans/requests` returns the current user's submitted plan requests so
  the plan UI can show request history and statuses
- `/admin/plan-requests` returns both replacement upgrades and renewal
  requests and should support filtering by request type so admin permission
  checks can differ between upgrade review and extension review tabs
- `/admin/notifications/send` accepts admin-authored notification broadcasts or
  targeted sends with a category, title, body, and either all-user delivery or
  an explicit recipient list
