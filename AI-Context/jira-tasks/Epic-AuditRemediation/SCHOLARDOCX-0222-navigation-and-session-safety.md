# SCHOLARDOCX-0222: Navigation & session safety (audit batch 6)

Status: Review

Owner: AI Agent

Epic: Epic-AuditRemediation

Created: 2026-11-01

## Summary

Three audit findings whose common theme is the browser session: tab state
moves into the URL (deep links, working Back, reload persistence), the Ask AI
composer stops locking during a pending answer (queue instead), and file
downloads stop putting the 30-day session token into URLs/history/logs by
switching to short-lived, file-scoped download tokens.

## Business Context

Links:

- Business file: [../business/decisions.md](../../business/decisions.md)

Business value:

- Views become bookmarkable/shareable; browser Back stops exiting the app.
- Users can compose their next question while an answer is being written.
- A leaked file URL (shared, screenshotted, logged) expires in minutes and reveals nothing else.

## Functional Context

Links:

- Functional file: [../functional/feature-ai-assistant.md](../../functional/feature-ai-assistant.md)

Requirements:

- Each main tab has a URL path; Back/Forward navigate between tabs; reload lands on the same view.
- Sending while an answer is pending queues the message instead of blocking the composer.
- File open/download uses a per-file, 5-minute token; the long-lived session token never appears in a URL the browser navigates to.

## Technical Context

Links:

- Technical file: [../technical/security-privacy.md](../../technical/security-privacy.md)

Technical notes:

- URL routing: shadow-wrapped `setActiveTab` (pushState on change) + popstate listener + initial tab from `location.pathname`. render.yaml already ships an SPA fallback, so reload/deep links resolve to index.html.
- Download tokens: HS256 JWT with `purpose=file_download`, `file_id`, 5-min `exp`; `view_file_content` accepts it as an alternative to session auth (ownership still enforced: the token is file-scoped AND the lookup is user-scoped). Legacy `?token=` remains accepted so existing links keep working.
- Queue (not abort): aborting a fetch would discard an answer the user is charged for — instead the composer stays enabled and pending sends run when the current one finishes.

## Scope

In scope:

- Frontend: tab↔path mapping in App.tsx; composer queue in FloatingAssistant; download-link flow in App.tsx (documents), SheetRecordFields, DashboardView; `fileDownloadUrl` helper in lib/api.ts.
- Backend: download-token create/decode in auth/jwt.py; `POST /files/{id}/download-link`; `view_file_content` accepts the token; optional-user dependency.
- Tests: token round-trip/expiry/wrong-file; endpoint auth; content route accepts valid token and rejects others.

Out of scope:

- Nested selection in URLs (project/sheet ids), chat streaming/cancel-over-the-wire, password reset, other `?token=` consumers (Google OAuth callback page uses its own flow).

## Acceptance Criteria

- Back/Forward/reload/deep-link all land on the right tab; client-side nav pushes history entries.
- Composer accepts input while loading; queued messages send in order after the current answer; session-limit copy still respected.
- Anchors/buttons that open files no longer embed the session token; failures toast.
- `download-link` 404s for files the caller doesn't own; content route 401s on bad/expired/mismatched tokens.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- jwt: create/decode round-trip; expired raises; purpose/file_id mismatch rejected; malformed user id rejected.
- Content route: valid token serves the caller's file; token for another file id → 401; garbage → 401.
- download-link route: owned file → token; unknown file → 404.

## File Size Check

Files expected to be edited:

- backend: `auth/jwt.py`, `auth/dependencies.py`, `api/routes.py`, tests.
- frontend: `App.tsx` (net small), `FloatingAssistant.tsx`, `SheetRecordFields.tsx`, `DashboardView.tsx`, `lib/api.ts`.

Line-count risk:

- Low-medium; App.tsx grows slightly (mapping) but shrinks elsewhere (anchor simplification).

## Verification Plan

- `npx tsc --noEmit`; `python -m compileall -q app`; both guards; manual reasoning over history edge cases.

## Completion Notes

Changed files:

- backend: `auth/jwt.py` (create/decode download token, purpose-isolated), `auth/dependencies.py` (`get_optional_current_user`), `api/routes.py` (`POST /files/{id}/download-link`; `view_file_content` accepts the token or a session, ownership enforced on both paths).
- frontend: `App.tsx` (TAB_PATHS mapping, path-initialized state, history-aware `setActiveTab`, popstate listener; both doc-file anchors now open via `openFileLink`; `onOpenFile` threaded to DocumentView), `lib/api.ts` (`fileDownloadUrl`), `DashboardView.tsx` + `SheetRecordFields.tsx` (download-link openers; session token no longer embedded), `FloatingAssistant.tsx` (composer queue: enabled while loading, queued indicator, drain effect via `sendMessageRef`).
- Context: security-privacy.md (download-token rule), api-boundaries.md (endpoint).

Verification completed:

- `npx tsc --noEmit` exit 0; `python -m compileall -q app` + test py_compile OK; both guards ok. render.yaml already ships the SPA fallback, so reload/deep links resolve. No test execution (CODE_RULES).

Unit tests added or updated:

- `tests/unit/test_file_download_tokens.py` (new) — token round-trip, expiry, session-token-is-not-a-download-token, wrong secret/bad identity; content route serves a valid token / 401 on other-file token, garbage, and no-credential; download-link returns a scoped token and 404s for unowned files.

Follow-ups:

- Nested selections (project/sheet ids) are not in URLs yet — a later routing story if wanted.
- Streaming answers and true server-side cancellation remain open (the queue design deliberately avoids discarding charged answers).
- ResearchPdfViewer opens PDFs through its own authorized fetch path (no URL token) — verified unaffected.
