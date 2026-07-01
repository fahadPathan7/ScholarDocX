# File Size And Modularity

## Policy

- Target maximum source file length: 1000 lines.
- Temporary grace limit: 1150 lines.
- A feature may push a file from around 950 lines to around 1150 lines if the change is cohesive.
- After that feature, split the file before adding more work.

## Required Behavior For AI Agents

Before editing a large source file:

1. Check line count.
2. If over 900 lines, consider extraction.
3. If the task pushes it over 1000 lines, document why in the Jira task.
4. If it reaches over 1150 lines, split it before the task is complete unless the user pauses the work.

## Known Large Files

The current codebase has inherited large files above the target. Treat these as known debt, not permission to expand them further:

- `frontend/src/styles.css`
- `frontend/src/components/AdminView.tsx`
- `backend/app/services/ai_actions.py`
- `frontend/src/visual-refresh.css`
- `frontend/src/components/ProjectWorkspace.tsx`
- `frontend/src/App.tsx`

When a task touches one of these files, prefer extracting focused CSS, components, hooks, services, or helpers in the same area. Do not start a broad unrelated refactor just because the file is already large; keep cleanup scoped to the active Jira task.

## Split Strategies

Frontend:

- Extract child components.
- Extract hooks.
- Extract schema and validation.
- Extract table columns, filters, and actions.
- Extract feature services.

Backend:

- Extract service methods.
- Extract repository modules.
- Extract schema files.
- Extract provider clients.
- Extract utility functions.
- Split large route files by resource or workflow.

Tests:

- Split fixtures.
- Split integration tests by workflow.
- Split unit tests by module.

## Anti-Patterns

- One file for all API routes.
- One dashboard component containing all cards, queries, filters, and modals.
- One service handling unrelated workflows.
- Provider-specific API calls mixed into application logic.
- Large constants embedded in components.
