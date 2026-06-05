# SCHOLAR-0013: Local-First MVP Completion

Status: Done

Owner: AI Agent

Created: 2026-05-27

## Summary

Build the documented ScholarDock MVP from the backlog: local workspace initialization, SQLite data model, dashboard, hierarchy, documents, file metadata/uploads, email outreach, reminders, and AI assistant provider boundary.

## Business Context

Links:

- [product-vision.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/business/product-vision.md)
- [business-requirements.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/business/business-requirements.md)
- [decisions.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/business/decisions.md)

Business value:

Turns the context foundation into a usable local-first application portal.

## Functional Context

Links:

- [requirements-index.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/requirements-index.md)
- [feature-map.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-map.md)
- [acceptance-criteria.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/acceptance-criteria.md)

Requirements:

- FR-1.1 through FR-1.4
- FR-2.1 through FR-2.5
- FR-3.1 through FR-3.5
- FR-4.1 through FR-4.4
- FR-5.1 through FR-5.4

## Technical Context

Links:

- [architecture-overview.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/architecture-overview.md)
- [stack-and-runtime.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/stack-and-runtime.md)
- [local-storage-and-data.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/local-storage-and-data.md)
- [testing-strategy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/testing-strategy.md)

Technical notes:

- Use React/Vite frontend.
- Use FastAPI backend.
- Use SQLite and local workspace media.
- AI calls must stay backend-side and degrade gracefully when keys are missing.

## Scope

In scope:

- Backend workspace initialization.
- SQLite schema and CRUD endpoints.
- Dashboard summary endpoint.
- Static file upload and metadata.
- Document versioning endpoints.
- Email template/draft/outreach/reminder endpoints.
- AI chat/research endpoints with provider-boundary fallback.
- React MVP interface for core workflows.
- Backend unit tests.
- README and context updates.

Out of scope:

- Google OAuth implementation.
- SMTP sending.
- Hosted backend.
- Cloud sync.
- Full rich-text editor package; MVP uses a rich text-like textarea with version storage.

## Acceptance Criteria

- App runs locally with backend and frontend commands.
- Workspace folders and SQLite database are created automatically.
- User can create hierarchy and application records.
- Dashboard aggregates applications, deadlines, reminders, and counts.
- User can create documents and versions.
- User can upload/register files and link metadata.
- User can create email templates, drafts, outreach logs, and reminders.
- AI module responds safely when keys are missing.
- Unit tests cover core backend behavior.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Workspace initialization.
- CRUD repository behavior.
- Dashboard aggregation.
- Email template rendering.
- AI missing-key fallback.
- File path safety.

## File Size Check

Line-count risk:

- Medium

Expected mitigation:

- Split backend into core, db, services, and API modules.
- Split frontend into components, API client, and data constants.

## Verification Plan

- Run backend unit tests.
- Run frontend build.
- Start backend and frontend.
- Browser-check main MVP UI.

## Completion Notes

Changed files:

- [backend/app](/Users/fahadpathan/Documents/ScholarDock/backend/app)
- [backend/tests](/Users/fahadpathan/Documents/ScholarDock/backend/tests)
- [frontend/src](/Users/fahadpathan/Documents/ScholarDock/frontend/src)
- [README.md](/Users/fahadpathan/Documents/ScholarDock/README.md)
- [.env.example](/Users/fahadpathan/Documents/ScholarDock/.env.example)

Verification completed:

- `.venv/bin/pytest`: 9 passed.
- `npm run build`: passed.
- `curl -s http://127.0.0.1:8000/api/health`: returned ok.
- Browser smoke test: dashboard loaded and a university was created through the UI.

Unit tests added or updated:

- Workspace initialization and safe media path tests.
- SQLite store, dashboard aggregation, template rendering, and outreach reminder tests.
- AI missing-key fallback tests.

Follow-ups:

- Add edit/delete controls in frontend lists.
- Replace MVP textarea with a richer editor such as TipTap.
- Add frontend unit/component tests once UI flows stabilize.
- Add Google OAuth only when Google integrations are prioritized.
- Project workspace layer added in SCHOLAR-0014.
