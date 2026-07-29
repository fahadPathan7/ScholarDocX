# SCHOLARDOCX-0201: Sticky Notes overhaul — tags, due dates, archive, grouped board

Status: Completed

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-07-29

## Summary

Sticky Notes worked, but it was a scratchpad in a product about deadlines. A
note could not carry a date, could not be labelled beyond one of six colours,
could not be found by searching, and could only leave the board by being
deleted. Past roughly twenty notes the board stopped being usable and there
was nothing to do about it.

This turns it into a planning surface: **tags**, **due dates with urgency
grouping**, **archive**, **manual ordering**, and an editing loop that saves as
you type. Four columns on `sticky_notes`, all rules extracted into a tested
module, and the 692-line view split into seven focused components.

## Business Context

Links:
- Business context: `AI-Context/README.md`
- Functional context: `AI-Context/functional/feature-sticky-notes.md`

Business value: notes become part of the application workflow rather than a
side pocket. Zero AI credits, zero external services, no new infrastructure —
the same four guardrails in `CLAUDE.md` that applied before still hold.

## Functional Context

Requirements:

**Tags.** Free-form, normalized (lowercase, internal whitespace collapsed, a
leading `#` stripped), max 8 per note and 24 characters each. Autocomplete over
tags already in use. Filtering by several tags means "has all of them".

**Due dates.** Optional date and time per note. Urgency reads at three
strengths: a coloured left edge on the card, a pill with a human label
("Tomorrow", "Overdue · 3 days ago"), and a board group. A completed checklist
is never overdue.

**Archive.** Archiving takes a note off the board without deleting it. The
toolbar switches between Board and Archive; archived notes can be restored or
deleted permanently.

**Board.** Masonry layout with collapsible groups — Pinned, Overdue, Today,
This week, Everything else — which appear only when populated. Grouping is
skipped under the manual and A–Z sorts.

**Editing.** Autosave while editing an existing note, checklist items tickable
directly on the card and in the viewer, undo after delete, `N` to create, `/`
to search, `Ctrl+Enter` to save, `Esc` to close.

## Technical Context

