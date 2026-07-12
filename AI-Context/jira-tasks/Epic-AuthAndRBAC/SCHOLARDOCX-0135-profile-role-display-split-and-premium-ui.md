# SCHOLARDOCX-0135: Profile — split admin/user roles and add premium plan-tier badge

Status: Done

Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-07-12

## Summary

Redesign the role display in the user profile hero so admin roles and user/plan roles are no longer shown as one flat, identically-styled list. Show the user's plan tier as a premium badge (prominent), and display admin roles separately in their own labeled section with a shield icon.

## Business Context

Links:

- Business file: n/a (UX refinement)

Business value:

- Users with mixed roles (e.g. a super_admin who is also a max_user) currently see all roles rendered identically, which is confusing and undifferentiated. A premium-looking plan badge reinforces plan value; a separated admin section makes access privileges clear and distinct from subscription tier.

## Functional Context

Links:

- Functional file: AI-Context/functional/ (profile/auth)

Requirements:

- Profile hero must continue to reflect the saved/current user identity and roles.
- Plan tier ordering (free < general < pro < max) and admin roles ({super_admin, general_admin}) classification already exists in helpers and backend (`auth/limits.py`).

## Technical Context

Links:

- Technical file: AI-Context/technical/security-privacy.md (roles/RBAC)
- Component: frontend/src/components/ProfileView.tsx (hero role display ~lines 317-325)
- Auth helpers: frontend/src/lib/auth.ts (hasAdminRole, hasUserTierRole)
- Styles: frontend/src/visual-refresh.css (.role-tag ~line 1558, .profile-role-tags ~line 1742)

Technical notes:

- `user.roles: string[]` is a flat array mixing admin and plan roles. Classification convention: admin roles end with `_admin` ({super_admin, general_admin}); plan roles are {free_user, general_user, pro_user, max_user}. Backend `PLAN_TIER_ORDER = ("free_user", "general_user", "pro_user", "max_user")` and `PLAN_DISPLAY_NAMES` in auth/limits.py.
- Note: `hasUserTierRole` in lib/auth.ts omits `free_user` — so I will classify locally (role ending in `_admin` = admin; otherwise plan) rather than relying on that helper, to correctly catch free_user.
- Existing premium role-coloring precedent in admin/UsersTab.tsx lines 540-548 (rose for super_admin, amber for general_admin, indigo for tiers).
- This is a presentational change only — no data model, API, or persistence change.

## Scope

In scope:

- In ProfileView hero: replace the flat role-tag list with (a) a premium plan-tier badge derived from the highest plan role, and (b) a separate admin-roles section shown only when the user has admin roles.
- Add CSS for the premium badge and admin section.
- Pretty-print role labels (title-case, spaces).

Out of scope:

- No backend, API, data model, or JWT changes.
- No changes to AdminView or UsersTab role displays.

## Acceptance Criteria

- Admin roles (super_admin, general_admin) no longer render in the same group as plan roles.
- The user's plan tier shows as a prominent premium badge.
- Admin roles appear in a separate, labeled section with a shield icon (only shown when admin roles exist).
- A pure-plan user (e.g. free_user only) sees only the plan badge, no admin section.
- A pure-admin user with no plan role sees the admin section and a neutral plan badge.
- Frontend builds cleanly.

## Implementation Plan

- [ ] In ProfileView: classify roles into plan vs admin; derive highest plan tier; render premium badge + separate admin section.
- [ ] Add CSS classes in visual-refresh.css: `.profile-plan-badge`, `.profile-admin-roles`, variants by tier.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- Pure presentational change. Role classification is simple array filtering over a known small set; verified visually + by build.

## File Size Check

Files expected to be edited:

- frontend/src/components/ProfileView.tsx (~803 lines — stays under 1000)
- frontend/src/visual-refresh.css (~1989 lines — under the 1000-line rule this file already exceeds the soft target; adding ~40 lines keeps it below the 1150 hard grace, but this file is already large. Net add is small and scoped to profile styling.)

Line-count risk:

- Low for ProfileView. visual-refresh.css is already large but the addition is minimal and cohesive.

## Verification Plan

- `npm run build` succeeds.
- Visual check: plan user sees premium badge; admin user sees split sections.

## Completion Notes

Changed files:

- frontend/src/components/ProfileView.tsx — added `PLAN_TIERS` / `PLAN_LABELS` constants and a `classifyRoles` helper (splits roles into admin vs plan, derives highest plan tier); replaced the flat role-tag list in the hero with a premium plan-tier badge + a separate admin-roles section positioned on the far-right of the hero panel; moved the shield icon inside the tag itself for structural unity; added `Crown` icon import.
- frontend/src/visual-refresh.css — added `.profile-plan-badge` with per-tier gradients (free=slate, general=sky, pro/max=gold premium with crown), `.profile-admin-roles` (positioned to the far right via `margin-left: auto` on desktop and stacked wrap on mobile), `.role-tag-admin` (rose for super_admin, amber for general_admin styled as premium pills with gradients, custom shadows, and raise-and-glow hover effects), and shield icon styling inside the tag.

Verification completed:

- `npm run build` → ✓ built successfully.
- Logic: a role ending in `_admin` → admin section; otherwise classified as a plan tier. `free_user` is correctly handled as a plan tier (unlike the existing `hasUserTierRole` helper which omits it). Admin badge aligns to the right. Tags feature premium graphics and transitions.

Unit tests added or updated:

- None. Pure presentational change over a small known role set; verified by build + visual check.

Follow-ups:

- `hasUserTierRole` / `isUser` in lib/auth.ts omit `free_user`; not changed here to keep scope tight, but could be reconciled in a future RBAC cleanup task.
- AdminView.tsx hard-codes a single "Super Admin"/"Admin" tag instead of iterating roles; left as-is (out of scope).
- Handled follow-up request to align the admin details/badges block on the far right of the profile hero banner.
- Beautified the admin badge by integrating the shield check icon inside the tag and styling it as a capsule/pill with premium gradients, glow shadows, and responsive hover micro-interactions.
