# SCHOLARDOCX-0203: Sheet — four fixes, command palette, column insights, colour rules

Status: Completed

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-07-29

## Summary

Follow-up to SCHOLARDOCX-0202, driven by four defects the user found on the
rebuilt sheet, plus the features requested alongside them.

**The fixes matter more than the features.** Three of the four were things
that looked finished and were not: a control duplicated across two places, a
selection with no way out, a button whose label described the wrong action,
and a toggle whose CSS never matched anything.

## Defects fixed

### 1. "Keep first column in view" did nothing, in either position

The freeze rules were written as:

```css
.sheet-scroll.is-frozen .sheet-table tbody td.data-cell:first-of-type
```

`:first-of-type` means "the first `<td>` among its siblings" — and the first
`<td>` in every row is the row-number header, not a data cell. So
`td.data-cell:first-of-type` asks for an element that is both a data cell and
the first cell, which never exists. **The selector matched nothing**, in both
the on and off states, and what looked like a stuck freeze was the
pre-existing sticky row-number column that the toggle does not control.

Fixed with an explicit `.is-first-data-col` class applied in
`SheetTableRow`/`SheetTable`. A positional selector would have been wrong
anyway: a collapsed column group renders a control cell ahead of the first
real column, so "first" is not a fixed index.

### 2. Import / Export existed twice

The header kept its own Import/Export dropdown from before 0202, offering
Export CSV / Import CSV / Save as Template, while the new **Data** menu
offered Import / Export / Email settings. Two controls, different labels,
overlapping contents. The header copy is gone; *Save as Template* moved into
Data, which is where the rest of it already was.

### 3. A selected cell could not be deselected

Escape *was* handled — on the scroll container's own `onKeyDown`, which
requires that container to hold focus. Clicking a cell does not reliably focus
it, so in practice the highlight was stuck until the user clicked another
cell. Three ways out now:

- a window-level Escape handler, which skips while an editor is open so
  Escape still means "cancel this edit" first;
- clicking the empty area below the rows;
- a visible **Deselect cell** button next to the formatting rail.

### 4. "Edit University name" read as renaming the column

The bulk-edit menu was labelled with the target column, which made it look
like a column-rename control rather than a way to write values into cells. It
is now **Fill values**, with the column named inside the menu — a target, not
a subject.

## Features added

**Command palette (`Ctrl`/`Cmd`+`K`).** Search and run anything: add a record,
clear filters, change density, pin the first column, summarise or hide any
column, open a saved view, export, undo. Built from live sheet state, so a
column added a second ago is immediately reachable. Matching is a subsequence
test — `adr` finds *Add record* — but the order is **fixed rather than
usage-ranked**, deliberately: a list that reshuffles itself makes
"Ctrl+K, a, Enter" mean something different every time, which is the whole
reason to have a palette.

**Column insights.** Clicking the type glyph in any header opens a summary:
fill rate with a bar, distinct-value count, the top five values with
proportion bars, and — by type — min/max/average/total for numbers, or
next-up/overdue/earliest/latest for dates. Clicking a top value filters the
sheet to it, so reading and acting on what you read are one journey.

**Colour rules (conditional formatting).** Per-sheet rules — "Status is
Rejected → red row", "Deadline is due within 7 days → amber". Nine operators,
offered per column type so a rule that could never fire cannot be built. Each
rule shows a live match count, so it can be checked without hunting through
the grid. Later rules win over earlier ones, which is the spreadsheet
convention: the rule you just added at the bottom is the one that takes
effect.

**Record panel navigation.** The peek panel now shows "Record 3 of 24" and
steps with `←`/`→` or its own buttons, without closing. Stepping follows the
*filtered, sorted view*, not the raw row array.

**Polish.** Light zebra banding, a proper focus ring, smoother row hover, an
animated palette and stats panel, and softer conditional tints (a wash plus a
left marker rather than a saturated fill, which would make the text it is
highlighting harder to read). All reduced-motion aware.

## Technical Context

- `sheetInsights.ts` (**new**) — column statistics and rule evaluation as pure
  functions. `sheetGrid.ts` keeps density/alignment/bulk edits.
