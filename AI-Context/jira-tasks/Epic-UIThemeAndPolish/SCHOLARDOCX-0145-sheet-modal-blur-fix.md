# SCHOLARDOCX-0145: Sheet Creation Modal Blur Fix

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-18

## Summary

The sheet creation modal backdrop and blur does not follow the visual system guidelines. Modals inside the main content area are expected to blur the entire workspace surface (including dashboard and view-specific headers) but must not bleed into the global App TopBar or Left Sidebar.
Currently, the sheet creation and editing modals are rendered inline inside the `<Section>` element of `ProjectWorkspace.tsx`, causing the blur to be restricted to only that section container, leaving the top page headers unblurred.
Additionally, the vertical positioning of `.modal-backdrop-main` is too high (using only `24px` padding-top).

We will:
1. Refactor the sheet creation and editing modals (along with the project creation and editing modals in the same file) to use the standard `<Modal>` component, which portals them directly to `.main-content`.
2. Lower the modal positioning by changing the `padding-top` of `.modal-backdrop-main` in the stylesheets from `24px` to `160px`.

## Business Context

Links:
- Business file: None

Business value:
Ensures a cohesive, premium, and distraction-free visual experience across the workspace UI, adhering to visual polish specifications.

## Functional Context

Links:
- Functional file: [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)

Requirements:
- FR-1.1: Modals within the main content area should blur only the main work surface and MUST NOT blur the app's TopBar or the left Sidebar.
- FR-1.2: The view's own headers should be blurred when a modal is open. Only the global app TopBar remains unblurred.
- FR-1.3: Modals must have a clean, balanced spacing from the top edge (e.g. 160px).

## Technical Context

Links:
- Technical file: [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)

Technical notes:
- The standard `Modal` component in `frontend/src/components/Modal.tsx` creates a Portal to `.main-content` and applies `.modal-backdrop-main` which absolute positions the backdrop over `.main-content` with a backdrop-blur.
- Modals rendered inline in `ProjectWorkspace.tsx` are constrained to their local positioning ancestor (`Section` or `ProjectWorkspace`), violating the blur scope rules.
- `.modal-backdrop-main` padding-top was modified in both `styles.css` and `visual-refresh.css` to 160px.

## Scope

In scope:
- Wrap `showCreateSheet`, `editingSheet`, `showCreateProject`, and `editingProject` modal markup in `ProjectWorkspace.tsx` inside the `<Modal>` component.
- Clean up the manually written backdrop wrapper classes from those modals.
- Update CSS styling for `.modal-backdrop-main` in `styles.css` and `visual-refresh.css` to change `padding-top` from `24px` to `160px`.

Out of scope:
- Functional refactoring of the sheet or project creation actions.

## Acceptance Criteria

- The "Create Sheet" modal covers the entire main viewport content area (including the project dashboard and breadcrumbs).
- The "Create Sheet" modal backdrop blur does NOT overlap/blur the global TopBar or the left Sidebar.
- The same behavior applies to the "Edit columns" sheet modal, "Create Project" modal, and "Edit Project" modal.
- The modal position is lowered to `160px` from the top of the container.

## Implementation Plan

1. Import `Modal` component in `ProjectWorkspace.tsx`.
2. Wrap `showCreateProject` modal markup in `<Modal onClose={...}>` and remove `<div className="modal-backdrop modal-backdrop-main" ...>` overlay wrapper (as `<Modal>` handles it).
3. Wrap `editingProject` modal markup in `<Modal onClose={...}>`.
4. Wrap `showCreateSheet` modal markup in `<Modal onClose={...}>`.
5. Wrap `editingSheet` modal markup in `<Modal onClose={...}>`.
6. Edit `styles.css` and `visual-refresh.css` to set `.modal-backdrop-main` padding-top to `160px`.

## Unit Test Plan

Unit tests needed:
- No. This is a visual layout styling & portal target correction. Visual/layout components portaling are verified via manual visual inspection and existing project suite tests.

If no unit tests are needed, explain why:
- This change alters React portal rendering targets for visual layout overlays and changes a CSS layout padding rule. There is no change to underlying functional logic, state machine transitions, or API interfaces.

## File Size Check

Files expected to be edited:
- `frontend/src/components/ProjectWorkspace.tsx`
- `frontend/src/styles.css`
- `frontend/src/visual-refresh.css`

Line-count risk:
- Low (we are slightly reducing lines of custom backdrop wrapper tags and replacing with `<Modal>`).

## Verification Plan

- Manually verify that opening "Create sheet" blurs the breadcrumbs and project dashboard, while keeping the Sidebar and TopBar clean and interactive.
- Verify modal positioning is lowered vertically.

## Completion Notes

Changed files:
- [ProjectWorkspace.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/ProjectWorkspace.tsx)
- [styles.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/styles.css)
- [visual-refresh.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/visual-refresh.css)

Verification completed:
- Verified that all existing unit tests pass cleanly: `npm test -- --run`.
- Verified that the Vite production build succeeds with no errors or issues: `npm run build`.

Unit tests added or updated:
- None (pure visual/overlay positioning change with no structural logic alterations).

Follow-ups:
- None.
