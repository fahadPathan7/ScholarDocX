# Frontend Visual System

## Direction

ScholarDocX should feel like a local research command center: focused,
interactive, and polished without becoming decorative marketing UI.


## Principles

- Use a distinctive but highly readable local-font stack and tighter typography
  scale.
- Keep global headers compact enough that workspace content remains visible on
  laptop-sized screens.
- Keep work surfaces scan-friendly, with dense cards and clear hierarchy.
- Project card grids should prefer a maximum of four cards per row on wide
  screens. Card widths should be fluid within the available grid space, not
  fixed pixel widths; stable card height is acceptable for scan consistency.
- Use color to clarify hierarchy and state, not to overpower body text or make
  labels hard to read.
- Prefer low-saturation, eye-soothing canvas and surface colors for planning
  screens. Avoid bright warm accents, heavy gradients, and visible background
  patterns that compete with work content.
- The app shell, left navigation, header, and floating side panels should remain
  fixed within the viewport. Scroll should be delegated to content sections,
  section bodies, sheet tables, chat/message bodies, and notification lists.
- Sheet tables should behave like spreadsheet work areas: the row-number/index
  column stays frozen on the left during horizontal scroll, and grouped column
  headers must keep high text contrast against their background. There is no repetitive
  Actions column on the sheet; instead, row controls (View Details, Edit, and Email) are
  contextually shown in the selection toolbar only when exactly 1 row is selected. When
  multiple rows are selected, only bulk actions (Copy, Duplicate, Delete) are visible.
- Sheet rows should default to a stable, scan-friendly preview height. Long
  text, long words, emails, and URLs should be clipped or wrapped within their
  own cells and never force automatic row expansion or bleed into adjacent
  columns.
- Clipped sheet cells should not use ambiguous fade blocks. Use a clear,
  clickable preview state and provide a full-cell viewer for reading and
  copying the complete value.
- Sheet cell interactivity should be applied to the whole visible cell area,
  not a small inner text chip. Avoid browser tooltip labels and zoom-in cursors
  in the grid because they make the spreadsheet feel less native.
- Full-cell editing should happen inside the cell viewer, with clear Save and
  Cancel actions, and should persist only the selected cell value.
- Multi-line cell editors should auto-size as the user types until roughly 10
  text lines are visible, then use editor-level scrolling instead of growing
  the whole modal.
- Empty cells should have a quiet but clickable full-cell target, not a dead
  dash. Their editor panel should use the same typed controls as filled cells.
- File cells in the full-cell editor should reuse the existing local document
  picker/upload component so attachment selection stays consistent across the
  record form and single-cell editing.
- Cell text and cell formatting (bold/italic/underline/strikethrough, text
  color, cell background, row background, alignment, font size presets, and a
  curated system-font list of 15 fonts: System Sans, Arial, Helvetica, Verdana,
  Trebuchet MS, Calibri, Optima, Century Gothic, Georgia, Palatino, Garamond, Bookman, Goudy Old Style, Times New Roman, and Monospace) is applied through a compact formatting bar
  (`CellStyleBar`) rendered directly inside the section header actions
  (`SheetToolbarActions`), positioned to the left of the 'Import / Export' button
  when a cell is focused, with parity in the full-cell viewer and full screen mode. The "Applying to X selected rows"
  scope selection indicator is positioned to the left of the formatting bar (`CellStyleBar`).
  The bar must not distort row height. File cells never show the format bar. Formatting
  persists per cell in the row's `_cellStyles` reserved key and per row in
  `_rowStyle`; it is never sent to CSV exports. Custom color inputs and swatches
  do not lose editor focus when clicked. Text and background color buttons feature
  colored horizontal underlines beneath their icons to represent the current state,
  defaulting to transparent dashed lines when no custom color is set.
- Sheet toolbar action buttons (Columns, Edit columns, Categorize, Date Colors, Email Config, Views)
  render with the active/selected status class (`.secondary.active`) whenever their popovers, modals,
  or views are currently active or open.
