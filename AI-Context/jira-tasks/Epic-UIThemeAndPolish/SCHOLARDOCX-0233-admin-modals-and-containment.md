# SCHOLARDOCX-0233: Admin modals stay on screen; admin page containment

Status: Done (right-edge containment unverified against the reported case)

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

1. Role Limits modals (role detail, edit limit, info) ran off the bottom of the
   screen. UsersTab modals (notification, edit roles, create user) used the same
   pattern. All six were `AdminPortal` + `absolute inset-0` overlays anchored to
   the admin page instead of the shared `<Modal>`.
2. Reported: the admin page's right side touches the screen edge (no gutter).

## Changes

- `RoleLimitsTab.tsx` (3 modals) and `UsersTab.tsx` (3 modals) now use
  `<Modal>`; edit-limit and info use `zIndex={1060}` (stacked over the role
  modal). Inline `85vh` / `90vh` caps replaced by work-surface-relative heights.
  `AdminPortal.tsx` deleted (no remaining users).
- `admin.css`: `#admin-view-root` and its children get `min-width: 0;
  max-width: 100%`; tab body and UsersTab root get `min-w-0`.

## Verification

Playwright with mocked API/permissions at 1440x800 and 1163x640: role modal and
nested edit modal both fully inside the work surface. Right gutter measured at
24px at 1163/1438/1920 widths (all tabs in the strip, long emails).
I could NOT reproduce the missing right gutter; the containment CSS is a
defensive fix. If it persists, send a full-window screenshot and the tab shown.
