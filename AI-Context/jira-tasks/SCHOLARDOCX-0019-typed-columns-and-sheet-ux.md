# SCHOLARDOCX-0019: Typed Columns and Sheet UX Redesign

Status: Done

Owner: AI Agent

Created: 2026-05-27

Completed: 2026-05-27

## Summary

Implement typed columns (`text | number | bool | file`) in the sheets system. Redesign the column creation and record form UX to resolve layout overflows, support typed fields (including checkbox toggles, numeric inputs, and custom Document-integrated file pickers), and remove the redundant manual Save button in favor of inline auto-saves.

## Business Context

Links:
- [business-goals.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/business/business-goals.md)

Business value:
- Promotes privacy-first local document management by centralizing document uploads and linking them to sheet cells dynamically.
- Minimizes data loss and user friction via automatic persistence and validation feedback.

## Functional Context

Links:
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md)
- [acceptance-criteria.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/acceptance-criteria.md)

Requirements:
- FR-7.5: Sheet can have editable, addable, and deletable columns and rows.
- FR-7.11: Records are rows inside sheet pages.
- FR-7.12: Users add records using a form generated from the current columns.
- FR-7.16: Rows can link uploaded documents/files.

## Technical Context

Links:
- [architecture-overview.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/architecture-overview.md)

Technical notes:
- Stored sheets previously defined columns as simple `string[]`. They must be migrated to `{name, type}[]` objects.
- Frontend components must adapt input fields depending on the column type.
- File-type fields must fetch existing files from `api.getFiles()` and perform uploads via `/files/upload` to keep Documents storage unified.

## Scope

In scope:
- Support types: `text`, `number`, `bool`, `file`.
- Auto-migrate old page data structures in SQLite transparently.
- Add an inline column form (name + type) in the sheet view.
- Single-column scrollable record form layout.
- Searchable file picker for file-type fields.
- Auto-save sheet page data on column/record additions.
- Add badges showing column types in the table header.

Out of scope:
- Advanced type validation (email syntax, range checks).
- Full cell cell-by-cell undo/redo.

## Acceptance Criteria

- Column creation requires a name and selecting text, number, bool, or file type.
- Record form adapts fields: boolean shows checkboxes, file shows file pickers, number shows number inputs, text shows inputs/textareas.
- File-type picker allows searching/selecting files from the workspace or uploading new ones directly.
- The Add Record form and adding columns auto-saves directly to the backend.
- Record form is scrollable and fits within viewport limits (no right-hand page overflow).
- All unit tests pass and include checking schema migrations.

## Verification Plan

- Run production frontend build: `npm run build`
- Run store and workspace unit tests: `pytest`
- Manual UI testing of form layouts and inputs.

## Completion Notes

Changed files:
- [store.py](file:///Users/fahadpathan/Documents/ScholarDocX/backend/app/services/store.py) - Updated default columns to dicts, added transparent schema migration in `_decode_page`, completely removed generic "Attachments" and "Linked documents" columns, and dynamically inserted degree-appropriate document fields (PhD, Masters/MSc, Bachelors/BSc) before the "Status" column.
- [test_store.py](file:///Users/fahadpathan/Documents/ScholarDocX/backend/tests/test_store.py) - Updated backend test assertions to match the migrated format and verify that generic columns are excluded while correct degree-specific default columns are loaded.
- [App.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/App.tsx) - Passed onFilesChanged callback to ProjectWorkspace.
- [FilePickerField.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/FilePickerField.tsx) - Added new file picker component.
- [ProjectWorkspace.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/ProjectWorkspace.tsx) - Redesigned workspace with inline column creation, single-column record form, auto-save status, toggleable Create Project form, cascade confirmations for deleting projects and sheets, dedicated "Edit Columns" form panel (rename, delete, reorder), mouse-drag row/column resizing, and auto-growing cells.
- [styles.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/styles.css) - Polished layouts, scrollbars, list containers, toggle switches, resize handle highlights, row headers, and reorder controls.
- [api.ts](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/lib/api.ts) - Added `delete` method to frontend API client and `deleteRecord` helper function.
- [acceptance-criteria.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/acceptance-criteria.md) - Documented typed columns, deletions, resizing, and cell auto-grow criteria.
- [feature-project-workspace.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md) - Documented column type behaviors, layout resizing, and customization rules.

Verification completed:
- Frontend builds cleanly: `npm run build`
- Backend tests pass: `pytest`
