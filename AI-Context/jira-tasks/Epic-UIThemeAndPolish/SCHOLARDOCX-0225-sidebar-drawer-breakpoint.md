# SCHOLARDOCX-0225: Lower the sidebar-drawer / single-column breakpoint 1450px → 1100px

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

On a MacBook (≈1280–1512 CSS px) the left sidebar collapsed into the hamburger
drawer and the dashboard stacked into one column, because the shell threshold
was 1450px. Owner wants the drawer only for genuinely small screens.

## Scope

Changed the shared threshold 1450px → 1100px (and the matching `min-width:
1451px` → `1101px`) in `useMediaQuery.ts` (`useIsMobile`), `responsive.css`
(all sections that used it: drawer, dashboard stack, whiteboard, documents,
sticky notes, Advisor Atlas, Scholarship Hunt, profile, admin, about),
`about-refresh.css`, and comments in `styles.css` / `visual-refresh.css`.
Tablet/mobile tiers (1023/767/479/374) are unchanged.

## Verification

`tsc --noEmit` and `npm run build`. Visual check pending on the owner's Mac
(dashboard needs a login).

## Follow-ups

Windows between 1100–1280px now get the full desktop layout; if the sidebar
feels cramped there, raise the threshold (single constant per file group).
