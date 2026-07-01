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
- [technical](technical): architecture, stack, storage, APIs, coding rules, testing.
- [planbook](planbook): detailed pre-implementation plans for large or cross-module features.
- [jira-tasks](jira-tasks): task files used to execute work.
- [workflows](workflows): the process rules for AI development (ai-dlc-process.md).
- (Skills are natively integrated into `.agents/skills`, `.claude/skills`, and `.codex/skills`).

## AI-DLC Reading Strategy

For any implementation task:

1. Read the root agent rules.
2. Read this file.
3. Read relevant repo-carried skills from `.agents/skills`, `.claude/skills`, or `.codex/skills`.
4. Read the active Jira task.
5. Read the relevant planbook when the Jira task links one.
6. Read only the relevant files from business, functional, and technical context.
7. Update context before code when requirements or design change.

## Context Update Rule

Every new feature or modification must update context before implementation.

Update:

- Business context when the "why", user value, product scope, privacy posture, or success metric changes.
- Functional context when user-visible behavior, workflow, entities, or acceptance criteria change.
- Technical context when architecture, stack, APIs, data model, storage, integration, or code organization changes.
- Jira task context whenever work starts, scope changes, or work completes.

## Naming Rules

- Business requirement IDs: `BR-###`
- Functional requirement IDs: `FR-#.#`
- Technical decision IDs: `TD-###`
- Business decision IDs: `BD-###`
- Jira task IDs: `SCHOLARDOCX-####`
- Prefer relative links for repository files so context remains valid if the workspace moves.
