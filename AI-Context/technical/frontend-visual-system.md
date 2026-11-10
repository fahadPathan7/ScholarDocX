# Frontend Visual System

How the UI is styled and the rules that prevent known regressions. Responsive tiers and the
drawer breakpoint live in [responsive-design-system.md](responsive-design-system.md). User-facing copy
rules (no infrastructure or algorithm jargon) live in AGENTS.md and are not restated here.

## Direction

A focused research command center: readable, interactive, polished, not decorative marketing UI.
The workspace is teal on a warm ivory canvas with a dark-green sidebar; the public landing page uses
a related ivory / ink-navy / gold editorial look. No external fonts or CDN assets beyond the
declared font link, and the PDF.js worker is bundled locally.

## Principles

- Keep headers compact so work content stays visible on laptop screens; dense, scannable cards with clear hierarchy.
- Color clarifies hierarchy and state; it never overpowers body text. Prefer low-saturation, eye-soothing surfaces for planning screens (muted teal primary, restrained blue and warm accents, no heavy gradients or busy patterns behind work content).
- Project card grids: at most four cards per row on wide screens, fluid widths.
- Motion is for state changes, panel entry, hover, and focus feedback; honor `prefers-reduced-motion`.
- Floating panels stay visually separate from content through depth, backdrop blur, and clear headers.
- Dashboard type is compact; admin panels read as a dense operational console; profile columns stay visually balanced; the collapsed sidebar is an icon rail with readable centered icons and accessible labels.

## Layout and scrolling

- **Layout freedom (owner decision, 2026-11-10):** no mandated scroll model, single-row, `nowrap`, or fixed-height rule.
- **Never clip content (SCHOLARDOCX-0227):** `.tab-container` is the default scroll owner. A page root must either grow to its content or scroll itself, never combine `overflow: hidden` with `min-height: 0` without an inner scroller. The sidebar scrolls on short screens. The shared block is at the end of `visual-refresh.css`; dashboard grid rows use a min-content minimum so cards never shrink below their content.
- Main views (Dashboard, Projects, Documents, Sticky Notes, Whiteboard, ...) stay mounted in `.tab-container` and are hidden with `.hidden-tab` (`display: none !important`) to avoid unmount blinks and layout shifts.
- Full-page tab views (About, Plans, Buy credits, Admin) use `.tab-page` (+ `--scroll` / `--column`); do not hand-roll inline flex/overflow/background wrappers.
- Wide tables intentionally scroll horizontally inside bounded containers; horizontal scrollers support click-drag panning without hijacking buttons, inputs, selects, or modal controls.
- Split panes avoid stretched side panels when one pane is only a control form; the content-heavy pane may own an internal scroller.
- Inner page layouts must not use a semantic `<main>` (the global `main` style sets the root viewport layout); use `<div className="news-main">`. The global `main` is a flex container, so wide section children need `min-width: 0`.
- The admin page contains its content (`#admin-view-root` and children `min-width: 0; max-width: 100%`).

## Modal backdrop blur (non-negotiable; regressed 3+ times)

The required pattern and forbidden list are in AGENTS.md ("Modal backdrop blur"). The mechanics:

| Region | Blurred while a modal is open? |
|---|---|
| Sidebar, global TopBar | No (crisp) |
| Breadcrumbs, view headers, toolbar, table | Yes |
| Modal panel | No |

