# AI-DLC Process

AI-DLC means AI-assisted development with explicit lifecycle context.

## Standard Loop

1. Understand the user request.
2. Read root rules.
3. Read relevant context.
4. Create or update Jira task.
5. Update business, functional, or technical context if needed.
6. Implement code.
7. Add or update unit tests when the feature has testable behavior.
8. Verify behavior.
9. Update Jira task completion notes.
10. Update context if implementation created new decisions.

## For Documentation-Only Tasks

If the user says not to code:

- Do not scaffold product files.
- Do not install dependencies.
- Do not start dev servers.
- Create or update docs only.

## For New Features

Before code:

- Add or refine functional requirements.
- Add acceptance criteria.
- Add technical notes.
- Create a Jira task.

## For Feature Modifications

Before code:

- Update the affected feature file.
- Update data relationships if entities change.
- Update technical context if APIs, schema, storage, or module boundaries change.
- Update the active Jira task.

## For Bug Fixes

Before code:

- Create or update a Jira task.
- Link the affected context files.
- If the bug reveals a missing rule or requirement, update context.
