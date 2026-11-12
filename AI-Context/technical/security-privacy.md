# Security And Privacy

## Baseline

ScholarDocX holds private academic data: essays, SOPs, proposals, CVs, transcripts, certificates, identity
files, professor correspondence, target lists, and funding notes. Structured data lives in Postgres and uploaded
files in object storage (SCHOLARDOCX-0139), served by the backend. Each user's data is isolated and never
shared. External AI and search calls are explicit user actions behind backend services; provider keys stay
server-side.

## Data and files

- Never commit real `.env` files or keys. Do not log API keys or, by default, full document contents.
- Validate file paths before reads and writes, use allowlists for upload categories and file types, and keep every file inside its storage prefix.
- **Maximum document size is 10 MB per file** (`MAX_DOCUMENT_SIZE_BYTES` in `backend/app/core/workspace.py`), validated client-side for feedback and server-side as the boundary.
- **Per-user browser state**: chat history and other sensitive client state are keyed by user id (for example `scholardocx_chat_history_${user.id}`); non-user-scoped legacy keys are purged on startup and logout so users sharing a browser never see each other's cached AI turns (SCHOLARDOCX-0160, `lib/migrateStorageKeys.ts`).
- **File downloads use short-lived, file-scoped tokens** (SCHOLARDOCX-0222): the frontend opens file content via `POST /files/{id}/download-link` (5-minute JWT with `purpose=file_download` and `file_id`; `create_download_token` / `decode_download_token` in `auth/jwt.py`), never by putting the 30-day session token in a URL, where it would leak into history, logs, and shared links. `view_file_content` accepts the download token or a normal session and enforces ownership on both. The legacy `?token=` session fallback remains for old links but new code must not use it; purpose isolation means a session token never validates as a download token and vice versa.

## What may be sent to providers

- AI and search calls must be explicit user actions; show when content may go to an external provider; handle provider errors without losing user data.
- **Google Analytics** (via Google Tag Manager `GTM-P5SJXF45`, owner-approved SCHOLARDOCX-0257): public pages (`/`, `/login`, `/register`) are tracked without a prompt; pages inside the signed-in app only after the user allows it in `AnalyticsConsentBanner` (asked once per user, choice remembered): Google receives page paths, title, device/browser data and IP-derived location, never user content. `frontend/src/lib/analytics.ts` loads the tag only in production and only on a URL with no query string, no hash, and not under `/auth-complete` (Google sign-in puts the login token there; the full-screen sheet URL carries ids); page views carry origin + path only. Never add analytics events that include names, emails, document or sheet content, or record ids.
- **Scholarship Hunt**: the goal text and optional degree level, destinations, and intake term go to the search provider as query terms (and to the OpenRouter planner and filter); only crawled-page text, title, and URL go to the extraction provider. Never application records, documents, or profile details. The Hunt Profile (and any nationality field) was removed in SCHOLARDOCX-0178. `scholarship_deep_hunt_runs` is user-scoped like every other table.
- **Advisor Atlas**: public page excerpts and the user-entered research-profile fields go to GLM after an explicit search. Never private documents, transcripts, email history, or application records. Fetching rejects loopback, private-network, file, and unsafe redirect targets; limits content type and size; sanitizes remote HTML; and respects robots and public-access restrictions. Deep Hunt reuses the same `PublicCrawler`, so it inherits those controls. Since SCHOLARDOCX-0251: every connection goes through `_PublicOnlyTransport`, which resolves the host once (non-blocking), rejects any non-global address, and connects to that pinned IP (Host header and TLS hostname unchanged), so DNS rebinding cannot reach internal hosts; every redirect hop is re-validated, robots-checked, and throttled; bodies are streamed and cut at the size cap; robots.txt follows redirects and an unreachable/5xx robots.txt means disallow. Scraped text is untrusted: every Advisor Atlas system prompt tells the model source text is data, never instructions. Vision calls receive the validated image bytes, never a URL for the provider to fetch.
- **Research Expert**: text is read from the user's uploaded PDF on the server and passages are sent to Jina for embeddings (see [ai-integrations.md](ai-integrations.md)). The PDF is opened only through `/api/research/papers/{paper_id}/pdf`, which resolves it from a user-owned `research_papers` row and its storage record; Documents lists, category counts, and `/files/{file_id}/content` do not expose `file_type='research_paper'` rows. Research papers still count toward the shared `total_documents_bytes` limit.
- **Advisor Atlas usage** is gated by the `can_use_advisor_atlas` plan check and metered in credits; candidate ownership is verified before a refresh spends credits. Frontend controls are informational, never the security boundary.

## Authentication and authorization