- Horizontal overflow areas should feel pannable: users can hold the primary
  mouse button and drag left/right on the scroll surface to move sideways,
  without hijacking interactions on buttons, links, inputs, selects, textareas,
  file pickers, or modal controls.
- Use a balanced palette with enough contrast to separate work surfaces from the
  canvas. Muted teal can remain the primary action color, but pair it with
  restrained blue and warm accent states so the interface does not read as a
  single green wash.
- Dropdown menus (such as Columns and Categorize list selectors) use a compact row spacing layout (0.125px gap, 0.2px 8px padding, 0px margin inputs, 1.2 line height) to maintain dense and clean scannability.
- Dashboard typography should be compact: headings and metric numbers should
  support scanning without visually shouting.
- Admin dashboard panels should feel like a dense operational console: compact
  metric cards, clear table headers, stable panel heights, and polished empty
  states. Avoid sparse blank card bodies when recent admin activity is limited.
- Profile pages should keep identity, workspace, plan, usage, and security
  actions visually balanced. Avoid one column ending far above another on
  desktop when cards can be regrouped without changing behavior.
- The collapsed left navigation should behave as an icon rail: icons stay at
  readable size, buttons are centered, active state does not overlap the icon,
  and hidden text remains accessible through labels or tooltips.
- Use motion for state changes, panel entry, card hover, and focus feedback.
- Keep floating panels visually separate from page content through depth,
  backdrop blur, and clear headers.
- **Modal backdrop blur scoping — NON-NEGOTIABLE (regressed 3+ times).**
  Read this entire block before creating or editing any modal.

  **Design intent**

  | Region | Blurred when modal open? |
  |--------|--------------------------|
  | Left Sidebar | No — stays crisp |
  | Global TopBar | No — stays crisp |
  | Breadcrumbs, view headers, toolbar, table | Yes |
  | Modal panel | No — stays sharp |

  **Architecture (two pieces that must work together)**

  1. **Portal target** — `<Modal>` (`frontend/src/components/Modal.tsx`) uses
     `createPortal(…, document.querySelector(".main-content"))`. The backdrop
     must be a direct child of `.main-content` (`position: relative`).
  2. **CSS positioning** — `.modal-backdrop-main` uses `position: absolute;
     inset: 0` so it fills `.main-content` only. The base `.modal-backdrop`
     class is `position: fixed` (for `scope="body"` modals in `App.tsx`);
     `.modal-backdrop-main` overrides that — do not merge or remove the override.

  **Why agents regress this (do not repeat)**

  - Grep for `modal-backdrop-main` and copy a legacy inline div from another file
    → blur scoped to `.section-body` only (breadcrumbs stay sharp). **Wrong.**
  - “Simplify” modal CSS by making `.modal-backdrop-main` fixed like `.modal-backdrop`
    → blur bleeds over sidebar and TopBar. **Wrong.**
  - Follow “use existing patterns” and copy `RecordFormModal`, `CsvImportModal`,
    `StickyNotesView`, etc. → all legacy inline backdrops. **Wrong pattern.**

  **Only approved implementation**

  ```tsx
  import { Modal } from "../Modal";

  return (
    <Modal onClose={onClose} zIndex={1060 /* optional, for nested modals */}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} …>
        …panel content only — no backdrop div…
      </form>
    </Modal>
  );
  ```

  Canonical reference: Create Project modal in `ProjectWorkspace.tsx`.

  **Forbidden markup**

  ```tsx
  // NEVER — missing portal; blur trapped in nearest positioned ancestor
  <div className="modal-backdrop modal-backdrop-main" onClick={onClose}>
    <form className="modal-panel">…</form>
  </div>
  ```

  **Canonical CSS** (mirror in `styles.css` and `visual-refresh.css`; do not edit
  without reading AGENTS.md modal table):

  ```css
  .modal-backdrop-main {
    position: absolute;                 /* NOT fixed — scopes to .main-content */
    inset: 0;
    min-height: 100%;
    backdrop-filter: blur(8px) saturate(110%);
    background: radial-gradient(circle, rgba(15,23,20,0.4) 0%, rgba(15,23,20,0.55) 100%);
    z-index: 1050;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 160px;                 /* lowered, not flush to top */
  }
  ```

  **Legacy inline backdrops to migrate (do not copy from these)**

  - `RecordFormModal.tsx`, `CsvImportModal.tsx`, `RowPeekPanel.tsx`
  - `StickyNotesView.tsx`, `HuntProfileModal.tsx`, `AddToTrackerModal.tsx`
  - `ProjectDashboard.tsx`, `AboutView.tsx`

  When editing any of the above, convert to `<Modal>` in the same change.

  **Already migrated to `<Modal>`:** Email Configuration, Edit columns, Add column,
  Create Project, Create Sheet (via `ProjectWorkspace.tsx`).

  **Admin/settings dense dialogs:** pass `<Modal compact>` for `padding-top: 48px`
  instead of the default `160px` (sheet/project modals with breadcrumbs).
