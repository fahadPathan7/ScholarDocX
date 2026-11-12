# SCHOLARDOCX-0258: Remote MCP server — connected apps (bring your own AI to your workspace)

Status: Review

Owner: AI Agent

Epic: Epic-AIAgentPlatform

Created: 2026-11-12

## Summary

Expose the workspace agent's tool surface as a remote Model Context Protocol (MCP) server so a
user can connect an AI app they already use (Claude Code, Cursor, VS Code, MCP Inspector) to
their own ScholarDocX workspace. The app can **read** workspace data and **suggest** changes;
every suggestion waits for the user's confirmation inside ScholarDocX. v1 authenticates with
scoped, revocable access keys. OAuth 2.1, which clients that only support OAuth connectors
need, is a follow-up.

[SCHOLARDOCX-0255](SCHOLARDOCX-0255-agent-tool-loop.md) put an external MCP server out of scope
("not needed for the product"). This task reverses that for the reasons under Business Context;
the MCP-shaped in-process registry built there is the seed.

Estimate: about 4–5 working days with tests and UI (spike + backend ≈ 3 days). The cut line is
under Implementation Plan.

## Business Context

Links:

- Business file: [decisions.md](../../business/decisions.md) (new BD-014 at kickoff),
  [product-vision.md](../../business/product-vision.md)

Business value:

- **Bring your own AI.** A user who already pays for an AI client can run it against their own
  workspace with no AI cost to ScholarDocX and no use of ScholarDocX credits: ScholarDocX makes
  no provider call on this path.
- **Showcase value.** A concrete, demonstrable example of safe agent tool exposure: scoped
  credentials, propose-only writes, untrusted-data handling.
- **Privacy posture change (owner confirmation needed, D1).** Today workspace data reaches a
  model only through backend provider calls on in-app actions. Here the user's *external*
  client and its model see whatever the key may read. Mitigations: opt-in per connection,
  read-only by default, revocable, no file contents or credentials, nothing written without an
  in-app confirmation.

## Functional Context

Links:

- Functional file: [feature-ai-assistant.md](../../functional/feature-ai-assistant.md),
  [requirements-index.md](../../functional/requirements-index.md) (new group FR-11 at kickoff)

Requirements (proposed; added to requirements-index.md as planned at kickoff, the way FR-6.6 is):

- FR-11.1: A user whose role has the `can_use_mcp` limit can create up to 5 connections ("connected apps"), each with
  a name, a scope (*Can read* or *Can read and suggest changes*) and an expiry (30 / 90 / 365
  days, default 90). The access key is shown once.
- FR-11.2: The user sees each connection's name, scope, last use and expiry, and can revoke it at
  any time; revocation applies to the next request.
- FR-11.3: A connected app reads the workspace through a fixed set of read tools. Results are
  bounded and never contain file contents, download links or credentials.
- FR-11.4: With the suggest scope, an app can submit changes. They appear in ScholarDocX as
  *Suggested changes* attributed to the connection; nothing changes until the user confirms. The
  user can dismiss. Suggestions expire after 7 days; at most 20 are pending per user.
- FR-11.5: Confirming runs the stored suggestion with the user's own role limits and shows the
  result.
- FR-11.6: A key stops working when the account's sessions are revoked (password change, admin
  reset, suspension, admin revocation) or when the user's role no longer has `can_use_mcp`.
- FR-11.7: Setup instructions for supported clients are shown in the app, in plain language.
- FR-11.8: Connected apps are marketed as a plan feature: a row on the landing pricing cards, in
  the in-app plan comparison, and in the landing features section, each reflecting the live
  role limits so it follows what an admin changes.

Roles (CODE_RULES RBAC, owner decision D2): a new admin-configurable role limit `can_use_mcp`
(permission, not a counter). Defaults: **on for basic (`general_user`), `pro_user` and
`max_user`; off for `free_user` and for both admin roles.** Admin roles carry no access of their
own: an admin can use connected apps only if the account also holds one of the three allowed
user roles. Verified: for non-`admin_*` features `check_and_increment_limit` uses the primary
user-level role (`get_primary_user_role`) and refuses an account with none, so this is the
existing behaviour; the admin-role rows are seeded as 0 for consistency only. It is independent of `can_use_agents`, so a basic
user who cannot use the in-app agent can still connect an external app. Create and confirm
require it. List, revoke and dismiss work for any signed-in user, so nobody is left with a live
key they cannot revoke, even after an admin turns the limit off or a plan expires.

