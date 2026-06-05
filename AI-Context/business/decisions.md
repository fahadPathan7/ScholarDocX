# Business Decision Log

Record product-level decisions here. Technical implementation details belong in technical decision files.

## BD-001: Product Is Local-First

Status: Accepted

Decision:

ScholarDock will store user application data locally by default.

Rationale:

Applicants handle sensitive academic, identity, and career documents. Local-first storage protects privacy and removes hosting cost.

Implications:

- No remote backend database for core data.
- SQLite is preferred for structured local data.
- Local file system is preferred for media and documents.
- AI integrations must be explicit external calls, not silent uploads.

## BD-002: Target Users Are Individual Applicants

Status: Accepted

Decision:

ScholarDock is designed for individual students and researchers managing their own application process.

Rationale:

The original problem is personal application complexity, not institutional admissions operations.

Implications:

- Single-user local app is the default.
- Collaboration, team accounts, and admin dashboards are out of scope unless later approved.

## BD-003: AI Is Assistance, Not Authority

Status: Accepted

Decision:

AI features support research, drafting, and summarization, but user-controlled records remain the source of truth.

Rationale:

Academic applications require accuracy, judgment, and personal voice.

Implications:

- AI outputs should be reviewable before saving.
- AI should cite or preserve research context when web search is used.
- AI should not automatically overwrite user documents.

## BD-004: No Mandatory Cloud Cost

Status: Accepted

Decision:

The app must not require hosted infrastructure to function.

Rationale:

The project goal includes zero infrastructure cost.

Implications:

- Local app architecture is preferred.
- External APIs must be optional and user-configured.
- Do not introduce managed storage, auth, or analytics by default.

## BD-005: Context Before Code

Status: Accepted

Decision:

New features and feature modifications must update context before code.

Rationale:

The project is intended to grow through AI-DLC, where future agents need compact current context.

Implications:

- Jira tasks are required for coding work.
- Context files must stay current.
- Root agent rules must be followed by future AI assistants.

## BD-006: Authentication Is Optional For MVP

Status: Proposed

Decision:

ScholarDock should not require signup or signin for the local-first MVP. Google OAuth 2.0 / OpenID Connect can be added later as an optional identity provider.

Rationale:

The product's core value is private local application management. Mandatory external signin adds friction and changes privacy expectations before it is necessary.

Implications:

- Local app data must remain accessible without Google signin.
- Google signin should request minimal scopes.
- Google identity should not imply remote data storage.
- Future Google integrations must update business, functional, and technical context first.

## BD-007: MVP Stack Selection

Status: Accepted

Decision:

Use React/Vite/TypeScript/Tailwind for the frontend and FastAPI/SQLite for the backend.

Rationale:

This keeps the local app simple to run, keeps frontend and backend boundaries clear, and matches the local-first requirement without adding framework server complexity.

Implications:

- Frontend runs on localhost during development.
- Backend owns SQLite, file storage, and AI provider calls.
- SQLite is accessed through the backend.
- The first MVP uses a browser-based local app rather than a packaged desktop app.

## BD-008: Optional Multi-Provider AI

Status: Accepted

Decision:

ScholarDock may support multiple user-configured AI providers, starting with
GLM and Google AI Studio Gemini API, while Tavily remains the dedicated web
research provider.

Rationale:

Provider redundancy helps the local-first assistant stay usable when one API is
rate-limited or unavailable. Google AI Studio can be used with a free-tier API
key for development and light local use.

Implications:

- AI providers remain optional and server-side.
- Free-tier Gemini defaults should use text-only Flash-Lite/Flash models.
- Do not enable paid-only Gemini media models, Google Search grounding, or
  Google Cloud-only workflows unless a later task explicitly approves them.
- Provider selection should not require Google OAuth or remote ScholarDock data
  storage.

## Pending Decisions

- Final desktop/local delivery model: browser app with local backend vs packaged desktop shell.
- Whether SMTP support ships in MVP or remains post-MVP.
- Whether document editor stores rich text as HTML, JSON, Markdown, or multiple formats.
- Whether Google OAuth should be prioritized for MVP or deferred until Google Calendar/Gmail/Drive integration work.
