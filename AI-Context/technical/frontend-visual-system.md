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
  headers must keep high text contrast against their background.
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
- Horizontal overflow areas should feel pannable: users can hold the primary
  mouse button and drag left/right on the scroll surface to move sideways,
  without hijacking interactions on buttons, links, inputs, selects, textareas,
  file pickers, or modal controls.
- Use a balanced palette with enough contrast to separate work surfaces from the
  canvas. Muted teal can remain the primary action color, but pair it with
  restrained blue and warm accent states so the interface does not read as a
  single green wash.
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
- Modals within the main content area should blur only the main work surface and MUST NOT blur the app's TopBar or the left Sidebar. 
- To achieve a full-surface blur without leaving empty margin space, use a Portal (like `AdminPortal`) to render the modal backdrop into a full-width/height `relative` root container (e.g., `<div id="view-root" className="w-full min-h-full flex flex-col relative">`). Do NOT use `position: fixed` or `.modal-backdrop` if it bleeds over the sidebar, and do NOT constrain the blur inside `max-w` containers or `animate-in` blocks.
- The view's own headers (like "Admin Dashboard") SHOULD be blurred when a modal is open. Only the global app TopBar remains unblurred.
- All new modal creations must keep appropriate space from the edges (e.g., use `items-start justify-center pt-24` or `items-center p-4 sm:p-8` depending on layout).
- Avoid external font/CDN dependencies to preserve local-first expectations.
- Prefer additive override styles in focused CSS files rather than expanding
  oversized global CSS.

## Implementation Notes

- `frontend/src/styles.css` is oversized and should not receive broad new
  visual-system rules.
- New broad visual polish should live in dedicated CSS files imported after the
  legacy stylesheet.
- Component markup changes should stay minimal unless the behavior or hierarchy
  needs to change.
- Split-pane work areas should avoid stretched side panels when one pane is
  only a control form. The content-heavy pane can own an internal scroller.
