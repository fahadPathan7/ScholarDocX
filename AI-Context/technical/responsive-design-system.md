# Responsive Design System & Mobile/Tablet Architecture

This document defines the non-negotiable responsive design rules and architecture for **ScholarDocX**. Every AI agent working on frontend code or layout MUST adhere strictly to these principles.

---

## 1. Breakpoint Architecture & Sidebar Drawer Threshold

| Breakpoint Threshold | Shell & Layout Mode | Sidebar Nav Strategy | Net Content Width | Layout Strategy for About & Page Views |
|----------------------|---------------------|----------------------|-------------------|----------------------------------------|
| **> 1450px** | Widescreen / Desktop | Persistent Left Sidebar (`280px`) | > 1170px | Multi-column side-by-side desktop grid |
| **≤ 1450px** (incl. 1200px/1440px laptop views) | Laptop / Split Screen / Tablet / Mobile | Off-Canvas Drawer (`≡` 3-bar icon, `z-index: 1080`) | 100% of viewport width | Single-Column Linear Stack with full vertical scrolling (`overflow-y: auto !important`) |

> **Rule 1: System-Wide Sidebar Drawer Breakpoint Set to 1450px**
> On all screen widths **≤ 1450px** (including 1200px/1440px laptop/split-screen views), the sidebar converts into an off-canvas drawer controlled by the TopBar hamburger button (`≡`). Main content receives **100% of the viewport width** so page views never experience squished content columns.

---

## 2. Full-Screen Parity Horizontal Action Toolbar (`.section-head`, `.sheet-toolbar` & `SheetToolbarActions`)

> **Rule 2: Never allow `.sheet-toolbar`, `.toolbar-left`, `.toolbar-right`, or `.section-head > div:last-child` to wrap buttons into stacked lines — enforce single-row horizontal flex layout with `overflow-x: auto` globally across ALL screen sizes**

- **Title `flex-shrink: 0` & `white-space: nowrap` Protection**: Section header title containers (`.section-head > div:first-child`), eyebrows, and `<h2>` elements MUST declare `flex-shrink: 0 !important; min-width: max-content !important; white-space: nowrap !important;`.
- **Single-Row Sheet Toolbar (`.sheet-toolbar`, `.toolbar-left`, `.toolbar-right`)**: Styled with `display: flex; flex-direction: row; align-items: center; flex-wrap: nowrap; gap: 8px; overflow-x: auto; -webkit-overflow-scrolling: touch;`.
- **Global Horizontal Action Alignment (`display: flex; flex-direction: row; flex-wrap: nowrap`)**: `.section-head > div:last-child` (the `SheetToolbarActions` container) is styled with `display: flex !important; flex-direction: row !important; align-items: center !important; gap: 8px !important; flex-shrink: 0 !important; flex-wrap: nowrap !important;`.

---

## 3. Overlay Drawers & Modal Horizontal Scrolling Architecture

- **Advisor Atlas Off-Canvas Drawer (≤ 1450px)**: The **Research History** sidebar opens **OVER** the workspace content (`position: absolute; z-index: 500; width: 280px`) so `.atlas-main` stays **100% full-width** at all times without horizontal column squeezing.
- **Admin & Settings Modals Horizontal Scrolling**: All modal panels containing wide tables or configuration inputs (`PlanPricingTable`, `ModelPricingTab`, `.pricing-modal-panel`) enforce `max-width: 95vw !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch;` and `min-width: 640px` on internal tables so inputs and column headers never collide on smaller screens.

### Modal Mobile Responsiveness (≤768px)

> **Rule 3: Sheet modals (Edit Columns, Add/Edit Record, Add Column) MUST convert from grid layouts to vertical flex layouts on mobile screens**

**Edit Columns Modal** (`EditColumnsModal`, `.edit-column-item`):
- Desktop uses 6-column grid: `grid-template-columns: 60px 1fr 130px 150px 75px 36px`
- Mobile (≤768px): Converts to `flex-direction: column` with full-width stacked controls
- Drag handle reorder buttons become full-width horizontal pairs for easier tapping
- All inputs/selects use 16px font size to prevent iOS auto-zoom on focus
- Touch targets meet 44px minimum height for accessibility
- Each column item gets a card-like appearance with border and background

**Add/Edit Record Modal** (`RecordFormModal`, `.record-form`):
- All form fields stack vertically with 16px font size inputs
- Input/select/textarea controls have 44px minimum height
- Modal max-height increases to 85vh to accommodate vertical layout

**Add Column Modal** (`AddColumnModal`, `.column-form`):
- Form fields use 16px font size and 44px minimum heights
- Color picker swatches enlarge to 32px for touch interaction
- Content padding adjusted to 16px for mobile

**SelectOptionsEditor** (`.select-options-editor`):
- Option pill inputs increase to 80px width with 14px font
- Add button and input have 44px minimum height
- Improved spacing for touch interaction

**Small Phone Breakpoint (≤430px)**:
- Modal backdrop padding reduces to 40px top, 8px sides
- Modal action buttons stack vertically (full width)
- Color picker wraps if needed
- Further padding reductions for compact screens

---

## 4. Verification Checklist for AI Agents

- [ ] Test viewports at `320px`, `375px`, `430px`, `768px`, `1092px`, `1200px`, `1440px`, and `1450px`.
- [ ] Confirm sidebar converts to drawer mode at ≤ 1450px (`useIsMobile()` in `useMediaQuery.ts`).
- [ ] Confirm `.about-page` uses single-column stacked layout with full vertical scroll on viewports ≤ 1450px.
- [ ] Confirm Advisor Atlas Research History drawer opens OVER content with high `z-index: 500`.
- [ ] Confirm Admin settings modals support horizontal left-right scrolling without column collision.
- [ ] Run `npm run build` to confirm 0 build/CSS syntax errors.
- [ ] Run `npm test` to confirm all unit tests pass.
