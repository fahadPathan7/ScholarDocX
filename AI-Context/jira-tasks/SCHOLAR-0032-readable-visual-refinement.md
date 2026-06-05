# SCHOLAR-0032: Readable Visual Refinement

Status: In Progress

Owner: AI Agent

Created: 2026-05-27

## Summary

Refine the visual refresh so typography and colors are easier to read, the
main header is smaller, and Documents uses a practical split layout where the
upload panel does not stretch and the uploaded documents panel scrolls.

## Functional Context

Links:

- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md)
- [feature-about-profile.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-about-profile.md)

Requirements:

- Dashboard and workspace header text should be readable and not oversized.
- Color contrast should make labels, section headings, and document text easy to understand.
- Documents upload panel should stay content-height instead of stretching.
- Uploaded Documents panel should have its own scroll area.

## Technical Context

Links:

- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/file-size-and-modularity.md)

Technical notes:

- Keep broad refinements in `frontend/src/visual-refresh.css`.
- Keep component changes small and targeted to class names when needed.

## Scope

In scope:

- Typography scale and font stack refinement.
- Readability-focused color tuning.
- Documents layout and scroll fix.
- Cleanup for malformed/duplicated document CSS selector.

Out of scope:

- New document management behavior.
- Backend or persistence changes.

## Acceptance Criteria

- Header title is visibly smaller and easier to read.
- Display font no longer uses the chunky serif-like face.
- Documents upload panel fits its content.
- Uploaded Documents panel scrolls internally.
- Frontend build passes.

## Verification Plan

- Run `npm run build` in `frontend`.
- Browser-check Documents and dashboard for readability, scroll, and overflow.