## Technical Context

Links:

- Technical file: [ai-integrations.md](../../technical/ai-integrations.md),
  [api-boundaries.md](../../technical/api-boundaries.md),
  [security-privacy.md](../../technical/security-privacy.md),
  [authentication-and-identity.md](../../technical/authentication-and-identity.md),
  [billing-contract.md](../../technical/billing-contract.md),
  [data-model.md](../../technical/data-model.md),
  [project-structure.md](../../technical/project-structure.md),
  [testing-strategy.md](../../technical/testing-strategy.md)
- Predecessor: [SCHOLARDOCX-0255](SCHOLARDOCX-0255-agent-tool-loop.md)

Verified facts this design relies on (checked in code on 2026-11-12):

- `get_current_user` accepts a JWT in the `Authorization` header **or** `?token=`, then checks
  `is_active`, `token_version` and plan expiry. An MCP key must be a separate, header-only
  credential.
- `ai_agent.run_read` and `ai_agent.check_proposal` are module-level functions over an
  `AiActionService`. The catalogue has 39 workspace actions (14 read, 25 write) plus
  record-domain actions. The REST execute route takes the plan **from the client**; MCP
  suggestions must be stored server-side and confirmed by id.
- Rate limits are in-memory, per process, declared in `RATE_LIMIT_RULES` (which also feeds the
  Admin Info tab). Render runs one uvicorn process. Backend and frontend are separate Render
  services; the frontend reaches the backend through `API_BASE` (`…/api`).
- `create_app()` has no lifespan. File sizes: `models.py` 1297, `FloatingAssistant.tsx` 1436,
  `ProfileView.tsx` 1000, `ai_actions.py` 963, `routes.py` 839. Do not grow the first three.

Design:

1. **Transport.** Remote MCP over Streamable HTTP, stateless, JSON responses: no server-to-client
   messages are needed, so nothing is lost when the free-tier instance sleeps or restarts.
   Official Python SDK mounted in the existing FastAPI app at `/mcp` on the backend origin
   (outside `/api`, own auth). A mounted sub-app's lifespan is not run by FastAPI, so the SDK's
   session manager must be started from a lifespan added to `create_app()`. Do not name a package
   `mcp` (it would shadow the SDK for scripts run from `backend/app`).
2. **Spike first (0.5–1 day) — decision gate.** Answer and record in this task:
   (a) does the current SDK install next to the pinned `fastapi==0.115.6` / Starlette? If not:
   bump them and run the suites, or hand-roll the small JSON-RPC subset (`initialize`,
   `notifications/initialized`, `ping`, `tools/list`, `tools/call`);
   *Pre-spike result (2026-11-12, `pip install --dry-run` on host Python 3.14 against the current
   `requirements.txt`):* it resolves with `mcp 1.19.0` next to `fastapi 0.115.6` /
   `starlette 0.41.3`, no pin changes. The latest `mcp 2.3.0` (needs Python ≥ 3.10) is blocked
   only by the pinned `PyJWT==2.8.0` (it wants ≥ 2.10.1; also `pydantic ≥ 2.12`). So: route A =
   `mcp 1.x` now, older spec revision, FastAPI unchanged; route B = bump PyJWT (auth library, run
   the auth tests) and use `mcp 2.x`, newer spec, `MCPServer` API. Re-check on Python 3.13 (Render).
   (M0 outcome, 2026-11-12: **official SDK `mcp==1.27.2` + `PyJWT==2.10.1`**. `mcp 1.19.0` does not import under the current pydantic 2.14 that Render would install, and `mcp 2.x` needs Starlette ≥ 0.48 on Python 3.14; 1.27.2 imports cleanly with the pinned FastAPI/Starlette. Proven in a scratch venv: stateless JSON `initialize` / `tools/list` / `tools/call`, identity reaches the tool through a ContextVar set by an auth wrapper, 401 + `WWW-Authenticate`, a plain FastAPI route at exactly `/mcp` (a `Mount` would 307-redirect `/mcp`), and each `create_app()` builds its own MCP server because a session manager can run only once per instance.)
   (b) which spec revision does it negotiate? Secondary sources report a 2026-07-28 revision that
   makes Streamable HTTP stateless and requires OAuth protected-resource metadata, and the SDK's v2
   docs rename `FastMCP` to `MCPServer`; read modelcontextprotocol.io before coding;
   (c) do mount, lifespan and the auth hook run under uvicorn;
   (d) do MCP Inspector, Claude Code and Cursor connect with a static `Authorization` header.