- `CommandPalette`, `ColumnStatsPanel`, `FormatRulesModal` (**new**).
- Rules live in `localStorage` per page id, like density and freeze: they
  describe how *this* reader wants to see the sheet, and writing them to the
  shared page record would push one person's colour scheme onto everyone.

## Scope

In scope: `sheet/{sheetInsights.ts, sheetInsights.test.ts, CommandPalette.tsx,
ColumnStatsPanel.tsx, FormatRulesModal.tsx}` (new);
`sheet/{SheetToolbar, SheetTable, SheetTableRow, SelectionToolbar,
RowPeekPanel, useSheetPage, sheetGrid, sheet-chrome.css}`;
`ProjectWorkspace.tsx`.

Out of scope:
- **Rules on the server.** They are per-reader by design; sharing them is a
  different feature with a different data model.
- **Rules referencing another column** ("A is later than B"). Single-column
  conditions cover the cases asked for; cross-column comparison needs an
  expression model rather than a dropdown.

## Unit Test Plan

`sheetInsights.test.ts` — 28 checks covering fill-rate treatment of blanks,
averaging only what parses, date range/next/overdue, per-type operator sets,
every rule operator including the unparseable-input cases, last-rule-wins
resolution, and the live match count.

## Verification Plan

- `npx tsc --noEmit`.
- Engine tests on node with the describe/it/expect shim, **run under three
  timezones** (UTC, Asia/Dhaka, US/Hawaii) — see below for why.

## Completion Notes

### Verification

- `npx tsc --noEmit` — clean, exit 0.
- **124 passed, 0 failed**: `sheetInsights` 28 (new), `sheetGrid` 25,
  `askAiPrompts` 18, `stickyNotes` 53. Identical under UTC, Asia/Dhaka and
  US/Hawaii.

### A timezone bug the tests caught

The `due within N days` rule failed on the first run — but only outside UTC.

`new Date("2026-08-05")` is specified to parse a **date-only** string as UTC
midnight, while `new Date("2026-08-05T09:00")` parses as **local**. Sheet date
columns store the date-only form, and the rule compared those against a
locally computed "today". East of UTC the two are a day apart, so a deadline
rule would have fired a day early or late depending on where the user sits —
in a product built around application deadlines.

Fixed with `parseSheetDate`, which constructs date-only values explicitly as
local midnight and leaves timestamped values to the normal parser. The suite
now runs under three timezones because a single-timezone run would not have
caught this and will not catch the next one.

### A duplicate the tests also caught

The shortcuts panel listed `Esc` twice — "cancel editing / clear search" from
before, and "deselect the focused cell" added this round — which the
uniqueness check rejected. Rather than relax the check, the two were merged
into one entry describing the layered behaviour, which is what a reader needs
anyway: Escape cancels an edit, then deselects.

### Decisions

- **The palette does not rank by usage.** Stable order is what makes a palette
  faster than a menu; a list that reorders itself is a menu with extra steps.
- **Conditional tints are a wash plus a left marker, not a fill.** A strongly
  coloured row makes its own text harder to read, which defeats the purpose of
  drawing attention to it.
- **Operators are filtered by column type.** Offering "is due within" on a
  text column is an invitation to build a rule that can never fire and then
  wonder why.
- **An empty `contains` matches nothing.** `"".includes("")` is `true`, so a
  half-built rule would otherwise tint the whole sheet the moment it was
  added. Pinned by a test.
- **Rule match counts ignore the enabled flag.** The count answers "what would
  this do?", not "what is it doing right now" — otherwise a switched-off rule
  always reads zero and cannot be checked before switching on.
- **Record stepping follows the view, not the row array.** Stepping through a
  filtered list should visit what is on screen.

### Modal backdrop blur — regressed again, and I caused it

AGENTS.md carries a section headed *"Modal backdrop blur (regressed 3+ times —
read before touching modals)"*. It says the only approved implementation is
`<Modal>` from `Modal.tsx`, which portals into `.main-content` so the blur
covers the work surface while the TopBar and Sidebar stay crisp — and it warns
specifically about the copy-paste trap of imitating the legacy inline
`<div className="modal-backdrop modal-backdrop-main">`.

I did exactly that, in six panels: the shortcuts panel, command palette,
colour-rules modal and column-stats layer here, and the sticky-note composer
and viewer in SCHOLARDOCX-0201. Every one blurred the wrong region.

