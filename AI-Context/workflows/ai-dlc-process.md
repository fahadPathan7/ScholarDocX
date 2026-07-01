# AI-DLC Process

AI-DLC means AI-assisted development with explicit lifecycle context.

## Standard Loop

1. Understand the user request.
2. Read root rules.
3. Read relevant context.
4. Check for an existing Epic folder in `AI-Context/jira-tasks/` (or create one). Create or update the Jira task inside it.
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
- Create an Epic folder in `AI-Context/jira-tasks/` if this feature doesn't belong to an existing one.
- Create a Jira task (story) inside the Epic folder.
- **Define explicit user roles/permissions required for the feature.**

## For Feature Modifications

Before code:

- **Analyze Blast Radius**: Search the codebase for all usages of the target component/function to identify related tasks and dependents.
- Update the affected feature file.
- Update data relationships if entities change.
- Update technical context if APIs, schema, storage, or module boundaries change.
- Update the active Jira task.

## For Bug Fixes

Before code:

- Create or update a Jira task.
- Link the affected context files.
- If the bug reveals a missing rule or requirement, update context.
