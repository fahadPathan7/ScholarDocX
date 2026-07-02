# Security And Privacy

## Privacy Baseline

ScholarDocX is privacy-first. Private academic data should remain local unless the user explicitly invokes an external AI/search action.

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
- Advisor Atlas fetching must reject loopback, private-network, file, and unsafe
  redirect targets; limit content type and size; sanitize remote HTML; and
  respect robots and public access restrictions.
- Advisor Atlas new-run and evidence-refresh endpoints must enforce the
  authenticated user's `advisor_atlas_searches_per_month` role limit on the
  backend. Candidate ownership must be verified before a refresh consumes
  quota, and frontend controls are informational rather than the security
  boundary.

## Authentication Rules

- JWT signing keys are the root of all role guards. The secret must never be a
  committed constant. `initialize_database()` provisions a per-install random
  secret (`secrets.token_hex(32)`) and rotates any value still set to the
  historical `scholar-docx-local-first...` placeholder. Read sites
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
- If Google OAuth is added, keep it optional unless a later business decision changes this.
- Request minimal scopes.
- Store only necessary identity fields.
- Do not expose OAuth secrets or refresh tokens to frontend code.

## Future Considerations

Possible later features:

- Local backup export.
- Encrypted local workspace.
- Redaction before AI calls.
- Per-document privacy flags.
- Optional Google OAuth identity.

These are not MVP requirements unless a Jira task adds them.
