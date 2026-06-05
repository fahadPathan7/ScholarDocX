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
floating panel.

## Data Rules

Sticky notes are local user data stored in SQLite. They should not sync to a
remote backend or use external services.

## Safety And Scope

Sticky notes are not a rich document editor. They are for quick local notes,
short checklists, and lightweight planning. Longer academic documents remain in
the uploaded Documents workflow.
