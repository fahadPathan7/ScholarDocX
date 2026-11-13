# Connected Apps (MCP Server)

SCHOLARDOCX-0258, decision BD-014, requirements FR-11 in [requirements-index.md](../functional/requirements-index.md).
Lets a user connect an AI app they already use (Claude Code, Cursor, VS Code) to their own
workspace: it can **read** data and **suggest** changes; by default every suggestion waits for the user's
confirmation in the web app. A key can instead be given the **`read_write`** scope to apply the same
allow-listed changes directly. ScholarDocX makes no provider call on this path, so nothing is billed
([billing-contract.md](billing-contract.md)).

## Transport and wiring

- Remote MCP over Streamable HTTP, **stateless, JSON responses**, via the official SDK (`mcp==1.27.2`, needs `PyJWT>=2.10.1`).
  Endpoint: `POST /mcp` on the backend origin, outside `/api`. The frontend derives the URL from `API_BASE` (`/api` → `/mcp`).
- `McpEndpoint` in `backend/app/services/mcp_server.py` owns one SDK server. `create_app()` builds its own endpoint (a session
  manager can run only once), starts it from the FastAPI lifespan, and registers the gateway as a plain `Route` at exactly `/mcp`
  (a `Mount` would 307-redirect POST `/mcp` to `/mcp/`). The route endpoint must be a callable *object*: Starlette treats a
  function or bound method as a GET-only request handler.
- MCP handlers are async; the executor and database are sync, so they run through `anyio.to_thread.run_sync` with a per-call session.

## Credentials ("access keys")

- Format `sdx_` + 32 random bytes. Only the SHA-256 hash and a 12-character display prefix are stored (`connected_apps`). Shown once.
- **Header-only** (`Authorization: Bearer`), never a query string. Not interchangeable with a session JWT: a JWT at `/mcp` is a 401 and
  an access key on any `/api/*` route is a 401 (no token passthrough).
- Each key snapshots the user's `token_version`; password change, admin reset, suspension and admin revocation invalidate it exactly
  like a session. Every call also requires `is_active`, applies plan expiry, and requires the **`can_use_mcp`** role limit.
- `can_use_mcp` defaults: `general_user`, `pro_user`, `max_user` on; `free_user`, `general_admin`, `super_admin` off. It resolves
  through the primary user-level role (`get_primary_user_role`), so an admin needs a basic/pro/max role too. Admin-editable in the
  Role Limits tab. Revoking = deleting the key row.
- Gateway order: `Origin` check (present and not an allowed CORS origin → 403) → failed-key rate limit per IP → key lookup (401/403) →
  per-user call rate limit → tool. Rate rules `mcp_call`, `mcp_auth_failure`, `connected_apps_manage` are in `RATE_LIMIT_RULES`.

## Tools

Static and typed, never generated from user data. Read tools are annotated `readOnlyHint`; `propose_changes` is
`readOnlyHint: false, destructiveHint: false`. Reads run through `ai_agent.run_read` (same normalizers, executor and bounded
serializer as the in-app agent). `get_deadlines`, `get_overdue_rows` need a project; `search_rows`/`get_rows`/`filter_rows` need a project and sheet.

| Tool | Catalogue action |
|---|---|
| `list_projects`, `list_sheets`, `get_rows`, `search_rows`, `filter_rows` | `get_projects`, `get_sheets`, `get_rows`, `search_rows`, `filter_rows` |
| `get_deadlines`, `get_overdue_rows`, `get_dashboard` | same names |
| `propose_changes` | queues a suggestion (`read_suggest`) or applies it now (`read_write`) |

`propose_changes` covers the sheet shape too (SCHOLARDOCX-0259): `create_sheet` may carry `sheet.columns`
(otherwise the sheet is blank, text columns A to E), `add_column` without a name takes the next letter, and
`rename_column` renames a column while keeping its values and cell formatting.

Not exposed: sticky notes, notifications, record-domain reads and writes, every `delete_*`, `clear_sheet`, `bulk_update_rows`, and all
provider-backed features (Advisor Atlas, Scholarship Hunt, Research Expert, web search). `ALLOWED_SUGGEST_ACTIONS` in
`backend/app/services/connected_apps.py` is the allow-list for suggestions.

## Suggestions

`propose_changes` validates with `ai_agent.check_proposal`, stores the **normalized plan** (`connected_app_suggestions.plan_json`) and answers
`awaiting_confirmation_in_scholardocx`, never that anything changed. The user confirms in the app: the server loads the stored plan by id
(the client never resends it) and runs `AiActionService.execute` as the signed-in user, so role limits apply as in the UI. The status
change is one atomic `UPDATE … WHERE status = 'pending'`, so a double click runs once. Statuses: pending, running, confirmed, dismissed,
failed, expired.

**Direct-apply keys (`read_write`).** For users whose AI app has its own safeguards. Opt-in twice: the scope is chosen in the create dialog and the API requires `acknowledge_direct` (a validator on `CreateAppPayload`). It is never the default. `apply_directly` in `backend/app/services/connected_apps.py` reuses the suggestion path (create, atomic claim, execute as the key's owner with their role limits), so the same allow-list applies (no deletes, bulk edits or record writes), the change is recorded as a confirmed suggestion with `auto_applied` in its plan, and a failure is recorded as `failed`. The tool answers `applied` instead of `awaiting_confirmation_in_scholardocx`. The pending-suggestion cap does not apply because nothing is queued. Trade-off: prompt injection through a row can now cause an allow-listed write without a click, so use it only with clients you trust.

Caps (hardcoded, listed in the admin Info tab "Save & Storage Caps"): 5 active keys per user (rejected at the cap); 20 pending
suggestions (rejected at the cap); 50 decided suggestions kept (newest evicts oldest); 20 actions per suggestion; 7-day expiry.

## Prompt injection

The external model reads user-entered text (rows may hold pasted web or email content). Defences: the only write path queues a suggestion a
human confirms; the confirmation view lists exactly what will change and which app proposed it; tool descriptions state returned values
are data, not instructions; no tool fetches URLs or calls a provider; no delete or bulk action is reachable.

## Management API

`backend/app/api/connected_apps.py` (session JWT): `GET`/`POST /api/connected-apps`, `DELETE /api/connected-apps/{id}`,
`GET /api/connected-apps/suggestions`, `POST …/suggestions/{id}/confirm`, `POST …/suggestions/{id}/dismiss`. Create and confirm need
`can_use_mcp`; list, remove and dismiss work for any signed-in user so nobody holds a live key they cannot revoke.

## Notifications

`_notify_user` in `backend/app/services/connected_apps.py` inserts a row into `notifications` (`preference_key = connected_app_activity`) when a suggestion is queued, and after a direct change succeeds. It reads the user's `local_profiles.notification_settings` through `is_notification_enabled`, so the default is on and the user can switch it off under Notification Settings. It is best-effort: a failure is logged and never fails the suggestion or the change. The text points the user to Profile → Review suggested changes.

## Logging

One line per tool call: app id, tool, status, duration. Never keys, arguments or results.

## Frontend

`frontend/src/components/connected-apps/`: `ConnectedAppsCard` (profile card), `ConnectedAppsPanel` (apps + Suggested changes),
`CreateConnectedAppModal` (shows the key once with setup snippets), helpers and tests. Copy avoids protocol and infrastructure
jargon ("Connected apps", "access key").

## Adding a tool safely

Typed schema; map onto an existing catalogue action; read tools stay bounded; any provider call must go through the billing gate in its
own task; add it to the tool list above and to `backend/tests/unit/test_mcp_endpoint.py`.
