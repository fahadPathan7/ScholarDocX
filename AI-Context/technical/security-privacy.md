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
