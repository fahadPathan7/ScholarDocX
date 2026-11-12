# API Boundaries

The browser calls the backend API; the backend owns persistence, file storage, limits and
billing, and every external provider call. **The live endpoint list is the OpenAPI document at
`/docs` and the routers in `backend/app/api/`** — this file records the boundary rules and the
contracts that are not obvious from reading a route.

All routes are under `/api`. Everything except auth, plans/public, webhooks, and internal
routes requires a signed-in user (`get_current_user`); data access goes through a user-scoped
store, never an unscoped query.

When no explicit API base is configured, the frontend derives the backend host from the current
page host on port 8000 (production uses the same origin), which avoids `localhost` vs
`127.0.0.1` mismatches in development (`frontend/src/lib/api.ts`).

## Frontend responsibilities

- Render views and forms, manage UI state, call the API, show validation and configuration state.
- Confirm with the user before AI saves or overwrites.
- Map API authorization/limit failures to friendly alerts through the central UI-error layer.
  In modals, forms, and admin handlers, show the backend's `detail` (`err?.message`) instead of a
  hardcoded generic message, and do not tag ordinary validation errors as `kind: "permission"`.
- **Login and boot stay non-blocking** (SCHOLARDOCX-0146, SCHOLARDOCX-0236): `/auth/login` already returns the `user`, so hydrate auth state from it and navigate client-side; `GET /auth/me` is only a background refresh and must not gate `isLoading`. `initAuth` must tolerate a null/undecodable token and always release `isLoading`, or the splash screen hangs. After auth the loading splash stays up until the five dashboard requests (`/workspace/status`, `/dashboard/summary`, files, categories, notifications) have all landed, so the dashboard never shows half-empty (owner preference: keep the splash); it shows the error text if loading fails. Run the requests in parallel and do not add a separate init round-trip or artificial delay floors: the backend initializes once at boot and every route funnels through the memoized, lock-guarded `ensure_db_initialized`.
- **Sheet Ask AI** (SCHOLARDOCX-0150): prompts target the exact sheet by `project_id` + `sheet_id`
  (names are labels only; duplicate names exist), send schema + IDs + selection but no cell values,
  and open Lumi on a fresh chat with auto-send. The action planner prompt must document
  `project_id`/`sheet_id` on every workspace action and allow chaining read-then-write actions.
- Aggregate-per-entity endpoints must return an entry for every entity, including zero-child
  ones (SCHOLARDOCX-0151: `/projects/sheet_counts` uses a LEFT JOIN so empty projects are listed).
- The top-bar Refresh refreshes the whole tab group you are on, in place (SCHOLARDOCX-0237); the model and rules are in [state-management.md](state-management.md). Keep the `useSheetPage` content-signature guard that skips an identical payload; it stops our own save echo from clobbering local edits.

## Backend responsibilities

- Initialize the database once per process: `create_app()` and `/workspace/init` must call
  `ensure_db_initialized(settings)` (never `initialize_database` directly), which is memoized and
  lock-guarded so a cold-start burst runs DDL and seeding once (SCHOLARDOCX-0149). Seed helpers use
  batched inserts, not per-row loops.
- Validate environment, paths, file types, and sizes; own file uploads and storage access through a
  storage service, never raw filesystem work in route handlers.
- Enforce plan gates, limits, and per-user billing before any provider call
  ([billing-contract.md](billing-contract.md)).
- Keep services for workflow logic (document versions, deadline aggregation, AI orchestration) and
  keep route handlers thin.

## Contracts worth knowing

- **Sheet creation** (SCHOLARDOCX-0259): `POST /projects/{id}/sheets` takes `name`, optional `template`
  (`blank` default, or `application`) and optional `columns` (validated starting columns, which win
  over `template`). Invalid input is a 422 before any quota is counted. Column logic lives in
  `backend/app/services/sheet_templates.py`.
- **Projects**: `GET /projects/{id}/meta` is the default open-project call (page stubs and aggregates
  only, no rows; `include_calendar=false` skips the calendar scan). `GET /project_pages/{id}` returns
  one fully decoded sheet. `/summary` is heavy and only for legacy/AI paths.
