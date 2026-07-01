# SCHOLARDOCX-0016: Sheet Records, Outreach Tracking, And Upload-Only Documents

Status: Done

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-05-27

## Summary

Remove separate Records and Outreach navigation. Treat records as rows inside project sheets. Add record form generated from sheet columns, date-based row coloring, outreach status/response tracking fields, document linking from uploaded files, and make Documents upload/link-only.

## Functional Context

Links:

- [feature-project-workspace.md](../../functional/feature-project-workspace.md)
- [feature-documents-storage.md](../../functional/feature-documents-storage.md)

Requirements:

- FR-3 upload/link-only behavior
- FR-7.11 through FR-7.16

## Scope

In scope:

- Remove Records nav tab.
- Remove Outreach nav tab.
- Add sheet record form.
- Add outreach/status/default columns to professor tracker.
- Add row date coloring with default 3/7/10 day thresholds.
- Link uploaded documents/files to records.
- Make Documents page upload/list only.

Out of scope:

- Full per-project threshold editor UI.
- Provider API email send/schedule.
- Document authoring/editor.

## Acceptance Criteria

- No Records or Outreach nav tabs.
- Sheet page has Add Record button/form.
- Rows can be added through the generated form.
- Rows can link uploaded files.
- Rows can track email sent, follow-up sent, response, central application, and dates.
- Rows color when due within 3, 7, or 10 days.
- Documents page only uploads and lists files.
- Tests/build pass.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Default professor columns include outreach/status/document-link fields.
- Calendar/date extraction detects follow-up and sent/scheduled dates.

## Verification Plan

- Backend unit tests.
- Frontend build.
- Browser smoke test for nav, Documents, and sheet Add Record.

## Completion Notes

Changed files:

- [frontend/src/App.tsx](../../../frontend/src/App.tsx)
- [frontend/src/components/ProjectWorkspace.tsx](../../../frontend/src/components/ProjectWorkspace.tsx)
- [frontend/src/styles.css](../../../frontend/src/styles.css)
- [backend/app/services/store.py](../../../backend/app/services/store.py)
- [backend/tests/test_store.py](../../../backend/tests/test_store.py)
- [README.md](../../../README.md)

Verification completed:

- `.venv/bin/pytest`: 12 passed.
- `npm run build`: passed.
- Browser smoke test confirmed no Records/Outreach nav tabs.
- Browser smoke test confirmed sheet Add Record form includes outreach, response, date, central application, and linked document fields.
- Browser smoke test confirmed Documents is upload/list only.

Unit tests added or updated:

- Updated default sheet/page test to cover outreach/date/document-link columns.

Follow-ups:

- Add per-project color threshold editor UI.
- Add richer record filtering and saved views.