3. **Access keys.** `sdx_` + 32 random bytes (urlsafe). Store only a SHA-256 hash (unique index)
   and a short display prefix; show the key once. Header-only (`Authorization: Bearer`), never a
   query string. Credentials are not interchangeable: a session JWT is rejected at `/mcp`; an
   access key is rejected by `get_current_user` and every `/api/*` route. Each key snapshots the
   user's `token_version` and is checked with the same rule as sessions, so password change,
   admin reset, suspension and admin revocation kill it. On every call: load the user, require
   `is_active`, apply plan expiry, require `can_use_mcp` (so a user whose plan lapses to free loses
   access on the next call). Hard cap of 5 active keys per user
   (a curated collection is rejected at the cap, not evicted — CODE_RULES capped-list rule),
   listed in the Info tab "Save & Storage Caps". `last_used_at` is written at most once a minute.
4. **Request hygiene.** 401 + `WWW-Authenticate: Bearer` for missing, invalid, expired or revoked
   keys; 403 for a suspended user or a role without `can_use_mcp` (mirrors `get_current_user`).
   Reject a request whose `Origin` header is present and not an allowed origin (a spec
   requirement for Streamable HTTP; MCP clients are not browsers). New rate-limit rules:
   `mcp_call` (per user) and `mcp_auth_failure` (per IP). MCP handlers are async but the executor
   and DB are sync: run them with `anyio.to_thread.run_sync` and a per-call `Store` / session
   that is closed afterwards (mirror `api/dependencies.get_store`), so one slow call cannot stall
   the single event loop.
5. **Tools.** Typed JSON Schemas, static, never generated from user data. Read tools carry
   `readOnlyHint: true`; `propose_changes` carries `readOnlyHint: false, destructiveHint: false`.
   Reads run through `ai_agent.run_read`: same normalizers, same executor, same 12,000-character
   cap and `truncated` flag as the in-app agent.

   | Tool | Catalogue action | Key scope |
   |---|---|---|
   | `list_projects` | `get_projects` | read |
   | `list_sheets` | `get_sheets` | read |
   | `get_rows` | `get_rows` | read |
   | `search_rows` | `search_rows` | read |
   | `filter_rows` | `filter_rows` | read |
   | `get_deadlines` | `get_deadlines` | read |
   | `get_overdue_rows` | `get_overdue_rows` | read |
   | `get_dashboard` | `get_dashboard` | read |
   | `propose_changes` | queues a suggestion | read + suggest |

   v1 excludes sticky notes, notifications and all record-domain reads (documents, reminders,
   outreach).
6. **Suggestions.** `propose_changes` allows only non-destructive workspace writes:
   `create_project`, `create_sheet`, `add_rows`, `create_sticky_note`, `update_project`,
   `update_sheet`, `update_row`, `rename_project`, `rename_sheet`, `update_sticky_note`,
   `add_column`, `add_group`, `pin_*` / `unpin_*`, `add_to_dashboard`, `remove_from_dashboard`,
   `duplicate_sheet`. Refused with a tool error: every `delete_*`, `clear_sheet`,
   `bulk_update_rows`, all record-domain writes, anything outside the catalogue. Allowed actions
   are checked with `check_proposal`, stored (at most 20 actions) as a pending suggestion, and the
   tool answers `awaiting confirmation in ScholarDocX` — never that a change was made. Confirm
   loads the **stored** plan by id (the client never resends it) and calls
   `AiActionService.execute(plan, user=<the signed-in user>)`, so role limits apply as in the UI.
   The status change is atomic (`UPDATE … WHERE status = 'pending'`) so a double click executes
   once. Expired rows are purged lazily on create and list.
7. **Prompt injection.** The external model reads user-entered text, and rows may hold pasted web
   or email content. Defences: the only write path queues a suggestion that a human must confirm;
   the confirmation view shows exactly what will change and which connection proposed it; tool
   descriptions state that returned values are data, not instructions; no tool fetches URLs or
   calls a provider (no SSRF surface, no billing); no delete or bulk action is reachable.
