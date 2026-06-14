# Security And Privacy

## Privacy Baseline

ScholarDock is privacy-first. Private academic data should remain local unless the user explicitly invokes an external AI/search action.

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
