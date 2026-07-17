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

When starting a new story or task:

1. **Switch to `main`**:
   ```bash
   git checkout main
   ```

2. **Update Local `main`**: Ensure you have the latest source from the remote origin:
   ```bash
   git pull origin main
   ```

3. **Create the Branch**: Switch to the branch using a descriptive, ticket-prefixed name:
   ```bash
   git checkout -b <type>/SCHOLARDOCX-[number]-[slug]
   ```

4. **Verify Setup**: Confirm that the workspace compiles and runs on the new branch before writing code:
   ```bash
   # Frontend
   npm run build
   # Backend
   pytest
   ```

---

## 3. Best Practices

* **Scope and Size**: Keep branches focused. One branch should correspond to a single Jira story or bug fix. Avoid packing unrelated changes together.
* **Database Safety**: Never run migration test suites or seeding scripts against production databases. Always check that the environment target points to a test/local target.
* **Secrets Management**: Do not commit private environment files (`.env`), API credentials, or certificates. Ensure they are explicitly ignored in `.gitignore`.
* **Cleanup on Complete**: Once a branch is merged, delete the local and remote copy to prevent clutter.