1. **Portal target**: `<Modal>` (`frontend/src/components/Modal.tsx`) portals into `.main-content` (`position: relative`), so the backdrop is a direct child of the work surface. `scope="body"` exists but in-app modals must not use it: it blurs the TopBar and centers under the sidebar (SCHOLARDOCX-0229).
2. **CSS**: `.modal-backdrop-main` is `position: absolute; inset: 0` (never `fixed`, never `min-height: 100vh`); the base `.modal-backdrop` is `position: fixed` and `.modal-backdrop-main` overrides it, so do not merge or remove the override. Canonical copies live in `styles.css` and `visual-refresh.css`.
3. **Placement**: 80px top offset (`<Modal compact>` uses 48px for dense admin dialogs); at 760px tall or less the offset is 20px and panels may use the whole surface. The backdrop scrolls if a panel is taller than the surface, panel width is capped to the work surface (`calc(100% - 32px)`), and panel bodies scroll inside with header and footer fixed. Size custom panels against the work surface (percentages), not `vw`/`vh`.
4. **Accessibility** (in `<Modal>`): Escape closes the topmost modal, focus is trapped and restored, `role="dialog" aria-modal="true"` (pass `label`), and stacked modals (`zIndex >= 1060`) get `data-modal-depth="nested"` which CSS uses to lighten the blur. Never write `[style*="zIndex..."]` selectors.
5. **Exceptions**: only `LoginPage.tsx`'s `auth-modal-backdrop` (pre-login, nothing to keep sharp). `DialogProvider` (`showAlert` / `showConfirm` / `showPrompt`) portals into `.main-content` with `.scoped-main`, falling back to fixed full-viewport only where no `.main-content` exists (login, splash). If a dialog does not fit `<Modal>`, change `Modal.tsx`; never write a second backdrop.
6. Do not copy older files that grep shows containing an inline `modal-backdrop modal-backdrop-main` div; that pattern blurs only `.section-body`.

## Theme

- **Tokens** live in `visual-refresh.css` (`--ui-*`), with `app-brand.css` (imported last) layering the in-app brand alignment (SCHOLARDOCX-0230): ivory canvas (`--ui-canvas #f6f1e6`, warm `--ui-line`), serif display face (`--font-display` = Fraunces) for h1/h2, section titles, and the sidebar wordmark, and a gold accent (`--ui-gold #c58a1b`) on the active-nav marker and the Pro plan badge. Put further brand-level tweaks in `app-brand.css`.
- **Landing page** (`frontend/src/components/LandingPage/`, SCHOLARDOCX-0223): ivory-paper / ink-navy / gold editorial theme. Tokens are scoped to `.lp-container` in `landing-shared.css` (`--lp-ink #0e1b33`, `--lp-ivory #fbf7ef`, `--lp-blue #1f3a8a`, `--lp-gold #c58a1b`, `--lp-serif` Fraunces) and also remap local `--ui-*`, so the in-app teal is untouched. `landing-theme.css` (imported last) holds cross-section overrides. One file per section plus an `index.tsx` barrel. Emphasised words are italic blue with a gold underline; the closing CTA is the only dark block; the header is transparent at rest and frosted on scroll, with its scroll listener on `.lp-container` (the page scrolls inside it, not the window). Motion is dependency-free (`useReveal` over `IntersectionObserver`, `.reveal` -> `.in-view`, staggered with `--reveal-delay`, reduced-motion safe; the stats band counts up capability numbers, never fabricated user counts). The hero product plate is a pure CSS/SVG mock; the FAQ is an accessible single-open accordion (`grid-template-rows: 0fr -> 1fr`). Do not re-add "How It Works" or `#how`. Pricing defaults come from `plan-defaults.ts` and zero-priced payloads are never rendered (SCHOLARDOCX-0214). Footer credits "Designed & built by Fahad Pathan", linked to https://fahadpathan7.github.io/ (opens in a new tab).
- **Auth pages** (`LoginPage.tsx`, `RegisterPage.tsx`) share `auth-*` primitives in `LoginPage.css`. Every view has a "Back to home" pill, and sub-views offer "Back to login" and "Back to registration". Registration is invite code or Google; quarterly billing toggles show a "Save 20%" chip. While a request is in flight `SlowStartToast` shows a bottom toast that dismisses itself after 6s (SCHOLARDOCX-0231); the splash screen keeps its own wake-up tip.
- **Suspended account**: a suspended login shows an "Account Suspended" notice with Contact Admin (opens an appeal textarea, `maxLength={500}`, `POST /auth/contact-admin`) and Close.
- Admin tables carry badges for join method (invite amber, purchase emerald, admin indigo, Google) and plan source (Polar cyan, admin-set purple, not subscribed slate), with matching filter groups, now behind a collapsible Filters bar (SCHOLARDOCX-0232).

- **Advisor Atlas, Research Expert, Scholarship Hunt polish (SCHOLARDOCX-0239)**: `frontend/src/tools-polish.css` (imported after `app-brand.css`) gives the three tool views one firmer language: warm paper cards with real borders and layered shadow, hover lift, a teal top edge on page headers, solid teal gradient primary buttons (disabled stays legible), strong-bordered inputs with a teal focus ring, darker muted text, and pill-style active sub-tabs. Its selectors are prefixed with `.main-content` so they beat per-view stylesheets regardless of bundle order. `research-expert.css` itself was recolored from indigo/violet/slate to the app's teal and warm neutrals; keep new accents on the teal tokens (`--tp-*` in `tools-polish.css`), not indigo.

