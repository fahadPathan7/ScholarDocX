# Architecture Overview

ScholarDocX should be built as a local-first application with a frontend UI, local backend API, SQLite database, and local media workspace.

## Initial Architecture

```text
Browser UI
  |
  | HTTP on localhost
  v
FastAPI backend
  |
  | SQL
  v
SQLite database
  |
  | file paths
  v
Local workspace media files

FastAPI backend
  |
  | optional external API calls
  v
GLM AI API and Tavily API
```

## Core Boundaries

- Frontend handles UI state, forms, views, and user interactions.
- Backend owns persistence, workspace initialization, file operations, AI provider calls, and validation.
- SQLite stores structured metadata.
- Local file system stores uploaded or generated binary files.
- External APIs are called only by backend integration services.

## Architectural Priorities

1. Local data ownership.
2. Simple setup.
3. Clear module boundaries.
4. Testable service layer.
5. AI-DLC maintainability.

## Avoid

- Direct AI API calls from the frontend.
- Browser access to arbitrary local file paths.
- Large all-in-one route files.
- Large all-in-one UI pages.
- Remote database assumptions.