- Modals within the main content area should blur only the main work surface and MUST NOT blur the app's TopBar or the left Sidebar.
- The view's own headers (like "Admin Dashboard") SHOULD be blurred when a modal is open. Only the global app TopBar remains unblurred.
- All new modal creations must keep appropriate space from the edges (e.g., use `items-start justify-center pt-24` or `items-center p-4 sm:p-8` depending on layout).
- Avoid external font/CDN dependencies to preserve secure personal workspace expectations.
- Prefer additive override styles in focused CSS files rather than expanding
  oversized global CSS.
- The public landing page (`frontend/src/components/LandingPage/`) is split into
  a colocated component directory (one file per section + colocated CSS + an
  `index.tsx` barrel) rather than a single component, to respect the file-size
  rule as the page grew. `main.tsx` imports it as `./components/LandingPage` and
  resolves to the barrel with no router change.
- Landing-page motion is dependency-free: a `useReveal()` hook wraps
  `IntersectionObserver` and toggles a shared `.reveal` → `.in-view` CSS
  transition (staggered via a `--reveal-delay` custom property). It honors
  `prefers-reduced-motion` by revealing content immediately. The same hook
  powers a count-up `StatsBand` (capability numbers only, never fabricated user
  counts). No framer-motion or animation library is added.
- The hero uses a pure CSS/SVG mock of the workspace (`ProductPreview`) — no
  external screenshots or CDN assets — built from the existing `--ui-*` tokens.
- The landing FAQ is an accessible accordion (single-open, `aria-expanded`,
  height animated via a `grid-template-rows: 0fr → 1fr` transition rather than
  JS-measured heights).
- The public auth pages (`LoginPage.tsx`, `RegisterPage.tsx`) use a shared set of
  `auth-*` visual primitives in one `LoginPage.css` (imported by both pages),
  built from the `--ui-*` tokens — light canvas gradient, white paper card, mint
  logo mark, muted-teal primary button/links, teal focus rings. This replaces a
  prior dark `bg-zinc-*` / `bg-emerald-*` Tailwind palette that clashed with the
  system. Every auth view (login, register, forgot password, request invite,
  success states) renders a "Back to home" `Link` to `/` as a pill at the
  top-left of the card, placed above the conditional view block so it is always
  visible. Auth logic, API calls, and routing are unchanged by the restyle.

## Implementation Notes

- `frontend/src/styles.css` is oversized and should not receive broad new
  visual-system rules.
- New broad visual polish should live in dedicated CSS files imported after the
  legacy stylesheet.
- Component markup changes should stay minimal unless the behavior or hierarchy
  needs to change.
- Split-pane work areas should avoid stretched side panels when one pane is
  only a control form. The content-heavy pane can own an internal scroller.
