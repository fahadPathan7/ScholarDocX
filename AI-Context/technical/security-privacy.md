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
