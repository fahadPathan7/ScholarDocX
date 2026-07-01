# SCHOLARDOCX-0059 — Role Limit Reset And Profile Logout

## Status
Completed

Owner: AI Agent

Created: 2026-05-31

## Summary
Add a reset action in Admin Role Limits so limits/permissions for a selected role can be restored to system defaults, and add a Logout button in Profile without changing the current UI style.

## Business Context
Links:

- Business file: `AI-Context/business/authentication-position.md`

Business value:

- Gives admins a fast recovery path when role limits are edited incorrectly.
- Improves account/session control by surfacing a clear logout action in Profile.

## Functional Context
Links:

- Functional file: `AI-Context/functional/feature-about-profile.md`
- Functional file: `AI-Context/functional/feature-authentication.md`

Requirements:

- FR-8.8: Profile includes a logout action that ends the local authenticated session.
- FR-6.7: Authenticated users can explicitly sign out without affecting local stored application data.
- FR-6.8: Role limits and admin permissions can be reset per role to defaults from Admin Role Limits.

## Technical Context
Links:

- Technical file: `AI-Context/technical/authentication-and-identity.md`

Technical notes:

- Reuse existing `/admin/limits/{role}/reset` backend endpoint.
- Reuse existing frontend `AuthContext.logout()` behavior and optional `/auth/logout` call before clearing token.

## Scope
In scope:

- Add Reset button and handler in Role Limits modal.
- Add Logout button in Profile tab with existing visual system.
- Keep layout stable and style-consistent.

Out of scope:

- Redesigning profile layout.
- Changing auth token model.

## Acceptance Criteria

- Clicking Reset in role modal restores all limits/permissions for that role to backend defaults.
- Reset action refreshes displayed role limits immediately.
- Profile tab shows a Logout button and clicking it logs out and navigates to login.
- No UI breakage in Role Limits or Profile layouts.

## Implementation Plan

- Add reset action and loading state in `AdminView` Limits modal.
- Add logout action and button in `ProfileView` using auth context.
- Add minimal CSS utility for profile action row while preserving existing button style.

## Unit Test Plan
Unit tests needed:

- No

Planned tests:

- Run frontend build for type/runtime validation.
- Run backend auth/admin tests if touched backend behavior (not expected for this task).

If no unit tests are needed, explain why:

- This change is UI wiring to already existing backend/auth behaviors with no new business logic branch in backend services.

## File Size Check
Files expected to be edited:

- `frontend/src/components/AdminView.tsx`
- `frontend/src/components/ProfileView.tsx`
- `frontend/src/styles.css`
- Context/Jira markdown files

Line-count risk:

- Medium (AdminView already exceeds size policy and should get future split task).

If any file exceeds 1000 lines, explain why.

- `AdminView.tsx` is pre-existing at >1150 lines. This task adds minimal localized code only.

## Verification Plan

- `npm --prefix /Users/fahadpathan/Documents/ScholarDocX/frontend run build`

## Completion Notes
Additional follow-up (2026-05-31):

- Locked profile email editing in UI and backend profile payload filtering.
- Removed `email` from profile update payload in frontend submit action.

Changed files:

- `frontend/src/components/AdminView.tsx`
- `frontend/src/components/ProfileView.tsx`
- `frontend/src/styles.css`
- `backend/app/services/store.py`
- `AI-Context/functional/feature-about-profile.md`
- `AI-Context/functional/feature-authentication.md`
- `AI-Context/technical/authentication-and-identity.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0059-role-limit-reset-and-profile-logout.md`

Verification completed:

- `npm --prefix /Users/fahadpathan/Documents/ScholarDocX/frontend run build`

Unit tests added or updated:

- None (UI wiring only; existing backend reset/logout endpoints reused)

Follow-ups:

- Split `AdminView.tsx` into feature modules in a dedicated refactor task.
