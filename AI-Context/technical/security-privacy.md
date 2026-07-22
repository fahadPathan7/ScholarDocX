# Security And Privacy

## Privacy Baseline

ScholarDocX stores private academic data in Supabase (PostgreSQL + Storage) and
serves it via the Render-hosted backend. The local-first origin (SCHOLARDOCX-0139)
was superseded by a cloud deployment decision: structured data lives in Supabase
Postgres and uploaded files live in Supabase Storage. External AI/search calls
remain explicit user actions behind backend services.

## Sensitive Data Types

- Essays
- SOPs
- Research proposals
- CVs
- Transcripts
- Certificates
- Passport or identity files
- Professor email conversations
- University target lists
- Funding strategy notes

## Local Security Rules

- Do not commit real `.env` files.
- Do not log API keys.
- Do not log full document contents by default.
- Validate paths before file reads and writes.
- Keep files inside the configured workspace.
- Use allowlists for upload categories and supported file types where possible.
- **Enforce maximum document size limit of 10 MB per file** to prevent resource
  exhaustion, storage abuse, and excessive bandwidth usage. This limit is
  validated both client-side and server-side.
- **Client-Side Account Isolation for Local Storage**: User conversation history
  and sensitive local state must be scoped per user ID (e.g.,
  `scholardocx_chat_history_${user.id}`). Non-user-scoped legacy keys must be
  purged on startup and logout to ensure multiple users sharing the same browser
  never see another account's cached AI turns (SCHOLARDOCX-0160).


## External API Rules

- AI/search calls must be explicit user actions.
- Show when content may be sent to external providers.
- Keep provider credentials server-side.
- Handle provider errors without losing local data.
- Scholarship Hunt query generation may send only selected public filter labels,
  a deterministic search baseline, and current date/cycle guidance to
  OpenRouter. It must not include application records, documents, profile
  details, or Tavily results.
- Advisor Atlas may send public page excerpts and user-entered research-profile
  fields to GLM after explicit search action. It must not send private
  documents, transcripts, email history, or application records.
- Scholarship opportunity extraction ("Analyze") may send only the target
  card's URL, title, and snippet/excerpt to GLM (or the OpenRouter Free
  fallback on GLM failure). It must not send private documents, application
  records, profile details, or other users' data. Extracted fields with no
  support in the source text must be left empty; the extractor must never
  invent a deadline, amount, or eligibility fact.
- The Hunt Profile's optional nationality field (Phase 3) is local-only: it
  is read only by the client-side fit-score function and must never appear
  in a Tavily query, an "Analyze" extraction request, or any other
  provider-bound payload. Fit scoring itself makes zero provider calls.
- Deep Hunt runs (Phase 5, SCHOLARDOCX-0125) send only the run's goal text
  and optional degree level/destinations/intake term to Tavily as query
  terms, and only crawled-page text/title/URL to the extraction provider —
  the same boundary "Analyze" already enforces. `scholarship_deep_hunt_runs`
  is listed in `USER_SCOPED_TABLES` so runs and their results are isolated
  per user like every other table in this section. Deep Hunt's crawler
  reuses `advisor_atlas.crawler.PublicCrawler`, so it inherits the same
  loopback/private-network/file/redirect rejection and robots/size/content
  -type limits described below, without re-implementing them.
- Advisor Atlas fetching must reject loopback, private-network, file, and unsafe
  redirect targets; limit content type and size; sanitize remote HTML; and
  respect robots and public access restrictions.
- Advisor Atlas new-run and evidence-refresh endpoints must enforce the
  authenticated user's `advisor_atlas_searches_per_month` role limit on the
  backend. Candidate ownership must be verified before a refresh consumes
  quota, and frontend controls are informational rather than the security
  boundary.

## Polar Billing Security (SCHOLARDOCX-0156 / 0157)

Full design in `billing-and-payments.md`. Security-relevant points:

- **Secrets are server-side only.** `POLAR_ACCESS_TOKEN` (checkout creation
  bearer key) and `POLAR_WEBHOOK_SECRET` (svix verification key) live on the
  `Settings` class and are never exposed to the frontend. The checkout endpoint
  proxies the provider call precisely so the token stays server-side.
