# Business Decision Log

Record product-level decisions here. Technical implementation details belong in technical decision files.

## BD-001: Product Is Secure Personal Workspace

Status: Accepted

Decision:

ScholarDocX will store user application data locally by default.

Rationale:

Applicants handle sensitive academic, identity, and career documents. Secure personal workspace storage protects privacy and removes hosting cost.

Implications:

- No remote backend database for core data (superseded by SCHOLARDOCX-0139: now uses Supabase PostgreSQL).
- PostgreSQL (Supabase) is used for structured application data.
- Secure file system is preferred for media and documents.
- AI integrations must be explicit external calls, not silent uploads.

## BD-002: Target Users Are Individual Applicants

Status: Accepted

Decision:

ScholarDocX is designed for individual students and researchers managing their own application process.

Rationale:

The original problem is personal application complexity, not institutional admissions operations.

Implications:

- Single-user secure app is the default.
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

- Secure app architecture is preferred.
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

ScholarDocX should not require signup or signin for the secure personal workspace MVP. Google OAuth 2.0 / OpenID Connect can be added later as an optional identity provider.

Rationale:

The product's core value is private secure application management. Mandatory external signin adds friction and changes privacy expectations before it is necessary.

Implications:

- Secure app data must remain accessible without Google signin.
- Google signin should request minimal scopes.
- Google identity should not imply remote data storage.
- Future Google integrations must update business, functional, and technical context first.

## BD-007: MVP Stack Selection

Status: Accepted

Decision:

Use React/Vite/TypeScript/Tailwind for the frontend and FastAPI/PostgreSQL (Supabase) for the backend.

Rationale:

This keeps the secure app simple to run, keeps frontend and backend boundaries clear, and matches the secure personal workspace requirement without adding framework server complexity.

Implications:

- Frontend runs on localhost during development.
- Backend owns PostgreSQL (Supabase), file storage, and AI provider calls.
- The database is accessed through the backend.
- The first MVP uses a browser-based secure app rather than a packaged desktop app.

## BD-008: Optional Multi-Provider AI

Status: Accepted

Decision:

ScholarDocX may support multiple user-configured AI providers, starting with
GLM and Google AI Studio Gemini API, while Tavily remains the dedicated web
research provider.

Rationale:

Provider redundancy helps the secure personal workspace assistant stay usable when one API is
rate-limited or unavailable. Google AI Studio can be used with a free-tier API
key for development and light local use.

Implications:

- AI providers remain optional and server-side.
- Free-tier Gemini defaults should use text-only Flash-Lite/Flash models.
- Do not enable paid-only Gemini media models, Google Search grounding, or
  Google Cloud-only workflows unless a later task explicitly approves them.
- Provider selection should not require Google OAuth or remote ScholarDocX data
  storage.

## BD-009: Rebrand to ScholarDocX

Status: Accepted

Decision:

The product's legacy pre-rebrand name was replaced by ScholarDocX across the codebase, configuration, identifiers, agent skills, task tracking, and project references.

Rationale:

The owner selected a new brand name. Applying it consistently — including technical identifiers (package name, env var, localStorage keys, auth token key, code constants), not only display text — avoids a half-renamed codebase where prose says one name while storage keys say another.

Implications:

- Display name, docs, API title, and every identifier casing now use ScholarDocX / scholardocx.
- Existing local data is preserved via a one-time localStorage and token migration shim (frontend/src/lib/migrateStorageKeys.ts), so upgrading users keep their settings, chat history, and login.
- Agent-skill folders and Jira task IDs use the scholardocx / SCHOLARDOCX prefixes.
- The project root directory is renamed to ScholarDocX as a final manual step.
- backend/backend.log is intentionally left with its historical entries.

## BD-010: Scholarship Hunt Evolves Into A Pipeline (Phases 0-2)

Status: Accepted

Decision:

Scholarship Hunt is reframed from a search-results page into a pipeline
(catalog → analyze → track), per
`AI-Context/planbook/scholarship-hunt-pipeline.md`. First delivery covers
Phases 0 (curated catalog), 1 (structured AI extraction/"Analyze"), and 2
(add-to-tracker + Opportunity Library). Phases 3 (profile-aware fit scoring)
and 4 (watchlists/deadline radar) are deferred; Phase 5 (Deep Hunt runs) is a
stretch goal not scheduled.

Rationale:

Raw search links require the user to do all the eligibility/deadline work
themselves and give the app no connection to the user's actual workflow.
Routing structured opportunities into the existing sheet/calendar system
reuses working infrastructure instead of building a parallel one.

Implications:

- The beta query-review dialog (FR-8.24) becomes an opt-in, default-off
  toggle instead of a mandatory step, since the extraction step is now the
  quality control surface.
- Structured extraction uses the token-metered configured provider (GLM) via
  the existing `AiService` billing funnel, with an OpenRouter Free fallback —
  mirroring the existing Scholarship Hunt query-generation pattern rather
  than introducing a new provider path.
- A future Hunt Profile (Phase 3) may include a nationality field, but only
  as opt-in and never sent to any provider unless the user explicitly enables
  it — consistent with BD-001's secure personal workspace/privacy-first posture. Not
  implemented in this delivery.
- Bookmarks are migrated into the Opportunity Library additively; the
  underlying `bookmarked_news` table and endpoints are not removed.

## Pending Decisions

- Final desktop/local delivery model: browser app with local backend vs packaged desktop shell.
- Whether SMTP support ships in MVP or remains post-MVP.
- Whether document editor stores rich text as HTML, JSON, Markdown, or multiple formats.
- Whether Google OAuth should be prioritized for MVP or deferred until Google Calendar/Gmail/Drive integration work.
