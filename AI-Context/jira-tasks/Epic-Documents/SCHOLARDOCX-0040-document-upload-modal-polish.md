# SCHOLARDOCX-0040: Document Upload Modal Polish

Status: Done

Owner: AI Agent

Epic: Epic-Documents

Created: 2026-05-28

## Summary

Improve the upload document modal so it matches the refreshed Documents UI and
does not rely on the browser-default file input as the primary visual control.

## Functional Context

Links:
- [feature-documents-storage.md](../../functional/feature-documents-storage.md)

## Requirements

- Make the upload document modal visually cleaner and more organized.
- Use a styled file picker surface that shows the selected file name.
- Keep category, file, notes, and submit behavior intact.
- Preserve local-first file upload behavior.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-open the upload modal and verify the panel layout and file picker
  presentation.

## Implementation Notes

- Added a dedicated upload modal layout with a stronger header, styled local
  file picker surface, cleaner notes area, and footer actions.
- Hid the browser-default file input visually while keeping the native file
  input in the form for local upload behavior.
- Added selected-file-name state so the file picker surface can show the chosen
  file name before submit.
- Split Documents-specific visual CSS into `documents-refresh.css` to keep the
  shared visual refresh file below the size limit.

## Changed Files

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/App.tsx`
- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/documents-refresh.css`
- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/main.tsx`
- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/visual-refresh.css`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-documents-storage.md`

## Verification

- Passed: `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`.
- Browser checked the upload modal: panel width/height, styled file picker,
  notes field, and footer actions render without clipping.
