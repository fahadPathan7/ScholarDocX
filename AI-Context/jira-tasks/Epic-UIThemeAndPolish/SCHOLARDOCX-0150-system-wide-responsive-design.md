# SCHOLARDOCX-0150: System-Wide Responsive Design & Adaptive Layout Engine

**Epic**: UI Theme & Polish (`Epic-UIThemeAndPolish`)  
**Status**: Completed  
**Priority**: High  

## Goal
Implement a system-wide adaptive layout engine for ScholarDocX across all screen sizes (widescreen >1150px, laptops ~1092px/1200px, split screens, tablets 768px, and mobile 320px–430px), enforcing 1-row ribbon toolbars with left-right scrolling, title flex-shrink protection, off-canvas navigation drawer, and single-column linear stacking for profile and about views on medium windows.

## Acceptance Criteria
- [x] On all screen sizes, `.section-head`, `CellStyleBar`, `.sheet-toolbar`, and `SheetToolbarActions` remain in 1 single horizontal row with `overflow-x: auto`.
- [x] Section title headers (`.section-head > div:first-child`) enforce `flex-shrink: 0`, `min-width: max-content`, and `white-space: nowrap`.
- [x] Unified system-wide responsive breakpoint threshold to `@media (max-width: 1450px)` across `responsive.css` and `about-refresh.css`.
- [x] Synchronized `useIsMobile()` hook in `useMediaQuery.ts` to `(max-width: 1450px)` for `<Menu />` 3-bar hamburger icon rendering.
- [x] Advisor Atlas Research History panel opens OVER content with high `z-index: 500` without squishing the search form (`.atlas-main` stays 100% full width).
- [x] Admin Panel Users Tab filter pills and search bar wrap fluidly on smaller screens.
- [x] Comprehensive system-wide modal audit completed: enforced `overflow-x: auto !important`, `max-width: 95vw !important`, `min-width: 750px` table protection, expanded `Price (USD)` column width to `20%` (min-w 90px input), and `grid-cols-1` single-column layout for Polar.sh product ID fields across ALL modals (`TokenPacksTab`, `ModelPricingTab`, `PlanPricingTable`, `SettingsTab`, `UsersTab`, `RoleLimitsTab`, `models-modal-panel`, etc.).
- [x] Sheet toolbar dropdown menus (`Categorize`, `Columns`, `Import / Export`, `Views`, `Ask AI`, filter menus) elevated to `zIndex: 9999` with drop shadow so they float above table headers without clipping or going under elements.
- [x] `npm run build` passes with 0 type/CSS errors.
- [x] `npm test` passes 96 / 96 unit tests.

## Changed Files
- `frontend/src/about-refresh.css` — updated `@media (max-width: 1450px)` to single-column flex stack with full vertical scroll.
- `frontend/src/responsive.css` — updated 1450px breakpoint threshold, off-canvas navigation drawer, Advisor Atlas overlay drawer, universal modal horizontal scrolling, table min-width 750px, and dropdown popover `zIndex: 9999` rules.
- `frontend/src/components/AboutView.tsx` — integrated action buttons into card footers and updated flow/guide steps to 4 points each.
- `frontend/src/components/AdvisorAtlasView.tsx` — configured Research History panel collapse state and removed redundant header toggle button.
- `frontend/src/components/sheet/SheetToolbar.tsx` — elevated dropdown menus (`Categorize`, `Columns`, `Views`, `Data`) to `zIndex: 9999`.
- `frontend/src/components/sheet/AskAiMenu.tsx` — elevated `AskAiMenu` to `zIndex: 9999`.
- `frontend/src/components/sheet/SheetTable.tsx` — elevated column filter menu to `zIndex: 9999`.
- `frontend/src/components/admin/UsersTab.tsx` — updated filter rows, search bar, and modal backdrop positioning (`pt-6 sm:pt-16`).
- `frontend/src/components/admin/PlanPricingTable.tsx` — set `min-w-[750px]` and `overflow-x: auto` on pricing table.
- `frontend/src/components/admin/ModelPricingTab.tsx` — set `min-w-[750px]` and expanded input/output cost columns to 19%.
- `frontend/src/components/admin/TokenPacksTab.tsx` — set `min-w-[750px]`, expanded Price (USD) column to 20%, and added min-w 90px to input containers.
- `frontend/src/components/admin/SettingsTab.tsx` — fixed `overflow-x-auto` on `showTokenPacksModal` wrapper and converted Polar.sh product ID input grids to `grid-cols-1`.
- `frontend/src/components/admin/RoleLimitsTab.tsx` — updated modal backdrop positioning and `overflow-x: auto`.
- `frontend/src/hooks/useMediaQuery.ts` — updated `useIsMobile` query to `(max-width: 1450px)`.
- `AI-Context/technical/responsive-design-system.md` — updated technical context with 1450px threshold, modal table 750px min-width, and dropdown z-index elevation.

## Verification
- Build: Passed in 2.45s (`npm run build`).
- Vitest Unit Tests: Passed 96 / 96 tests (`npm test`).
