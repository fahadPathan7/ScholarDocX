# SCHOLARDOCX-0020: Column Edit Staging and Styling Refinements

Status: Draft

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-05-27

## Summary

Refine the Column Edit UX so that reordering, renaming, and deleting columns inside the "Edit Columns" dialog operates entirely in a staging state (`tempColumns`) and does not auto-save or print "Saved" status messages until the user clicks "Done". Position the "Edit Columns" button on the far right of the sheet toolbar with a distinct theme/color.

## Business Context

Links:
- [business-requirements.md](../../business/business-requirements.md)

Business value:
- Enhances user trust by avoiding premature database writes and flickering status labels while reordering/editing column names.
- Clarifies sheet administration actions by separating metadata changes (Edit Columns) from layout/record entry additions.

## Functional Context

Links:
- [feature-project-workspace.md](../../functional/feature-project-workspace.md)
- [acceptance-criteria.md](../../functional/acceptance-criteria.md)

Requirements:
- FR-7.5: Sheet can have editable, addable, and deletable columns and rows.
- Reordering and renaming column changes must accumulate in a temporary/staged local UI state. Clicking "Done" commits the bulk set of changes. Clicking the close button or pressing Escape cancels and discards the changes.

## Technical Context

Links:
- [architecture-overview.md](../../technical/architecture-overview.md)

Technical notes:
- The backend accepts updated page schemas via PATCH `/project_pages/{id}`.
- We must make the frontend form mapping utilize `tempColumns` during staging.
- We must map the "Edit Columns" form `onSubmit` to the `saveColumnEdits` handler.

## Scope

In scope:
- Change mapping inside the "Edit Columns" form list from `columns` to `tempColumns`.
- Bind column name changes, up/down moves, and deletes to update only the local `tempColumns` state.
- Ensure the Edit Columns button in the sheet toolbar triggers `openEditColumns` to properly initialize staging state.
- Submit the entire edit form via `onSubmit={saveColumnEdits}` when "Done" is clicked, applying the transformations and persisting to the DB.
- Position the "Edit Columns" button on the far right of the toolbar.
- Apply a custom mint/teal or distinct warm/bronze border style to the "Edit Columns" button to separate it from the standard creation buttons.

Out of scope:
- Multi-user conflict resolution for schema changes.
- Row sorting options.

## Acceptance Criteria

- Clicking the up/down arrows or typing inside the "Edit Columns" form does not trigger `persistPage` or change the "Saved" message immediately.
- Edits are committed in a single batch only when clicking "Done".
- Closing the form via "X" or pressing Escape discards the changes.
- The "Edit Columns" button is positioned on the far right of the toolbar.
- The "Edit Columns" button is styled differently from "+ Column" and "+ Add Record" buttons.

## Implementation Plan

- Create/Modify `AI-Context/jira-tasks/SCHOLARDOCX-0020-column-edit-staging-and-styling.md` task.
- Update `implementation_plan.md` artifact.
- Bind "Edit Columns" toolbar button to `openEditColumns`.
- Modify "Edit Columns" JSX to map over `tempColumns`.
- Clean up references to undefined functions like `renameColumnAndPersist`.
- Hook up "Edit Columns" form `onSubmit` to `saveColumnEdits`.
- Update `styles.css` to align the button to the right and style it.
- Verify changes compile and tests pass.

## Unit Test Plan

Unit tests needed:
- No (No new logic is introduced that is not covered by existing front-end integration. Schema logic is already verified in Python tests).

## File Size Check

Files expected to be edited:
- `ProjectWorkspace.tsx` (~1100 lines, risk is low, keeping under limit)
- `styles.css` (~1050 lines, risk is low)

Line-count risk:
- Low

## Verification Plan

- Run TypeScript build: `npm run build` inside frontend.
- Run Python backend tests: `pytest` inside backend.
- Manually check that column order change does not save until "Done" is clicked, and can be discarded.