8. **Billing contract.** No MCP path calls a provider, so there is no `can_spend` or charge.
   `make guard-billing` must pass with **no new EXEMPT entries**, and the MCP modules must not
   import provider settings. A future provider-backed tool (Advisor Atlas, Scholarship Hunt,
   Research Expert) goes through the billing gate in its own task.
9. **Data.** New module `backend/app/db/connected_apps_models.py`, registered like
   `calendar_models.py` (`models.py` is over the cap): `connected_apps` (id, user_id, name,
   key_prefix, key_hash unique, scope, token_version, created_at, expires_at, last_used_at) and `connected_app_suggestions` (id, user_id, connected_app_id,
   summary, plan_json, status `pending|running|confirmed|dismissed|failed|expired`, created_at,
   expires_at, decided_at, result_message). `create_all` creates new tables, so no `_add_*`
   migration. Foreign keys use column-level `ondelete="CASCADE"` (precedent: `advisor_atlas_*`,
   SCHOLARDOCX-0153) so account deletion removes them. Logs carry connection id, tool, status and
   duration only — never keys, arguments or results.
10. **API.** MCP: `POST /mcp` (access key). Management, JWT-authenticated, in a new router
    `backend/app/api/connected_apps.py` (`routes.py` is 839 lines): `GET` / `POST
    /api/connected-apps`, `DELETE /api/connected-apps/{id}`, `GET
    /api/connected-apps/suggestions`, `POST …/suggestions/{id}/confirm`, `POST
    …/suggestions/{id}/dismiss`.
11. **Frontend.** New folder `frontend/src/components/connected-apps/`: a *Connected apps* panel
    (list, create, revoke), a *Suggested changes* inbox (confirm, dismiss, result) and a create
    modal built on `<Modal>` (default scope) that shows the key once with copy buttons and setup
    snippets (Claude Code, Cursor, generic). The MCP URL is derived from `API_BASE` (`/api` →
    `/mcp`). Mount it in `ProfileView.tsx` with a one-line import and element (the file is at
    1000 lines) or from a new view; do not touch `FloatingAssistant.tsx`. Copy (AGENTS.md jargon
    rule): "Connected apps", "access key", "Can read", "Can read and suggest changes",
    "Suggested changes"; no provider or infrastructure names, no "token", and no "MCP" except
    where the URL or command needs it.
12. **Deployment.** Same backend service; no `render.yaml` change expected. On the free tier the
    first call after an idle sleep may time out in some clients: document "retry". This task
    adds no keep-alive.
13. **Role limit and marketing.**
    - *Limit.* Add `('can_use_mcp', 1|0, 'never')` to every role in `DEFAULT_ROLE_LIMITS`
      (`services/admin.py`): `general_user` 1, `pro_user` 1, `max_user` 1, `general_admin` 0,
      `super_admin` 0, `free_user` 0 (the `free_user` block is at the end of the dict; see its
      note). `_seed_role_limits` inserts missing keys with `ON CONFLICT DO NOTHING`, so existing
      databases gain the rows on next init without overwriting admin edits: no `_add_*`
      migration. Enforce with `check_and_increment_limit(user, "can_use_mcp", 0, db)`.
    - *Admin panel.* Add the key to `RoleLimitsTab.tsx` (the limit list and its `featureInfo`
      entry: description, "permission, does not reset", example) so admins can toggle it per role.
    - *Pricing and landing.* Add `can_use_mcp` ("Connected AI apps", boolean) to
      `LANDING_FEATURES` in `LandingPage/plans-data.ts`, to the in-app feature list in
      `PlanComparisonView.tsx`, and to each tier in `LandingPage/plan-defaults.ts` (fallback
      values used when live limits are unavailable: free 0, basic / pro / max 1). Add a short
      item to `FeaturesSection.tsx` (and the FAQ if it lists integrations). Copy follows the
      jargon rule: "Use your own AI app (like Claude) with your workspace: it reads your data and
      suggests changes you approve." No "MCP", provider or infrastructure names.
    - Billing wording: the feature costs no ScholarDocX credits; say so only if it is accurate on
      the pricing surface.

