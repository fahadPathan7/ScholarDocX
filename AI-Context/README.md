# AI-Context

Compact, structured project context for AI-DLC development. The goal is to let a
future agent understand the project without replaying long chats or reading the
whole codebase.

**This file is a map, not a brain.** It says where things live and in what order
to read them. It deliberately holds no rules of its own — a duplicated rule is a
rule that will drift, and this file used to carry ~55 lines of billing detail
that named four functions which never existed (SCHOLARDOCX-0205).

## Folder Map

| Folder | Holds | Lifetime |
|---|---|---|
| [business](business) | goals, users, decisions, metrics, risks | living — must match today |
| [functional](functional) | features, requirements, acceptance criteria | living — must match today |
| [technical](technical) | architecture, stack, storage, APIs, integrations, testing | living — must match today |
| [workflows](workflows) | the AI-DLC process rules themselves | living — must match today |
| [planbook](planbook) | pre-implementation plans for large features | point-in-time |
| [jira-tasks](jira-tasks) | task files used to execute work | point-in-time |

The lifetime column matters. **Living context describes the present** and is
corrected when the code moves. **Point-in-time files describe a moment** — a
completed task naming a file that was later deleted is an accurate record, not a
defect, and editing it to match today would falsify history. The drift guard
checks living context only, for exactly this reason.

Skills live in `.agents/skills`, `.claude/skills`, and `.codex/skills`.

## Reading Order

1. Root agent rules: [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), [CODE_RULES.md](CODE_RULES.md).
2. This file.
3. The relevant repo-carried skill.
4. The active Jira task.
5. The planbook entry, when the task links one.
6. Only the business / functional / technical files the task actually touches.

Update context before code whenever requirements or design change.

## Where The Rules Live

Each rule has exactly one home. Link to it; do not restate it.

| Topic | Source |
|---|---|
| Billing and credit enforcement | [technical/billing-contract.md](technical/billing-contract.md) |
| Credit economy, balances, coverage | [technical/ai-token-economy.md](technical/ai-token-economy.md) |
| Subscriptions and payment | [technical/billing-and-payments.md](technical/billing-and-payments.md) |
| Provider integration detail | [technical/ai-integrations.md](technical/ai-integrations.md) |
| File size, modularity, testing | [CODE_RULES.md](CODE_RULES.md) |
| Security, privacy, data boundaries | [technical/security-privacy.md](technical/security-privacy.md) |
| UI, theming, responsiveness | [technical/frontend-visual-system.md](technical/frontend-visual-system.md), [technical/responsive-design-system.md](technical/responsive-design-system.md) |
| Process, handoff, branching | [workflows](workflows) |

**If the task touches any AI or search provider**, read
[technical/billing-contract.md](technical/billing-contract.md) first. It is the
one normative source, and `make guard-billing` / `make guard-context` enforce it.

## Context Update Rule

- **Business** — when the "why", user value, scope, privacy posture, or a
  success metric changes.
- **Functional** — when user-visible behaviour, workflow, entities, or
  acceptance criteria change.
- **Technical** — when architecture, stack, APIs, data model, storage,
  integration, or code organisation changes.
- **Jira task** — when work starts, scope changes, or work completes.

## Naming Rules

| Kind | Format |
|---|---|
| Business requirement | `BR-###` |
| Functional requirement | `FR-#.#` |
| Technical decision | `TD-###` |
| Business decision | `BD-###` |
| Jira task | `SCHOLARDOCX-####` |

Use relative links for repository files so context survives a move.

## Auditing This Folder

Run the `scholardocx-context-audit` skill. It runs the mechanical drift check
first, then works through the judgment questions the script cannot answer —
staleness, contradiction, duplication, and orphaned context.

## Historical Note

The project began as two root files, `business.md` and `functional.md`. Both were
deleted after their content was absorbed here.
