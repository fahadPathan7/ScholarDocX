# SCHOLARDOCX-0045: Document Pin Fetch Fix

Status: Done

Owner: AI Agent

Created: 2026-05-28

## Summary

Document local pin and dashboard pin still show a browser `Failed to fetch`
toast. The backend route works directly, so fix the browser/API connection path
and local development CORS handling.

## Functional Context

Links:
- [feature-documents-storage.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-documents-storage.md)

## Requirements

- Document pin and dashboard-pin actions should complete from the browser.
- The frontend should not hard-code an API host that can mismatch the page host.
- Local development CORS should support loopback and private local origins used
  by the Vite dev server.
- Preserve local-first behavior.

## Verification Plan

- Run frontend build.
- Run focused backend tests.
- Smoke-check the static file PATCH route.

## Implementation Notes

- Changed the frontend API base fallback to derive from the current page host
  instead of hard-coding `localhost`.
- Added a local/private-origin CORS regex so loopback and LAN dev URLs can make
  PATCH requests without browser-level fetch failures.
- Kept the existing `/static_files/{id}` document pin route and payload shape.

## Changed Files

- `/Users/fahadpathan/Documents/ScholarDocX/frontend/src/lib/api.ts`
- `/Users/fahadpathan/Documents/ScholarDocX/backend/app/core/config.py`
- `/Users/fahadpathan/Documents/ScholarDocX/backend/app/main.py`
- `/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/api-boundaries.md`

## Verification

- Passed: `npm run build` in `/Users/fahadpathan/Documents/ScholarDocX/frontend`.
- Passed: `pytest tests/test_store.py tests/test_workspace.py` in
  `/Users/fahadpathan/Documents/ScholarDocX/backend`.
- Browser smoke checked the Documents CV modal: dashboard pin and local pin both
  completed without an error toast and updated the visible button labels.
- Reverted the temporary pin state changes made during smoke verification.