Open decisions (owner, before Ready):

- **D1** Privacy posture: accept user-directed exposure to a third-party client (record as BD-014).
- **D2 (decided by owner, 2026-11-12)** New role limit `can_use_mcp`, editable in the admin panel,
  default on for basic, pro and max only (off for free and for admin roles; an admin needs one
  of those user roles too); marketed on the landing page and in
  pricing (Design 13). No migration: see Design 13.
- **D3** v1 write allow-list as listed in Design 6; deletes, bulk and record-domain writes later.
- **D4** Defaults: 5 keys, 90-day default expiry, 20 pending suggestions, 7-day suggestion expiry.
- **D5** Official SDK or hand-rolled subset: decided by the spike.
- **D6** OAuth 2.1 (authorization server, client registration, consent screen) as a separate
  task; needed for clients that only offer OAuth connectors.

Risks:

- Spec or SDK drift: read the official spec in the spike, pin the SDK version, record the
  negotiated revision.
- Dependency conflict with the pinned FastAPI / Starlette: settled in the spike.
- Free-tier cold start and client timeouts: documented, not engineered around.
- Leaked key: hash-only storage, expiry, revoke, 5-key cap, scope, rate limit, `token_version`.
- Indirect prompt injection through row text: Design 7.
- Blocking the event loop with sync DB work: Design 4.

## Scope

In scope:

- Remote MCP endpoint (Streamable HTTP, stateless) with the eight read tools and
  `propose_changes`.
- Access keys: create, list, revoke; hashed, scoped, expiring, tied to `token_version`; the
  `can_use_mcp` role limit (seed, admin Role Limits tab).
- Marketing surfaces: landing pricing cards, in-app plan comparison, landing features section.
- Suggestions: store, list, confirm, dismiss, expire.
- Management API, Connected apps panel, Suggested changes inbox, setup instructions.
- Rate-limit rules and Info tab rows, `Origin` validation, log hygiene.
- Tests, README section, context updates.

Out of scope:

- OAuth 2.1 authorization server, dynamic client registration, consent screen (follow-up).
- Provider-backed tools (Advisor Atlas, Scholarship Hunt, Research Expert, web search): billed
  and long-running.
- Record-domain reads and writes (documents, email drafts, outreach logs, reminders,
  applications).
- Destructive or bulk writes (`delete_*`, `clear_sheet`, `bulk_update_rows`).
- MCP resources, prompts, sampling, elicitation, streamed responses.
- Per-project allow-lists for a key, a per-connection activity-log table, push or email
  notification of new suggestions (the inbox is checked in the app).
- An admin view of all users' connections (admin revocation already works through
  `token_version`).
- A stdio or locally installed package.

## Acceptance Criteria

1. **Create.** A user whose role has `can_use_mcp` creates a connection (name up to 60 characters, scope,
   expiry); the key is returned once; the database holds only its SHA-256 hash and a display
   prefix; the list never shows the key; the 6th active key is refused.
2. **Protocol.** From MCP Inspector and Claude Code (Cursor if available), `initialize`,
   `tools/list` and `tools/call` succeed against `<backend origin>/mcp` with the key as a Bearer
   header; no session header is required.
3. **Auth.** A missing, malformed, unknown, expired or revoked key gets 401 with
   `WWW-Authenticate: Bearer`; a suspended user or a role without `can_use_mcp` gets 403; a
   session JWT at `/mcp` gets 401; an access key on any `/api/*` route gets 401; a key in the
   query string is ignored; no response or log contains a key.
4. **Isolation.** Read tools return only the key owner's data; another user's project or sheet id
   gives the normal not-found result; results are bounded with a `truncated` flag; no tool
   returns file bytes, download tokens, credentials or other users' data.
5. **Scopes.** A read-scope key calling `propose_changes` is refused. With the suggest scope the
   call queues a suggestion and answers `awaiting confirmation in ScholarDocX`, never that a
   change was made. Actions outside the allow-list get a tool error.
6. **Suggestions.** They appear in the app attributed to the connection, with a human-readable
   action list. Confirm runs the stored plan with the signed-in user's role limits (an over-limit
   plan fails with the normal message). Dismiss removes it. A double confirm executes once.
   Foreign, expired or already-decided suggestions cannot be confirmed. They expire after 7 days;
   the 21st pending suggestion is refused.