Links:
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/technical/project-structure.md`

**Backend.** Four columns on `sticky_notes`, added by
`_add_sticky_note_planning_columns` in `connection.py` following this repo's
existing `ADD COLUMN IF NOT EXISTS`-on-boot pattern — no migration tooling, safe
to re-run, a no-op on fresh installs. `tags_json TEXT NOT NULL DEFAULT '[]'`,
`sort_order INTEGER NOT NULL DEFAULT 0`, and nullable `due_at` / `archived_at`.
All four added to the writable-column allowlist in `store.py`.

`archived_at` is a timestamp rather than a boolean so the archive sorts
most-recent-first without a second column. `sort_order` defaults to `0` so
every existing note ties and falls back to the previous `updated_at` ordering
— nothing reshuffles until something is actually dragged.

**Frontend.** `lib/stickyNotes.ts` holds every rule as a pure function —
parsing, tag normalization, due bucketing, search, filter, sort, group,
reorder. Same split as `lib/games/`, for the same reason: this repo has no DOM
test harness, so logic kept out of components is the only logic that can be
tested. The view is now seven components under `components/sticky/`.

## Scope

In scope:
- `backend/app/db/{models,connection}.py`, `backend/app/services/store.py`
- `frontend/src/lib/stickyNotes.ts` (**new**) and its test file
- `frontend/src/components/sticky/` (**new**): `StickyNotesView`, `NoteCard`,
  `NoteComposer`, `NoteViewer`, `NoteToolbar`, `TagInput`, `SketchCanvas`,
  `sticky-notes.css`, `sticky-controls.css`
- `frontend/src/App.tsx` (import path only)
- Deleted: `frontend/src/components/StickyNotesView.tsx`,
  `frontend/src/components/sticky-notes.css` (moved)

Out of scope, and why:

- **Linking notes to applications, programs and professors.** Raised as part of
  the scope option, but not among the prioritised capabilities, and it is the
  one item here that needs a real entity picker and join rather than a column.
  The obvious next task — see Follow-ups.
- **Reminder delivery.** `due_at` is stored and surfaced in the UI, but nothing
  yet raises a notification when a note comes due. `notifications` already has
  a `due_at` and a scheduler path; wiring the two together is its own change
  with its own failure modes, and shipping half of it silently would be worse
  than not shipping it.
- **Rich text.** Unchanged, per the standing scope note in the functional file:
  sticky notes are not a document editor.

## Acceptance Criteria

- Tags can be added, autocompleted, removed and filtered on; case and spacing
  variants collapse to one tag.
- A note can be given and cleared a due date; overdue/today/this-week notes are
  visually distinct and grouped.
- Archive removes a note from the board and the Archive shelf restores it.
- Board groups appear only when populated; empty board, empty archive and
  no-search-results are three different messages.
- Checklist items tick from the card without opening the note.
- Editing an existing note autosaves; creating one does not.
- Delete offers an undo for 8 seconds.
- `npx tsc --noEmit` clean; logic tests pass.

## Unit Test Plan

Unit tests needed: Yes — `frontend/src/lib/__tests__/stickyNotes.test.ts`.

Covered: body-envelope parsing and round-trip, checklist parsing of malformed
JSON, tag normalization/dedupe/caps/ranking/suggestion, due parsing and
day-granularity arithmetic, bucketing including the completed-checklist case,
search across items, filter combinations, sort ordering and immutability,
grouping exclusivity, and reorder minimality and clamping.

## File Size Check

| File | Lines |
| --- | --- |
| `lib/stickyNotes.ts` | 395 |
| `lib/__tests__/stickyNotes.test.ts` | 422 |
| `components/sticky/StickyNotesView.tsx` | 445 |
| `components/sticky/NoteComposer.tsx` | 383 |
| `components/sticky/NoteCard.tsx` | 216 |
| `components/sticky/NoteViewer.tsx` | 160 |
| `components/sticky/NoteToolbar.tsx` | 148 |
| `components/sticky/TagInput.tsx` | 89 |
| `components/sticky/SketchCanvas.tsx` | 78 |
| `components/sticky/sticky-notes.css` | 791 |
| `components/sticky/sticky-controls.css` | 668 |

Every file is under the 1000-line target. The stylesheet reached 1430 lines
during the work — past the 1150 grace band — and was split by role rather than
by line count: `sticky-notes.css` keeps the board and the card, and everything
that surrounds a note (toolbar, groups, tag chips, due badges, composer,
viewer, undo) moved to `sticky-controls.css`. The old 692-line
`StickyNotesView.tsx` is gone, replaced by seven files averaging 217 lines.

## Verification Plan

- `npx tsc --noEmit`.
- Logic tests executed directly on node with a describe/it/expect shim (vitest
  cannot start in this environment — `node_modules` carries the macOS rollup
  binary; same constraint recorded in SCHOLARDOCX-0198).
- Static checks that the boot migration, the SQLAlchemy model and the writable
  allowlist name the same four columns, and that the empty-string coercion
  clears a date without touching text fields.

## Completion Notes

Changed files: as listed under Scope.

### Verification

- `npx tsc --noEmit` — clean, exit 0.
- `stickyNotes.test.ts` — **53 passed, 0 failed**.
- Backend consistency check — migration, model and allowlist all name
  `tags_json`, `sort_order`, `due_at`, `archived_at`.
- Coercion check — `""` and `"   "` become `NULL` for `due_at`/`archived_at`,
  a real ISO string passes through, and an empty `title` is left alone.

### Four defects found in the existing feature

Worth recording, because three of them were invisible from the code and only
showed up once the behaviour was written down:

1. **Ticking a checklist item from the card never worked.** `toggleSavedItem`
   was built, passed into `NoteCard` as a prop, and then never referenced in
   the card's body. Ticking a box meant open note → tick → close. It is now
   wired, on the card and in the viewer.
2. **Filtering to a colour with no notes said "Your board is clear. Capture
   the next useful thought."** Telling someone their board is empty while they
   are looking at a filter they just applied is actively misleading. Empty
   board, empty archive and no-results are now three separate states.
3. **Every write refetched the whole board.** `toggleSavedItem` and `togglePin`
   updated local state optimistically and *then* called `loadNotes()`, so each
   tick cost a second round trip and could stomp a concurrent edit. Writes are
   now optimistic with a rollback on failure and no refetch.
4. **The card was an `<article onClick>`.** Not focusable, not reachable by
   keyboard, invisible to a screen reader as an interactive thing. It is now a
   real button covering the card, with the pin/archive controls and checklist
   rows sitting above it so they stay separately reachable.

### Decisions

- **Autosave applies to editing, not creating.** Autosaving a new note would
  litter the board with blanks from anyone who opened the composer and changed
  their mind. A note is created once, explicitly, and autosaves from then on —
  the composer switches into edit mode against the row it just created, so a
  second Save cannot make a duplicate.
- **Autosave does not fire the update notification.** A `notify()` per typing
  pause is an HTTP call every second of editing, to raise an event that is off
  by default. Explicit saves still notify.
- **Undo after delete re-creates the row rather than soft-deleting.** The
  server delete happens immediately — holding it back would mean a "deleted"
  note reappearing on another device — and the note's data is kept in memory
  for 8 seconds. The restored note is a new row with a new id. The honest
  alternative is a soft-delete column plus a sweeper job, which is a lot of
  machinery for an undo button.
- **Pinned beats overdue when grouping.** Pinning is an explicit instruction
  about where a note sits; moving it because a date passed would be ignoring
  the user.
- **A completed checklist is never overdue.** A finished note that keeps
  shouting trains people to ignore the colour, which costs more than the
  reminder is worth.
- **Undated notes sort last under "By due date".** A missing date is not "due
  at the beginning of time"; treating it that way buries the dated notes the
  sort exists to surface.
- **Dragging is only enabled under the manual sort.** A position recorded while
  sorted by due date would be overwritten on the next render, so offering the
  drag would be lying about what it does.

### Two CSS problems worth noting

**Masonry, not a grid.** The old board used
`grid-template-columns: repeat(auto-fill, minmax(245px, 1fr))` with a fixed
280px card height. A row-based grid pads every cell to the tallest in its row,
which is where the ragged white gaps came from, and the fixed height meant a
three-word note and a twenty-item checklist occupied identical space. CSS
columns fill top-to-bottom instead, with `break-inside: avoid` so a card is
never split mid-sentence.

**Invisible buttons still swallow clicks.** The card's hover actions are
`opacity: 0` until hover. An `opacity: 0` element is still a click target, so
the top-right corner of every card was silently toggling the pin instead of
opening the note. They now carry `pointer-events: none` while hidden — which
does not affect keyboard focus, so `:focus-within` still reveals them — and a
`@media (hover: none)` block shows them unconditionally on touch, where
hover-to-reveal means never.

### Post-release fix: the chosen font stopped reaching checklist items

Reported after release — a note set to Modern rendered its title and body in
Modern but its checklist items in handwriting.

Cause is in this task. Checklist items became `<button>`s so they could be
ticked from the card, and a button does not inherit typography from its
parent, so the new rule reset it:

```css
.sticky-check-list .check-item.tickable { font: inherit; /* … */ }
```

The `font` shorthand sets `font-family` as well. At (0,3,0) it out-ranks
`.font-sans .check-item` at (0,2,0) — and because the theme applies the font to
each themed *element* rather than to the card, `inherit` resolved to the card's
own `font-family: 'Caveat'` base. So the items inherited the default while
everything else honoured the user's choice.

Fixed by resetting everything a button actually needs — size, weight, style,
line-height, letter-spacing, colour — and leaving `font-family` to the
`.font-*` rules that own it. All four fonts already list `.check-item` among
their targets, so nothing is left unstyled.

**Guard added:** `scripts/check-sticky-note-fonts.py` fails if any rule sets
`font` or `font-family` on a themed sticky-note element with specificity above
the `.font-*` theme rules. Verified by reintroducing the bug and watching it
fail, then restoring.

This is the same failure shape as the sheet's sticky-column regression in
SCHOLARDOCX-0203: **a generic reset silently out-ranking a specific theme
rule.** Both are now caught by a script rather than by a reviewer noticing.

### Post-release fix: the filter chips jumped left when a tag was picked

The colour swatches and tag chips sat centred, then snapped to the left edge
the moment a filter was applied — the controls moving out from under the
cursor as a direct result of using them.

Cause: I named the second toolbar row's modifier `secondary`.

`.secondary` is the app's **secondary-button utility** in `styles.css`, and it
carries `justify-content: center` along with `display: inline-flex`,
`min-height`, padding and a border-radius. `<div className="sticky-toolbar-row
secondary">` inherited all of it, so the row was centred. Adding the "Clear
filters" button with `margin-left: auto` then overrode the centring for layout
purposes and everything slid left.