All six now use `<Modal>`. While in there, two long-standing offenders were
fixed too:

- **`RowPeekPanel`** — named in AGENTS.md as an example of the inline-override
  failure. It portalled into `#sheet-work-surface` and then re-stated
  `position`, `background`, `backdropFilter` and `z-index` inline, so it
  neither matched the canonical backdrop nor followed it when it changed.
- **`CsvImportModal`** — legacy inline backdrop.

**And the dialog provider, which was the opposite bug.** `showPrompt` /
`showConfirm` / `showAlert` rendered `.custom-dialog-backdrop` as
`position: fixed; 100vw/100vh` at the app root, so *"Save this arrangement"*
blurred the TopBar and Sidebar as well — the **over-blur** symptom AGENTS.md
lists as the mirror image of the first. It now portals into `.main-content`
and switches to an absolute backdrop via a `.scoped-main` class, falling back
to fixed full-viewport where there is no `.main-content` (login, splash),
which is correct there because there is no chrome to keep sharp.

Worth stating plainly: the AGENTS.md warning existed, was specific, and I
still reproduced both halves of it. The guard that would actually have caught
this is a lint rule banning the literal string `modal-backdrop` outside
`Modal.tsx` — raised as a follow-up, because a fourth prose warning clearly is
not enough.

### Freeze first column — attempted three times, then removed

This is the honest record of a feature I could not land.

**Attempt 1** shipped a selector that matched nothing:
`td.data-cell:first-of-type` asks for a cell that is both a data cell and the
first `<td>` in its row, and the first `<td>` is always the row-number header.
Reported as "no effect".

**Attempt 2** added an explicit `.is-first-data-col` class, `!important` to
out-rank `.sheet-table td.data-cell { position: relative }`, switched off the
row-level `content-visibility: auto` while frozen, and removed an inline
`width: 40px` on the row-number header that disagreed with the
`--sheet-index-width: 64px` the offset used. I verified the cascade with a
script that parses every stylesheet and computes the winning `position`
declaration — that part was genuinely correct. Reported as "breaks the UI":
the table escaped `.sheet-scroll`, the rounded container was lost, and the
grid overflowed to the right.

**Removed.** The combination this needs to survive — `position: sticky` on a
table cell, inside a row with `content-visibility` containment, in a
`table-layout: fixed` table with `min-width: 1200px`, inside a rounded
overflow container — is not something to keep guessing at. There is no browser
in this environment, so every attempt was reasoned rather than observed, and
two of the three made the product worse than not having the feature.

What is left behind for whoever picks it up:

- `.is-first-data-col` is still emitted by `SheetTable` and `SheetTableRow`.
  It is correct, harmless, and the hook to build on.
- The three known blockers are documented in a comment where the CSS used to
  be, so the next attempt starts from what was learned rather than repeating
  it.
- The toggle, the preference, the palette command and the props are all gone.
  A control that does nothing is worse than no control.

The lesson worth keeping: **CSS layout changes to a grid this constrained
cannot be verified by reasoning.** Type-checking and cascade analysis proved
the rule would apply; neither could tell me what it would do to the layout.
Work that needs a browser should not be shipped without one.

### The bleed across the row numbers — my zebra banding, not the freeze

After the freeze feature was removed the grid still looked wrong: cell text
appeared to run across the row-number column. That was a separate bug, and
mine.

`.sheet-table td.row-header` is `position: sticky`. **A sticky cell without an
opaque background is a window** — the rows scrolling horizontally underneath
show straight through it. The zebra banding I added in the polish pass was
written as:

```css
.sheet-table tbody tr:nth-child(even) > td { background-color: ... }
```

`> td` matches the row-number header too, and at (0,2,3) it out-ranks
`.sheet-table td.row-header` at (0,2,1) — so every even row lost the opaque
background on its sticky cell.

**A guard script found this is not only mine.** `scripts/check-sticky-column.py`
computes which selectors set a background on sheet cells and out-rank the row
header: **seventeen across four stylesheets**, including row hover, the three
deadline tints and `row-focused`. All but the banding predate this task. The
column has been see-through on hover for a long time; the banding just made it
happen on every even row instead of only under the cursor.

