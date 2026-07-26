# Git Branch Creation Guide

This document outlines the standard branch naming conventions, creation workflows, and best practices for AI agents and developers working on the ScholarDocX codebase.

---

## 1. Branch Naming Conventions

To keep the repository history clean and readable, always prefix branch names with the type of work being performed, followed by a slash and a hyphen-delimited descriptive slug.

| Prefix | Use Case | Example |
| :--- | :--- | :--- |
| `feat/` | Introducing a new feature or capability | `feat/whiteboard-quota-guard` |
| `fix/` | Fixing a bug, UI regression, or incorrect behavior | `fix/admin-user-refresh` |
| `refactor/` | Modifying code structure without altering external behavior | `refactor/api-response-models` |
| `chore/` | Updating dependencies, build pipelines, or configuration files | `chore/update-pytest-dependencies` |
| `docs/` | Editing documentation or context files without code changes | `docs/update-dlc-workflow` |

### Jira Ticket Integration
If a task has an associated Jira story, include the ticket identifier right after the prefix:
* Format: `<type>/SCHOLARDOCX-[ticket_number]-[slug]`
* Example: `fix/SCHOLARDOCX-0142-plan-comparison-ui-polish`

---

## 2. Branch Creation Workflow

**MANDATORY WORKFLOW - NO EXCEPTIONS**: When starting a new story or task, AI agents and developers MUST follow these steps IN ORDER. Skipping any step violates the project's git hygiene rules.

1. **Switch to `main`** (REQUIRED - NEVER create branches from feature branches):
   ```bash
   git checkout main
   ```
   **Why this matters**: Creating a branch from an outdated or feature branch creates merge conflicts and pollutes the git history with unrelated changes.

2. **Update Local `main`** (REQUIRED - NEVER skip pulling latest changes):
   ```bash
   git pull origin main
   ```
   **Why this matters**: Working from an outdated main causes merge conflicts, duplicated work, and context drift. You must have the latest code before branching.

3. **Create the Branch** (REQUIRED - Use the correct naming convention):
   ```bash
   git checkout -b <type>/SCHOLARDOCX-[number]-[slug]
   ```
   **Why this matters**: Consistent naming allows automated tooling, clear PR reviews, and traceable git history.

4. **Verify Setup** (RECOMMENDED - Confirm the workspace is healthy before coding):
   ```bash
   # Frontend
   npm run build
   # Backend
   pytest
   ```
   **Why this matters**: Starting from a broken state wastes time debugging issues you didn't create.

---

### AI Agent Enforcement Rule

**STRICT MANDATE FOR ALL AI AGENTS**: When a user asks to "create a branch and push", "push changes", or "commit and push", the AI agent MUST:

1. ✅ Execute `git checkout main` (switch to main)
2. ✅ Execute `git pull origin main` (update main from remote)
3. ✅ Execute `git checkout -b <branch-name>` (create new branch from updated main)
4. ✅ Stage, commit, and push changes

**VIOLATION CONSEQUENCES**: Skipping steps 1 or 2 creates:
- Merge conflicts with unrelated changes from stale branches
- Git history pollution with commits that don't belong to the current task
- Context drift where the AI is working with outdated code assumptions
- Wasted reviewer time resolving conflicts that should never have existed

**NO SHORTCUTS**: Even if the current branch appears up-to-date, ALWAYS follow the full workflow. The cost of following the process (2 extra commands) is negligible compared to the cost of fixing merge conflicts and history pollution.

---

## 3. Best Practices

* **Scope and Size**: Keep branches focused. One branch should correspond to a single Jira story or bug fix. Avoid packing unrelated changes together.
* **Database Safety**: Never run migration test suites or seeding scripts against production databases. Always check that the environment target points to a test/local target.
* **Secrets Management**: Do not commit private environment files (`.env`), API credentials, or certificates. Ensure they are explicitly ignored in `.gitignore`.
* **Cleanup on Complete**: Once a branch is merged, delete the local and remote copy to prevent clutter.
