# Frontend Visual System

## Direction

ScholarDocX should feel like a local research command center: focused,
interactive, and polished without becoming decorative marketing UI.

> **Responsive Design System**: For all non-desktop viewports (≤ 1200px), off-canvas navigation drawer, single-column flex linear card stacking, compact topbar controls, and unrestricted horizontal/vertical scrollability, read [responsive-design-system.md](responsive-design-system.md).


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
- System-wide responsive design is enforced across six key viewports: 320px, 375px, 430px (phones), 768px (tablets), 1024px, and 1440px (desktops). Playwright visual audit sweeps inspect all in-app tabs and public routes to ensure 0 horizontal page-level overflow offenders (`r.width > mainW`). On smaller viewports (≤768px and ≤430px), static non-functional decorative header copy, ambient canvas banners, and heavy marketing subtitles are hidden to declutter the workspace and maximize scrollable functional area (`overflow-y: auto`).
- **Responsive Single-Row Flex Parity Rules**: Section headers (`.section-head`), action toolbars (`SheetToolbarActions`), cell formatting ribbons (`CellStyleBar`), and sheet toolbars (`.sheet-toolbar`) MUST maintain a single-row horizontal flex layout (`flex-direction: row !important; flex-wrap: nowrap !important; overflow-x: auto !important`). Never use un-scoped `.section-head div` selectors which force action buttons into vertical columns. Title containers (`.section-head > div:first-child`) MUST have `flex-shrink: 0 !important; min-width: max-content !important; white-space: nowrap !important` so section titles (`Edit rows and columns` / `ttt`) are never crushed into a 10px vertical line of single letters. Full spec: [responsive-design-system.md](responsive-design-system.md).

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
- **Research Expert PDF viewer** (`ResearchPdfViewer.tsx`) uses the `pdfjs-dist`
  library to render uploaded papers client-side and highlight cited passages on
  the real PDF text layer. The PDF.js worker is bundled locally
  (`import "pdfjs-dist/build/pdf.worker.min.mjs?url"`) — no CDN, consistent with
  the local-first/no-external-CDN rule. The whole viewer is `React.lazy`-loaded
  (behind `Suspense`) so the ~480 KB PDF.js chunk only downloads when a user
  actually opens "View in PDF", keeping the main bundle lean. Minimal PDF.js
  `.textLayer` positioning rules are inlined in `research-pdf-viewer.css` (the
  full `pdf_viewer.css` is intentionally not imported).
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
  `auth-*` visual primitives in `LoginPage.css` built from the `--ui-*` tokens.
  The card layout uses a wide container (`.auth-card.auth-card-wide`, `max-width: 740px`)
  for registration to allow multi-column horizontal field layouts: Plan and Billing
  Cycle side-by-side, full-width single horizontal Price Readout banner (mint background),
  Display Name and Email side-by-side, Password and Confirm Password side-by-side.
  The registration page defaults to opening the "Purchase a plan" tab.
  Price readout, hint text, cycle toggle button text (`Quarterly Save 20%`), and footer links
  formatting are set to single-line display (`white-space: nowrap`) to prevent line wrapping
  and vertical overflow on laptop viewports.
  Quarterly billing toggles across the landing page, registration form, and plan comparison view
  display a promotional `Save 20%` badge chip for marketing incentive.
  Every auth view renders a "Back to home" `Link` to `/` as a pill at the top-left of
  the card. All sub-views (Request Invite, Forgot Password, Success screens) provide both
  "Back to login" and "Back to registration" links. Auth logic, API calls, and routing are unchanged.
