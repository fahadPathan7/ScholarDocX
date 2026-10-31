# SCHOLARDOCX-0215: Landing page refresh — remove How It Works, aurora theme, author credit

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-10-31

## Summary

Three landing-page changes requested by the product owner:
1. Remove the "How It Works" three-step section entirely (not needed).
2. Refresh the landing page UI/theme — darker, atmospheric "aurora" look
   continuous with the in-app deep-space topbar, while keeping every section's
   content and behaviour unchanged.
3. Credit the owner at the bottom of the footer: "Fahad Pathan".

## Business Context

Business value:

- The landing page is the first surface for new users; a distinctive theme
  and cleaner section flow (without the redundant How It Works) communicates
  a more polished product.

## Functional Context

Requirements:

- How It Works section no longer renders (component + styles removed).
- No content/behaviour changes in the remaining sections (copy, links,
  pricing logic untouched).
- Footer bottom line credits Fahad Pathan.

## Technical Context

Links:

- `frontend/src/components/LandingPage/**`
- `AI-Context/technical/frontend-visual-system.md`

Technical notes:

- Shared classes `lp-section-title` / `lp-section-subtitle` live in
  `landing-shared.css` — theming them restyles all sections at once.
- Keep the light, low-saturation system inside the app untouched; this
  refresh is scoped to the public landing page.
- Respect prefers-reduced-motion for any new ambient animation.

## Scope

In scope:

- index.tsx section list; HowItWorks.tsx/.css deletion.
- landing-shared.css theme tokens + shared section header/button polish.
- HeroSection, LandingNav, StatsBand, ClosingCta, LandingFooter visual
  refresh (CSS-first, markup only where needed).
- Footer credit line.

Out of scope:

- PricingSection data logic (SCHOLARDOCX-0214), FeaturesSection/Pillars/
  Faq content, any app-internal views.

## Acceptance Criteria

- "How It Works" gone from the rendered page and the file tree.
- Hero/nav/footer read as one refreshed dark-aurora system; sections share
  the same header treatment.
- Footer shows the Fahad Pathan credit.
- `npx tsc --noEmit` and `npm run build` pass.

## Unit Test Plan

Unit tests needed:

- No (presentation-only).

## File Size Check

Files expected to be edited:

- LandingPage/index.tsx, landing-shared.css, HeroSection.css/.tsx,
  LandingNav.css, StatsBand.css, ClosingCta.css/.tsx, LandingFooter.css/.tsx;
  delete HowItWorks.tsx/.css.

Line-count risk:

- Low-Medium (CSS-heavy, files are small)

## Verification Plan

- tsc + build; visual pass over section order and footer.

## Completion Notes

Changed files:

- Removed: `HowItWorks.tsx`, `HowItWorks.css` (deleted); `index.tsx`
  section list + `LandingNav.tsx` `#how` links (desktop + mobile).
- Theme: `landing-shared.css` (aurora page washes, gradient section-title
  `span` treatment, `.lp-grid-texture` utility, `lp-aurora-drift`
  keyframes + reduced-motion guard), `HeroSection.css` (full dark
  ink-teal canopy with three drifting orbs, grid horizon, glass badge and
  secondary button, glow CTA, bottom fade into the light body) +
  `HeroSection.tsx` (texture/orb markup), `LandingNav.css` + `.tsx`
  (dark-glass resting header that flips to the light glass on scroll —
  scroll listener now attaches to `.lp-container`, not `window`, which
  never fired before; dark mobile panel), `StatsBand.css` (stats card
  pulled up into the hero fade, layered glass), `ClosingCta.css` +
  `.tsx` (harmonized palette + grid texture), `LandingFooter.css` +
  `.tsx` (dark ink bookend with mint-gradient "Fahad Pathan" credit).

Verification completed:

- `npx tsc --noEmit` clean; `npm run build` succeeds.
- Dev-server visual pass (Playwright): dark aurora hero with grid + orbs
  and readable nav; header flips dark→light on scroll (verified via
  computed class/background); stats card layers over the hero fade;
  closing CTA + dark footer with the credit render correctly; "How It
  Works" absent from the DOM and the nav.

Follow-ups:

- ProductPreview mock still uses light chrome — could get a dark-window
  variant to sit deeper in the canopy.
- Pillars/Features/Faq sections keep their own light styling; only their
  shared headers were rethemed — a deeper pass could aurora-wash their
  card backgrounds.
