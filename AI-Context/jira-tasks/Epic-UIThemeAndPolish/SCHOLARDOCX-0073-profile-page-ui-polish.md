# SCHOLARDOCX-0073 — Profile Page UI Polish

Status: Done

Epic: Epic-UIThemeAndPolish


## Request

Fix the Profile page UI after screenshot review.

## Context

- Technical visual system: [frontend-visual-system.md](../../technical/frontend-visual-system.md)


## Scope

- Apply ScholarDocX UI/UX rules to the profile page layout.
- Improve top spacing, hero density, card balance, action grouping, and responsive behavior.
- Keep this UI-only with no profile API, auth, role, password, or storage behavior changes.

## Out Of Scope

- Changing profile persistence.
- Changing role display rules or admin permissions.
- Reworking profile modals.

## Acceptance Criteria

- Profile content has clear breathing room under the global header.
- Cards are balanced between columns and do not leave a large empty lower-left area on desktop.
- Hero and cards are compact enough for dashboard-style scanning.
- Build passes; browser/manual verification notes are recorded.

## File-Size Risk

`ProfileView.tsx` is under the source file-size limit. Changes should remain markup-only and focused; broad visual rules should live in existing focused CSS.

## Test Plan

- Run `cd frontend && npm run build`.
- Browser-check desktop profile layout when practical.
- Unit tests are not planned because this is visual presentation polish without behavior, persistence, validation, or API changes.

## Changed Files

- `frontend/src/components/ProfileView.tsx`
- `frontend/src/visual-refresh.css`
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0073-profile-page-ui-polish.md`

## Implementation Notes

- Applied ScholarDocX UI/UX rules.
- Moved the existing Usage & AI Models card under Workspace to balance the two desktop columns.
- Added profile-specific CSS overrides for top spacing, compact hero height, tighter card spacing, smaller action buttons, and responsive full-width action buttons on narrow screens.
- Kept profile API, auth, admin-role, password, modal, and persistence behavior unchanged.

## Verification

- `cd frontend && npm run build` passed.
- Desktop rendered check captured at `/tmp/scholardocx-profile-desktop.png`: profile content has top spacing under the global header, compact hero, balanced columns, and no obvious desktop overlap.
- Mobile screenshot at `/tmp/scholardocx-profile-mobile.png` shows the existing app shell/sidebar dominating the narrow viewport before profile content; broader mobile shell behavior is outside this profile-card polish.

## Follow-Ups

- Consider a separate mobile app-shell task so narrow viewports can reach content without the sidebar occupying the whole screen.
