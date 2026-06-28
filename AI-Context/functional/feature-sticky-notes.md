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

## Data Rules

Sticky notes are local user data stored in SQLite. They should not sync to a
remote backend or use external services.

## Safety And Scope

Sticky notes are not a rich document editor. They are for quick local notes,
short checklists, and lightweight planning. Longer academic documents remain in
the uploaded Documents workflow.
