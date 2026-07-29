# SCHOLARDOCX-0202: Sheet restructure — grouped toolbar, frozen column, density, bulk edits

Status: Completed

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-07-29

## Summary

The sheet was already capable — sort, per-column filters, saved views,
grouping, undo/redo, keyboard navigation, CSV in and out, cell formatting. The
problem was that none of it was legible. Eight identical grey buttons sat in a
row that scrolled sideways when the window narrowed, the toolbar's appearance
lived in roughly 400 lines of inline style objects, column types were invisible,
every empty cell printed a dash, and the keyboard support was entirely
undocumented.

This restructures the chrome into grouped menus backed by a real stylesheet, and
adds the four grid behaviours that were missing: a frozen first column, row
density, type-aware headers and alignment, and bulk cell editing.

## Business Context

Links:
- Business context: `AI-Context/README.md`

Business value: the sheet is the product's core working surface. Everything
here is presentation and interaction — no AI credits, no new endpoints, no
schema change.

## Functional Context

Links:
- `AI-Context/jira-tasks/Epic-SheetRecords/SCHOLARDOCX-0150-sheet-ask-ai-prompt-catalog.md`

**Toolbar.** Two primary actions keep their weight — *Add record* (the only
filled button on the bar) and search. Everything else groups by what it is for:

| Menu | Contains |
| --- | --- |
| **View** | Row height, freeze first column, categorise by column, show/hide columns |
| **Views** | Saved views: load, save, delete, reset |
| **Format** | Edit columns, deadline colours |
| **Data** | Import CSV, export CSV, email settings |

Nothing was removed. Menu triggers show an active state when something inside
is switched on, and the View trigger carries a badge when columns are hidden —
so a hidden column is discoverable rather than a mystery.

**Grid.**

- **Frozen first column.** The row-number column was already sticky; the first
  data column now sticks with it. The grid has a 1200px minimum width, so it
  always scrolls sideways, and a row number alone does not tell you which
  university you are looking at. On by default; switch it off under View.
- **Row density** — Compact / Cosy / Roomy, remembered per person.
- **Column type icons** in headers, and type-aware alignment: numbers and dates
  right so their digits line up, yes/no centred, text left.
- **Empty cells** no longer print a dash. A faint rule reads as "nothing here"
  without adding a character to scan past on every blank cell of a wide sheet.

**Bulk editing.** With rows selected, an *Edit <column>* menu offers fill down
from the topmost selected row, set-every-row-to (offering the column's own
options, or the values already in use), and clear-all-cells. Each is one undo
step and one save.

**Discoverability.** A shortcuts panel on `?` or the keyboard button,
documenting bindings that already existed and were invisible. `/` jumps to
search. A sheet with no columns now gets a real empty state with buttons
instead of one line of grey text.

## Technical Context

