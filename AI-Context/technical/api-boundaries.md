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
- Login path must stay non-blocking (SCHOLARDOCX-0146): the `/auth/login`
  response already returns the full `user` object, so the frontend hydrates
  auth state synchronously from it and navigates client-side (`navigate`),
  never via `window.location.href` (which forces a full SPA re-bootstrap).
  `GET /auth/me` runs only as a background refresh for latest plan/role fields
  and must not gate `isLoading`. `initAuth` must also be defensive: a null/
  undecodable token payload must not throw out of the bootstrap (wrap in
  try/catch and always release `isLoading`), otherwise the SplashScreen hangs
  on refresh and the app never mounts. Dashboard data fetches fan out with
  `Promise.all` but must start **after** `POST /workspace/init` resolves — init
  and `get_store` both touch `initialize_database`, so firing them concurrently
  risks DDL/connection-pool contention. No client-imposed minimum-delay floors
  on the login-to-dashboard path. On the backend, the boot path (`create_app`),
  `/workspace/init`, and `get_store` all funnel through one memoized
  `ensure_db_initialized` so DDL + seeding runs at most once per process
  regardless of how many refreshes occur. The memo flag is guarded by a
  `threading.Lock` so a concurrent cold-start burst cannot both run DDL
  (SCHOLARDOCX-0149).

  **Boot-init rule (SCHOLARDOCX-0149):** `create_app()` MUST call
  `ensure_db_initialized(settings)`, never `initialize_database(...)` directly.
  Calling it directly leaves the `_db_initialized` flag unset, so the first
  request's `get_store` re-runs the entire DDL + ~160-row seed pass a second
  time — the dominant cause of slow `/workspace/init` on Render cold starts.
  The seed helpers (`_seed_role_limits`, `_seed_ai_token_defaults`) must use
  batched `executemany`-style inserts (one round-trip per table), not per-row
  loops.

  **Sheet Ask AI prompt catalog (SCHOLARDOCX-0150):** the sheet "Ask AI"
  button is a dropdown of context-aware, metric-driven prompts
  (`askAiPrompts.ts`), not a single canned question. Each prompt has a full,
  always-visible description (never hover-only) and builds a message that
  targets the **exact sheet by ID** (`project_id` + `sheet_id`), with names
  kept only as human-readable labels. Names are NOT used for resolution — a
  user can have multiple projects/sheets with the same name, so name-based
  targeting would mis-target. The backend action planner already resolves
  `project_id`/`sheet_id` before names (`ai_actions_workspace.py:45-65`,
  `ai_actions_execute.py:27-60`) and the workspace snapshot already exposes
  the IDs to the model. Every write-action prompt appends an explicit
  instruction to emit `project_id`/`sheet_id` in the plan.

  Picking a prompt (or writing a custom one) dispatches `scholardocx:open-ai`
  with `{ contextMessage, autoSend: true, newChat: true }` — Lumi opens on a
  fresh chat and sends immediately (no manual Send click). Prompts are
  concrete ("application status breakdown with conversion rate", "funding
  totals and biggest award", "deadline risk for the next 45 days", "outreach
  response rate and non-responders", "score every row by priority 1–5") and
  phrased as imperative action requests so FloatingAssistant's
  `looksLikeWorkspaceAction` detector routes them to `/ai/actions/plan` →
  `/ai/actions/execute`, giving the AI real data/action control (`add_rows`,
  `bulk_update_rows`, `add_column`, `filter_rows`, `analyze_sheet`, …). The
  auto-send path uses `sendMessage(overrideText)` + a `pendingSendRef` in
  FloatingAssistant; the legacy pre-fill-only path (no `autoSend`) is
  preserved for other callers. No cell values are sent in context — only
  schema + IDs + selection/focus, matching the action planner's design (it
  uses read actions to inspect values).

  **Action planner ID rule (SCHOLARDOCX-0150 rev 3):** `ACTION_PLANNER_SYSTEM_PROMPT`
  and `_build_planner_prompt` (`backend/app/services/ai_actions.py`) MUST
  document `project_id`/`sheet_id` as accepted fields on every workspace
  action and MUST instruct the model to prefer them over names whenever the
  user's message includes IDs. The executor already resolved IDs first
  (`ai_actions_workspace.py:45-65`, `ai_actions_execute.py:27-60`), but if
  the prompt schema only shows `project_name`/`sheet_name`, the model never
  emits IDs and name collisions cause mis-targeting or `needs_info` failures.
  The prompt must also state that a single plan may chain multiple actions
  (read-then-write), which transform prompts like "add a column and fill it"
  require.

  **Bulk count endpoints must include zero rows (SCHOLARDOCX-0151):** any
  endpoint that aggregates per-entity counts (e.g.
  `Store.project_sheet_counts` → `/projects/sheet_counts`) MUST emit an entry
  for every entity the user owns, including those with zero children. A plain
  `GROUP BY child.project_id` on the child table silently omits parents with
  no children, which left the project card's "X / Y sheets" counter stuck on
  its loading state. Use `LEFT JOIN parent → child` with `COUNT(child.id)`
  and `GROUP BY parent.id`. The frontend additionally seeds the counts map
  with `0` for every known project before the fetch resolves, as a defensive
  guard against pre-fetch flashes and future regressions.

  **Refresh button must reload everything visible (SCHOLARDOCX-0152):** the
  top-bar "Refresh data" button (`App.tsx:refreshActiveTab`) bumps
  `refreshTrigger`, and `ProjectWorkspace`'s `refreshTrigger` effect must
  reload (1) the project list, (2) the per-project sheet-count badges, (3)
  the open project's `/meta` stubs, AND (4) the open sheet's full
  rows/columns via `getSelectedPageData`. Previously it skipped (2) and (4),
  so Refresh visibly spun but left the open grid and the "X / Y" counters
  stale. The `useSheetPage` contentSignature guard intentionally skips
  applying an identical payload (prevents our own save echo from clobbering
  local edits) — that guard is correct and must be preserved.