## Shared primitives and conventions (SCHOLARDOCX-0213)

Reuse these instead of inline styles or new variants: `.tab-page`; `.secondary.compact` (32px) paired with `.icon-button.compact`; `.text-button` (popover-footer action, with `.danger`); `.modal-content.stacked` (flex column, 16px gap); `.modal-callout` (`--plain`, `is-tip`); `.modal-footer` (`flex-wrap: wrap; gap: 12px`, never re-declare inline); `.field-label`. Fixed regressions not to reintroduce: dashboard card headers and bodies share one 14px left inset; the unread-notification accent is an inset box-shadow (border width must never change); the Register `or` divider and Google button span the full grid (`grid-column: 1 / -1`); calendar weekday labels align with day numbers; the whiteboard minimap sits 20px from its canvas; `.wb-text-dim` does not exist (use `--wb-text-muted`); the sticky board is CSS-columns masonry by design; `--sheet-index-width` is the single source for the row-index column. The `Field` component matches select option values case-insensitively. User-facing text about cloud-hosted resources must not say "saved locally".

## Sheets

- **Grid vs chrome**: `frontend/src/sheet-table-polish.css` owns the grid (table, headers, cells, resize, sticky columns); `components/sheet/sheet-chrome.css` owns everything around it (toolbar, buttons, menus, shortcuts panel, blank state). New sheet styling goes in one of these, never inline.
- **One menu primitive**: `components/sheet/SheetMenu.tsx` (`SheetMenu` + `SheetMenuItem` / `SheetMenuToggle` / `SheetMenuLabel` / `SheetMenuDivider`). Toolbar grouping is by purpose: View, Views, Format, Data; only Add record and search sit outside a menu. Toolbar buttons show `.secondary.active` while their popover, modal, or view is open.
- **Spreadsheet behaviour**: the row-number column stays frozen and opaque; there is no Actions column (View Details, Edit, Email appear in the selection toolbar for exactly one selected row; bulk Copy/Duplicate/Delete for several). Rows keep a stable preview height; long text is clipped or wrapped inside its cell, never auto-expands rows or bleeds sideways. Clipped cells show a clear clickable preview and open a full-cell viewer for reading, copying, and editing (explicit Save/Cancel, persists only that cell; multi-line editors auto-size to about 10 lines, then scroll). The whole visible cell is the interactive target (no tiny chip, no browser tooltips, no zoom cursors); empty cells get a quiet clickable target with the same typed controls; file cells reuse the document picker.
- **Cell formatting**: the compact `CellStyleBar` sits in the section header actions (`SheetToolbarActions`) left of Import / Export when a cell is focused (parity in the full-cell viewer and full-screen mode; the "Applying to X selected rows" indicator sits left of it). Options: bold/italic/underline/strikethrough, text color, cell and row background, alignment, size presets, and a curated list of 15 system fonts. It never distorts row height, is never shown for file cells, persists per cell in `_cellStyles` and per row in `_rowStyle` (reserved row keys, see [data-model.md](data-model.md)), and is never exported to CSV. Color inputs keep editor focus; the color buttons show the current color as an underline (transparent dashed when unset).
- **Density and view preferences** drive the existing `--sheet-row-height` and `--sheet-cell-lines` variables. Density, frozen column, and colour rules are per-reader and live in `localStorage`, never on the shared page record.
- **Pure logic, tested**: grid rules in `components/sheet/sheetGrid.ts`, filters in `sheetFilters.ts`, insights and colour rules in `sheetInsights.ts` (tests next to each). This repo has no DOM test harness, so logic kept out of components is the only logic that can be tested.
- **Dates**: parse sheet dates with `parseSheetDate`, never `new Date(value)` (a date-only string parses as UTC but a timestamped one as local, so comparisons drift by a day east of UTC). Date-sensitive tests run under UTC, Asia/Dhaka, and US/Hawaii. Colour rules resolve last-wins; operators are filtered by column type; conditional tints are a background wash plus a left marker, never a saturated fill. The command palette (`Ctrl/Cmd+K`) keeps a fixed order.
- **No sticky first data column.** It was attempted and removed after two regressions (it interacts badly with sticky row headers, `content-visibility: auto`, `table-layout: fixed`, `min-width: 1200px`, and the rounded `overflow: auto` container). `.is-first-data-col` remains only as a hook. Do not retry without a browser to verify.
- **The sticky row-number column must stay opaque.** `.sheet-table td.row-header` is sticky; without an opaque background the scrolling rows show through. Many `... td` rules out-rank it (hover, due tints, focus, zebra), so `background` and `box-shadow` use `!important` at the foot of `sheet-chrome.css`. Any new rule that backgrounds sheet cells must target `td.data-cell`, not a bare `td`.