- **JWT secret**: `JWT_SECRET` comes from the environment (`settings.jwt_secret_key`). `get_jwt_secret` raises 500 if it is missing or still starts with the known-compromised placeholder prefix; never reintroduce a hardcoded secret or a silent fallback.
- **Roles come from the database**, not the token payload: `get_current_user` loads the user row, checks the token version (revocation), applies plan expiry, and refuses suspended accounts. Do not trust token-embedded roles for permission decisions.
- **Per-user isolation is enforced server-side.** Any handler that lists, reads, or mutates user-scoped records must inject the store through `get_user_store`, which sets `Store.current_user_id`; plain `get_store` is unscoped and leaks rows. The store scopes any table whose columns include `user_id`.
- **Google sign-in** is optional (SCHOLARDOCX-0169): authorization-code + PKCE runs server-side, scopes are `openid email profile`, only the Google `sub`, email, name, and avatar snapshot go into `external_identities`, no refresh tokens are stored, and the client secret never reaches the frontend. A first-time Google user gets an active free account (`signup_method='google'`); auto-link to an existing user is permitted only when the Google email is verified.
- **Forgot-password** must not allow user enumeration: `POST /auth/forgot-password` always returns HTTP 200 with the same message regardless of whether the email exists, whether a request was created, or whether a limit applied. Two silent limits (enforced by not creating a row): one pending request per user and one per client IP per hour. The IP budget is consumed before the email lookup so the limit is not a timing or enumeration oracle.
- **Connected-app access keys** (SCHOLARDOCX-0258) are a separate credential from the session JWT: `sdx_` random keys, SHA-256 hash stored, header-only, tied to `token_version`, gated by `can_use_mcp`, accepted only at `/mcp`. A key on `/api/*` or a JWT at `/mcp` is a 401. A key may carry the opt-in `read_write` scope (explicit acknowledgement, never default); the write allow-list still applies. See [mcp-server.md](mcp-server.md).
- Remote sign-in is how users reach the hosted app; do not add paths that bypass `get_current_user` (the only anonymous routes are auth, `plans/public`, webhooks, and internal secret-gated routes).

## Polar billing security (SCHOLARDOCX-0156 / 0157)

Design: [billing-and-payments.md](billing-and-payments.md). Security points:

- `POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET` live on `Settings`, server-side only; the checkout endpoint proxies the provider call so the token stays there.
- `/webhooks/polar` is anonymous and authenticated solely by signature: svix verification runs before any DB write, a missing `POLAR_WEBHOOK_SECRET` fails closed (500), and svix enforces `svix-id`/`svix-signature`/`svix-timestamp` and a 5-minute replay window.
- `payload.customer_email` is untrusted: the customer identity derives from `current_user`, so a spoofed email cannot redirect a purchase to another account.
- `success_url` is validated against `Settings.cors_origins` + `cors_origin_regex` (open-redirect guard).
- Idempotency: `polar_processed_events` dedups by svix message id, so retries cannot double-grant credits; handlers raise 5xx for reconciliation misses and unknown products so Polar retries.
- Checkout failures return a generic message; the provider name and upstream body are logged server-side only (see the copy rule in AGENTS.md).

## Rate limiting (SCHOLARDOCX-0137)

- Every IP and user rate limit lives in one registry, `RATE_LIMIT_RULES` in `backend/app/auth/rate_limit.py` (25 rules), enforced through the shared `rate_limiter`. Do not re-implement inline buckets; add a rule and call `check_and_record` (counts every hit), or `check` then `record` on a bad outcome (login and password change record only failed credentials, so legitimate use never consumes the budget). Forgot-password swallows the limit into a generic 200 to keep the anti-enumeration invariant.
- Identity: unauthenticated endpoints (`/auth/login`, `/auth/register`, `/auth/invite-request`, `/auth/forgot-password`, `/auth/contact-admin`) key on client IP (`client_ip_from_request`); authenticated expensive endpoints key on user id (`user_identity`).
- Limits run before plan and credit checks so they fast-fail before any spend. Covered: every AI-billing endpoint, every search or extraction endpoint (deep-hunt run, advisor-atlas run and refresh, scholarship analyze), file upload, and the auth endpoints. Deliberately not limited: plain GET reads, cheap user-scoped writes, `/auth/plans/request` (one-pending-per-user guard), and `/admin/*` (already permission gated).
- The registry feeds the admin Info tab via `GET /admin/info/rate-limits` (permission `admin_view_info`).
- Buckets are in memory and per process: they reset on restart and are not shared across workers, which is acceptable for a single-process deployment. `client_ip_from_request` reads `request.client.host` with no `X-Forwarded-For` handling; behind a reverse proxy that would key every user on the proxy IP (follow-up if the topology changes).

## Role limits and billing guards (SCHOLARDOCX-0111)

- `can_use_mcp` (connected apps) is a permission limit: on for `general_user`, `pro_user`, `max_user`; off for `free_user` and both admin roles (admins need a user-tier role too).

- Plan expiry is applied at auth time (`app/auth/plan_state.py`): `get_current_user` strips expired user-tier roles and falls back to `free_user`.
- Count-based usage (`total_projects`, `total_sheets`, `total_records`, `total_documents_bytes`, `total_sticky_notes`, `total_whiteboards`) means current usage, not lifetime. `resync_usage_counts` (`app/auth/limits.py`) recounts from live data after route deletes (`RESYNC_FEATURES_BY_TABLE`), after every agent plan, and at startup; `total_records` counts rows inside `rows_json`.
- Create paths pre-increment the counter, so a failed storage write must give the quota back (compensating decrement in the CRUD create, sheet-create, rows-update, and file-upload routes); upload also settles the difference between the declared size and the bytes written.
- `verify_model_permission` must receive the settings object: with no model it resolves the default-provider chain `AiService` uses and enforces `can_use_<provider>`, so omitting the model is not a bypass.
- A missing `role_limits` row **denies**: `check_and_increment_limit` raises and `get_user_limit` returns 0 with an ERROR log; users with no user-tier role get 0. Admin role-limit edits must call `invalidate_limits_cache()`. Billing details: [billing-contract.md](billing-contract.md), [ai-token-economy.md](ai-token-economy.md).

## Possible later work

Redaction before AI calls, per-document privacy flags, and a "Connect Google" action in Profile for linking an existing password account. None is required unless a Jira task adds it.