7. **Revocation.** Revoking a key, a password change, an admin password reset, suspension, admin
   revocation (`token_version` bump), key expiry and loss of `can_use_mcp` (admin toggle or plan lapse) each make the very next
   MCP call fail.
8. **Limits.** The per-user call rate and the per-IP failed-auth rate are enforced and appear in
   the Admin Info tab; the key cap appears under "Save & Storage Caps"; a request with a
   disallowed `Origin` header is rejected.
9. **Billing.** No MCP path makes a provider call; `make guard-billing` passes with no new EXEMPT
   entries; a regression test fails if an MCP path touches a provider client.
10. **Injection.** A row containing hostile instructions, returned by a read tool, cannot cause a
    write without a confirmation (automated test plus a manual drill).
11. **UI.** Create, list, revoke and the inbox work at 1280×600 and 390×700; the create modal
    uses `<Modal>`; the copy contains none of the banned jargon.
12. **Role limit.** `can_use_mcp` exists for every role with the defaults in Design 13 (free and admin
    roles off; basic, pro, max on); an admin account holding only an admin role is refused, and
    the same account with a basic / pro / max role is allowed; an admin can change it in the Role Limits tab and the change
    takes effect on the next MCP call and the next create / confirm; existing databases get the
    rows without losing other admin edits; a free user can still list and revoke.
13. **Marketing.** The landing pricing cards, the in-app plan comparison and the landing features
    section show the feature per tier from live limits (fallback defaults match the seed), with
    no banned jargon; layouts hold at 1280×600 and 390×700.
14. **Docs.** The README explains how to connect (Claude Code command, Cursor / VS Code config,
    Inspector), the security model in 10 lines or fewer, and the tool list; context files are
    updated per the checklist below.

## Implementation Plan

Milestones (gate each on the previous):

- **M0 Spike (0.5–1 d).** Design 2. Outcome and versions recorded here. Decision gate: SDK or
  hand-rolled.
- **M1 Keys and auth (1 d).** Models module, key generation and hashing, repository,
  `get_mcp_principal` (header-only, `token_version`, plan expiry, role limit, `Origin`), rate-limit
  rules, management router (create, list, revoke), lifespan and `/mcp` mount.
- **M2 Read tools (0.5 d).** Typed schemas mapped onto `ai_agent.run_read`, size cap,
  annotations, cross-user isolation.
- **M3 Suggestions (1 d).** Allow-list, persistence, confirm, dismiss, expiry, atomic
  transitions, execute path.
- **M4 Frontend (1–1.5 d).** Panel, create modal, inbox, setup snippets, copy, Info tab rows,
  Role Limits tab entry, landing / pricing / plan-comparison rows.
- **M5 Docs and hardening (0.5 d).** README section, injection drill, context updates, guards.

Cut line (about 3 days): M0–M3 plus a minimal inbox (list, confirm, dismiss) and a plain
create / revoke form. The full panel, polish and copy-lint tests follow.

Context updates (CODE_RULES context-first; living files are checked by `make guard-context`
against real code, so they must not name files that do not exist yet):

- **At kickoff, before code:** BD-014 in `business/decisions.md`; FR-11 in
  `functional/requirements-index.md`, marked planned; this task to Ready once D1, D3 and D4 are
  confirmed (D2 is decided). Also record the `can_use_mcp` defaults where role limits are
  documented (`security-privacy.md` "Role limits and billing guards").
- **At completion, after code:** new `technical/mcp-server.md` (design, auth model, tool
  catalogue, limits, how to add a tool safely); update `technical/ai-integrations.md` (it says
  all actions are in-app and there are no background agent runs), `api-boundaries.md`,
  `security-privacy.md`, `authentication-and-identity.md`, `data-model.md`,
  `project-structure.md`, `testing-strategy.md`; `functional/feature-ai-assistant.md` or a new
  feature file; a row in `AI-Context/README.md` "Where The Rules Live"; the root `README.md`
  (how to connect, tool list, and note that the tool-use agent is also exposed over MCP).

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests (role limits through `monkeypatch`; no writes to `role_limits` or `app_settings`
— CODE_RULES 0178 rule; per-user rows cleaned with `cleanup_user_records`):

