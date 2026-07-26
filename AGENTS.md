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
- **NO INFRASTRUCTURE EXPOSURE TO USERS**: Never display internal backend technology or infrastructure service names (e.g., Supabase, Render, PostgreSQL) to users in the frontend UI or user-facing copy. Always use domain-appropriate abstractions (e.g., "cloud storage" instead of "Supabase storage buckets").
- **ABSOLUTE BILLING ENFORCEMENT FOR ALL CREDIT-CONSUMING OPERATIONS**: Every operation that consumes external API credits—AI chat, AI research, Tavily searches, OpenRouter calls, Gemini calls, GLM calls, Groq calls, Mistral calls, scholarship extraction, query generation, Deep Hunt operations, Advisor Atlas research, background AI tasks, and ANY other external provider call—MUST go through the centralized billing system (`ai_tokens.py`) and MUST enforce admin-configured role limits BEFORE making the external call. This is NON-NEGOTIABLE and applies to:
  - **Foreground user-initiated operations**: All `/ai/chat`, `/ai/research`, `/ai/summarize`, `/ai/actions/plan`, `/ai/actions/execute`, `/news/search`, `/news/query-preview` calls.
  - **Background asynchronous operations**: Advisor Atlas runs, Deep Hunt runs, scholarship extraction, automated research, batch processing, scheduled tasks, webhook-triggered AI operations.
  - **Administrative operations**: Admin-panel-triggered AI operations, bulk processing, system maintenance tasks that call AI providers.
  - **All provider types**: GLM, Gemini, Groq, Mistral, OpenRouter (including OpenRouter Free), Tavily (including both main and Scholarship Hunt keys), Google AI Studio, and any future provider additions.
  - **Zero exceptions**: The phrase "OpenRouter Free" or "background task" does NOT exempt an operation from billing enforcement. If it calls an external provider, it MUST be billed and gated by the user's plan limits set in the admin panel.
  - **Pre-flight validation**: Check `can_use_<provider>`, token balance, and feature-specific quotas (`can_use_scholarship_hunt`, `can_use_advisor_atlas`, `can_use_web_search`, `can_use_agents`) BEFORE calling the provider. Reject the request with a clear error if the user lacks permission or credits.
  - **Mandatory charge recording**: Every successful provider call MUST record token usage via `charge_ai_tokens` or `charge_flat_fee` so admin dashboards accurately reflect consumption and users are properly billed against their subscription or purchased token balance.
  - **Enforcement location**: Place billing checks at the service-layer entry point (e.g., `AiService.chat`, `NewsService.search`, `DeepHuntService.start_run`, `AdvisorAtlasService.run_discovery`) where the user context and session are available, NOT deep inside provider adapters or utility functions.
  - **No silent bypasses**: Do not add conditional logic that skips billing for "internal" or "system" operations. If a background task needs to call AI, it must load the user context via `load_user_dict` and charge that user's balance.
  - **Audit requirement**: When adding a new AI or search integration, explicitly document the billing enforcement in the feature's Jira task and update `AI-Context/technical/ai-integrations.md` with the billing flow.
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

Every external provider call that consumes API credits MUST be properly billed and gated. This section defines the absolute requirements that apply to ALL AI and search integrations without exception.

### Core Billing Principles

1. **Every credit-consuming operation goes through centralized billing**: All AI chat, research, summarization, drafting, agent actions, Tavily searches, OpenRouter calls, and any external provider API call MUST use `ai_tokens.py` (charge_ai_tokens, charge_flat_fee, check_available_tokens) to enforce plan limits and record usage.

2. **Admin panel is the source of truth for limits**: Plan limits configured in the admin panel (`can_use_gemini`, `can_use_glm`, `can_use_groq`, `can_use_mistral`, `can_use_web_search`, `can_use_scholarship_hunt`, `can_use_advisor_atlas`, `can_use_agents`, `can_use_purchased_tokens`, monthly AI token allowances) MUST be checked before every provider call. The configured limits apply to all users in that role.

3. **No "free" or "background" exceptions**: Operations labeled "free tier", "OpenRouter Free", "background task", "admin operation", or "internal" are NOT exempt from billing. If an operation calls an external provider, it counts against a user's quota and token balance.

4. **Pre-flight validation before external calls**: Before calling GLM, Gemini, Groq, Mistral, OpenRouter, Tavily, or any other provider:
   - Check the feature gate (`can_use_<provider>`, `can_use_<feature>`).
   - Check available token balance via `check_available_tokens` or `get_ai_token_balance`.
   - For flat-fee operations (Scholarship Hunt, Advisor Atlas, specific agent actions), check the flat-fee balance via `check_flat_fee_balance`.
   - Reject the request with an informative error if the user lacks permission or credits. Do NOT make the external call and then fail.

5. **Mandatory charge recording after successful calls**: After every successful provider response:
   - Call `charge_ai_tokens(user, token_count, session)` for token-metered operations.
   - Call `charge_flat_fee(user, fee_amount, session, category, operation_id)` for flat-fee operations.
   - Commit the charge to the database so usage dashboards and user balances remain accurate.

6. **Background tasks must load user context for billing**: Background operations (Advisor Atlas runs, Deep Hunt runs, scheduled research, webhook-triggered AI tasks) MUST load the user context via `load_user_dict(user_id, session)` and pass it to the billing service. Background tasks are not a special case—they consume the user's token balance.

7. **Service-layer enforcement point**: Billing checks belong at the service entry point where user context and session are available (e.g., `AiService.chat`, `NewsService.search`, `DeepHuntService.start_run`, `AdvisorAtlasService.run_discovery`), NOT deep inside adapters or low-level utility functions that lack user context.