## Backend Responsibilities

- Initialize workspace.
- Validate environment variables.
- Read and write PostgreSQL data.
- Manage file uploads and secure storage.
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
- `/projects/{project_id}/summary` (full pages with rows; heavy — used only by
  legacy/AI paths that need every sheet's rows)
- `/projects/{project_id}/meta?include_calendar=true|false` — lightweight
  project metadata for the project/dashboard/sheet-list views. Ships page
  STUBS only (`id, sheet_id, name, project_id, updated_at, row_count`) plus
  per-project aggregates (`sheet_count`, `row_count`, `notification_count`),
  sheets, and notifications — never the full `rows`/`columns`.
  `include_calendar=false` skips the dashboard calendar scan and omits
  `calendar_items`; the post-save refresh path uses this since it does not
  redraw the calendar. Replaced `/summary` as the default open-project call.
  (SCHOLARDOCX-0121)
- `/project_pages/{page_id}` (GET) — one fully decoded page (the open sheet's
  full `columns`/`rows`/`email_config`). The frontend fetches this on demand
  for the single open sheet instead of pulling every sheet's rows via
  `/summary`. Distinct from the generic CRUD `GET /project_pages` (list) and
  `PATCH/DELETE /project_pages/{record_id}` by HTTP method. (SCHOLARDOCX-0121)
- `/projects/sheet_counts` (GET) — `{ "<project_id>": <int> }` in one grouped,
  user-scoped query. Kills the Projects-list N+1 where the UI previously fired
  one `/summary` per project just to show sheet counts. (SCHOLARDOCX-0121)
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
  user and the approved query, then persist both to user-scoped feedback
  storage before returning normalized results
- `/news/bookmarks` (superseded by the Opportunity Library UI; endpoints
  remain and back the one-time additive migration into
  `scholarship_opportunities`)
- `/scholarship-catalog` returns the curated, code-shipped scholarship
  catalog (Phase 0) with zero provider calls; each entry is flagged if
  already present in the user's Opportunity Library
- `/scholarship-catalog/{catalog_id}/check-cycle` makes one Tavily basic
  search scoped to the catalog entry's canonical name and official domain,
  billed through the existing `can_use_scholarship_hunt` gate (no new quota
  key)
- `/scholarship-opportunities/analyze` runs one structured AI extraction call
  over a card's URL/title/snippet, gated by the `can_use_scholarship_hunt`
  role limit plus the AI token economy, and upserts a
  `scholarship_opportunities` row deduped by canonical name + normalized URL;
  missing fields are never invented
- `/scholarship-opportunities` (generic user-scoped CRUD: list/patch-status/
  delete) is the Opportunity Library backing store; `GET` lazily migrates any
  un-migrated `bookmarked_news` rows in before returning
- "Add to tracker" has no dedicated backend endpoint — the frontend
  orchestrates it over the existing `/project_sheets`, `/project_pages`, and
  `/scholarship-opportunities/{id}` (PATCH) endpoints so sheet-template
  knowledge stays frontend-only
- `/local_profiles` (existing generic CRUD) also carries `hunt_profile_json`
  (Phase 3: degree level, destinations, field of study, intake term,
  opt-in nationality) — no new endpoint
- `/scholarship-opportunities/{id}` (PATCH, existing) also accepts
  `last_deadline_notified_at`, written by the client-side deadline-radar
  scan to dedupe notifications — no new endpoint
- `/news/saved-queries/{id}` (PATCH, new — Phase 4) updates
  `seen_article_ids_json` and `last_used_at` on a saved query so re-running
  it can diff and badge results "new since last run" (watchlist behavior)
- `/scholarship-deep-hunt/runs` (Phase 5, SCHOLARDOCX-0125) creates and lists
  user-scoped persisted Deep Hunt runs (one free-text funding goal plus
  optional degree level/destinations/intake term). Creating a run is gated
  by `can_use_scholarship_hunt` (Pro/Max by default, mirroring Advisor
  Atlas) plus an AI-token pre-flight check; the background run then does a
  bounded search -> crawl -> extract loop reusing
  `scholarship_extraction_service` (Phase 1) and
  `advisor_atlas.crawler.PublicCrawler`, and persists accepted results into
  `scholarship_opportunities` (`source: "deep_hunt"`, `deep_hunt_run_id` FK)
  via the same upsert helper `/scholarship-opportunities/analyze` uses.
- `/scholarship-deep-hunt/runs/{run_id}` returns run status/stage/progress
  plus the opportunities the run has found so far, parsed the same way as
  `/scholarship-opportunities`
- `/scholarship-deep-hunt/runs/{run_id}/cancel` stops an active run
- `/scholarship-deep-hunt/runs/{run_id}/resume` resumes a failed/cancelled
  run (plan-gated, same as create)
- `/scholarship-deep-hunt/runs/{run_id}` (DELETE) removes a run record
- `/advisor-atlas/runs` creates and lists user-scoped persisted discovery runs
  and validates Professor-mode identity context: professor name, university
  name, official university/professor URL, department or research area, degree
  target, intake term with year, and at least one research interest. Creating a
  run consumes one `advisor_atlas_searches_per_month` unit after request
  validation and before the background run is accepted.
- `/advisor-atlas/runs/{run_id}` returns progress, candidates, dossiers, and the
  run intelligence summary, including related-unit coverage and the nested
  faculty, research-match, and opportunity populations. Discovery summaries
  also include per-unit counts plus inspected, accessible, and inaccessible
  faculty-directory coverage.
- `/advisor-atlas/runs/{run_id}/cancel` stops an active local run
- `/advisor-atlas/runs/{run_id}/resume` resumes an eligible incomplete run
- `/advisor-atlas/candidates/{candidate_id}` returns the full evidence dossier
- `/advisor-atlas/candidates/{candidate_id}/refresh` verifies candidate
  ownership, consumes one `advisor_atlas_searches_per_month` unit, and refreshes
  public evidence
- `/advisor-atlas/candidates/{candidate_id}` updates shortlist, lane, notes, and
  reading state
- `/advisor-atlas/candidates/{candidate_id}/save` confirms creation of a core
  ScholarDocX professor record
- `/auth/google/start` if optional Google signin is implemented
- `/auth/google/callback` if optional Google signin is implemented
- `/auth/session` if optional signin or local profile sessions are implemented
- `/auth/plans/request` accepts upgrade and renewal requests with a
  `request_type` field
- `/auth/plans/requests` returns the current user's submitted plan requests so
  the plan UI can show request history and statuses
- `/auth/plans/public` (GET, **anonymous**) returns the admin-configured
  plans + pricing (limits per tier, monthly/yearly prices, monthly AI credits,
  active flags) with **no** `get_current_user` dependency. It is the public
  source of truth the landing page `PricingSection` renders. It shares one
  assembly helper (`_assemble_public_plans`) with the auth-gated `/auth/plans`
  so the two endpoints can never drift. Exposes only marketing-safe data
  (plan limits/prices) — no per-user or private config.
- `/admin/plan-requests` returns both replacement upgrades and renewal
  requests and should support filtering by request type so admin permission
  checks can differ between upgrade review and extension review tabs
- `/admin/notifications/send` accepts admin-authored notification broadcasts or
  targeted sends with a category, title, body, and either all-user delivery or
  an explicit recipient list
- `/auth/forgot-password` is unauthenticated, accepts an email, and always
  returns an identical generic success message (no user enumeration); it
  silently enforces one pending request per user and one request per IP per hour
- `/admin/password-reset-requests` lists forgot-password requests with optional
  status filtering and is gated by the `admin_manage_password_resets` permission
- `/admin/password-reset-requests/{id}/resolve` lets an admin set a new password
  (bumps `token_version`, marks the request `Completed`) or dismiss it (marks
  `Dismissed` without changing the password)
- `/admin/info/rate-limits` (GET) is read-only and returns the catalog of all
  active request rate limits (`rule_key`, `label`, `method`, `path`,
  `max_requests`, `window_seconds`, `window_label`, `scope`). Gated by the
  `admin_view_info` permission (default ON for both `general_admin` and
  `super_admin`). The data comes from the `RATE_LIMIT_RULES` registry in
  `backend/app/auth/rate_limit.py` — see `security-privacy.md` § Rate Limiting
  (SCHOLARDOCX-0137) for the enforcement patterns and the full list of
  throttled endpoints (the four `/auth/*` limits plus contact-admin, AI
  chat/research/summarize, scholarship deep-hunt and advisor-atlas run starts,
  and news search/query-preview).

