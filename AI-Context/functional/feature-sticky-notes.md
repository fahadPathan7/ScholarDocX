# Feature: Sticky Notes

Requirement group: FR-8

## Goal

Users need a lightweight place for quick thoughts, reminders, short checklists,
and application planning fragments that do not belong in a sheet row or uploaded
document.

## User Experience

Sticky Notes should appear as its own section after Documents in the main
navigation. The view should feel fast, friendly, and low-friction:

- Quick note creation from the top of the view.
- Color choices that visually resemble sticky notes.
- A checklist mode for small task lists.
- Inline completion toggles for checklist items.
- Clear edit and delete actions on each note.
- Empty states that invite the user to create the first note.

The main view should show the note board and one clear create button. Creating
or editing a note should open a floating modal, not a permanent left-side form.
Checklist creation should be emphasized over text styling controls. Long notes
should keep their dates and actions separate from scrollable or clamped content.
Long notes should also offer a view action that opens the full note in a
floating panel. Checklist-focused sticky note cards should show a single
badge-like summary line with the total number of checklist items and how many
are done, visually distinct from the note body text. Checklist cards should not
add an extra overflow strip or progress bar under the checklist preview.
Sticky note focused views should keep the delete action visually separated from
the Cancel and Edit actions to reduce accidental taps.
The sticky note composer toolbar should keep font style and font size controls
grouped together in the same row so the formatting tools read as one cluster.
Focused note footer dates should remain legible and balanced against the action
buttons instead of fading into the background.
The sticky note focused view footer should use an icon-only delete action and
omit the Cancel button when edit and close controls already provide a safer exit.
Long sticky-note previews should use a compact "more" badge for truncated text
or hidden checklist items instead of a wide bottom strip.
When a sticky-note preview has a "more" badge, the badge should sit to the
right of the date in the card footer.

## Planning Features (SCHOLARDOCX-0201)

Sticky notes carry enough structure to be planned with, not just written on.

**Tags.** Free-form labels, normalized to lowercase with collapsed whitespace
and any leading `#` removed, so "Round 1", "round  1" and "#round 1" are one
tag. Maximum 8 per note, 24 characters each. The composer suggests tags already
in use — without that, people re-type a tag slightly differently and end up
with two filters that should have been one. Filtering by several tags means
"has all of them".

**Due dates.** An optional date and time per note. Urgency is shown at three
strengths so it reads from across the board and up close: a coloured left edge
on the card, a pill with a plain-language label ("Tomorrow", "Overdue · 3 days
ago"), and a board group. A note due earlier today is overdue, not "today" —
the day is not the deadline, the time is. A checklist with every item ticked is
never shown as overdue.

**Archive.** Archiving takes a note off the board without deleting it. The
toolbar switches between Board and Archive; an archived note can be restored or
deleted for good. Delete always offers an undo for a few seconds, and the
confirmation points at archiving as the safer option.

**Board organisation.** A masonry layout (notes are wildly different heights;
an equal-cell grid pads every card to the tallest in its row) with groups —
Pinned, Overdue, Today, This week, Everything else — that appear only when they
have something in them. A group heading over blank space reads as a loading
failure. Pinned wins over overdue: pinning is an explicit instruction about
where a note sits. Sorting offers My order (drag to arrange), Recently changed,
Newest first, By due date and A–Z; grouping is skipped under My order and A–Z,
because the user asked for one specific order. Notes without a due date sort
last under By due date, not first.

**Search.** Across titles, body text, tags and **checklist items** — a
checklist note's real content is its items, so searching only the title would
miss the thing being looked for. Sketch strokes are excluded.

**Editing.** Editing an existing note saves as you type, with a visible saving
state. Creating a note does not autosave — that would litter the board with
blanks from anyone who opened the composer and changed their mind. Checklist
items tick directly on the card and in the full view, without opening the
editor. Keyboard: `N` new note, `/` search, `Ctrl+Enter` save, `Esc` close, and
every card is reachable and openable by keyboard.

**Empty states are specific.** An empty board, an empty archive, and a filter
that matches nothing are three different messages. Telling someone their board
is clear while they are looking at a search box with text in it is misleading.

## Data Rules

Sticky notes are user data stored in the database. They should not sync to a
remote backend or use external services.

Tags, due date, archive state and manual order live on `sticky_notes`
(`tags_json`, `due_at`, `archived_at`, `sort_order`). An untagged, undated,
unarchived note behaves exactly as it did before these columns existed.

## Safety And Scope

Sticky notes are not a rich document editor. They are for quick local notes,
short checklists, and lightweight planning. Longer academic documents remain in
the uploaded Documents workflow.
