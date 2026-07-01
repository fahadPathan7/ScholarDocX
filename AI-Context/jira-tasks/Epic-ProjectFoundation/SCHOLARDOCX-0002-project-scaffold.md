# SCHOLARDOCX-0002: Project Scaffold

Status: Done

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-05-27

## Summary

Choose the final local app stack and create the initial frontend/backend scaffold.

Do not execute this task until the user explicitly asks to start coding or scaffolding.

## Business Context

Links:

- [product-vision.md](../../business/product-vision.md)
- [decisions.md](../../business/decisions.md)

Business value:

Creates the technical foundation for a local-first, zero-infrastructure application portal.

## Functional Context

Links:

- [requirements-index.md](../../functional/requirements-index.md)

Requirements:

- Supports future implementation of FR-1 through FR-5.

## Technical Context

Links:

- [stack-and-runtime.md](../../technical/stack-and-runtime.md)
- [project-structure.md](../../technical/project-structure.md)
- [architecture-overview.md](../../technical/architecture-overview.md)

Technical notes:

- Frontend framework selected: React/Vite/TypeScript/Tailwind.
- Backend selected: FastAPI.
- Database selected: SQLite.
- Backend dependency manager selected: `pip` with `requirements.txt`.
- Frontend package manager selected: `npm`.

## Scope

In scope:

- Select frontend framework.
- Select package managers.
- Scaffold frontend.
- Scaffold backend.
- Add basic development run instructions.
- Add initial `.env.example`.

Out of scope:

- Implementing application features.
- Building database schema beyond placeholder setup.
- Calling GLM or Tavily.

## Acceptance Criteria

- Frontend and backend folders exist.
- Local development commands are documented.
- `.env.example` lists expected keys without real secrets.
- Project structure context is updated to match reality.
- No source file exceeds file-size policy.

## File Size Check

Line-count risk:

- Low

## Verification Plan

- Run frontend build or dev server smoke test.
- Run backend startup or test command.
- Confirm docs reflect actual commands.

## Completion Notes

Changed files:

- [backend](../../../backend)
- [frontend](../../../frontend)
- [.env.example](../../../.env.example)
- [README.md](../../../README.md)

Verification completed:

- Backend tests passed.
- Frontend build passed.
- Backend health endpoint responded.
- Browser smoke test passed.

Unit tests added or updated:

- Backend tests added under [backend/tests](../../../backend/tests).