Links:
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/technical/project-structure.md`

- `sheetGrid.ts` (**new**) holds the rules as pure functions — density
  presets, alignment, fill/set/clear change-set computation, existing-value
  ranking, and the shortcut list as data. Tested. Same split as
  `sheetFilters.ts`.
- `SheetMenu.tsx` (**new**) is one dropdown used by every menu. The toolbar
  previously repeated the trigger-plus-portal-plus-hand-written-panel-styles
  block per menu, which is why the menus had drifted apart.
- `sheet-chrome.css` (**new**) holds all chrome styling. The grid keeps
  `sheet-table-polish.css`.
- Density drives the existing `--sheet-row-height` / `--sheet-cell-lines`
  variables rather than a parallel set of rules, so every height already
  derived from them follows automatically.
- `useSheetPreferences.ts` and `useBulkCellEdits.ts` (**new**) were extracted
  from `useSheetPage.ts` — see File Size Check.

## Scope

In scope:
- `sheet/{sheetGrid.ts, sheetGrid.test.ts, SheetMenu.tsx, ShortcutsPanel.tsx,
  ColumnTypeIcon.tsx, SheetBlankState.tsx, useSheetPreferences.ts,
  useBulkCellEdits.ts, sheet-chrome.css}` (**new**)
- `sheet/{SheetToolbar, SheetTable, SheetTableRow, SelectionToolbar,
  useSheetPage}`, `ProjectWorkspace.tsx`, `SheetRecordFields.tsx`

Out of scope:
- **Column-level bulk edit across all rows.** The bulk actions deliberately
  operate on the *selection*, not the whole column. "Set every row in this
  sheet to X" is a much larger action than it reads as, and there is no
  selection to sanity-check it against.
- **Multi-cell rectangular selection.** Selection is still row-based. Real
  range selection is a substantial change to the focus model and belongs in
  its own task.
- **The footer.** Unchanged.

## Acceptance Criteria

- Every control that existed before is still reachable, grouped as above.
- Menu triggers show active state; View badges the hidden-column count.
- First column stays put when scrolling sideways; can be switched off.
- Density switches between three heights and survives a reload.
- Headers show a type glyph; numbers and dates are right-aligned.
- No dashes in empty cells.
- Fill down, set-column and clear work across a selection as one undo step.
- `?` opens shortcuts, `/` focuses search, neither fires while typing.
- `npx tsc --noEmit` clean; grid tests pass.

## Unit Test Plan

Unit tests needed: Yes — `sheet/sheetGrid.test.ts`.

Covers density coercion of junk values, alignment per type, fill-down
ordering/skipping/immutability, set-column no-op detection, clear-cells column
exclusions, existing-value ranking, and the shortcut list's integrity.

## File Size Check

| File | Before | After |
| --- | --- | --- |
| `ProjectWorkspace.tsx` | 1248 | **1296** |
| `sheet/useSheetPage.ts` | 1170 | **1190** |
| `sheet/SheetTable.tsx` | 695 | 716 |
| `sheet/SheetToolbar.tsx` | 495 | 501 |
| `sheet/sheet-chrome.css` | — | 507 |
| `sheet/sheetGrid.ts` | — | 209 |
| `sheet/SelectionToolbar.tsx` | 64 | 165 |
| `sheet/SheetMenu.tsx` | — | 124 |
| `sheet/useBulkCellEdits.ts` | — | 84 |
| `sheet/useSheetPreferences.ts` | — | 60 |
| `sheet/ShortcutsPanel.tsx` | — | 61 |
| `sheet/SheetBlankState.tsx` | — | 39 |
| `sheet/ColumnTypeIcon.tsx` | — | 36 |

**Two files are over the 1150-line grace band, and this is not resolved.**
Stating it plainly rather than burying it:

- Both were already over the limit *before* this task (1248 and 1170). This
  change did not create the violation, but it did add to it.
- Real extractions were made rather than none: `useSheetPreferences` and
  `useBulkCellEdits` came out of `useSheetPage`, which would otherwise have
  finished at ~1274; `SheetBlankState` and the toolbar's inline styles came
  out of `ProjectWorkspace` and `SheetToolbar`. Net new code went into eight
  new files, not into the two large ones.
- `ProjectWorkspace.tsx` still holds the project CRUD, sheet CRUD, four
  modals, the sidebar and the sheet host. Splitting it properly means moving
  those modals with their form state — a mechanical but wide refactor with a
  real regression surface, done at the end of a large change, and it deserves
  its own task rather than being rushed in behind an unrelated one. Raised as
  a follow-up with a proposed split below.

## Verification Plan

- `npx tsc --noEmit`.
- Grid and Ask-AI prompt tests executed directly on node with a
  describe/it/expect shim (vitest cannot start here —
  `@rollup/rollup-linux-arm64-gnu` is missing; same constraint as
  SCHOLARDOCX-0198).

## Completion Notes

Changed files: as listed under Scope.

### Verification

- `npx tsc --noEmit` — clean, exit 0.
- Engine tests — **43 passed, 0 failed**: `sheetGrid` 25 (new),
  `askAiPrompts` 18 (existing, unaffected).

The 25 new checks concentrate on the parts that are easy to get quietly wrong:
fill-down taking the *topmost* selected row rather than the first clicked (a
bottom-up selection would otherwise fill the wrong value), skipping cells that
already match so a fill over a consistent column is not a hundred writes and a
useless undo step, clear-cells never touching a file column, and density
coercion refusing a junk value from storage rather than producing a grid with
`undefined`-height rows.

### Decisions

- **Grouping by purpose, not by frequency.** View / Views / Format / Data
  splits on what a control is *for*. The alternative — most-used first — reads
  well on day one and becomes arbitrary as soon as two people use the sheet
  differently.
- **Freeze defaults to on.** The grid's min-width is 1200px, so it scrolls
  sideways on essentially every screen. Defaulting off would mean the fix only
  helps people who go looking for it.
- **Density and freeze live in `localStorage`, not on the page record.** How
  tall someone likes their rows is a property of the reader, not of the data;
  writing it to the shared page would make one user's choice everyone's.
- **Bulk edits are one undo step.** Looping the existing `saveCellValue` would
  have been less code, but it fires a PATCH per cell and pushes a history entry
  per cell — undoing a fill across forty rows would take forty presses, which
  is not an undo.
- **Clear-cells skips file columns and says so in the prompt.** Detaching an
  uploaded document is a much bigger action than the word "clear" suggests.
- **The bulk menu falls back to the first editable column when no cell is
  focused,** rather than hiding itself. A feature that is invisible until you
  happen to click the right thing first is one most people never find.
- **The dash placeholder became a faint rule, not nothing at all.** Removing
  it entirely makes an empty cell and a cell containing a space look the same;
  the rule still says "nothing here" without adding a glyph to read past.

### Something the restructure exposed

**Saved views could be created but never deleted.** `onDeleteView` was
implemented in the hook, passed down through `SheetToolbar`'s props, and typed
in its signature — and the old Views menu never rendered a control that called
it. The prop had been wired end to end and then not used, so a view, once
saved, was permanent. The rebuilt menu has a delete button per view, behind a
confirmation, since a saved view is a few minutes of setup.

This is the second dead prop found in as many features (Sticky Notes had
`toggleSavedItem` in the same shape) and is worth naming as a pattern: a
handler that is threaded through the layers but never called from the leaf
looks completely wired from every file except the one that matters.

## Follow-ups

- **Split `ProjectWorkspace.tsx` (1296 lines).** Proposed: `ProjectModals.tsx`
  (create/edit project), `SheetModals.tsx` (create/edit sheet, template
  picker), leaving a workspace shell of roughly 700 lines. Its own task —
  see File Size Check.
- **Split `useSheetPage.ts` (1190 lines).** The CSV import/export and
  paste-handling block is the next cohesive extraction.
- **Rectangular cell selection.** Would make fill-down work on a range rather
  than whole rows, and is what most people mean by "fill".
- **Component tests.** Still none, for the standing reason: no DOM testing
  library in this repo. The logic added here is fully covered because it was
  kept out of the components.
