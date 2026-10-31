# SCHOLARDOCX-0211: Fix /files/upload 500 — ORM model/DB schema drift (stray polar_product_id)

Status: Done

Owner: AI Agent

Epic: Epic-Documents

Created: 2026-10-31

## Summary

`POST /api/files/upload` returned 500 ("Internal Server Error"; the UI shows
the generic "Something went wrong. Please try again." modal) for every user.
Root cause: commit b95ff60 (Polar integration) copy-pasted
`polar_product_id` onto the `DocumentCategories` and `AiModels` ORM models.
`Base.metadata.create_all` never alters existing tables and no `_add_*`
migration added the column, so against the live database every ORM SELECT on
those tables failed with `psycopg.errors.UndefinedColumn`. The upload
endpoint hits that in `routes.upload_file` → `Store.ensure_document_category`
(an ORM select on `document_categories`) before the file is even saved.

## Business Context

Links:

- Business file: `business/decisions.md`
- Technical file: `technical/project-structure.md`

Business value:

- Document upload works again on every existing database (the primary
  Documents feature was fully broken).
- Uploads fail fast with a real message again for genuine errors instead of
  a generic 500 modal.

## Functional Context

Links:

- Functional file: N/A (restores intended behaviour, no functional change)

Requirements:

- FR: uploading a document from the Documents view or the file-picker must
  create the `static_files` record and store the object.

## Technical Context

Links:

- `technical/project-structure.md` (data-layer notes)

Technical notes:

- Only `ai_token_packs.polar_product_id` is a real Polar column (used by
  `app/services/ai_tokens.py` pack SQL and `PackUpdatePayload`). The same
  column on `document_categories` / `ai_models` is referenced nowhere —
  removed from both models rather than adding a migration for a dead column.
- Works on both DB generations: pre-b95ff60 databases (column absent — ORM
  no longer references it) and fresh create_all databases (column may exist,
  ORM ignores it).
- `ai_token_packs` and the live DB were already consistent (the
  `add_polar_token_pack.py` scratch script had added that column manually);
  no data change was needed anywhere.

## Scope

In scope:

- Remove stray `polar_product_id` from `DocumentCategories` and `AiModels`
  models with an explanatory comment.
- Regression tests pinning model/DB parity.

Out of scope:

- Any Polar/billing behaviour change.
- Splitting `models.py` (1286 lines, pre-existing; this change removes lines).

## Acceptance Criteria

- `POST /api/files/upload` returns 200 and stores the file against the live
  database.
- No ORM model declares a column missing from the configured database.
- Existing `ai_token_packs.polar_product_id` behaviour unchanged.

## Implementation Plan

- [x] Remove `polar_product_id` from `DocumentCategories` (models.py).
- [x] Remove `polar_product_id` from `AiModels` (models.py).
- [x] Verify parity of all models vs live DB (information_schema diff).

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Snapshot of `document_categories` / `ai_models` model column sets.
- Generic parity test: every ORM model column exists in the configured DB.
- The exact broken path: `Store.ensure_document_category` round-trip.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `backend/app/db/models.py` (1286 → 1290 lines: −2 columns, +9 comment
  lines; pre-existing overage documented here, net change is negative)

Line-count risk:

- Low

## Verification Plan

- Reproduced 500 against local backend with throwaway user; confirmed
  traceback `UndefinedColumn: column document_categories.polar_product_id
  does not exist` at `routes.py:435`.
- After fix: same request → HTTP 200 with record; `GET /api/files/{id}/content`
  returned the exact uploaded bytes; storage object deleted afterwards.
- Model/DB parity re-check: zero drift.
- Per CODE_RULES the pytest suite was not executed; the new regression file
  compiles (`py_compile`) and follows suite conventions.

## Completion Notes

Changed files:

- `backend/app/db/models.py` — removed stray columns, added SCHOLARDOCX-0211
  comments.
- `backend/tests/regression/test_orm_schema_parity.py` — new (3 tests).

Verification completed:

- End-to-end upload + download round-trip against the live database via the
  running dev server (throwaway user, cleaned up: user, static_files row,
  storage object all deleted).

Unit tests added or updated:

- `tests/regression/test_orm_schema_parity.py` (not executed — CODE_RULES).

Follow-ups:

- Consider a `make check`-style CI guard that runs the parity test against a
  long-lived schema snapshot so create_all-fresh CI databases cannot mask
  migration drift.
- `backend/app/db/models.py` exceeds the 1150-line grace limit and should be
  split before the next feature that touches it.
