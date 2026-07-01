# SCHOLARDOCX-0068 — Beautiful Custom UI Alerts and Dialogs

Status: Done

Epic: Epic-NotificationsAndAlerts


## Owner
AI Agent

## Created
2026-06-05

## Summary
Replace all native browser alerts/confirms with custom styled dialogs, and revamp the custom dialog provider (`DialogProvider.tsx` and `dialog.css`) to be beautiful, modern, accessible, and theme-consistent.

## Business Context
Links:
- Business file: `AI-Context/business/`

Business value:
- A premium, native-feeling interface build trust and wows the user. Browser-native alerts feel cheap and inconsistent.
- Keyboard accessibility (Escape to close, Enter to confirm) provides an efficient, standard desktop experience.

## Functional Context
Links:
- Functional file: `AI-Context/functional/feature-project-workspace.md`

Requirements:
- FR-7.21: Styled alerts and modal confirmations for destructive/important actions.
- Accessibility: Keyboard navigation (Enter to confirm, Escape to cancel).

## Technical Context
Links:
- Technical file: `AI-Context/technical/stack-and-runtime.md`

Technical notes:
- The custom Dialog provider in `frontend/src/components/DialogProvider.tsx` uses custom React state to show alerts, confirms, and prompts.
- Remaining native browser `alert` and `confirm` calls in `AdminView.tsx` must be converted to async calls using `useDialog`.
- Enhance CSS in `dialog.css` for rich animations, rounded borders, backdrop blur, distinct color/icon categories for dialog states (e.g. error, warning, success, info, prompt).

## Scope
In scope:
- Redesign `frontend/src/components/DialogProvider.tsx` and `frontend/src/components/dialog.css` to introduce premium glassmorphic styling, category-specific icons (Success, Warning, Info, Trash/Danger, Input), and animation timing.
- Add keyboard listeners for Escape and Enter keys in the dialog provider for quick operations.
- Update `frontend/src/components/AdminView.tsx` to replace all native browser `confirm` and `alert` calls with `useDialog`'s `showConfirm` and `showAlert`.
- Ensure frontend builds and runs correctly.

Out of scope:
- Modifying other modals (e.g., settings modal or project creation modal) except for styling consistency.
- Backend limit checks or database schema changes.

## Acceptance Criteria
- All browser-native alerts/confirm popups are replaced with customized dialog panels.
- Custom dialogs have beautiful visual layouts with high-quality icons, typography, clear spacing, drop shadows, and backdrop blurs.
- Escape key closes/cancels open dialogs; Enter key confirms alert and confirmation dialogs.
- Custom dialog buttons have distinct styles (destructive action confirm button is styled as a premium danger button).
- Frontend compilation succeeds without any errors.

## Implementation Plan
1. Refactor `DialogProvider.tsx` to support distinct dialog types (info, warning, danger, success) and dynamically show corresponding icons.
2. Add global keydown event listeners to `DialogProvider.tsx` to handle Escape (cancel/close) and Enter (confirm).
3. Redesign `dialog.css` using modern, glassmorphic styling, smooth keyframe transitions, and custom variables matching the app's dark green/sand theme.
4. Modify `AdminView.tsx` to use `useDialog` for status toggles, revoke actions, reset limits, deleting invite codes, and updating secret key warnings.
5. Verify changes locally and compile frontend.

## Verification Plan
- Verify that Escape closes dialogs and Enter submits them.
- Verify that confirm/alert boxes in AdminView look beautiful and work asynchronously.
- Verify visual design with the browser.
- Run `npm run build` to ensure no TS/lint errors.
