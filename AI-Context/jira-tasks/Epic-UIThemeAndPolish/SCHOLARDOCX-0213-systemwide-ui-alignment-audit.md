# SCHOLARDOCX-0213: System-wide UI alignment audit and fixes

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-10-31

## Summary

Extensive search across the frontend for visual alignment and UX polish
issues (misaligned icons/labels, inconsistent paddings/margins, broken
flex/grid alignment, inconsistent spacing scales, off-baseline controls,
uneven gaps in toolbars and modal rows) and fix them. UI/UX only — no
functional, state, API, or data changes.

## Business Context

Links:

- Business file: AI-Context/business/product-overview.md

Business value:

- A visually consistent workspace reads as trustworthy and professional;
  misalignment is the most visible form of UI debt for applicants using
  the portal daily.

## Functional Context

Links:

- Functional file: AI-Context/functional/ (UI feature areas)

Requirements:

- No behaviour changes. Only presentation (className, CSS, layout
  markup) may change.

## Technical Context

Links:

- Technical file: AI-Context/technical/frontend-visual-system.md,
  AI-Context/technical/responsive-design-system.md

Technical notes:

- Root CSS files live in `frontend/src/*.css`; components in
  `frontend/src/components/**`.
- Respect the modal backdrop blur rule (see AGENTS.md) — audit may
  touch legacy inline backdrops only to migrate them to `<Modal>` if a
  cheap, safe visual fix is possible; otherwise leave and note as
  follow-up.
- No jargon in user-facing copy.

## Scope

In scope:

- Icon/label baseline alignment in buttons, tabs, toolbar rows.
- Consistent padding/margin/gap values within shared components.
- Flex/grid alignment fixes (centering, stretch, baseline).
- Header/meta-row alignment in cards and list rows.
- CSS inconsistencies causing visible misalignment.

Out of scope:

- Any functional, state, API, routing, or data-logic change.
- Copy/wording changes (unless a string exposes jargon — report, do not
  rewrite beyond that).
- Large redesigns or new components.

## Acceptance Criteria

- Each fixed issue is purely presentational (diff touches className/CSS/
  layout markup only).
- No regression to modal backdrop blur scoping.
- `cd frontend && npx tsc --noEmit` (or project equivalent) passes.

## Implementation Plan

- Fan out read-only audit across view groups (shell/dashboard/profile,
  sheet toolbar family, sticky/whiteboard/calendar/games,
  research/advisor/news/plan/documents).
- Collect concrete findings with file:line evidence.
- Apply minimal CSS/className fixes.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- Pure presentation changes; no behaviour, data transformation, or
  integration boundary touched.

## File Size Check

Files expected to be edited:

- frontend/src/components/**/*.tsx (targeted), frontend/src/*.css

Line-count risk:

- Low (edits are small and local)

## Verification Plan

- TypeScript compile check on frontend.
- Visual review of edited spots where feasible.

## Completion Notes

Method: four read-only audit passes (shell/main views, sheet family,
sticky/whiteboard/calendar/games, research/atlas/projects/modals), then
minimal presentational fixes. No handlers, state, API, or copy logic changed.

Changed files:

- Shell/auth/dashboard: `App.tsx`, `LoginPage.css`, `visual-refresh.css`
  (dashboard section inset, topbar hero colors/badge as CSS, notification
  panel radius, unread accent, profile hint rhythm), `RegisterPage` grid fix,
  `styles.css` (new shared primitives + metric grid + breadcrumb gap +
  notification item + modal footer wrap).
- Sheet: `SheetToolbar.tsx` (30px rail, gap de-duplication), `RowPeekPanel.tsx`
  (icon gap), `SelectionToolbar.tsx` (icon column for fill suggestions),
  `FilterMenu.tsx` (checkbox centering, input heights), `SheetTable.tsx`
  (row-index single source, Clear-all class), `ColumnEditor.tsx`
  (canonical swatch/button sizes), `CsvImportModal.tsx` (arrow centering,
  footer class), `cell-formatting.css`, `sheet-table-polish.css`.
- Sticky/whiteboard/calendar/games: `WhiteboardView.tsx` (muted token,
  minimap offset, Style row), `sticky-notes.css` (tape clipping, `.note-title`
  rule, duplicate/dead CSS), `NoteViewer.tsx` (equal-height footer), 
  `calendar.css` + `CalendarMonthView.tsx` (weekday axis, today pill,
  compact action buttons), `MinesweeperGame.tsx` (lucide glyphs),
  `PatternMemoryGame.tsx` (toolbar order), `dialog.css` (12px gap),
  `responsive.css` (inert sticky-grid overrides removed).
- Projects/documents/modals: `ProjectDashboard.tsx` + `DashboardView.tsx`
  (calendars migrated to `<Modal>`; 3-tile grid), `ProjectWorkspace.tsx`
  (breadcrumb gap, create-sheet modal on `.form-grid`/`.modal-callout`,
  Lightbulb icon), `EmailConfigModal.tsx`,
  `AdvisorResearchDefaultsModal.tsx` (class-based footer/content/label),
  `documents-refresh.css` (`.doc-file-actions` owns its own flex).
- Atlas/research/admin/profile: `advisor-atlas.css` (centered headers,
  48px hero button, history heading class), `advisor-atlas-detail.css`
  (sticky heading top 76px), `AdvisorAtlasView.tsx`, `research-expert.css`
  (authors row, library warning class, quota-pill 40px, prompt header
  centering), `ResearchExpertView.tsx`, `research-pdf-viewer.css`
  (compound-selector media rule), `AdminView.tsx` (clock icon row class,
  height 100% not 100dvh), `BuyTokensView.tsx` (header parity with Plans).

Verification completed:

- `cd frontend && npx tsc --noEmit` — clean.
- `npm run build` — succeeds (pre-existing chunk-size warning only).
- `make guard-billing`, `make guard-context` — both ok.
- Modal backdrop scoping preserved: both migrated calendar modals render via
  `<Modal scope="main">`; Sidebar/TopBar stay sharp, breadcrumbs blur.

Unit tests added or updated:

- None (presentation-only; no behaviour/data boundary touched).

Follow-ups (found but intentionally not fixed here — need design decisions
or are larger than alignment):

- `responsive.css` `.section-head` carries a global
  `align-items: flex-start !important` that fights the `center` in
  styles.css/visual-refresh.css — pick one authority.
- AboutView hero map pills clip at ~1450–1700px viewports (percent-placed
  nodes vs narrow 4-col hero); needs a layout decision (breakpoint or
  right-anchored nodes).
- ProfileView's four ad-hoc Tailwind backdrops vs `UsageModal`'s `fixed`
  backdrop — should migrate to `<Modal>`.
- Advisor compare dialog uses custom scrim tokens (`z-index 3000`,
  `blur(5px)`) instead of the canonical backdrop.
- `AiTokenWidget` pill and `.token-usage-badge` are two designs for the same
  credit readout.
- Plan request history tab is a third visual language (Tailwind
  slate/emerald, rounded-3xl) vs the app's `--ui-*` tokens.
- Pattern Memory block still uses a slate/rose/emerald palette instead of
  the brain-games paper/ink/teal tokens; its `pulse` keyframe lives in
  DeepSpaceBanner.css.
- `.project-sheet-count` vs `.sheet-record-count` are two badge designs for
  the same quota slot; `PinActions.tsx` is dead code (imported, never
  rendered).