- Documents category grid cards utilize a compact layout (height auto/118px, padding 14px 16px) with glassmorphism (translucent background, blur filter) and quiet, neutral hover scaling (no bright colored glows) to maintain a low-saturation, eye-soothing visual system. Category titles display inline to the right of the category icons (inside `.doc-category-card-title-group`) to yield a clean horizontal layout that eliminates empty vertical space. Typography is compact (16px semibold title) with overflow clipping to prevent wrapping. To minimize visual noise, the latest upload subtext (`11px` metadata) is conditionally displayed only when the category has documents, leaving 0-file cards completely clean and centered. Document upload actions are located at the card-level (inside `.doc-category-card-footer-actions`), pre-populating and pre-selecting the specific category within the upload modal.
- Projects grid cards utilize a flexible layout matching the glassmorphic aesthetics. Auto-sizing heights (removing fixed grid auto rows) prevent empty vertical spacing and allow cards to stretch to the tallest card in their row. Accent strips on the left side of the cards are disabled in favor of clean border lines. Subtitle metadata and descriptions utilize small, clean fonts (11px meta, 12px description with a 2-line clamp). Card toolbar actions use low-contrast, borderless button styling for administrative controls (Pin, Dashboard, Edit, Delete), showing soft translucent background and border accents only when active or hovered. Projects are grouped by degree type in a case-insensitive manner (e.g. 'phd' and 'PhD' belong to the same group) to avoid duplicate headers in the list.
- To prevent unmounting blinks and layout shifts, main navigation views (Dashboard, Projects, Documents, Sticky Notes, Whiteboard, etc.) are kept mounted in the DOM using a `.tab-container` class and hidden dynamically via a `.hidden-tab` class (`display: none !important`).
- To prevent layout shifts inside the Projects card grid when sheet quotas are loading asynchronously, the progress bar and chip render immediately with a subtle grey pulse loading animation (`.quota-loading` and `.loading`) instead of completely hiding the block.
- The `Field` component matches option values case-insensitively when rendering select dropdowns. This resolves visual mismatches where database values (e.g. 'phd') have different casing than option keys (e.g. 'PhD'), preventing the dropdown from defaulting to 'Select'.
- Inner page layouts and workspace components must NOT use semantic `<main>` elements for their layout content (e.g. `<div className="news-main">` instead of `<main className="news-main">`). The HTML `<main>` tag is styled globally in the visual system for the root viewport layout, and nesting inner `<main>` tags will result in layout height pollution (e.g. height: 100dvh) and screen clipping.
- The loading Splash Screen features a glassmorphic warning banner and a rotating carousel of tips and academic quotes (cycling every 6 seconds) with subtle slide-up fade animations (`.fade-in`, `.fade-out`, `.splash-tips-container`, `.splash-render-warning`, `.splash-warning-pulsar`) to communicate Render's free tier sleep delay elegantly without causing user fatigue.
- The subscription Plan Comparison view utilizes a dedicated style sheets module (`plan-comparison.css`) that transforms the comparison grid into a light glassmorphic deck on a clean slate background (`#f8fafc`). The design includes soft ambient background color washes (`.plan-glow-node-1`, `.plan-glow-node-2`), micro-glowing card outlines color-coded per tier (with General in blue tint, Pro in emerald tint, and Max standing out as a premium dark obsidian card), clean sans-serif typography (`font-extrabold text-sm`) for feature limit readouts, and a diagonal glare sweep reflection (`.glare-sweep-beam`) that glints when cards are hovered.
- All user-facing alerts and modals must avoid local-first persistence terms (e.g. 'saved locally', 'store locally') when referring to cloud-hosted resources such as user profiles, avatars, or uploaded files. Instead, use cloud-oriented terms such as 'Profile saved.', 'Avatar saved.', 'Ready to upload', and 'Upload file'.
- The Whiteboard view allows deleting any whiteboard, including the final active board. When no whiteboards remain, the component cleanly resets drawing state and transitions to the `wb-empty-state` screen ('No whiteboards yet') with a CTA to create a new whiteboard.



