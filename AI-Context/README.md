# AI-Context

This folder stores compact, structured project context for AI-DLC development.

The goal is to let future AI agents understand the project without repeatedly loading long chats or the entire codebase.

## Historical Source Notes

The initial project idea came from two root Markdown files:

1. `business.md`
2. `functional.md`

Those files were deleted after their content was absorbed into this refined working context.

## Folder Map

- [business](business): product goals, users, business decisions, success metrics, risks.
- [functional](functional): features, requirements, relationships, acceptance criteria.
- [technical](technical): architecture, stack, storage, APIs, coding rules, testing, and [responsive-design-system](technical/responsive-design-system.md).
- [planbook](planbook): detailed pre-implementation plans for large or cross-module features.
- [jira-tasks](jira-tasks): task files used to execute work.
- [workflows](workflows): the process rules for AI development (ai-dlc-process.md, branch-creation.md).
- (Skills are natively integrated into `.agents/skills`, `.claude/skills`, and `.codex/skills`).

## AI-DLC Reading Strategy

For any implementation task:

1. Read the root agent rules (AGENTS.md—includes billing enforcement).
2. Read this file.
3. Read relevant repo-carried skills from `.agents/skills`, `.claude/skills`, or `.codex/skills`.
4. Read the active Jira task.
5. Read the relevant planbook when the Jira task links one.
6. Read only the relevant files from business, functional, and technical context.
7. Update context before code when requirements or design change.

**BILLING ENFORCEMENT MANDATE**: If the task involves ANY AI provider (GLM, Gemini, Groq, Mistral, OpenRouter), search provider (Tavily), or credit-consuming operation (chat, research, summarization, agent actions, Scholarship Hunt, Advisor Atlas, Deep Hunt), you MUST:
- Read `technical/ai-integrations.md` to understand the provider integration boundaries.
- Read `technical/billing-and-payments.md` to understand the token economy and Polar subscription model.
- Verify that the feature enforces role-based plan gates (`can_use_<provider>`, `can_use_<feature>`) BEFORE calling the external provider.
- Verify that successful calls record token usage via `charge_ai_tokens` or `charge_flat_fee` from `ai_tokens.py`.
- Verify that background tasks load user context via `load_user_dict` and charge the user's balance.
- If introducing a new provider or feature, document the billing enforcement in the Jira task and update `ai-integrations.md`.

NO EXCEPTIONS: Even operations labeled "free tier", "background task", "OpenRouter Free", or "admin operation" MUST enforce billing. If it calls an external provider, it consumes user credits and must be gated by admin-configured plan limits.

## Context Update Rule

Every new feature or modification must update context before implementation.

Update:

- Business context when the "why", user value, product scope, privacy posture, or success metric changes.
- Functional context when user-visible behavior, workflow, entities, or acceptance criteria change.
- Technical context when architecture, stack, APIs, data model, storage, integration, or code organization changes.
- Jira task context whenever work starts, scope changes, or work completes.

## Billing Enforcement Context Rule

When working on ANY feature that calls external AI providers (GLM, Gemini, Groq, Mistral, OpenRouter) or search providers (Tavily):

1. **Before implementation**:
   - Confirm the feature has a documented billing flow in `technical/ai-integrations.md`.
   - Confirm the admin panel exposes the relevant plan gate (`can_use_<provider>`, `can_use_<feature>`) for admins to configure per role.
   - Confirm token balance checks and charge recording are part of the service-layer entry point.

2. **During implementation**:
   - Place billing enforcement at the service entry point (e.g., `AiService.chat`, `NewsService.search`, `AdvisorAtlasService.run_discovery`) where user context and database session are available.
   - Use `check_available_tokens(user, session)` or `check_flat_fee_balance(user, fee, session)` BEFORE calling the external provider.
   - Use `charge_ai_tokens(user, tokens, session)` or `charge_flat_fee(user, fee, session, category, operation_id)` AFTER a successful provider response.
   - For background tasks, load user context via `load_user_dict(user_id, session)` and pass it to the billing service.
   - Return clear user-facing errors (e.g., "Insufficient AI credits", "Feature not available in your plan") when a pre-flight check fails. Do NOT expose provider names or internal error details.

3. **After implementation**:
   - Update the Jira task to document the billing enforcement.
   - Update `technical/ai-integrations.md` with the new provider or feature's billing flow.
   - Add test coverage to `tests/regression/test_limits_billing_guards.py`.
   - Verify the admin panel Plan Comparison UI reflects the new limit or gate.

**ENFORCEMENT CHECKLIST FOR CODE REVIEW**:
- [ ] Feature checks `can_use_<provider>` or `can_use_<feature>` gate before calling external provider.
- [ ] Feature checks token or flat-fee balance before calling external provider.
- [ ] Feature calls `charge_ai_tokens` or `charge_flat_fee` after successful provider response.
- [ ] Background tasks load user dict and charge user balance (no silent bypasses).
- [ ] Error responses are user-friendly and do not expose provider internals.
- [ ] `technical/ai-integrations.md` documents the billing flow.
- [ ] Jira task documents billing enforcement.
- [ ] `test_limits_billing_guards.py` includes test coverage.

## Naming Rules

- Business requirement IDs: `BR-###`
- Functional requirement IDs: `FR-#.#`
- Technical decision IDs: `TD-###`
- Business decision IDs: `BD-###`
- Jira task IDs: `SCHOLARDOCX-####`
- Prefer relative links for repository files so context remains valid if the workspace moves.