- `backend/tests/unit/test_connected_apps_keys.py`: key format, hashing, shown once, cap,
  expiry, revoke, `token_version` bump, suspended user, plan expiry, `can_use_mcp` off (limit read monkeypatched), default seed per role
  (assert against `DEFAULT_ROLE_LIMITS`, not the live table).
- `backend/tests/unit/test_mcp_auth.py`: header-only, JWT rejected at `/mcp`, key rejected on
  `/api/*`, status codes, `Origin` check, rate limits, no key in logs.
- `backend/tests/unit/test_mcp_tools.py`: protocol round trip (`initialize`, `tools/list`,
  `tools/call`), each tool maps to the expected catalogue action, cross-user isolation,
  truncation, no provider call (provider clients patched to raise).
- `backend/tests/unit/test_mcp_suggestions.py`: scope check, allow-list, normalization errors
  returned to the client, persistence, confirm executes the stored plan once (concurrent
  confirm), role limits at confirm, expiry, cap, foreign user, hostile-row drill.
- `backend/tests/regression/test_limits_billing_guards.py`: add a case that MCP paths make no
  provider call.
- Rate-limit registry: the new rules are present (extend the existing registry test).
- Frontend (vitest): panel (list, create shows the key once, revoke), inbox (confirm, dismiss,
  result, error), copy lint for banned words in the new components, `refreshTrigger` handling if
  built as a page or tab (CODE_RULES).

## File Size Check

Files expected to be edited:

- Edited: `backend/app/main.py` (66, lifespan and mount), `backend/app/db/connection.py` (785, one
  import), `backend/requirements.txt` (pinned SDK), `backend/app/auth/rate_limit.py` (434, two
  rules), `frontend/src/components/ProfileView.tsx` (1000, at most a few lines),
  `frontend/src/components/admin/InfoTab.tsx` (cap row), `backend/app/services/admin.py` (one
  row per role in `DEFAULT_ROLE_LIMITS`), `admin/RoleLimitsTab.tsx`,
  `LandingPage/plans-data.ts`, `plan-defaults.ts`, `FeaturesSection.tsx`,
  `PlanComparisonView.tsx` (check each file's size before editing; add a frontend test that the
  feature row renders per tier).
- New: `backend/app/db/connected_apps_models.py`, `backend/app/services/connected_apps.py` (keys,
  suggestions), `backend/app/services/mcp_server.py` and `mcp_tools.py`,
  `backend/app/api/connected_apps.py`, `frontend/src/components/connected-apps/*`, tests.
- Not touched: `models.py` (1297), `FloatingAssistant.tsx` (1436), `ai_actions.py` (963),
  `routes.py` (839).

Line-count risk:

- Low to Medium (`ProfileView.tsx` sits exactly at 1000; if the mount pushes it over, record why
  here or move a section out).

If any file exceeds 1000 lines, explain why.

## Verification Plan

Run only when the user asks (project rule), scoped to the new files:

- `make test-db-start`; pytest on the four new test files and the regression file;
  `make guard-billing`; `make guard-context`; vitest on the new components;
  `make test-frontend-build`.
- Manual, local, with the backend running: `npx @modelcontextprotocol/inspector`, transport
  Streamable HTTP, URL `http://localhost:8000/mcp`, header `Authorization: Bearer <key>`; list
  tools; call `list_projects` and `get_deadlines`.
- Claude Code: `claude mcp add --transport http scholardocx http://localhost:8000/mcp --header
  "Authorization: Bearer <key>"` (confirm the flag syntax against the current docs). Ask "what is
  due in the next 14 days?", then "add a row for University X to <sheet>": the suggestion appears
  in the app, confirm it, the row appears. Revoke the key; the next call fails.
- Injection drill: put hostile text in a row, ask the client to summarize the sheet, check that no
  write happens without an in-app confirmation.
- After deploy: smoke test on Render, including a cold start.
- Record the SDK version, the negotiated protocol revision, and the clients (with versions) tested.

## Completion Notes

Changed files:

- Backend, new: `app/db/connected_apps_models.py`, `app/services/connected_apps.py`,
  `app/services/mcp_server.py`, `app/api/connected_apps.py`.
