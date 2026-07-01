---
name: scholardocx-test-cases
description: Use for ScholarDocX test planning, unit tests, integration tests, UI flow checks, regression tests, and verification notes. Applies when features include meaningful behavior, data transformation, validation, persistence, API boundaries, AI provider boundaries, or UI workflows.
---

# ScholarDocX Test Cases

## Test Selection

- Backend: use pytest for services, repositories, validation, API boundaries, workspace file handling, and AI provider mocks.
- Frontend: use the existing frontend test setup when present; otherwise prefer focused component or utility tests that match current tooling.
- Browser verification: required for UI layout, overflow, responsive behavior, modal/dialog behavior, and visual polish tasks.

## Cover First

- Path safety and local workspace initialization.
- SQLite persistence and migrations or schema changes.
- Request/response validation.
- AI provider fallback and key-missing behavior.
- UI failure, loading, empty, and disabled states.
- Regression cases named by the user or Jira acceptance criteria.

## When Tests Are Not Added

Record the reason in the Jira task. Acceptable reasons include docs-only work, pure context updates, or no test harness for a changed surface when browser/manual verification is more direct.

## Verification Notes

Log exact commands and outcomes in the Jira task, for example:

```bash
cd backend && pytest
cd frontend && npm run build
```

If a command fails because of unrelated existing issues, document the first relevant error and continue with narrower checks when possible.
