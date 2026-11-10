# SCHOLARDOCX-0229: Modals must stay inside the work surface

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

"Your Current Usage & Limits" (Profile) opened centered on the whole browser
window and behind the sidebar, so its left edge was cut off. Cause: several modals
used their own `fixed inset-0 z-50` overlay (Tailwind) instead of the canonical
`<Modal>` (AGENTS.md "Modal backdrop blur"), so they ignored the sidebar and sat
under it (z-50 < sidebar 1100).

## Changes

- Converted to `<Modal>`: `UsageModal`, `PlanComparisonView` request modal,
  `admin/SettingsTab` (JWT + External APIs), `admin/InvitesTab` (usages),
  `admin/PasswordResetRequestsTab`, and the four `ProfileView` modals (password,
  identity, avatar, notifications; these were `absolute inset-0` and would have
  covered the whole, now-scrolling profile page).
- `visual-refresh.css`: `.modal-backdrop-main` scrolls (`overflow-y: auto`) when a
  panel is taller than the work surface; `.modal-backdrop-main > .modal-panel`
  max-width is `calc(100% - 32px)` so old `vw` caps can't push panels under the
  sidebar. Profile "never clip" rule now excludes `#admin-view-root`.

## Verification

Playwright with a mocked API at 1470x900 and 1280x600: usage, identity,
password and notification modals open inside the work area (left edge >= 280px).
Not exercised: Admin portal modals (`RoleLimitsTab`, `UsersTab`; still
`absolute inset-0` inside `#admin-view-root`, anchored to the admin page, not
the viewport) and the plan request modal.

## Follow-up (same day)

The five Documents modals in `App.tsx` (upload, category list, category editor,
edit file, All Documents) used `<Modal scope="body">`: full-window blur (TopBar
blurred) and panels centered on the window, so the left edge slid under the
sidebar. Switched to the default `scope="main"`. Verified "All Documents" at
1510x960: backdrop = work surface (280..1510), TopBar and sidebar crisp, panel
centered. Upload/category/edit modals use the same component but were not opened.
No `scope="body"` modals remain.
