# Assumptions And Risks

## Assumptions

- The initial user is comfortable running a local development-style app.
- The app can start as single-user.
- SQLite is sufficient for expected personal-scale data.
- Local file system storage is acceptable for documents and uploads.
- GLM and Tavily are the intended initial AI/search providers.
- Users may still create some files externally, such as CVs in Overleaf or Europass.

## Risks

## R-001: Local Setup Complexity

Risk:

Users may struggle to run frontend, backend, environment variables, and local workspace setup.

Mitigation:

Prioritize clear initialization, validation, and developer documentation.

## R-002: Privacy Leakage Through AI

Risk:

User may send sensitive text to AI providers without realizing it.

Mitigation:

Make AI actions explicit. Show what context will be sent. Keep AI provider calls behind controlled backend services.

## R-003: Large Feature Surface

Risk:

Dashboard, documents, storage, emails, and AI could make the MVP too large.

Mitigation:

Use Jira tasks and context files to sequence features. Keep MVP workflows narrow.

## R-004: File Organization Drift

Risk:

As the codebase grows, AI agents may create large mixed-purpose files.

Mitigation:

Enforce file-size and modularity rules in root docs and Jira tasks.

## Open Questions

- Should ScholarDock be packaged later as a desktop app?
- Should document editor content be exportable to PDF/DOCX in MVP?
- Should calendar reminders integrate with local OS calendars or remain in-app only?
- Should SMTP email sending be included early, or should MVP use mailto/copy only?