- The Admin Panel Users tab (`UsersTab.tsx`) includes a **Join Method** column (`Joined by Invite` amber badge vs `Online Purchase` emerald badge vs `Admin Created` indigo badge) with a corresponding `Join Method` filter subgroup (`All Methods` | `Joined via Invite` | `Online Purchase` | `Admin Created`), as well as a **Plan Source** column (`Via Polar` cyan badge vs `Admin Set` purple badge vs `Not Subscribed` slate badge) with a corresponding `Plan Source` filter subgroup (`All Sources` | `Via Polar` | `Admin Set` | `Not Subscribed`) so admins can track both how accounts joined and how current active plans were granted.
- The Admin Panel Info tab (`InfoTab.tsx`) includes a dedicated **System Cron Jobs & Automated Maintenance** panel detailing active background maintenance routines (Expired Plan Downgrade, Unpaid Pending Account Cleanup), their schedules (Daily UTC, 2-hour interval), routes, CLI scripts, auth headers, and execution behaviors.

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
- The loading Splash Screen features a subtle, borderless sub-line (`.splash-message-secondary`, `rgba(255,255,255,0.52)`, `12px`, `font-weight: 400`) without icons or borders for the cold-start notice ("The first load after a period of inactivity may take up to a minute while the server wakes up.") alongside a rotating carousel of tips and academic quotes (cycling every 6 seconds) with subtle slide-up fade animations (`.fade-in`, `.fade-out`, `.splash-tips-container`) to communicate Render's free tier sleep delay quietly without stealing visual focus.
- The subscription Plan Comparison view utilizes a dedicated style sheets module (`plan-comparison.css`) that transforms the comparison grid into a light glassmorphic deck on a clean slate background (`#f8fafc`). The design includes soft ambient background color washes (`.plan-glow-node-1`, `.plan-glow-node-2`), micro-glowing card outlines color-coded per tier (with General in blue tint, Pro in emerald tint, and Max standing out as a premium dark obsidian card), clean sans-serif typography (`font-extrabold text-sm`) for feature limit readouts, and a diagonal glare sweep reflection (`.glare-sweep-beam`) that glints when cards are hovered.
- All user-facing alerts and modals must avoid local-first persistence terms (e.g. 'saved locally', 'store locally') when referring to cloud-hosted resources such as user profiles, avatars, or uploaded files. Instead, use cloud-oriented terms such as 'Profile saved.', 'Avatar saved.', 'Ready to upload', and 'Upload file'.
- **No algorithm or data-pipeline jargon in user-facing copy (SCHOLARDOCX-0174)**: rendered UI strings (headings, body text, toasts, error messages, loading text, tooltips, marketing/upgrade copy, button labels) must describe the **user outcome**, never the mechanism. Banned terms include "vector", "embeddings"/"vector embeddings", "pgvector", "semantic chunking", "chunks" (e.g. "X chunks indexed", "Chunk #3"), "cosine similarity"/"similarity search", "HNSW"/"IVFFlat", "text extraction", "indexing"/"re-indexing", "token count", "synthesizing", provider/model IDs (e.g. "jina-embeddings-v4", "text-embedding-004"), infrastructure names (Supabase, Render, PostgreSQL), and raw HTTP status codes ("Request failed: 403"). Approved plain replacements: embeddings/vector search → "the paper's content" / "AI-powered search across the paper"; chunks → "sections" / "Section #3"; "similarity: 92%" → "relevance: 92%"; "re-indexing" → "retrying"; "tokens consumed" → "credits used"; raw status → "Something went wrong. Please try again." Internal code (variable/type/CSS names, comments, console logs, API payloads) is exempt. This is enforced by `AGENTS.md` "NO INFRASTRUCTURE OR ALGORITHM JARGON IN USER-FACING COPY" — a regression if "vector", "embedding", "chunk", "pgvector", or a provider name appears in rendered copy.
- The Whiteboard view allows deleting any whiteboard, including the final active board. When no whiteboards remain, the component cleanly resets drawing state and transitions to the `wb-empty-state` screen ('No whiteboards yet') with a CTA to create a new whiteboard.
- The Admin Panel Settings tab (`SettingsTab.tsx`) Registration card uses a split-pane footer layout with a subtle slate-50 background, a border-t divider, an uppercase tracking-wider label for the Mode select dropdown (custom border and focus ring styled cleanly instead of raw inputs), and a soft emerald action button with an inline `Trash2` icon for the manual account cleanup trigger.
- **Suspended Account View (`SplashScreen.tsx` & `LoginPage.tsx`)**: When a suspended user (`user_suspended` / `user_blocked`) attempts to log in on `LoginPage.tsx`, the primary informative "Account Suspended" modal ("Your account has been suspended from ScholarDocX. If you think this was a mistake, please contact an administrator.") renders first with a **Contact Admin** button and a **Close** button. Clicking **Contact Admin** opens the appeal message textarea form modal (`maxLength={500}`, `POST /auth/contact-admin`), with a **Cancel** button to return to the info notice.
- **Responsive design (SCHOLARDOCX-0150)**: the app is fully responsive across
  320 / 375 / 430 / 768 / 1024 / 1440 px. The responsive system has three pieces:
  1. **`frontend/src/responsive.css`** — a dedicated override sheet imported
     LAST in `main.tsx` (after `cell-formatting.css`). All new broad
     responsive rules live here, not in the oversized `styles.css`. New rules
     use Tailwind-aligned breakpoints (640 / 768 / 1024) while the legacy
     `@media (max-width: 980px)` block in `styles.css` is left intact for the
     769–980px band. **Do not expand `styles.css` with new responsive rules —
     add them to `responsive.css`.**
  2. **Mobile nav drawer (≤768px)** — the desktop sidebar (a persistent
     `grid-template-columns: 280px 1fr` column) becomes an off-canvas slide-in
     drawer. `App.tsx` holds `mobileNavOpen` state and uses the `useIsMobile`
     hook (`frontend/src/hooks/useMediaQuery.ts`). The nav collapse toggle
     button (`nav-toggle-button` class) renders a `Menu` (hamburger) icon on
     mobile and the `PanelLeftClose/Open` icons on desktop. The drawer
     (`aside.sidebar.sidebar-open`) is `position: fixed; transform:
     translateX(-100%) → 0`, width `min(280px, 82vw)`, z-index 1080, with a
     tap-to-dismiss `.sidebar-mobile-backdrop` (z-index 1070). `handleSidebarNav`
     closes the drawer after every tab switch. Above 768px the desktop
     collapse behaviour (280px↔86px) is unchanged — do not remove the
     `nav-collapsed` class or the legacy 980px block.
  3. **Per-view fixes** — documents category grid constrained with
     `min-width: 0` (cards were forcing ~403px min-content); about-page
     hero/flow panels given `min-width: 0` so the grid track doesn't overflow;
     about models modal resets its `margin-left: 150px` sidebar offset on
     mobile; PlanComparisonView toggle row uses `flex-wrap`; admin tables and
     the sheet table rely on their existing `overflow-auto` scroll wrappers
     (confirmed working). Wide tables intentionally scroll horizontally inside
     bounded containers — this is correct, not a bug.




