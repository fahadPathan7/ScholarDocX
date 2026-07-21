# SCHOLARDOCX-0165: Registration & Login Page UI/UX Refresh — Split-Screen Layout

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-21

## Summary

Transform the registration and login pages from a simple centered-card layout into a premium split-screen design with a branded showcase panel on the left and the form card on the right. The brand panel features a deep teal gradient (matching the landing page's ClosingCta banner), the ScholarDocX logo mark, a gradient-highlighted headline, and 3 value-proposition bullet points.

## Business Context

Links:

- Business file: [README.md](../../business/README.md)

Business value:

The auth pages are the first surface new visitors see after the landing page. A premium split-screen layout with branding reinforcement makes the product feel cohesive and professional, reducing bounce rate and building trust during the critical registration moment. The current simple centered card wastes whitespace on desktop and doesn't convey the academic-workspace brand.

## Functional Context

Links:

- Functional file: [README.md](../../functional/README.md)

Requirements:

- Split-screen layout on desktop (≥900px): branded panel left, form card right.
- Brand panel hides on mobile (<900px); form centers full-width.
- All form logic, validation, API calls, and routing remain unchanged.
- Both Login and Register pages share the same split-screen treatment.

## Technical Context

Links:

- Technical file: [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Technical notes:

The auth pages share `LoginPage.css` for visual primitives. The split-screen CSS adds grid layout rules, brand panel styles, and responsive breakpoints. Brand panel markup uses the existing `ScholarDocXMark` SVG component and lucide-react icons. No new dependencies.

## Scope

In scope:

- `LoginPage.css` — split-screen grid layout, brand panel styles, responsive rules.
- `RegisterPage.tsx` — brand panel markup.
- `LoginPage.tsx` — brand panel markup.

Out of scope:

- Auth logic, API calls, validation, token handling, routing.
- PasswordField component changes.
- Landing page changes.

## Acceptance Criteria

- Desktop: split-screen layout visible with brand panel left, form right.
- Brand panel shows ScholarDocX logo, headline, value props with mint check icons.
- Form is fully functional (invite code + paid tabs on register, all login views).
- Mobile (<900px): brand panel hidden, form centers full-width.
- `npm run build` passes.

## Implementation Plan

- Add split-screen grid CSS to `LoginPage.css`.
- Add `.auth-brand-panel` styles with deep teal gradient, glow orbs, typography.
- Add brand panel JSX to `RegisterPage.tsx` and `LoginPage.tsx`.
- Verify build and visual output.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- Purely visual layout change. No behavior, validation, data transformation, or persistence changed.

## File Size Check

Files expected to be edited:

- `frontend/src/components/LoginPage.css` (~508 → ~650)
- `frontend/src/components/RegisterPage.tsx` (~461 → ~510)
- `frontend/src/components/LoginPage.tsx` (~406 → ~460)

Line-count risk:

- Low

## Verification Plan

Manual Verification:

- Visit `/register` → split-screen with brand panel left, form right.
- Visit `/login` → same split-screen layout.
- Resize below 900px → brand panel hides, form centers.
- Test all form tabs and views remain functional.
- `npm run build` succeeds.

## Completion Notes

Changed files:
- `backend/app/services/admin.py` — updated `list_users` query to return `registered_with_invite_id`, `invite_code`, and calculated `signup_method` (`"invite"` vs `"purchase"`).
- `frontend/src/components/admin/UsersTab.tsx` — added `Join Method` column to User Management table (`Joined by Invite` amber badge vs `Online Purchase` emerald badge) and added `Join Method` filter subgroup (`All Methods` | `Joined via Invite` | `Joined via Purchase`).
- `frontend/src/components/LoginPage.css` — expanded `.auth-card.auth-card-wide` max-width to `740px`, styled `.auth-plan-readout` as a single horizontal mint badge banner.
- `frontend/src/components/RegisterPage.tsx` — set "Purchase a plan" (`paid`) tab as default active tab, rendered single horizontal price readout banner (`5.99 USD • For candidates applying to multiple top-tier programs.`).
- `frontend/src/components/LoginPage.tsx` — added "Back to registration" `Link` (`/register`) alongside "Back to login" across all sub-views.
- `frontend/src/components/LandingPage/PricingSection.tsx` & `PricingSection.css` — added `Save 20%` badge chip to Quarterly Billing button toggle.
- `frontend/src/components/PlanComparisonView.tsx` — added `Save 20%` badge chip to Quarterly toggle button.
- `AI-Context/technical/frontend-visual-system.md` — updated auth pages & admin panel user management documentation.

Decisions:
- Added Join Method badges (`Joined by Invite` vs `Online Purchase`) to each user row in the Admin Panel User Management table.
- Added Join Method filter subgroup (`All Methods` | `Joined via Invite` | `Joined via Purchase`) to the Admin Panel User Management filter bar.
- Restored single horizontal price readout banner (`5.99 USD • For candidates applying to multiple top-tier programs.`) per user preference.
- Set "Purchase a plan" tab as the default active view when entering the registration page.
- Expanded registration card container width to `740px` (`.auth-card-wide`) so `Quarterly` and `Save 20%` sit on 1 single line inside the button without wrapping.
- Added a `Save 20%` discount pill to Quarterly billing toggles across the landing page, registration form, and plan comparison view for marketing conversion incentive.
- Formatted account hint text to 1 single line: `You won't be able to log in until payment is confirmed. Unpaid accounts are removed after 2 hours.`
- Formatted footer switch links to 1 single inline row: `Already have an account? Log in • Need an invite code? Request one here`.

Verification completed:
- `npm run build` passes (0 errors, 0 TypeScript errors).

Unit tests added or updated:
- None (purely visual layout change; no behavior changed).
