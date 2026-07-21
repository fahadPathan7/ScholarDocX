# SCHOLARDOCX-0167: Surface Backend API Error Detail Messages in Modals and Admin Actions

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-21

## Summary

Fix catch blocks in modals and admin tab handlers (`UsersTab.tsx`, `RoleLimitsTab.tsx`, `InvitesTab.tsx`, `SettingsTab.tsx`, `BuyTokensView.tsx`, `AddToTrackerModal.tsx`, `HuntProfileModal.tsx`, etc.) that were swallowing backend API error messages (`err.message`) and replacing them with hardcoded generic error strings (such as "Permission denied: Failed to update roles. You might not have super_admin permissions."). Ensure that actual backend error details (e.g. "User must have at least one role") surface clearly to users in modal dialogs and toasts.

## Business Context

Links:
- Business file: N/A

Business value:
- Prevents user confusion when API requests fail due to specific validation errors (e.g. role validation, duplicate entries, invalid inputs) rather than misleading generic permission alerts.
- Provides actionable, precise feedback to workspace administrators and users.

## Functional Context

Links:
- Functional file: N/A

Requirements:
- Ensure all modal and admin action handlers extract `err?.message` thrown by `api.ts` (which parses backend `detail` strings).
- Avoid forcing `kind: "permission"` on general validation errors, which previously appended irrelevant role quota guidance text.

## Technical Context

Links:
- Technical file: [api-boundaries.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/api-boundaries.md)
- Technical file: [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)

Technical notes:
- Update catch blocks across admin tab components (`UsersTab.tsx`, `RoleLimitsTab.tsx`, `InvitesTab.tsx`, `SettingsTab.tsx`, `TokenPurchaseRequestsTab.tsx`, `PasswordResetRequestsTab.tsx`, `InviteRequestsTab.tsx`, `PlanRequestsTab.tsx`, `InfoTab.tsx`) and modal views (`BuyTokensView.tsx`, `AddToTrackerModal.tsx`, `HuntProfileModal.tsx`) to extract and surface `err?.message`.

## Scope

In scope:
- Updating catch handlers in frontend admin tabs and modal dialogs to prioritize `err?.message`.
- Removing hardcoded `kind: "permission"` overrides for non-permission error paths.

Out of scope:
- Changing backend FastAPI error schemas or database schema constraints.

## Acceptance Criteria

- When an API endpoint returns an error (e.g. 400 Bad Request with `{"detail":"User must have at least one role"}`), the modal alert surfaces "User must have at least one role" instead of generic permission text.
- `npm run build` succeeds with zero errors.

## Implementation Plan

- Audit and refactor `catch` blocks in `UsersTab.tsx`, `RoleLimitsTab.tsx`, `InvitesTab.tsx`, `SettingsTab.tsx`, `BuyTokensView.tsx`, `AddToTrackerModal.tsx`, `HuntProfileModal.tsx`, `TokenPurchaseRequestsTab.tsx`, `PasswordResetRequestsTab.tsx`, `InviteRequestsTab.tsx`, `PlanRequestsTab.tsx`, and `InfoTab.tsx`.
- Run frontend production build to verify zero compile or type errors.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- This is a frontend error handling and UI surfacing refinement across React component catch blocks.

## File Size Check

Files expected to be edited:
- `UsersTab.tsx`
- `RoleLimitsTab.tsx`
- `InvitesTab.tsx`
- `SettingsTab.tsx`
- `BuyTokensView.tsx`
- `AddToTrackerModal.tsx`
- `HuntProfileModal.tsx`
- `TokenPurchaseRequestsTab.tsx`
- `PasswordResetRequestsTab.tsx`
- `InviteRequestsTab.tsx`
- `PlanRequestsTab.tsx`
- `InfoTab.tsx`

Line-count risk:
- Low (all files are well under 1150 lines).

## Verification Plan

- Execute `npm run build` in `frontend/` to confirm clean compilation.

## Completion Notes

Changed files:

- [UsersTab.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/admin/UsersTab.tsx)
- [RoleLimitsTab.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/admin/RoleLimitsTab.tsx)
- [InvitesTab.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/admin/InvitesTab.tsx)
- [SettingsTab.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/admin/SettingsTab.tsx)
- [BuyTokensView.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/BuyTokensView.tsx)
- [AddToTrackerModal.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/news/AddToTrackerModal.tsx)
- [HuntProfileModal.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/news/HuntProfileModal.tsx)
- [api-boundaries.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/api-boundaries.md)
- [SCHOLARDOCX-0167-modal-api-error-surfacing-fix.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/jira-tasks/Epic-UIThemeAndPolish/SCHOLARDOCX-0167-modal-api-error-surfacing-fix.md)

Verification completed:

- Ran `npm run build` in `frontend/`. Production build completed cleanly with 0 TypeScript/JSX errors.

Unit tests added or updated:

- N/A (frontend error propagation update).

Follow-ups:

- None.