- **Brain Games surface (SCHOLARDOCX-0198 / 0199 / 0200)**: the six games under
  `frontend/src/components/games/` share one stylesheet, `brain-games.css`,
  scoped entirely under `.brain-games`, `.game-*`, and per-game prefixes
  (`.sudoku-*`, `.g2048-*`, `.mine-*`, `.word-*`, `.ttt-*`, `.pattern-*`). It
  does not participate in `responsive.css`; its two breakpoint blocks live at
  the foot of the file with the rest of the games' rules, because nothing
  outside this view consumes them.
  - **Game rules are never in components.** Every rule, generator and search
    lives as a pure function in `frontend/src/lib/games/`, and the components
    hold only rendering and input. This is deliberate and load-bearing: the
    repo has no DOM testing library, so logic kept out of the components is
    the only game logic that can be tested at all. A new game or mechanic
    goes in `lib/games/` first.
  - **Motion is feedback, not decoration.** Animations here exist to make a
    state change legible (a 2048 merge, a word row's marks arriving, a won
    tic-tac-toe line) and are all short one-shots driven by a class the
    component clears on a timer. Every one of them must also be listed in the
    `@media (prefers-reduced-motion: reduce)` block at the foot of
    `brain-games.css`, clearing `transform` as well as `animation` — a tile
    caught mid-flip at 90 degrees is invisible if only the animation is
    removed.
  - **Copy in `gameRules.ts` and the `howTo` blurbs follows the no-jargon
    rule above**: plain language only, no "minimax", "flood fill", "chord",
    "vector" or similar. Describe the move, not the mechanism.
  - `brain-games.css` is at ~1015 lines, over the 1000-line target and inside
    the grace band in `CODE_RULES.md`. A seventh game should split it
    per-game (`games/styles/`) rather than extend it further.

- **Sheet chrome vs. sheet grid (SCHOLARDOCX-0202)**: sheet styling is split by
  role across two files and they should stay that way.
  `frontend/src/sheet-table-polish.css` owns the **grid** — table, headers,
  cells, row/column resize, sticky columns. `components/sheet/sheet-chrome.css`
  owns everything **around** it — toolbar, buttons, menus, the shortcuts panel
  and the blank state. New sheet styling goes in one of these, never inline:
  the toolbar previously carried ~400 lines of inline style objects, every
  button restating its own padding and font size and every dropdown its own
  border and shadow, which is precisely why the menus had drifted apart from
  one another.
  - **One dropdown component.** `components/sheet/SheetMenu.tsx` is the only
    menu primitive (`SheetMenu` + `SheetMenuItem` / `SheetMenuToggle` /
    `SheetMenuLabel` / `SheetMenuDivider`). Adding a menu means composing
    these, not writing another portal-and-panel block.
  - **Toolbar grouping is by purpose**: View (what you see), Views (saved
    arrangements), Format (how it looks), Data (what crosses the boundary).
    Only *Add record* and search sit outside a menu. A new control belongs in
    whichever menu matches its purpose rather than as another top-level button.
  - **Row density drives the existing `--sheet-row-height` and
    `--sheet-cell-lines` variables**, not a parallel set of rules, so anything
    already sized from them follows automatically. Density and the frozen-column
    preference are per-person and live in `localStorage`, never on the shared
    page record.
  - **Grid rules are pure functions** in `components/sheet/sheetGrid.ts`
    (density presets, type alignment, bulk-edit change sets, the shortcut list
    as data), tested in `sheetGrid.test.ts`. Same arrangement as
    `sheetFilters.ts`, `lib/games/` and `lib/stickyNotes.ts`, and for the same
    reason: this repo has no DOM test harness.

