# AGENTS.md

Project: ScholarDocX

This file is the root instruction file for AI agents working in this repository.

## Mission

ScholarDocX is a secure personal workspace, privacy-first higher education application management portal. It helps applicants manage universities, programs, professors, deadlines, documents, outreach emails, and AI-assisted academic research from one local workspace.

## Mandatory AI-DLC Workflow

Before writing or changing product code:

1. Read [AI-Context/README.md](AI-Context/README.md).
2. Read the relevant repo-carried skills automatically loaded from `.agents/skills`, `.claude/skills`, or `.codex/skills`.
3. Read the relevant business, functional, and technical context files for the requested work.
4. Read or create the relevant Jira task file in [AI-Context/jira-tasks](AI-Context/jira-tasks).
5. Refine context first when a feature is new, changed, unclear, or crosses module boundaries.
6. Only then implement code.
7. After implementation, update context and the Jira task with decisions, changed files, tests, and follow-ups.

### STRICT ENFORCEMENTS
- **NO WORK WITHOUT JIRA**: Every piece of major work (features, large refactors, UI updates) MUST have an associated Jira story in `AI-Context/jira-tasks/`. Do not start writing code for major changes without first creating the task file inside an Epic.
- **MANDATORY CONTEXT UPDATE**: After every feature or code update, the AI Agent MUST update the relevant AI-Context files (for example `technical/frontend-visual-system.md`, `technical/api-boundaries.md`, `technical/project-structure.md`, or `technical/security-privacy.md`) with any new architectural or design decisions. Do not end the session without updating the context.
- **NO INFRASTRUCTURE OR ALGORITHM JARGON IN USER-FACING COPY**: Never expose internal implementation detail to users in the frontend UI, toasts, error messages, loading text, tooltips, marketing/upgrade copy, or any other string a user reads. This covers TWO categories:
  1. **Infrastructure / provider names** — e.g. Supabase, Render, PostgreSQL, SQLAlchemy, FastAPI, Vite. Use domain abstractions ("cloud storage" not "Supabase storage buckets").
  2. **Algorithm / data-pipeline jargon** — e.g. "vector", "embeddings", "vector embeddings", "pgvector", "semantic chunking", "chunks" (as in "X chunks indexed" or "Chunk #3"), "cosine similarity", "similarity search", "HNSW", "IVFFlat", "text extraction", "indexing", "re-indexing", "token count", "synthesizing", provider model IDs ("jina-embeddings-v4", "text-embedding-004"). Users should never see how a feature works under the hood — only what it does for them.

  **Approved plain-language replacements** (use these or equivalent):
  - "vector embeddings" / "embeddings" → "the paper's content" / "saved analysis"
  - "chunks" / "chunk history" / "Chunk #3" → "sections" / "Section #3" / "passages"
  - "vector similarity search" / "similarity search" → "AI-powered search across the paper"
  - "similarity: 92%" → "relevance: 92%"
  - "text extraction & semantic chunking" → "full-text reading with AI-powered section analysis"
  - "re-indexing" → "retrying"
  - "tokens consumed" → "credits used"
  - raw HTTP status ("Request failed: 403") → "Something went wrong. Please try again."

  When in doubt, describe the **user outcome**, not the mechanism. A reviewer seeing "vector", "embedding", "chunk", "pgvector", "extraction", or a provider name in rendered UI copy should treat it as a regression to fix. Internal code (variable names, comments, type fields, CSS classes, console logs, API payloads) is exempt.
- **ABSOLUTE BILLING ENFORCEMENT**: every external provider call made on a
  user's behalf is charged to that user, with the plan gate checked before the
  call. Foreground, background, admin-triggered, fallback, retry, and
  vendor-"free" calls are all included; there are no exempt categories. The
  full contract lives in
  [AI-Context/technical/billing-contract.md](AI-Context/technical/billing-contract.md)
  — read it before touching provider code, and do not restate it here.
## Repo-Carried Agent Skills

ScholarDocX keeps project-specific `SKILL.md` files natively integrated in `.agents/skills`, `.claude/skills`, and `.codex/skills`. These skills are compact task guides for coding, context updates, test cases, context review, UI/UX, AI integrations, security/privacy, and handoff.

Use only the skills relevant to the current task. Skills supplement the source-of-truth order below; they do not override the user's latest instruction, root rules, the active Jira task, or AI-Context.



## Source Of Truth

Use this order when resolving conflicts:

1. The user's latest explicit instruction.
2. Root rules: this file, [CLAUDE.md](CLAUDE.md), and [CODE_RULES.md](AI-Context/CODE_RULES.md).
3. Current Jira task file.
4. AI-Context files.
5. Existing codebase patterns.
6. Historical source notes, now absorbed into [AI-Context](AI-Context/README.md).

## Non-Negotiable Product Constraints

- Cloud-deployed (SCHOLARDOCX-0139): the app runs on Render (free tier),
  database on Supabase Postgres, file storage on Supabase Storage. The original
  local-first / SQLite / local-file constraints were superseded by this
  deployment decision.
- Zero infrastructure cost: Render free + Supabase free tier.
- AI integrations are optional external API calls controlled by server-side keys.
- External AI/search calls remain explicit user actions behind backend services.
- The app must remain maintainable by AI coding assistants as it grows.

## Billing And Credit Enforcement Rules

Every external provider call made on a user's behalf is charged to that user.
There are no exempt categories: background tasks, fallback paths, retries,
models the vendor prices at $0, and calls whose results get discarded are all
billed. The operator never absorbs provider cost.

