# Architecture Overview

ScholarDocX is a cloud-deployed web app (SCHOLARDOCX-0139): a React single-page
frontend, a FastAPI backend, PostgreSQL for structured data, and object storage for
uploaded files. Stack, hosting, and connection details live in
[stack-and-runtime.md](stack-and-runtime.md).

```text
Browser (React/Vite SPA)
  |  HTTPS, JWT
  v
FastAPI backend ──> PostgreSQL (per-user rows, row-level isolation)
  |            └──> Object storage (uploaded documents)
  |
  └──> AI / search / billing providers (server-side keys, explicit user actions)
```

## Boundaries

- Frontend: UI state, forms, views, interactions. Never calls an AI or search provider directly.
- Backend: persistence, validation, file operations, provider calls, billing and limits ([billing-contract.md](billing-contract.md)).
- Database: structured data. Object storage: binary files. Neither is reachable from the browser except through the API.

## Priorities

1. Per-user data isolation and privacy ([security-privacy.md](security-privacy.md)).
2. Free-tier hosting cost.
3. Clear module boundaries and a testable service layer.
4. Maintainability for AI coding agents (small files, context kept current).

## Avoid

- Direct provider calls from the frontend.
- Browser access to arbitrary storage paths.
- Large all-in-one route files or UI pages (see the file-size rule in [CODE_RULES.md](../CODE_RULES.md)).
