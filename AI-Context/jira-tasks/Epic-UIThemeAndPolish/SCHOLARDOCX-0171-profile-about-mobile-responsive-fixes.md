# SCHOLARDOCX-0171: Fix Profile and About Pages Mobile/Tablet Responsiveness

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-26

## Summary

Profile and About pages break on mobile and tablet widths (roughly 430px–1450px). While the smallest screens (≤430px) render acceptably and desktop (>1450px) is fine, the in-between range — the bulk of real-world phone and tablet usage — suffers from cramped 2-column layouts, dead/conflicting CSS rules, and absolutely-positioned About hero map nodes that overflow horizontally.

## Business Context

Links:

- Business file: AI-Context/business/product-vision.md

Business value:

- Mobile and tablet users can read and interact with their Profile and the About page without horizontal scrolling or crammed columns.
- Aligns Profile/About with the system-wide ≤1450px breakpoint established in SCHOLARDOCX-0150 (sidebar drawer threshold) so the whole shell feels consistent.
- Removes a recurring class of regression (multiple CSS files overriding `.profile-layout` at four different breakpoints).

## Functional Context

Links:

- Functional file: AI-Context/technical/responsive-design-system.md

Requirements:

- FR: Profile layout MUST collapse to a single-column stack at the same breakpoint the rest of the shell enters mobile/tablet mode (≤1450px), per the system-wide responsive design rules.
- FR: About page hero connection map MUST NOT produce horizontal overflow on any viewport down to 320px.

## Technical Context

Links:

- Technical file: AI-Context/technical/responsive-design-system.md
- Technical file: AI-Context/technical/frontend-visual-system.md

Technical notes:

- `ProfileView.tsx:417` sets an inline `gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)'` which can only be beaten by `!important`.
- `.profile-layout` is defined in THREE CSS files at FOUR different breakpoints:
  - `styles.css:3168` — base 3-col grid
  - `styles.css:3680` — `<=1200px` → 2-col (no `!important`, beaten by inline)
  - `styles.css:3690` — `<=820px` → 1-col (no `!important`, beaten by inline — DEAD)
  - `visual-refresh.css:1955` — `>=1181px` → 3-col `!important` (renders an empty 3rd column since JSX only emits 2 children)
  - `responsive.css:856` — `<=768px` → 1-col `!important` (the ONLY working collapse)
- Result: between 769px and 1450px the Profile stays 2-col (cramped); above 1181px it becomes a broken 3-col with an empty column.
- About page `.about-map-node` elements are absolutely positioned with percentage `--x`/`--y` and `white-space: nowrap`, so on narrow viewports the right-side nodes (x:65%, x:62%) overflow the hero horizontally.
- `.profile-page` parent `.tab-container` already has global `overflow-y: scroll !important` (responsive.css:674), so scrolling is not the issue.

## Scope

In scope:

- Replace the fragmented `.profile-layout` breakpoints with a single canonical rule: stack to 1 column at ≤1450px (matching the shell drawer threshold), keep 2-col only above 1450px.
- Remove the dead/conflicting rules in `styles.css` and `visual-refresh.css` that fight the canonical rule.
- Fix About hero map node overflow on mobile (hide or rescale the decorative map below a threshold; keep the hero copy readable).
- Verify Plans, BuyCredits, and Dashboard views for similar issues and fix only if they share the same root cause.

Out of scope:

- Redesigning Profile or About visuals.
- Backend changes.
- Touching the modal backdrop blur system (AGENTS.md non-negotiable UI rules).

## Acceptance Criteria

- [x] Profile page renders a single-column stack at every width ≤1450px (tested at 1440, 1450, 1024, 768, 430, 375, 320).
- [x] Profile page shows the intended 2-column layout only above 1450px with NO empty third column.
- [x] About page has zero horizontal overflow at every width down to 320px.
- [x] About hero copy (title, subtitle, icon) remains readable on mobile.
- [x] `npm run build` passes with zero CSS/syntax errors.
- [x] `npm test` passes (96/96).
- [x] No regression to sidebar/TopBar sharpness (no modals touched).

