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

Status: Superseded — accounts exist (SCHOLARDOCX-0139); Google sign-in shipped as an optional method (SCHOLARDOCX-0169)

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

## BD-010: Research Expert Workspace (SCHOLARDOCX-0174)

Status: Accepted

Decision:

ScholarDocX introduces a Research Expert workspace allowing applicants to upload PDF research papers for text extraction, 768-dim vector embedding generation (Gemini `text-embedding-004`), pgvector cosine similarity search, and AI-assisted paper analysis. Access is restricted to Pro and Max tier users (`can_use_research_reader`), with monthly paper upload limits (`research_papers_per_month`: Pro 30, Max 100). All embedding and analysis calls consume AI tokens from the user's balance.

Rationale:

Academic applicants (especially Master's/PhD candidates) spend significant time reading literature for SOPs, research proposals, and professor outreach. Providing vector-search augmented paper reading directly inside ScholarDocX accelerates research prep while retaining user privacy and metering consumption.

Implications:

- Pro/Max exclusive feature. Free/General users see an upgrade prompt.
- PDF text extraction is local-first using `pdfplumber`.
- Vector embeddings (768 Float dimensions) live in Supabase PostgreSQL via pgvector extension (`Vector(768)`).
- All AI calls are metered and gated by user token balances.

## BD-011: The Operator Never Absorbs Provider Cost (SCHOLARDOCX-0204)

Status: Accepted

Decision:

Every external provider call issued on a user's behalf is charged to that user's
AI credit balance. There are no exempt categories. Specifically, none of the
following is a reason to skip a charge: the call runs in a background task; the
call is a fallback or retry; the provider's own price for that model is $0
("free tier"); the call is auxiliary rather than user-initiated (routing,
planning, relevance scoring, summarization); the result was discarded, filtered
out, or never shown to the user. The work was performed *for* that user, so that
user pays for it.

Where this conflicts with an earlier per-feature choice to bill a provider at
$0 — Advisor Atlas Tavily searches, previously recorded as a deliberate
zero-cost counter — this decision supersedes it.

Rationale:

Unbilled calls are direct margin loss carried by the operator, and they scale
with success: the more the product is used, the more the operator pays. They are
also invisible in the admin dashboards, which count ledger rows and so report a
$0 call as activity with no cost. The SCHOLARDOCX-0204 audit found eight such
paths, none of which were "billing forgotten" — each had a documented charge
helper that was never actually invoked at runtime.

Implications:

- A charge site takes its billing context as a required parameter. An optional
  `ai_service=None` that guards the charge is prohibited.
- `compute_cost()` returning `$0` for an unrecognized model is a configuration
  failure to surface at startup, not a free call to let through.
- A gated feature with no `role_limits` row is denied, not allowed.
- Background billing resolves the same effective role a live request would —
  plan expiry and suspension included.
- User-visible credit figures (Advisor Atlas `research_metrics.credits_used`,
  the balance widget) will rise once the unbilled paths are wired. That is the
  correct number appearing for the first time, not a regression.
- Pricing levels are unaffected. This decision governs *whether* a call is
  billed, not *how much* — per-call prices stay admin-configurable.

## BD-012: Context Is Verified, Not Trusted (SCHOLARDOCX-0205)

Status: Accepted

Decision:

AI-DLC context is treated as code, not documentation. Three rules follow:

1. **Every rule has exactly one home.** Other files link to it and never restate
   it. A duplicated rule is a rule that will drift, and drifted copies give no
   way to tell which is authoritative.
2. **Living context must resolve.** Files under `business/`, `functional/`,
   `technical/`, `workflows/`, plus `AI-Context/README.md`, `CODE_RULES.md`,
   `AGENTS.md`, `CLAUDE.md`, and skills, describe the present and are corrected
   whenever code moves. `make guard-context` fails the build when any of them
   names a path, link, or symbol that does not exist.
3. **Point-in-time files are never "corrected".** `jira-tasks/` and `planbook/`
   record what was true when written. Editing them to match today falsifies the
   decision trail, so the guard deliberately does not check them.

Skills follow the same single-source rule: `.agents/skills/` holds the files and
`.claude/skills/` + `.codex/skills/` are symlinks into it.

Rationale:

Context is read as instructions, so a wrong sentence does not sit harmlessly —
it propagates into code the next agent writes and into conclusions a reviewer
draws. The SCHOLARDOCX-0205 audit found `charge_ai_tokens` named 28 times across
AGENTS.md and AI-Context; it had never existed. Three of the four "enforcement
locations" the context prescribed were fictional. Four skills had drifted between
agent trees, with the `.claude` and `.codex` copies still calling the database
SQLite years into PostgreSQL — so Claude and Codex sessions were being handed the
wrong stack. None of this was catchable by reading, because the prose was
confident and internally consistent.

Implications:

- Adding a rule means choosing its home file, not adding a paragraph wherever it
  seems useful.
- A "BILLING ENFORCEMENT"-style assertion in context is a requirement, not
  evidence. Verify at the call site before believing it — SCHOLARDOCX-0204 found
  four such claims that were false in code.
- When removing a claim, say what replaced it and cite the task. A bare deletion
  invites the next agent to reinvent what was removed on purpose.
- New skills go in `.agents/skills/` and are symlinked. Never copied.

## BD-013: One Home For Agent Rules; Entry Files Stay Lean (SCHOLARDOCX-0235)

Status: Accepted

Decision: `AGENTS.md` is the single home for agent workflow and hard rules (jargon, billing
pointer, modal pattern, layout/reachability, repo hygiene pointers). `CLAUDE.md` only adds the
reading order and a product summary and defers to it. File-size policy lives only in
`CODE_RULES.md`; the separate `technical/file-size-and-modularity.md` was deleted.
`architecture-overview.md` and `project-structure.md` describe the cloud architecture and real
layout, not a local-first or "future" design. Entry files must not reference deleted files or
carry history.

Rationale: the same rules were restated in several files and had drifted; shorter entry files cost
fewer tokens on every task and leave nothing to contradict.

## BD-014: Users May Connect Their Own AI App To Their Workspace (SCHOLARDOCX-0258)

Status: Accepted

Decision: a user whose plan includes `can_use_mcp` (basic, pro, max; off for free and for admin
roles) can create revocable access keys that let an external AI app (Claude Code, Cursor, VS Code)
read their own workspace and *suggest* changes. Every suggestion waits for the user's confirmation
inside ScholarDocX. ScholarDocX makes no provider call on this path, so it costs no AI credits.

Rationale: users who already pay for an AI client can use it on their data. The privacy cost is
that the user's external client and its model see the data a key may read; it is user-directed,
opt-in per connection, read-only by default, revocable, and never includes file contents or
credentials. Deletes, bulk edits and record-domain writes are not reachable in v1.
Owner addition: a key may be given a direct-write scope (no per-change approval) for users whose AI
app has its own safeguards; it needs an explicit acknowledgement, is never the default, and keeps
the same allow-list and plan limits.

## BD-015: Projects Are Free-Form; Sheets Start Blank (SCHOLARDOCX-0259)

Decision (owner, 2026-11-13): a project is a named container with no degree label, and a new
sheet is a blank grid with lettered columns the user renames. The application tracker and the
other layouts remain as optional templates.

Rationale: applicants track far more than applications. A required Bachelors/Masters/PhD label
and a prebuilt 30-column tracker made every other use awkward. The `projects.degree_type` column
stays for existing rows (it still selects the application-tracker layout for them) but the UI
no longer asks for it or shows it.

## Pending Decisions

- Whether SMTP support ships or Gmail/Outlook compose links stay the only outreach path.
- Whether further Google integrations (Calendar, Gmail, Drive) are worth adding beyond sign-in.
