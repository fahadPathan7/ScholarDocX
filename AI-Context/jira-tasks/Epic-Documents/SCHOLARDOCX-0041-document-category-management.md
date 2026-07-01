# SCHOLARDOCX-0041: Document Category Management

Status: Done

Owner: AI Agent

Created: 2026-05-28

## Summary

Add document category management to the Documents view. Users should be able to
create, rename, and delete document categories. Deleting a category also deletes
the associated document records and local files.

## Functional Context

Links:
- [feature-documents-storage.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-documents-storage.md)

## Requirements

- Add persistent document categories.
- Show category management controls in the Documents UI.
- Create categories and make them available in upload/edit category selectors.
- Rename categories and update existing documents in that category.
- Delete categories and delete associated document records and local files.
- Keep path handling local-first and path-safe.

## Verification Plan

- Run backend tests.
- Run frontend build.
- Browser-check create, rename, and delete category flows.

## Implementation Notes

- Added persistent `document_categories` records with default category seeding.
- Added backend category endpoints for list, create, rename, and delete.
- Changed media path handling to normalize category names into safe local
  directory slugs instead of rejecting all non-default categories.
- Renaming a category updates existing `static_files.file_type` values.
- Deleting a category deletes associated `static_files` records, local files,
  and the category folder.
- Updated the Documents UI with New category, rename, and delete controls.
- Updated upload/edit category selectors and the sheet file picker upload
  selector to use live document categories.

## Changed Files

- `/Users/fahadpathan/Documents/ScholarDocX/backend/app/core/categories.py`
- `/Users/fahadpathan/Documents/ScholarDocX/backend/app/core/workspace.py`
- `/Users/fahadpathan/Documents/ScholarDocX/backend/app/db/connection.py`
- `/Users/fahadpathan/Documents/ScholarDocX/backend/app/db/schema.py`
- `/Users/fahadpathan/Documents/ScholarDocX/backend/app/api/routes.py`
- `/Users/fahadpathan/Documents/ScholarDocX/backend/app/services/store.py`
- `/Users/fahadpathan/Documents/ScholarDocX/backend/tests/test_store.py`
- `/Users/fahadpathan/Documents/ScholarDocX/backend/tests/test_workspace.py`
- `/Users/fahadpathan/Documents/ScholarDocX/frontend/src/App.tsx`
- `/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/FilePickerField.tsx`
- `/Users/fahadpathan/Documents/ScholarDocX/frontend/src/documents-refresh.css`
- `/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-documents-storage.md`
- `/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/api-boundaries.md`
- `/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/data-model-draft.md`
- `/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/local-storage-and-data.md`

## Verification

- Passed: `npm run build` in `/Users/fahadpathan/Documents/ScholarDocX/frontend`.
- Passed: `pytest tests/test_store.py tests/test_workspace.py` in
  `/Users/fahadpathan/Documents/ScholarDocX/backend`.
- Full backend `pytest` still fails on the pre-existing async AI tests because
  the current environment lacks a pytest async plugin.
- Browser checked Documents category UI: default categories render, category
  action controls render, create and rename work through the UI, and a temporary
  category was deleted through the backend endpoint after verification.
