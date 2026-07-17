# SCHOLARDOCX-0143: Static Landing Page for Non-Authenticated Visitors

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-17

## Summary

Add a static landing page for unauthenticated visitors showing product capabilities and subscription plans, while redirecting authenticated users to the workspace dashboard automatically.

## Business Context

Links:
- Business file: [README.md](../../business/README.md)

Business value:
Provides a high-conversion welcome gate for non-users, showcasing features, FAQ, and pricing models without exposing the authenticated application layers.

## Functional Context

Links:
- Functional file: [README.md](../../functional/README.md)

Requirements:
- Publicly accessible root path (`/`).
- Show overview of Centralized Workspaces, Sheets, AI tools, Document Vault.
- Show static pricing plans (Free, General, Pro, Max) with Monthly/Yearly toggle.
- Automatically redirect authenticated users to the workspace dashboard.

## Technical Context

Links:
- Technical file: [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Technical notes:
Uses react-router integration in `main.tsx` outside of the `ProtectedRoute` gate, and leverages `useAuth` hook inside `LandingPage.tsx` for clean workspace redirection.

## Scope

In scope:
- Public static landing page component `LandingPage.tsx`.
- Dedicated style rules in `landing-page.css` utilizing current design system tokens.
- Navigation header links and CTA buttons pointing to `/login` and `/register`.

Out of scope:
- Interactive dashboard actions or document loading for anonymous sessions.

## Acceptance Criteria

- Visiting `/` as an anonymous user shows the static landing page with sections (Hero, Features, Pricing with monthly/yearly switcher, FAQ, Footer).
- Clicking login/register from the landing page redirects to correct sub-routes.
- Visiting `/` as a logged-in user redirects automatically to `/dashboard`.
- Visual styling aligns with the light theme visual system refresh.

## Implementation Plan

- Create `landing-page.css` styling.
- Create `LandingPage.tsx` component.
- Integrate into `main.tsx` routing.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- This is a purely visual landing page containing static copy, navigation links, and standard path redirects which are verified during the visual build test and manual deployment flows.

## File Size Check

Files expected to be edited:
- `main.tsx`
- `LandingPage.tsx` [NEW]
- `landing-page.css` [NEW]

Line-count risk:
- Low

## Verification Plan

Manual Verification:
- Log out of all accounts and verify that visiting `/` renders the static landing page.
- Log in with `fahadpathan56@gmail.com` and verify that visiting `/` redirects automatically to `/dashboard`.

## Completion Notes

### Initial build (static landing page)
Changed files:
- `main.tsx`
- `LandingPage.tsx` [NEW]
- `landing-page.css` [NEW]

### Premium upgrade (full refresh)
The monolithic `LandingPage.tsx` (344) + `landing-page.css` (586) were refactored into a colocated component directory to stay within the project file-size rule and support the much larger feature set.

Decisions:
- **Component directory:** `frontend/src/components/LandingPage/` with one file per section + colocated CSS. `main.tsx` import (`from "./components/LandingPage"`) resolves to the new `index.tsx` barrel — no router change needed.
- **Dependency-free motion:** a `useReveal()` hook wraps `IntersectionObserver`; toggling an `.in-view` class drives a shared `.reveal` CSS transition (staggered via `--reveal-delay`). Honors `prefers-reduced-motion` (content revealed immediately). No framer-motion or new npm packages.
- **Hero product mock:** `ProductPreview` is a pure CSS/SVG mock of the real workspace (projects grid + tracker sheet + left rail + floating chips). No external screenshots/assets — built from existing design tokens.
- **Stats band:** capability-based counters only (6 tools, 4 plans, 100% RLS-isolated, 0 shared). No fabricated user numbers. Count-up animation on reveal via `requestAnimationFrame`.
- **FAQ:** static cards upgraded to an accessible accordion (one open at a time, `aria-expanded`, grid-rows height transition).
- **Nav:** added a mobile hamburger + slide-down panel (links were previously hidden entirely on mobile). Scroll-shrink on the sticky header.
- **New sections:** StatsBand, HowItWorks (3 steps), ClosingCta (gradient conversion banner). Pricing tiers/toggle/BDT amounts and FAQ/footer copy preserved from the initial build.

Changed files (upgrade):
- `frontend/src/components/LandingPage/` [NEW directory — 23 files: index.tsx + 11 section components + 11 colocated CSS + useReveal.ts + landing-shared.css]
- `frontend/src/main.tsx` (removed `import "./landing-page.css";`; `LandingPage` import unchanged)
- `frontend/src/components/LandingPage.tsx` [DELETED]
- `frontend/src/landing-page.css` [DELETED]

Verification completed:
- Frontend compiled successfully with `npm run build` (tsc -b + vite build, 0 errors). Pre-existing warnings (chunk size, dynamic-import overlap) unrelated to this change.
- All new files ≤ 245 lines (well under the 1000 target / 1150 grace limit).

Manual verification pending (deploy/dev run):
- `/` anonymous → full page renders with all 7 sections; scroll-reveal animations fire; mobile hamburger opens/closes; FAQ accordion expands/collapses; pricing monthly/yearly toggle switches Pro/Max prices; CTAs route to `/login` + `/register`.
- `/` authenticated → still redirects to `/dashboard`.
- `prefers-reduced-motion` → animations disabled, content visible.

Follow-ups:
- Consider code-splitting the landing page (lazy `LandingPage` route) to reduce the main bundle; chunk-size warning predates this change.
- Replace the mocked tracker-sheet rows in `ProductPreview` with representative real data once a screenshots/asset strategy is decided (currently asset-free by design).

### Post-review fixes (scroll + preview polish)
Bug: the landing page was not scrollable. Root cause — the global stylesheet locks `body` to `height: 100vh; overflow: hidden` (workspace-shell behavior), which clipped any taller top-level route. Fix: `.lp-container` now owns its own viewport-sized scroll surface (`height: 100vh; overflow-y: auto; overflow-x: hidden`), mirroring what `.app-shell` does for the authenticated workspace. No change to `styles.css`, so the workspace shell is unaffected.

Polish: `ProductPreview` was rewritten to look like a genuine product dashboard instead of abstract skeleton bars — it now shows a real page header ("PhD Applications · Fall 2026"), a tracker sheet with program names/deadlines/colored status badges (Stanford CS PhD, MIT EECS, ETH Zürich, CMU LTI), mini stat tiles (Submitted / In review / Offer), and a "New Sheet" button. Verified via headless-Chrome screenshots.

Changed files (post-review):
- `frontend/src/components/LandingPage/landing-shared.css` (`.lp-container` owns its scroll surface)
- `frontend/src/components/LandingPage/ProductPreview.tsx` + `ProductPreview.css` (real-looking dashboard content)

Verification (post-review):
- `npm run build` passes (0 errors).
- Headless-Chrome capture confirms the page scrolls (tall viewport renders all sections) and the product preview reads as a polished dashboard.

Known limitation:
- The `prefers-reduced-motion` safety path reveals content immediately; in normal mode the `.reveal` elements start at `opacity: 0` and animate in on scroll via `IntersectionObserver`. If a future environment disables JS or IO, those sections would stay hidden — acceptable for an SPA, flagged for awareness.

### Navbar polish
Feedback: the navbar looked poor. Root cause — the logo icon was a solid blank teal block: it rendered a 16px "S" character that was too small and low-contrast to read, so the mark read as an empty square. Fix: replaced the "S" glyph with a lucide `GraduationCap` icon (on-brand for an academic app) at `size=20, strokeWidth=2.4`, upsized the icon tile (28px → 36px), and added an inset highlight + lift-on-hover micro-interaction. The wordmark now uses solid `--ui-ink` (not gradient text-clip, which read thin). Nav links kept their animated underline; Log In became a subtle text button with mint hover; Get Started kept the teal-gradient pill with refined shadow depth. Background blur/saturation strengthened and scroll-shrink tightened.

Changed files: `LandingNav.tsx` (GraduationCap import + markup) + `LandingNav.css` (full restyle). Verified via headless-Chrome: graduation-cap mark renders clearly, links/buttons balanced, polish confirmed.
