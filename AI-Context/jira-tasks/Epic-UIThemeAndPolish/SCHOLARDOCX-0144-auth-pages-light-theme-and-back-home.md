# SCHOLARDOCX-0144: Auth Pages Light Theme + Back-to-Home Navigation

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-17

## Summary

Restyle the Login and Register pages (and their inlined Forgot Password and Request Invite views) to the app's light muted-teal visual system instead of the disconnected dark zinc/emerald theme, and add a consistent "Back to home" control on every auth view.

## Business Context

Links:

- Business file: [README.md](../../business/README.md)

Business value:

The auth pages are the first surface new visitors see after the landing page. The current dark zinc-950/zinc-900 theme clashes with the light, low-saturation, muted-teal system used across the landing page and workspace, making the product feel inconsistent and unpolished. A missing "back to home" path traps users who landed on `/login` or `/register` directly and want to return to the marketing page.

## Functional Context

Links:

- Functional file: [README.md](../../functional/README.md)

Requirements:

- All auth views (login, register, forgot password, request invite) share one light theme that matches the rest of the app.
- Every auth view offers a way back to the landing page (`/`).
- No change to authentication logic, API calls, validation, or routes.

## Technical Context

Links:

- Technical file: [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Technical notes:

The two pages currently hardcode a dark Tailwind palette (`bg-zinc-950`, `bg-zinc-900`, `bg-zinc-800`, `border-zinc-700`, `bg-emerald-600`). The app's real design tokens live as CSS custom properties (`--ui-primary`, `--ui-mint`, `--ui-ink`, `--ui-paper`, `--ui-shadow`, etc.) in `visual-refresh.css`, used by the landing page and workspace. We will restyle using those tokens (via a dedicated CSS file per page, mirroring the landing-page approach) and keep Tailwind only for layout utilities. A "Back to home" link uses `react-router-dom` `Link` to `/`.

## Scope

In scope:

- `LoginPage.tsx` + new `LoginPage.css` — full light restyle + back-to-home control.
- `RegisterPage.tsx` + new `RegisterPage.css` — full light restyle + back-to-home control.
- Back-to-home visible on all four views (login, register, forgot password, request invite).

Out of scope:

- Auth logic, API calls, validation, token handling, routing.
- The suspended-account modal internals (only theme-restyled to match).

## Acceptance Criteria

- `/login`, `/register`, the Forgot Password view, and the Request Invite view all render in the light muted-teal theme consistent with the landing page.
- Each of those four views has a clearly visible "Back to home" control that navigates to `/`.
- Inputs, labels, buttons, error/success banners, and the suspended-account modal all read clearly in the light theme with accessible contrast.
- `npm run build` passes.

## Implementation Plan

- Create `LoginPage.css` and `RegisterPage.css` using `--ui-*` tokens; import from each component.
- Replace dark Tailwind color classes with semantic class hooks; keep layout utilities.
- Add a shared "back to home" header above each card with a `Link` to `/`.
- Verify with a headless-Chrome screenshot.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- Purely visual restyle and navigation-link addition. No behavior, validation, data transformation, or persistence changed. Verified by build + manual visual check.

## File Size Check

Files expected to be edited:

- `frontend/src/components/LoginPage.tsx` (~410 → ~430)
- `frontend/src/components/RegisterPage.tsx` (~157 → ~175)
- `frontend/src/components/LoginPage.css` [NEW]
- `frontend/src/components/RegisterPage.css` [NEW]

Line-count risk:

- Low

## Verification Plan

Manual Verification:

- Visit `/login` → light theme, "Back to home" present, navigates to `/`.
- Toggle Forgot Password and Request Invite views → light theme, back-to-home present.
- Visit `/register` → light theme, "Back to home" present.
- `npm run build` succeeds.

## Completion Notes

Changed files:
- `frontend/src/components/LoginPage.tsx` — replaced dark zinc/emerald Tailwind palette with `auth-*` semantic classes; added "Back to home" control (visible on all four views: login, forgot password, request invite, invite-success). All auth logic, API calls, validation, token handling unchanged.
- `frontend/src/components/RegisterPage.tsx` — same light restyle via shared `auth-*` classes + "Back to home" control.
- `frontend/src/components/LoginPage.css` [NEW] — shared auth visual primitives built from `--ui-*` tokens (light canvas gradient, mint logo mark, muted-teal primary button, teal focus rings, danger/success alerts). Imported by both LoginPage and RegisterPage (shared, not page-specific).

Decisions:
- One shared `LoginPage.css` for both pages — the `auth-*` classes are reusable visual primitives (card, inputs, buttons, alerts, modal), not page-specific. RegisterPage imports it directly rather than duplicating a second stylesheet.
- "Back to home" is a react-router `Link` to `/` rendered as a pill with a left-arrow icon, placed at the top-left of each card. It stays visible across all inlined sub-views (forgot password, request invite, success states) because it lives above the conditional view block.
- The suspended-account modal was also restyled to match (light card, teal ghost button, danger-colored close).

Verification completed:
- `npm run build` passes (0 errors).
- Headless-Chrome screenshots of `/login` and `/register` confirm: light theme (soft canvas gradient + white card), "Back to home" present top-left, muted-teal primary button, teal links/focus, no dark zinc/emerald remnants. Matches the landing-page aesthetic.

Unit tests added or updated:
- None (purely visual + navigation link; no behavior changed).

Follow-ups:
- Consider extracting the shared `auth-*` primitives into a generic `auth.css` (e.g. `frontend/src/auth.css`) if a third auth screen is added, to avoid the LoginPage.css naming implying it's login-only.
- The invite-request phone field and success banners are functional but could use the same input component abstraction if forms grow.

### Split-screen layout + anonymous routing fix
Feedback: the auth pages had a large empty background (centered card with wasted space), and anonymous users were landing on `/login` instead of the landing page on refresh/direct-visit.

Routing fix:
- `ProtectedRoute.tsx`: anonymous users now `<Navigate to="/" replace />` (was `/login`) — so visiting any protected route while logged out returns them to the landing page, not the login form.
- `AuthContext.logout()`: now `window.location.href = "/"` (was `/login`) — logging out lands on the landing page.
- Net effect: `/login` and `/register` are now reached only via explicit CTA clicks from the landing page, exactly as intended. No change to post-login redirect (still honors `location.state.from`).

Split-screen layout:
- Auth pages (`LoginPage`, `RegisterPage`) now use a CSS grid split layout (`1.05fr 1fr`): a branded left panel + a form column.
- Branded panel: deep teal gradient (on-brand, matches the closing CTA banner tone), radial glow orbs, ScholarDocX logo (graduation-cap mark), a gradient-highlighted headline, subtext, and 3 value-prop bullet points with mint check chips. Fills the left half — no empty space.
- Form column: the existing light auth card, now left-aligned (header changed from center to left-aligned to suit the column).
- Responsive: below 900px the brand panel hides and the form centers full-width (mobile keeps the clean card-only layout).

Changed files: `ProtectedRoute.tsx`, `AuthContext.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `LoginPage.css`. Verified via headless-Chrome (both pages render split-screen, balanced, premium). Build passes.