- **Files**: `POST /files/{id}/download-link` exchanges a stored file for a 5-minute, file-scoped
  token that `GET /files/{id}/content` accepts, so the session token never appears in file URLs
  ([security-privacy.md](security-privacy.md)).
- **Research Expert**: `GET /research/papers/{id}/pdf` streams the user's own paper PDF after checking
  `can_use_research_reader`, ownership, and the storage record; analyses are saved via
  `POST /research/papers/{id}/analyses` (10-per-paper cap, HTTP 400 when full, no AI/billing call on
  save).
- **AI chat**: the client sends `message_count` for the per-session limit check. Model-to-provider
  resolution reads the `ai_models` catalog first; prefix guessing is only a fallback.
- **Plans and checkout**: `GET /auth/plans/public` is anonymous and shares `_assemble_public_plans`
  with the gated `/auth/plans` so they cannot drift; it exposes only marketing-safe data.
  `POST /auth/plans/checkout` derives the Polar customer from `current_user` (never from a
  client-supplied email), validates `success_url` against CORS origins and `product_id` as a UUID,
  and returns generic errors. `/auth/plans/request` takes upgrade or renewal requests via
  `request_type`. Design: [billing-and-payments.md](billing-and-payments.md).
- **Registration**: invite-code `POST /auth/register` and Google sign-in only; paid registration at
  signup was removed in SCHOLARDOCX-0169 ([authentication-and-identity.md](authentication-and-identity.md)).
- **Polar webhook** `POST /webhooks/polar`: svix-signed, deduped by message id, reconciled by
  `polar_customer_id` then email; a miss returns 5xx so Polar retries. `subscription.canceled` keeps the
  plan until period end; only `.revoked` downgrades immediately.
- **Admin users**: `signup_method` (`invite` | `purchase` | `admin` | `google`) is an immutable origin set
  at INSERT, never derived from mutable state. `plan_source` (`polar` | `admin_set` | `none`) is derived from
  current funding: `polar` iff a Polar subscription/customer id exists; `admin_set` iff a paid-tier role on an
  admin-created account or an admin-set `plan_ends_at` without Polar; else `none`.
- **Forgot password**: `/auth/forgot-password` always returns the same generic message (no enumeration),
  one pending request per user and one per IP per hour; admins resolve or dismiss via
  `/admin/password-reset-requests`.
- **Rate limits**: the catalog is read-only at `GET /admin/info/rate-limits`; enforcement patterns are in
  [security-privacy.md](security-privacy.md).
- **Scholarship Hunt and Advisor Atlas** run creation, resume, cancel, and refresh endpoints are gated by
  their role limits plus the credit pre-flight; behaviour is described in the feature files under
  [functional](../functional) and [ai-integrations.md](ai-integrations.md).

- **Connected apps** (SCHOLARDOCX-0258): `/api/connected-apps*` is the session-JWT management API (keys, suggestions); the MCP endpoint itself is `POST /mcp` outside `/api`, access-key authenticated. See [mcp-server.md](mcp-server.md).

## Delete cascade semantics

Generic `DELETE /{table}/{id}` goes through `store.delete_record`. Children resolve by FK nullability
(SCHOLARDOCX-0153):

- **NOT NULL child FK -> cascade delete**, via `cascade="all"` on the parent relationship in
  `backend/app/db/models.py` (project sheets and pages, university programs, document versions).
- **Nullable child FK -> nullify.** The child survives with the FK set to NULL (project notifications as
  historical records, email drafts, `Documents.owner_id`, `Applications.degree_workspace_id`).

Quota counters are recomputed from live data by `resync_usage_counts` (`backend/app/auth/limits.py`) after a
delete, using `RESYNC_FEATURES_BY_TABLE` in `backend/app/api/routes.py`, so cascades flow into counts with no
manual math. ORM cascade is used (not `ondelete="CASCADE"`) because `create_all` does not alter existing
constraints; the `advisor_atlas_*` tables use column-level `ondelete` since they were created later.

## Avoid

- Business logic in UI components.
- Raw SQL scattered across route handlers.
- File-system operations in route handlers without a storage service.
- Provider-specific AI code mixed into generic assistant code.
