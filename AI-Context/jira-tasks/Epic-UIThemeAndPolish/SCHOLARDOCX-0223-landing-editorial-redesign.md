# SCHOLARDOCX-0223: Landing page redesign — "Scholar's Study" editorial theme

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

Owner dislikes the dark-teal "aurora" landing theme (SCHOLARDOCX-0215), which
reads as generic SaaS. Replace it with an academic-editorial identity: warm
ivory paper, deep ink-navy, scholarly gold accent, serif display type.

## Business Context

Business value: the landing page is the first impression for applicants; a
distinctive, credible, scholarly look differentiates ScholarDocX from generic
dashboards.

## Functional Context

Requirements:

- Presentation-only. Copy, links, pricing logic, section order unchanged,
  except removal of infrastructure jargon ("Row-Level Security") per AGENTS.md.
- Respect prefers-reduced-motion; responsive down to phone width.

## Technical Context

Links:

- `frontend/src/components/LandingPage/**`, `frontend/index.html` (font)
- `AI-Context/technical/frontend-visual-system.md`

Technical notes:

- Landing tokens are scoped to `.lp-container` (`--lp-*`, and local `--ui-*`
  overrides) so the in-app teal system is untouched.
- Display serif: Fraunces (Google Fonts, already used for other fonts).

## Scope

In scope: all LandingPage CSS, HeroSection/StatsBand/ClosingCta/Footer markup
where needed, index.html font link.

Out of scope: app-internal views, pricing data logic, auth pages.

## Acceptance Criteria

- No dark-teal aurora left; one coherent ivory/ink/gold system top to bottom.
- `npx tsc --noEmit` and `npm run build` pass; visual check at 1440 and 390 px.

## Unit Test Plan

- None (presentation-only).

## File Size Check

- All edited files stay well under 1000 lines (PillarsShowcase.css 846, theme
  changes are value-level).

## Completion Notes

Changed files: `LandingPage/` — landing-shared.css (tokens, shell, titles,
ruled texture), new landing-theme.css, HeroSection.tsx/.css, LandingNav.css,
StatsBand.css/.tsx (label copy), ClosingCta.css, LandingFooter.css,
PricingSection.tsx (tier accents), FaqSection/FeaturesSection.tsx (removed
"Row-Level Security" copy), palette remap in Features/Pricing/Faq/Pillars/
ProductPreview CSS; `frontend/index.html` (Fraunces).

Verification: `tsc --noEmit` and `npm run build` clean; Playwright screenshots
at 1440 and 390 px reviewed. No tests run (presentation-only).

Follow-ups: ProductPreview window chrome and Pillars game mocks still use
their old internal colors; a dark-mode variant is not provided.