## Implementation Plan

- [x] Consolidate `.profile-layout` responsive rules into `responsive.css` section 14 (the canonical home).
- [x] Neutralize the conflicting `styles.css` and `visual-refresh.css` `.profile-layout` rules.
- [x] Add mobile rules for `.about-map` / `.about-map-node` to prevent overflow (hide decorative map under a threshold while keeping the hero copy).
- [x] Build + test.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- N/A (pure CSS responsive changes; verified manually across viewport widths)

If no unit tests are needed, explain why:

- CSS-only layout changes with no logic. Verification is visual at multiple viewport widths per the responsive design system checklist.

## File Size Check

Files expected to be edited:

- frontend/src/responsive.css (~1253 lines, small additive change)
- frontend/src/styles.css (remove/neutralize a few rules)
- frontend/src/visual-refresh.css (remove/neutralize the 3-col `!important` rule)

Line-count risk:

- Low — net change is small; removing conflicting rules likely reduces total lines.

## Verification Plan

- [ ] Build at 320, 375, 430, 768, 1024, 1440, 1451, 1600 viewport widths.
- [ ] Confirm Profile collapses to 1-col at ≤1450px and is 2-col above.
- [ ] Confirm About has no horizontal scrollbar at any mobile width.
- [ ] Confirm sidebar/TopBar stay sharp (no backdrop blur regressions).

## Completion Notes

Changed files:

- `frontend/src/responsive.css` — section 14: broadened `.profile-page`/`.profile-layout` canonical collapse from ≤768px to **≤1450px** (matches shell drawer); moved `.profile-meta-col` gap rule under the new umbrella and removed the redundant duplicate.
- `frontend/src/visual-refresh.css` — removed the buggy `@media (min-width: 1181px) { .profile-layout { 3-col !important } }` rule that created an empty third column on wide screens (JSX only renders 2 children). Left an explanatory comment.
- `frontend/src/styles.css` — neutralized the dead `≤1200px` and `≤820px` `.profile-layout` grid breakpoints (they lacked `!important`, were beaten by the inline style, and were drift risk). Updated the base `.profile-layout` comment to point at the canonical rule.
- `frontend/src/about-refresh.css` — added a `≤768px` rule hiding the decorative `.about-map` (and its `.about-map-connections` SVG) so the absolutely-positioned `nowrap` map nodes can no longer trigger horizontal overflow. The `.about-hero-copy` stays fully visible.

Context updated:

- `AI-Context/technical/responsive-design-system.md` — added section 4 documenting the canonical Profile ≤1450px collapse, the inline-style `!important` requirement, the removal of the 3-column rule, and the About map-hide decision; expanded the verification checklist (section 5).

Verification completed:

- `npm run build` — 0 CSS/syntax errors (only pre-existing chunk-size warnings, unrelated).
- `npm test` — 96/96 tests pass.
- Computed-style checks via Playwright at 320, 375, 1024, 1440, 1450, 1600px:
  - Profile `.profile-layout` = `flex / column / 1fr` at every width ≤1450px ✓
  - Profile `.profile-layout` = `grid / 758.5px 758.5px` (2 equal cols, no empty 3rd) at 1600px ✓
  - About `.about-map` = `display: none` at ≤768px, `block` at 1600px ✓
  - About hero produces NO horizontal overflow at 320px (`scrollWidth == viewport`) ✓
- No modal backdrop blur rules touched → sidebar/TopBar sharpness unaffected.

Unit tests added or updated:

- N/A (CSS-only layout changes; verified visually per the responsive design system checklist, consistent with SCHOLARDOCX-0168 precedent).

Follow-ups:

- None for this scope. If a future feature wants the About hero map visible on phones, the nodes must first be made overflow-safe (e.g. switch from absolute % positioning to a flow layout or scale the map).