Renamed to `.filters`, with an explicit `justify-content: flex-start` so the
row is pinned left in both states and nothing moves when the clear button
appears or disappears.

**Guard added:** `scripts/check-css-modifier-collisions.py` fails if any class
used as a local modifier is also a bare single-class utility in `styles.css` or
`visual-refresh.css` that sets layout properties. Verified by reintroducing the
name and watching it fail.

### Three regressions, one root cause

The sheet's sticky column, the checklist font, and this — all the same shape:
**a broad rule silently winning over a specific one.** A global utility picked
up by name, a `font: inherit` shorthand out-ranking a theme rule, a `> td`
selector out-ranking a sticky cell's background. None are visible to
TypeScript, none show up in review, and all three present only as a rendering
bug in a browser this environment does not have.

Three scripts now encode them: `check-sticky-column.py`,
`check-sticky-note-fonts.py`, `check-css-modifier-collisions.py`. Each was
verified by reintroducing the original bug and confirming it fails. Run all
three after touching sheet or sticky-note styling.

## Follow-ups

- **Link notes to applications, programs and professors.** The one deferred
  piece of the original scope, and the obvious next step now that a note can
  carry a date: a note about "Prof. Chen — email by Friday" should be able to
  point at the professor row.
- **Deliver reminders for `due_at`.** The column and the UI exist; nothing
  raises a notification yet.
- **Component tests.** None here, for the same reason as everywhere else in
  this repo — no DOM testing library. The logic is fully covered because it
  was deliberately kept out of the components.