## Sticky notes, whiteboard, games

- **Sticky notes** live in `components/sticky/` with two stylesheets (`sticky-notes.css` board and card, `sticky-controls.css` everything around a note); rules (parsing, tags, due buckets, search, sort, reorder) are pure functions in `lib/stickyNotes.ts`. **Never reset `font` wholesale** on a themed note element: `font: inherit` includes `font-family` and resolves to the card's Caveat default instead of the user's choice. Reset size, weight, style, line-height, letter-spacing, and colour only.
- **Never reuse a global utility name as a local modifier**: `.secondary`, `.primary`, `.compact` carry real layout in `styles.css` / `visual-refresh.css`. Name modifiers for what they are (`.filters`, `.tools`).
- **Whiteboard**: any board, including the last, can be deleted; with none left it resets drawing state and shows `wb-empty-state` ("No whiteboards yet") with a create CTA.
- **Brain Games** (`components/games/`): one stylesheet `brain-games.css` scoped to `.brain-games`, `.game-*` and per-game prefixes; it does not participate in `responsive.css`. All rules, generators, and searches are pure functions in `lib/games/`, components only render and handle input. Animations are short feedback one-shots and each must be listed in the `prefers-reduced-motion` block, clearing `transform` as well as `animation`. Copy in `gameRules.ts` and the how-to blurbs is plain language (no "minimax", "flood fill", "vector"). The file is over the 1000-line target; a seventh game should split it per game.

## Other components

- **Research Expert PDF viewer** (`ResearchPdfViewer.tsx`): `pdfjs-dist` renders papers client-side and highlights cited passages on the real text layer. The worker is bundled locally (`pdfjs-dist/build/pdf.worker.min.mjs?url`), the viewer is `React.lazy`-loaded so the ~480 KB chunk downloads only on "View in PDF", and minimal `.textLayer` rules are inlined in `research-pdf-viewer.css`.
- **Documents and Projects grids**: compact glassmorphic cards with auto height and quiet hover scaling; document category titles sit inline with the icon, the latest-upload line appears only when files exist, and uploads start from the category card. Projects group by degree case-insensitively. Project cards show the quota bar and chip immediately with a grey pulse (`.quota-loading`) so nothing shifts while quotas load.
- **Plan Comparison** (`plan-comparison.css`): light glassmorphic deck, per-tier tinted outlines (Max as a dark card), and a hover glare sweep.
- **Splash screen**: shown while the first data load runs (and on failure or the auth gate); its cold-start note is a quiet borderless sub-line (`.splash-message-secondary`) above a rotating tip carousel (6s).
- Dropdown menus use compact row spacing for scannability.

## CSS organization

- `styles.css` is oversized and receives no broad new rules. New visual work goes in focused files imported after it. Load order is set in `main.tsx`: `styles.css`, `visual-refresh.css`, `documents-refresh.css`, `about-refresh.css`, `about-page.css`, `sheet-table-polish.css`, `cell-formatting.css`, `responsive.css`, `app-brand.css`.
- Keep component markup changes minimal unless behaviour or hierarchy needs them.
- **Run the CSS guards** after touching sheet or sticky-note styling (`make guard-css`, also part of `make guards`): `scripts/check-sticky-column.py`, `scripts/check-sticky-note-fonts.py`, `scripts/check-css-modifier-collisions.py`. All three catch one cause, a broad rule silently out-ranking a specific one, which is invisible to TypeScript and review and shows up only as a rendering bug.
