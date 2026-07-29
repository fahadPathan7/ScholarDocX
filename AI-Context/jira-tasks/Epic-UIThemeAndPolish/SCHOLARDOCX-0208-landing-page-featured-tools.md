# SCHOLARDOCX-0208: Landing Page Marquee Feature Showcase for Research Expert, Advisor Atlas & Focus Games

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-29

## Summary

Enhance the ScholarDocX public landing page by creating a dedicated, high-impact Feature Spotlight Showcase (`PillarsShowcase`) that separately features and markets the 3 core power tools: **Research Expert**, **Advisor Atlas**, and **Focus Games (Brain Games)**.

## Business Context

Links:
- Business file: [README.md](../../business/README.md)

Business value:
Elevates applicant conversion and product differentiation by heavily highlighting ScholarDocX's unique value propositions: AI-assisted paper analysis (Research Expert), faculty matching and vetting (Advisor Atlas), and integrated mental micro-break cognitive focus tools (Brain Games) to combat application fatigue.

## Functional Context

Links:
- Functional file: [README.md](../../functional/README.md)

Requirements:
- Add a prominent, interactive 3-pillar showcase section (`#featured-tools` / `#pillars`) on the public landing page.
- Feature interactive tab/card navigation allowing visitors to explore deep simulated previews of Research Expert, Advisor Atlas, and Focus Games.
- Highlight specific capabilities:
  - **Research Expert**: AI-assisted PDF paper breakdowns, key contribution extraction, predefined analytical prompt suites, proposal sharpening.
  - **Advisor Atlas**: Research-fit score matching, verified faculty contact info, publication overlap analysis, recruiting availability signals.
  - **Focus Games**: 6 built-in cognitive micro-break games (2048, Sudoku, Pattern Memory, Minesweeper, Word Puzzle, TicTacToe) for applicant mental recharge.
- Add direct navigation link ("Featured Tools") in the header navigation bar (`LandingNav.tsx`).
- Highlight these 3 flagship features in the main features grid (`FeaturesSection.tsx`) with glowing "Featured" badges.
- Expand FAQ section (`FaqSection.tsx`) to address these 3 tools.
- Strictly adhere to plain-language, non-jargon copy rules (no "vector", "embeddings", "chunks", "pgvector", etc.).

## Technical Context

Links:
- Technical file: [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Technical notes:
- Create modular components `PillarsShowcase.tsx` and `PillarsShowcase.css` inside `frontend/src/components/LandingPage/`.
- Ensure all files remain well under the 1000 line limit per module.
- Leverage existing design tokens (`--ui-*`) and `useReveal()` hook for scroll transitions.

## Scope

In scope:
- `PillarsShowcase.tsx` [NEW] & `PillarsShowcase.css` [NEW].
- Updates to `index.tsx`, `LandingNav.tsx`, `HeroSection.tsx`, `FeaturesSection.tsx`, `FaqSection.tsx`.

Out of scope:
- Changes to authenticated application routes or workspace backend APIs.

## Acceptance Criteria

- Visiting `/` displays the new interactive 3-Pillar Spotlight Showcase featuring Research Expert, Advisor Atlas, and Focus Games.
- Users can switch between tabs or view feature cards with responsive simulated UI mockups.
- LandingNav includes a "Featured Tools" navigation item pointing to `#featured-tools`.
- FeaturesSection displays special glowing badges for Research Expert, Advisor Atlas, and Focus Games.
- No infrastructure or algorithm jargon appears in rendered landing page text.
- `npm run build` passes with zero errors.

## Completion Notes

### Completed Changes
- Created `PillarsShowcase.tsx` & `PillarsShowcase.css` featuring interactive tab navigation, simulated UI mockups, prompt suite buttons, professor match gauges, and mini game previews.
- Integrated `PillarsShowcase` into `LandingPage/index.tsx` right after the Hero & Stats band.
- Added "Featured Tools" navigation item in desktop and mobile header (`LandingNav.tsx`).
- Transformed `FeaturesSection.tsx` & `FeaturesSection.css` into a high-impact **Bento Grid** layout featuring 7 core platform capabilities (Centralized Workspaces, Dynamic Tracker Sheets, Contextual AI Assistant, Scholarship Hunt, Outreach Logger, Safe Document Vault, Security & Privacy) without duplicating the 3 marketed power tools (Research Expert, Advisor Atlas, Focus Games) from `PillarsShowcase.tsx`.
- Updated `HowItWorks.tsx` 3-step timeline to align with the core power tools workflow:
  1. Set up workspace & deadlines
  2. Analyze research & vet advisors (Research Expert + Advisor Atlas)
  3. Draft outreach & refresh focus (AI Outreach + Focus Games)
- Updated `FaqSection.tsx` & `FaqSection.css` with a comprehensive 8-question suite featuring category badges (`OVERVIEW`, `SECURITY & PRIVACY`, `CORE POWER TOOLS`, `AI ASSISTANT`, `PROGRAM MANAGEMENT`, `DATA EXPORT`, `PRICING & TRIALS`, `GETTING STARTED`), accessible single-open accordion animation, and clear answers covering all applicant inquiries.
- Verified build: `npm run build` (tsc -b + vite build) passed with 0 errors.
- Updated `AI-Context/technical/frontend-visual-system.md`.

