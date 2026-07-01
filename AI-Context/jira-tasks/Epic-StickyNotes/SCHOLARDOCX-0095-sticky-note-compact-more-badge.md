# SCHOLARDOCX-0095: Sticky Note Compact More Badge

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Replace the wide bottom overflow strip in sticky-note card previews with a
compact "more" badge for truncated text or hidden checklist items.

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Improves readability and makes the truncation cue feel intentional instead of
  looking like a blank footer.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: Sticky note previews should present truncation cues in a compact,
  visually clear format.

## Technical Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Technical notes:

- The sticky note preview truncation cue lives in `frontend/src/components/StickyNotesView.tsx`
  and `frontend/src/components/sticky-notes.css`.
- The existing `sticky-more` element currently renders as a wide strip.

## Scope

In scope:

- Replace the wide overflow strip with a compact badge.
- Use the badge for both long text notes and hidden checklist items.

Out of scope:

- Changing note content truncation rules.
- Changing the focused modal.

## Acceptance Criteria

- Long text notes show a compact "more" badge instead of a strip.
- Checklist cards with hidden items show a compact hidden-item badge.
- The badge does not span the full width of the card.

## Implementation Plan

- Update the preview markup to surface the hidden-item count when needed.
- Restyle the `sticky-more` element as a pill-like badge.
- Verify the frontend build.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- No dedicated frontend test harness exists in this repo; verify with the
  frontend build.

If no unit tests are needed, explain why:

- This is a presentation-only visual change.

## File Size Check

Files expected to be edited:

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/StickyNotesView.tsx`
- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/sticky-notes.css`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-sticky-notes.md`

Line-count risk:

- Low

If any file exceeds 1000 lines, explain why.

- None expected.

## Verification Plan

- `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`

## Completion Notes

Changed files:

- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/StickyNotesView.tsx`
- `/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/sticky-notes.css`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-sticky-notes.md`
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/jira-tasks/SCHOLARDOCX-0095-sticky-note-compact-more-badge.md`

Verification completed:

- `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`

Unit tests added or updated:

- None

Follow-ups:

- More indicators now render as compact badges instead of wide strips.
