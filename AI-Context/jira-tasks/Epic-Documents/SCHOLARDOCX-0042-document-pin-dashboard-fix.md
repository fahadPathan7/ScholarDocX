# SCHOLARDOCX-0042: Document Pin Dashboard Fix

Status: Done

Owner: AI Agent

Epic: Epic-Documents

Created: 2026-05-28

## Summary

Fix uploaded document pin and dashboard-pin actions from the Documents category
modal. They should update the local `static_files` record and pinned dashboard
documents should show readable file metadata.

## Functional Context

Links:
- [feature-documents-storage.md](../../functional/feature-documents-storage.md)

## Requirements

- Document pin action should not call a missing endpoint.
- Document dashboard-pin action should persist to `static_files`.
- Dashboard pinned document cards should use uploaded-file fields.
- Pinned dashboard documents should open the local file content.

## Verification Plan

- Run frontend build.
- Run focused backend store tests.
- Verify document pin and dashboard-pin actions no longer return 404.

## Implementation Notes

- Fixed the Documents modal pin actions to call `/static_files/{id}` with the
  standard CRUD payload shape instead of the missing `/records/static_files/{id}`
  route.
- Updated dashboard pinned document rendering to use uploaded-file metadata:
  `display_name`, `file_type`, and `created_at`.
- Dashboard pinned documents now open the stored local file content endpoint.
- Added focused backend coverage for dashboard-pinned uploaded files.

## Changed Files

- `frontend/src/App.tsx`
- `backend/tests/test_store.py`
- `AI-Context/functional/feature-documents-storage.md`

## Verification

- Passed: `npm run build` in `frontend`.
- Passed: `pytest tests/test_store.py tests/test_workspace.py` in
  `backend`.
- Live API smoke check: temporary `/static_files` record patched through
  `/api/static_files/{id}` returned HTTP 200, then the temp record was deleted.