- **Sheet insights and colour rules (SCHOLARDOCX-0203)**: column statistics and
  conditional-formatting evaluation are pure functions in
  `components/sheet/sheetInsights.ts`, tested in `sheetInsights.test.ts`.
  - **Parse sheet dates with `parseSheetDate`, never `new Date(value)`.**
    JavaScript parses a date-only string (`"2026-08-05"`) as UTC midnight but a
    timestamped one as local. Sheet date columns store the date-only form, so
    comparing them against a locally computed "today" is off by a day for
    anyone east of UTC — a deadline rule firing a day early in a product built
    around deadlines. Any new date comparison in the sheet must go through this
    helper.
  - **Date-sensitive tests run under multiple timezones.** The suite is
    executed under UTC, Asia/Dhaka and US/Hawaii; a single-timezone run would
    not have caught the above.
  - **Colour rules resolve last-wins**, matching the spreadsheet convention:
    the rule added at the bottom of the list is the one that takes effect.
    Rule operators are filtered by column type so a rule that can never fire
    cannot be constructed.
  - **Conditional tints are a background wash plus a left marker**, never a
    saturated fill — a strongly coloured row makes its own text harder to read.
  - **Per-reader settings live in `localStorage`, not on the page record**:
    density, frozen column, and colour rules all describe how one person wants
    to read a shared sheet.
  - **The command palette (`Ctrl/Cmd+K`) keeps a fixed order**, not a
    usage ranking. Stable ordering is what makes it faster than a menu.

- **Modal backdrops — one implementation, no exceptions (SCHOLARDOCX-0203)**:
  every dialog in the sheet and sticky-note views now goes through `<Modal>`
  from `components/Modal.tsx`. Converted in this task: `ShortcutsPanel`,
  `CommandPalette`, `FormatRulesModal`, the column-stats layer, `RowPeekPanel`
  (which had inline `position`/`backdropFilter` overrides), `CsvImportModal`,
  `NoteComposer` and `NoteViewer`. There are no remaining hand-rolled
  `modal-backdrop` divs under `components/sheet/` or `components/sticky/`.
  `DialogProvider` (`showAlert`/`showConfirm`/`showPrompt`) was the opposite
  defect — a fixed full-viewport backdrop that blurred the TopBar and Sidebar
  — and now portals into `.main-content` with a `.scoped-main` class, falling
  back to fixed full-viewport only where no `.main-content` exists (login,
  splash). If a new dialog needs a backdrop, use `<Modal>`; if `<Modal>` does
  not fit, change `Modal.tsx` rather than writing a second backdrop.

- **Sheet grid: no sticky first data column (SCHOLARDOCX-0203)**. Attempted and
  removed after two regressions. The sheet grid combines `position: sticky`
  row headers, `content-visibility: auto` on rows (an off-screen-row perf
  optimisation), `table-layout: fixed`, `min-width: 1200px` and a rounded
  `overflow: auto` container. Those interact badly and the failure modes are
  layout-level, so they are invisible to type-checking and to CSS specificity
  analysis. `.is-first-data-col` is still emitted on the first data cell as a
  hook. Do not re-attempt this without a browser to check the result in.

- **The sheet's sticky row-number column must stay opaque (SCHOLARDOCX-0203)**.
  `.sheet-table td.row-header` is `position: sticky`. A sticky cell without an
  opaque background is a window — the rows scrolling horizontally underneath
  show through it, and cell text appears to bleed across the row numbers.
  Seventeen selectors across four stylesheets set a background on `... td` and
  out-rank it (row hover, the `due-urgent`/`due-warning`/`due-watch` deadline
  tints, `row-focused`, and zebra banding). Most predate this task; the banding
  only made a long-standing bug visible on every even row rather than on hover.
  The column therefore defends itself: `background` and `box-shadow` are set
  with `!important` at the foot of `sheet-chrome.css`, with hover and selected
  variants so it still responds. **Any new rule that backgrounds sheet cells
  must target `td.data-cell`, not a bare `td`.** Enforced by
  `scripts/check-sticky-column.py`, which fails if the `!important` defence is
  removed or if a new rule in `sheet-chrome.css` out-ranks it without one.
