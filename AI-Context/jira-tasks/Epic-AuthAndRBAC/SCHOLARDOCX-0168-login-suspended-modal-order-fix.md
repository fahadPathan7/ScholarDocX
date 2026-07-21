# SCHOLARDOCX-0168: Fix Suspended Account Login Modal Sequence

Status: Completed

Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-07-21

## Summary

Fix the suspended account login modal flow on `LoginPage.tsx` so that when a suspended/blocked user attempts to log in, the informative "Account Suspended" notice modal (with "Contact Admin" and "Close" buttons) is displayed first, rather than bypassing it and opening the appeal text area form directly.

## Business Context

Links:
- Business file: N/A

Business value:
- Provides clear, non-intrusive status explanation to suspended users before presenting them with a contact form.
- Ensures a logical, multi-step UX flow: Information Notice -> Contact Admin Form.

## Functional Context

Links:
- Functional file: N/A

Requirements:
- On login failure with `user_suspended` or `user_blocked`, open the primary "Account Suspended" info modal first (`setShowAppealForm(false)`).
- Provide a clear "Contact Admin" button on the info modal that opens the appeal message textarea form.

## Technical Context

Links:
- Technical file: [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)

Technical notes:
- Update `LoginPage.tsx` catch handler for login submission: set `setShowAppealForm(false)` when `err.message === "user_suspended" || err.message === "user_blocked"`.

## Scope

In scope:
- Updating `LoginPage.tsx` modal state initialization upon suspended login attempt.

Out of scope:
- Modifying backend authentication logic or suspension statuses.

## Acceptance Criteria

- When a suspended user enters credentials on the login screen, the informative "Account Suspended" modal ("Your account has been suspended from ScholarDocX. If you think this was a mistake, please contact an administrator.") renders first.
- Clicking "Contact Admin" inside the modal reveals the appeal form with the textarea input.
- `npm run build` succeeds with zero errors.

## Implementation Plan

- Edit `LoginPage.tsx` login handler to set `setShowAppealForm(false)` when `setIsSuspendedModalOpen(true)` is called.
- Run frontend production build to verify zero compile or type errors.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- This is a modal UI state sequence fix on the frontend auth view.

## File Size Check

Files expected to be edited:
- `LoginPage.tsx` (423 lines)

Line-count risk:
- Low (well under 1000 lines).

## Verification Plan

- Execute `npm run build` in `frontend/` to confirm clean compilation.

## Completion Notes

Changed files:

- [LoginPage.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/LoginPage.tsx)
- [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)
- [SCHOLARDOCX-0168-login-suspended-modal-order-fix.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/jira-tasks/Epic-AuthAndRBAC/SCHOLARDOCX-0168-login-suspended-modal-order-fix.md)

Verification completed:

- Executed `npm run build` in `frontend/`. Production bundle built cleanly with 0 TypeScript/JSX errors.

Unit tests added or updated:

- N/A (modal state flow fix).

Follow-ups:

- None.