8. **Audit trail for new integrations**: When adding a new AI provider, search provider, or credit-consuming feature:
   - Document the billing enforcement in the Jira task.
   - Update `AI-Context/technical/ai-integrations.md` with the billing flow.
   - Add test coverage to `tests/regression/test_limits_billing_guards.py`.
   - Verify that the admin panel plan comparison UI reflects the new limit or feature toggle.

### Provider-Specific Enforcement Requirements

| Provider | Environment Key | Plan Gate | Billing Method | Notes |
|---|---|---|---|---|
| **GLM AI** | `GLM_API_KEY` | `can_use_glm` | `charge_ai_tokens` (token-metered) | Default configured provider for Max plan users |
| **Google Gemini** | `GEMINI_API_KEY` | `can_use_gemini` | `charge_ai_tokens` (token-metered) | Default for Free/General/Pro; user selects chat + background models |
| **Groq** | `GROQ_API_KEY` | `can_use_groq` | `charge_ai_tokens` (token-metered) | Available to Pro/Max users |
| **Mistral** | `MISTRAL_API_KEY` | `can_use_mistral` | `charge_ai_tokens` (token-metered) | Available to Max users |
| **OpenRouter** | `OPENROUTER_API_KEY` | Varies by endpoint | `charge_ai_tokens` or `charge_flat_fee` | Used for Scholarship Hunt query preview (`/news/query-preview`), Deep Hunt query planner, Deep Hunt relevance filter. Even "OpenRouter Free" calls count against user balance |
| **Tavily (main)** | `TAVILY_API_KEY` | `can_use_web_search` | `charge_flat_fee` (per-search flat fee) | Used by `/ai/research` web research flow; gated by `can_use_web_search` + session/monthly research limits |
| **Tavily (Scholarship Hunt)** | `TAVILY_API_KEY_SCHOLARSHIP_HUNT` | `can_use_scholarship_hunt` | `charge_flat_fee` (per-search flat fee) | Used by `/news/search` and Scholarship Hunt catalog cycle checks; gated by `can_use_scholarship_hunt` + daily/monthly limits |

### Feature-Specific Enforcement Checklist

**AI Assistant Chat (`/ai/chat`)**:
- Check `can_use_<provider>` for the configured chat provider.
- Check `ai_messages_per_session` limit.
- Check token balance before provider call.
- Charge tokens after successful response.
- Enforce `can_use_web_search` if the routing prompt triggers Tavily.

**AI Research (`/ai/research`)**:
- Check `can_use_web_search`.
- Check `web_searches_per_session` and `web_searches_per_month` limits.
- Charge flat fee for the Tavily search.
- Charge tokens for the synthesis call via the configured provider.

**AI Summarization (`/ai/summarize`)**:
- Check `can_use_<provider>` for the configured background model.
- Check token balance.
- Charge tokens after successful summary.

**Agent Actions (`/ai/actions/plan`, `/ai/actions/execute`)**:
- Check `can_use_agents`.
- For plan generation: check `can_use_<provider>` and token balance, then charge tokens.
- For execute: enforce create-action role limits (total_projects, total_sheets, etc.) via `check_and_increment_limit`.

**Scholarship Hunt (`/news/query-preview`, `/news/search`)**:
- Check `can_use_scholarship_hunt`.
- Check `news_searches_per_day` and `news_searches_per_month` limits.
- Query preview: charge tokens for the OpenRouter Free call (even though the model is "free", the user's token balance must be sufficient).
- Search: charge flat fee for the Tavily Scholarship Hunt call.

**Advisor Atlas (`/advisor-atlas/run-discovery`, `/advisor-atlas/request-update`)**:
- Check `can_use_advisor_atlas`.
- Check `advisor_atlas_searches_per_month` limit.
- Charge flat fee at run start (one unit per run or refresh).
- All internal Tavily calls and GLM/vision calls during the run count against the user's token and flat-fee balances.

**Deep Hunt (`/deep-hunt/start`, background scholarship extraction)**:
- Check `can_use_scholarship_hunt` (Deep Hunt is a Scholarship Hunt feature).
- Check monthly Deep Hunt run limit if configured.
- Charge flat fee for each run.
- Query planner (OpenRouter Free) and relevance filter (OpenRouter Free) MUST charge tokens.
- Scholarship extraction (configured provider or OpenRouter Free fallback) MUST charge tokens.

### Enforcement Testing Requirements

When touching any billing-related code:
- Run `tests/regression/test_limits_billing_guards.py` to verify existing guards hold.
- Add a new test case if introducing a new provider, feature, or billing flow.
- Verify that rejected requests (insufficient tokens, missing gate, exceeded quota) return clear user-facing error messages without exposing provider internals.
- Verify that successful operations correctly decrement the user's subscription_remaining and/or purchased_remaining token buckets in `ai_tokens` table.

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

- **Never expose infrastructure names in UI copy.** (See STRICT ENFORCEMENTS above.)

## Expected Agent Behavior

- Keep changes scoped to the active Jira task.
- Do not start implementation if the user explicitly asks for context, planning, or documentation only.
- Prefer existing patterns once code exists.
- Do not introduce cloud services, remote databases, analytics, or telemetry unless context and user approval explicitly require it.
- Never commit secrets or real API keys.
- Keep documentation short, structured, and easy for future agents to scan.
- STRICT RULE: Do NOT create any summary `.md` files at the root of the project or anywhere else unless explicitly told by the user. All context updates must happen inside the existing files in `AI-Context/` or as a new Jira task file.
- Add or update unit tests for each feature when meaningful behavior, data transformation, validation, persistence, or integration boundaries are introduced.