- Backend, edited: `app/main.py` (lifespan + exact `/mcp` route), `app/db/connection.py` (model import),
  `app/services/admin.py` (`can_use_mcp` per role), `app/auth/rate_limit.py` (3 rules, registry now 25),
  `requirements.txt` (`mcp==1.27.2`, `PyJWT` 2.8.0 → 2.10.1).
- Frontend, new: `components/connected-apps/` (`ConnectedAppsCard`, `ConnectedAppsPanel`,
  `CreateConnectedAppModal`, `connectedAppsApi.ts`, `connectedAppsHelpers.ts` + test).
- Frontend, edited: `ProfileView.tsx` (import + one element; now 1003 lines, over the 1000 target and inside the
  1150 grace, because the card and modal live in `ConnectedAppsCard`), `admin/RoleLimitsTab.tsx`,
  `admin/InfoTab.tsx` (3 cap rows), `PlanComparisonView.tsx`, `LandingPage/plans-data.ts`,
  `LandingPage/plan-defaults.ts`, `LandingPage/FeaturesSection.tsx`.
- Context: BD-014, FR-11, new `technical/mcp-server.md`, and updates to ai-integrations, security-privacy,
  authentication-and-identity, api-boundaries, data-model, project-structure, testing-strategy,
  feature-ai-assistant, `AI-Context/README.md`; root `README.md` (new section, diagram node).

Deviations from the plan (kept deliberately):

- Revoke = delete the key row, so `connected_apps` has no `revoked_at` and no `call_count`; added a
  transient suggestion status `running` for the atomic claim.
- SDK: route A (`mcp 1.19.0`) was rejected in the spike (does not import under pydantic 2.14); shipped
  `mcp==1.27.2` with `PyJWT==2.10.1`. Token payload has no `sub`/`iss`, so the PyJWT bump needs no code change.
- The gateway is a callable object, not a bound method (Starlette treats methods as GET-only handlers).
- `get_deadlines` / `get_overdue_rows` require a project (the catalogue normalizer demands it), so the
  tools require `project_id` or `project_name`.
- Original estimate "about 3 days" held only for backend + spike; UI, role limit and marketing made it larger.

Verification completed:

- Scratch venv (route B pins): stateless `initialize` / `tools/list` / `tools/call`; tool schemas and
  annotations; hidden internal parameter; `days_ahead` clamping; refusal of `delete_*`, `clear_sheet`,
  `bulk_update_rows`; read-only key refused for suggestions; 401 + `WWW-Authenticate`, 403 suspended, JWT-like
  token 401, key in query string ignored, bad `Origin` 403; the real module imports with all new routes and
  both tables registered on `Base`. Database calls were stubbed in that run.
- `tsc -b` clean; vitest for the new helpers 7/7; `make guard-billing`, context-drift, css and sticky guards
  pass (no new billing exemptions).
- **Not run:** the three new backend test files and the existing suites (they need the Docker Postgres, and the
  project venv points at a removed Anaconda interpreter); no live run against Render; no run with Claude Code,
  Cursor or MCP Inspector; the UI was not exercised in a browser; the `ai_models`/role-limit seeds were not run
  against a real database. Run `make test-db-start` then the scoped tests, and do the manual steps in
  Verification Plan before marking Done.

Unit tests added or updated:

- New: `backend/tests/unit/test_connected_apps_keys.py`, `test_mcp_endpoint.py`,
  `test_connected_app_suggestions.py`; `frontend/src/components/connected-apps/connectedAppsHelpers.test.ts`.
- No billing change, so `test_limits_billing_guards.py` is unchanged; `test_mcp_endpoint.py` asserts no outbound
  provider call. The `refreshTrigger` rule does not apply (a modal panel in the profile, not a page or tab), but
  the panel reloads when `refreshTrigger` changes.

Owner additions after review (2026-11-12):

- *Review suggested changes* row with a pending count on the profile card; the modal can open on the inbox alone.
- Third scope `read_write` (direct apply, no approval) with `acknowledge_direct`, `apply_directly`, tests, and copy/docs updated. This relaxes "writes are only suggestions" for opted-in keys; the allow-list and plan limits are unchanged.

Follow-ups:

- OAuth 2.1 authorization server for clients that only offer OAuth connectors (claude.ai, Claude Desktop).
- Record-domain tools, per-project key scope, activity log, notification of new suggestions.
- Confirm the Gemini price and the Render cold-start behaviour with a real client.
