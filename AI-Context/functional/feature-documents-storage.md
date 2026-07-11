# Feature: Documents And Storage

Requirement group: FR-3

## Goal

Users upload and link externally prepared documents. ScholarDocX should not be a document writing surface.

## Document Types

Initial document types:

- SOP
- Research proposal
- Personal statement
- Academic certificate
- Academic transcript
- CV
- Test score report
- Writing sample
- Other

## Document Authoring Rule

Users should not write SOPs, proposals, or other academic documents inside ScholarDocX.

They should upload files prepared elsewhere and link those files to project sheet records.

## Static File Storage

Supported file examples:

- CV
- Transcript
- Certificate
- Test score report
- Passport or ID copy if user chooses to store it
- Writing sample
- PDF proposal

Static files should be stored under the local workspace media folder. SQLite should store metadata and file paths.

## File Linking

Uploaded files can be linked to sheet records through the record form.

## Documents Workspace UX

The Documents view should keep the upload form as a compact, content-height
left panel. The uploaded documents area should use the remaining width and own
the vertical scrolling when the list grows, so the upload panel does not stretch
down the full page and the file list remains easy to scan.

When upload opens in a floating panel, the main Documents surface should use
the full workspace width. Document groups should avoid cramped multi-column
cards when file names or notes are long; same-type documents should remain
easy to scan in a wider grouped list. File date metadata should show the date
value directly without extra "Uploaded:" label text.

For category-heavy document collections, the Documents view should use a
matrix-style category overview. The main page shows category cards only, with
the category name and document count. It should not show individual files or
category scrollbars in the main view. Clicking a category opens a modal where
that category's files are listed and can scroll independently. File actions in
that modal should support local pinning, dashboard pinning, editing, deletion,
and opening the stored secure file. Pin and dashboard-pin actions should provide
visible state changes and friendly feedback after they complete.

The upload document modal should use a polished, purpose-built layout with a
clear category selector, a styled file picker surface, optional notes, and a
footer action. It should avoid exposing the browser-default file input as the
primary visual control.

Document categories are user-manageable. Users can create, rename, and delete
categories from the Documents view. Renaming a category updates the category on
existing documents. Deleting a category deletes the category and all associated
document records and secure files. The workspace supports a maximum of 16
document categories, and the category overview should show at most 4 category
cards per row.

## Safety Requirements

- Validate file paths.
- Avoid path traversal.
- Do not silently upload files to external services.
- Keep original filenames or a traceable display name.