**The contract — API, enforcement locations, gates, and the checklist for adding
a provider — lives in one place:
[AI-Context/technical/billing-contract.md](AI-Context/technical/billing-contract.md).**
Read it before touching anything that calls a provider. It is kept honest by
`scripts/check-context-drift.py`, so its function names are real; this section
deliberately holds no API detail of its own, because the copy that used to live
here drifted for a year and told agents to call four functions that never
existed (SCHOLARDOCX-0205).

Two guards enforce this, both wired into `make check`:

- `make guard-billing` — fails when a function talks to a provider without
  charging, or makes its billing context optional.
- `make guard-context` — fails when context names code that does not exist.

When you touch billing code, update
`backend/tests/regression/test_limits_billing_guards.py`. Do not run it yourself
unless the user explicitly asks — see [CODE_RULES.md](AI-Context/CODE_RULES.md).

## File Size And Modularity Rule

- Target maximum file size: 1000 lines.
- Temporary grace limit: up to 1150 lines during the current feature if a file starts near the limit.
- If a file exceeds 1150 lines after a feature is completed, split it before beginning the next feature.
- Prefer cohesive modules over large mixed-purpose files.
- Before editing a large file, check line count and consider extracting helpers, components, schemas, routes, or services.

## Non-Negotiable UI Rules

These are recurring regressions. Violating them breaks the visual system and
must be caught before opening a PR.

### Modal backdrop blur (regressed 3+ times — read before touching modals)

**Intended look:** blur covers the full `.main-content` work surface (breadcrumbs,
view headers, toolbar, table) but the global TopBar and left Sidebar stay crisp.

**Why agents keep breaking it**

1. **Copy-paste trap** — `rg modal-backdrop-main` returns ~10 files. Most still
   use a legacy inline `<div className="modal-backdrop modal-backdrop-main">`.
   Agents copy that pattern and miss the portal step. **Do not copy those files.**
2. **CSS “simplification”** — `.modal-backdrop` (base) is `position: fixed`.
   Agents merge or “unify” it with `.modal-backdrop-main` and switch to fixed
   viewport positioning, blurring the sidebar and TopBar.
3. **Two bugs, opposite symptoms** — under-blur (inline div in `.section-body`)
   vs over-blur (`position: fixed` on `.modal-backdrop-main`). Fixing one often
   reintroduces the other.
4. **“Use existing patterns” misfires** — legacy inline backdrops are wrong
   patterns. The only approved implementation is `<Modal>` from `Modal.tsx`.
5. **Inline styles override CSS** — custom `position`/`backdropFilter` inline
   (e.g. `RowPeekPanel.tsx`) bypass the canonical rule.

| Symptom | Cause | Fix |
|--------|-------|-----|
| Sidebar/TopBar blurred | `.modal-backdrop-main` uses `position: fixed` | Restore `position: absolute; inset: 0` |
| Only table area blurred; breadcrumbs sharp | Inline backdrop, no portal | Wrap in `<Modal onClose={…}>` |
| Modal flush to top | `padding-top` changed from `160px` | Restore `padding-top: 160px` |

**Required pattern for every main-content modal**

```tsx
import { Modal } from "./Modal"; // or "../Modal"

export function MyModal({ onClose, … }) {
  return (
    <Modal onClose={onClose}>          {/* nested: zIndex={1060} */}
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} …>
        …
      </form>
    </Modal>
  );
}
```

`<Modal scope="main">` (default) portals into `.main-content` and applies
`.modal-backdrop-main`. That is the entire backdrop implementation — do not
add your own backdrop div.

**Forbidden**

- Inline `<div className="modal-backdrop modal-backdrop-main">` anywhere except
  inside `Modal.tsx`.
- Changing `.modal-backdrop-main` to `position: fixed` / `min-height: 100vh`.
- Custom portals to `#sheet-work-surface` or `.section-body` for standard modals.
- Copying modal markup from: `RecordFormModal.tsx`, `CsvImportModal.tsx`,
  `StickyNotesView.tsx`, `RowPeekPanel.tsx`, `HuntProfileModal.tsx`,
  `AddToTrackerModal.tsx`, `ProjectDashboard.tsx`, `AboutView.tsx` — these
  are legacy; migrate to `<Modal>` when touched.

**Before shipping modal work — visual check**

- [ ] Sidebar icons/text are sharp (not blurred).
- [ ] Global TopBar (“ScholarDocX”, Ask AI) is sharp.
- [ ] Breadcrumbs and view header ARE blurred.
- [ ] Panel sits ~160px below the top of the work surface.

Canonical CSS and full spec:
`AI-Context/technical/frontend-visual-system.md` (“Modal backdrop blur scoping”).

- **Never expose infrastructure names or algorithm jargon in UI copy** (vectors, embeddings, chunks, pgvector, similarity, extraction, provider/model names, raw HTTP codes). See the "NO INFRASTRUCTURE OR ALGORITHM JARGON" rule above for the approved plain-language replacements.

## Expected Agent Behavior

- Keep changes scoped to the active Jira task.
- Do not start implementation if the user explicitly asks for context, planning, or documentation only.
- Prefer existing patterns once code exists.
- Do not introduce cloud services, remote databases, analytics, or telemetry unless context and user approval explicitly require it.
- Never commit secrets or real API keys.
- Keep documentation short, structured, and easy for future agents to scan.
- STRICT RULE: Do NOT create any summary `.md` files at the root of the project or anywhere else unless explicitly told by the user. All context updates must happen inside the existing files in `AI-Context/` or as a new Jira task file.
- Add or update unit tests for each feature when meaningful behavior, data transformation, validation, persistence, or integration boundaries are introduced.
