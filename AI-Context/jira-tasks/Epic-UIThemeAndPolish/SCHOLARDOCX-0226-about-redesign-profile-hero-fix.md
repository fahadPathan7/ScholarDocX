# SCHOLARDOCX-0226: About page redesign + Profile hero clipping fix

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

Owner reported UI issues on MacBook and small screens: Profile hero clipped the
name and the "Online Subscription" chip; the About hero's animated connection
map clipped its node labels. Owner asked to replace the About UI with a better one.

## Scope

- About: new layout in `components/AboutView.tsx` + new `about-page.css`
  (`ab-*` classes): hero with CTAs and four principle cards, numbered
  "application journey" steps, "Meet Lumi" capability list, UTC footnote. All
  grids are auto-fit (no per-device breakpoints). Animated map removed; copy
  unchanged. Old About layout CSS deleted from `about-refresh.css` (models
  modal + notification-settings styles kept).
- Profile: `.profile-hero-wrapper` now sizes to content (`visual-refresh.css`).

## Verification

`tsc --noEmit`, `npm run build`. About rendered in a temporary harness at 1440
and 390 px (harness removed). Profile fix is CSS-only and not visually
re-checked (needs a logged-in session). Dead `.about-*` rules remain in
`styles.css` / `responsive.css` (harmless; remove in a cleanup).