- **The webhook endpoint is anonymous and authenticated solely by signature.**
  `/webhooks/polar` has NO `Depends(get_current_user)` — Polar cannot
  authenticate. svix `Webhook.verify` runs BEFORE any DB write; a missing
  `POLAR_WEBHOOK_SECRET` fails closed (500, never accept). svix natively
  enforces `svix-id` / `svix-signature` / `svix-timestamp` presence and a ±5 min
  replay window.
- **`payload.customer_email` is untrusted.** The checkout endpoint ignores the
  client-supplied email and derives the customer identity from `current_user`
  (the authenticated session). A spoofed email cannot redirect a purchase onto
  another user's account or unlock a different customer's history.
- **`success_url` is allowlisted.** Before being forwarded to the provider it is
  validated against `Settings.cors_origins` + `cors_origin_regex` — an
  authenticated client cannot redirect a post-payment buyer to an arbitrary
  external host (open-redirect / phishing guard).
- **Webhook idempotency is enforced.** The `polar_processed_events` table dedups
  by svix message id; retried deliveries cannot double-grant credits or
  duplicate plan mutations. Handlers raise 5xx (so Polar retries) for
  reconciliation misses and unknown products rather than silently returning 200.
- **Error messages never leak the provider.** Checkout failures return a generic
  user-facing detail; the provider name and upstream response body are logged
  server-side only (AGENTS.md: no infrastructure exposure in UI copy).

## Authentication Rules

- JWT signing keys are the root of all role guards. The secret must never be a
  committed constant. `initialize_database()` provisions a per-install random
  secret (`secrets.token_hex(32)`) and rotates any value still set to the
  historical `scholar-docx-secure personal workspace...` placeholder. Read sites
  (`get_jwt_secret`) must raise rather than fall back to a default if the
  secret is missing or compromised. Never reintroduce a hardcoded secret or a
  silent fallback.
- Roles for authorization are read from the database, not from the JWT
  payload, so a client cannot self-elevate. Do not trust token-embedded roles
  for permission decisions.
- Per-user data isolation is enforced server-side via `Store.current_user_id`.
  Any handler that lists/reads/mutates user-scoped records must inject the
  store through `get_user_store` (which sets `current_user_id`), never
  `get_store` — the latter leaves the store unscoped and leaks other users'
  rows. Known-user-scoped tables are listed in `USER_SCOPED_TABLES`.
- Forgot-password must not allow user enumeration: `POST /auth/forgot-password`
  always returns HTTP 200 with an identical message whether or not the email is
  registered, whether or not a request was created, and even when a rate limit
  applies. Two silent limits apply (enforced by not creating a row): at most one
  pending request per user, and one request per client IP per hour. The IP
  budget is consumed before the email lookup so the limit cannot be used as a
  timing/enumeration oracle.
- Do not require remote signin for local-only MVP workflows.

## Rate Limiting (SCHOLARDOCX-0137)

- All IP/user request-rate limits live in one place: the `RATE_LIMIT_RULES`
  registry in `backend/app/auth/rate_limit.py`, enforced through the shared
  `rate_limiter` singleton. Do not re-implement inline `defaultdict(list)`
  buckets — add a rule to the registry and call `check_and_record` (counts
  every hit), or `check` + `record` (for check-first / count-on-failure flows
  like login).
- Three enforcement patterns exist:
  - `check_and_record(key, identity)` — count every request (register,
    contact-admin, all AI/hunt/atlas/news/upload endpoints).
  - `check(key, identity)` then `record(key, identity)` only on a bad outcome
    — login and password-change (records only on failed credentials, so legit
    uses never consume the budget).
  - `check_and_record` swallowed into a generic 200 — forgot-password (never
    raises 429; preserves the anti-enumeration invariant above).
- Identity: unauthenticated endpoints (`/auth/login`, `/auth/register`,
  `/auth/invite-request`, `/auth/forgot-password`, `/auth/contact-admin`) key
  on client IP via `client_ip_from_request`; all authenticated expensive
  endpoints key on user id via `user_identity(user)` (more accurate for a
  local multi-user install).
- Rate limits sit **before** plan-tier quota checks (token budget,
  `can_use_scholarship_hunt`, etc.) so they fast-fail before any spend.