Fixed at the cause rather than in seventeen places: the column now defends
itself with `background` and `box-shadow` set `!important` (matching how its
`position: sticky !important` is already written), plus hover and selected
variants so it still responds. The guard script is checked in and fails if
that defence is removed or if a new rule in `sheet-chrome.css` out-ranks it.

### "Show columns" looked empty

Reported as an empty section that should be removed. It was not empty — it was
below the fold.

The Display menu rendered a radio row per groupable column. This sheet has
eight, plus "None", plus three row-height options and two dividers: seventeen
rows before the columns list even started, in a panel capped at
`min(420px, 70vh)`. The label was the last thing visible and everything under
it was scrolled out of sight.

Two changes:

- **Categorise rows is now a `<select>`.** Eleven rows collapse to one, and a
  single control is the right shape for "pick one of many" anyway — a radio
  list only makes sense when the options are few enough to scan at once.
- **The columns list scrolls independently** (`.sheet-menu-scroll` already had
  `max-height`, now with `overscroll-behavior: contain`), so no section above
  it can push it out of the menu again. The label also carries a "N hidden"
  count so the section says something even before it is read.

Worth noting the failure mode: the section was not broken, and deleting it —
which is what the report reasonably asked for — would have removed a working
feature. "Nothing is there" and "nothing is visible" look identical from the
outside and need opposite fixes.

### View / Views

The two adjacent menus were **View** and **Views** — one letter apart, sitting
side by side. Renamed to **Display** (row height, frozen column, grouping,
column visibility) and **Saved views** (stored arrangements). No shared stem,
and the palette's section labels follow.

### The colour-rules row overflowed, and did not explain itself

Two reports on the same panel, with the same root cause: I built the row as a
UI and not as a sentence.

**Layout.** The rule was eight fixed grid tracks. A rule does not have a fixed
number of parts — the value input disappears entirely for "is empty" or "is in
the past" — so any fixed track count is wrong for some rule, and the widest
case simply did not fit. The match count and delete button were pushed out
through a horizontal scrollbar. It is now a wrapping flex row: a long rule
becomes two lines instead of overflowing. The panel also now sets its width as
`.modal-panel.format-rules`, two classes, so it reliably beats
`.modal-panel { width: 600px }` regardless of stylesheet order.

**Comprehension.** Having removed the vague intro paragraph, the row was a
line of unlabelled dropdowns with no indication of what it did. The fix was
not to put the paragraph back — it was to add the connective words, so the row
reads as what it is:

> When [Status] [is exactly] [Rejected] colour it [red] across the whole row

Plus one concrete lede naming the purpose ("so an overdue deadline or a
rejected application stands out without you tinting cells by hand"), the match
count reworded from "1 matches" to "1 row" / "matches nothing yet", and a
labelled "New rule for" on the add control.

The "bold only" swatch was a diagonal hatch pattern, which read as a
crossed-out "not allowed" sign; it now shows a **B**.

The general lesson, worth keeping: an explanatory paragraph above a control is
usually a sign the control does not explain itself. Fixing the control is the
better move, and it is what makes the paragraph unnecessary rather than merely
absent.

### Copy trimmed

The colour-rules modal opened with a paragraph explaining what rules are and
how precedence works, plus a suggested first rule in the empty state. Both
were abstract filler in front of the actual controls; removed, and replaced by
the self-describing row above. Precedence is documented where it belongs — in
`sheetInsights.ts` and this task.

## Follow-ups

Carried over from 0202 and still open:

- **Split `ProjectWorkspace.tsx`** — now ~1400 lines, and this round added to
  it again (palette command list, three panels). This is overdue and should be
  the next sheet task, ahead of further features. Proposed split unchanged:
  `ProjectModals.tsx` and `SheetModals.tsx`.
- **Split `useSheetPage.ts`** (~1220) — CSV/paste block is the next extraction.
- **`sheet-chrome.css` is ~1000 lines** and will need the same by-role split
  the stylesheet already went through once.
- **Lint rule: ban `modal-backdrop` outside `Modal.tsx`.** Prose has now
  failed to prevent this four times. A one-line ESLint `no-restricted-syntax`
  rule on the class literal would make it impossible.
- Rectangular cell selection; cross-column rule conditions.
