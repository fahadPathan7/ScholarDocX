# SCHOLARDOCX-0142: Plan Comparison UI Visual Polish

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-17

## Summary

Enhance the "Choose Your Plan" page visual design. Apply a premium glassmorphic feel, tier-specific visual branding (Crown for Max, Gem for Pro, Rocket for General, Package for Free), elegant typography, clean feature row formatting, and premium hover and active states.

## Business Context

Links:
- Business file: N/A

Business value:
- Provides a premium user onboarding and billing experience.
- Promotes plan upgrades by highlighting premium Pro and Max tiers with superior visual design.

## Functional Context

Links:
- Functional file: N/A

Requirements:
- Improve the design of the subscription plan comparison view.
- Maintain existing functions (View All Features, Monthly/Yearly toggle, Plans/Requests tabs, Upgrade/Renewal modals).
- Ensure high readability and clean contrast in both light and dark themes.

## Technical Context

Links:
- Technical file: [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)

Technical notes:
- Update [PlanComparisonView.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/PlanComparisonView.tsx).
- Add custom css modifications or use Tailwind utility classes since PlanComparisonView uses Tailwind extensively.
- Ensure the layout remains responsive and fits well across laptop-sized screens.

## Scope

In scope:
- UI facelift for the plan comparison grids and cards.
- Layout polishing for toggles and buttons.
- Tier icon branding.

Out of scope:
- Modifying subscription backend endpoints.

## Acceptance Criteria

- Cards feature a highly polished glassmorphic aesthetic.
- Distinct icons represent each plan tier (Package, Rocket, Gem, Crown).
- Highlighted cards (e.g. Active plan or Max plan) have a premium glow and breathing animation status badge.
- Toggles feature a smooth slider or clean tab design.
- The code compiles cleanly.

## Implementation Plan

- Edit card rendering block inside `PlanComparisonView.tsx` to apply new CSS classes and layout structure.
- Add fine-grained custom style classes or Tailwind configurations for the glows, borders, and badge animations.

## Unit Test Plan

Unit tests needed:
- No (presentation and CSS changes only).

## File Size Check

Files expected to be edited:
- [PlanComparisonView.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/PlanComparisonView.tsx) (~525 lines)

Line-count risk:
- Low (well under the 1000 line limit)

## Verification Plan

- Check the React component compilation.
- Manually check the visual look of the splash screen page.
- Verify the quotes rotate correctly.

## Completion Notes

Changed files:
- [PlanComparisonView.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/PlanComparisonView.tsx)

Verification completed:
- Verified via `npm run build` inside the `frontend` folder (production bundle built successfully with no errors).

Unit tests added or updated:
- None (CSS / presentation changes only).

Follow-ups:
- None.