- Coverage (19 rules total): every AI-billing endpoint (`/ai/chat`,
  `/ai/research`, `/ai/summarize`, `/ai/actions/plan`, `/ai/actions/execute`),
  every search/extraction endpoint (deep-hunt run, advisor-atlas run +
  candidate refresh, news search + query-preview, scholarship analyze +
  catalog check-cycle), file upload, and the five auth endpoints. Deliberately
  NOT rate-limited: pure `GET` reads (cheap DB queries), cheap user-scoped DB
  writes (bookmarks, saved-queries, generic CRUD, outreach log, template
  render), `/auth/plans/request` (already has a one-pending-per-user guard),
  and all `/admin/*` routes (already admin-auth + permission gated).
- The registry is the single source of truth for the admin Info tab:
  `GET /admin/info/rate-limits` returns `rate_limiter.catalog()`, gated by the
  `admin_view_info` permission (default ON for both admin roles).
- Buckets are in-memory and per-process with a `threading.Lock`; they reset on
  restart and are not shared across workers. This is acceptable for the
  local-first single-process deployment.
- Known limitation: `client_ip_from_request` reads `request.client.host`
  directly; there is no `X-Forwarded-For` handling yet (relevant only if the
  app is ever served behind a reverse proxy — tracked as a follow-up).
- Latent bug fixed by SCHOLARDOCX-0137: `/auth/register` previously pruned and
  checked its bucket but never recorded into it, so the 5/5min limit could not
  trigger. Switching to `check_and_record` fixed this.

## Role Limits And Billing Guards (SCHOLARDOCX-0111)

- Plan expiry is enforced at auth time: `get_current_user` strips expired
  user-tier roles and falls back to `free_user`. `check_and_increment_limit`
  only checks the not-yet-started plan date.
- Count-based usage (`total_projects`, `total_sheets`, `total_records`,
  `total_documents_bytes`, `total_sticky_notes`, `total_whiteboards`) means
  *current* usage, not lifetime. Deletes must free quota:
  `resync_usage_counts` in `app/auth/limits.py` recounts from live data and
  runs after route deletes (`RESYNC_FEATURES_BY_TABLE`), after every agent
  plan, and at startup. `total_records` counts rows inside `rows_json`
  (`json_array_length`), never pages.
- Create paths pre-increment the counter, so a failed storage write must give
  the quota back (compensating decrement in the CRUD create, sheet-create,
  rows-update, and file-upload routes). Upload also settles the difference
  between the client-declared size and the bytes actually written.
- `verify_model_permission` must be called with the settings object: when no
  model is specified it resolves the same default-provider chain `AiService`
  uses (groq→gemini→mistral→glm) and enforces `can_use_<provider>` — omitting
  the model is not a provider-permission bypass.
- Billing (`ai_tokens.py`): both `charge` and `charge_flat_fee` gate the
  purchased bucket on `can_use_purchased_tokens`; `compute_cost` prices
  deactivated models (deactivation blocks selection, not billing); duplicate
  Pending purchase requests per user+pack are rejected; pack approval is
  idempotent via the Pending-status guard.
- Missing role-limit rows default to allow (`check_and_increment_limit`) and
  no-cap (`get_user_limit` → -1); users without any user-tier role get 0.
  Admin role-limit edits must call `invalidate_limits_cache()`.
- Google OAuth (SCHOLARDOCX-0169) is implemented as an OPTIONAL login
  method. It must stay optional unless a later business decision changes
  this. Authorization-code + PKCE flow runs server-side; the client
  secret never reaches the frontend.
- Request minimal scopes (`openid email profile`).
- Store only necessary identity fields (Google `sub`, email, name,
  avatar snapshot) in `external_identities`.
- Do not expose OAuth secrets or refresh tokens to frontend code. No
  refresh tokens are stored at all — login only needs the id_token.
- Google sign-in does NOT create accounts. Auto-link is permitted only
  for Google emails with `email_verified=true`. A first-time Google user
  with no matching `users.email` is rejected with a clear message.

## Future Considerations

Possible later features:

- Local backup export.
- Encrypted local workspace.
- Redaction before AI calls.
- Per-document privacy flags.
- "Connect Google" button in Profile/Settings (link an existing password
  account to Google from within the app, as opposed to login-time auto-link).

These are not MVP requirements unless a Jira task adds them.
