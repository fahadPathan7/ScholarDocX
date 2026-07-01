# SCHOLARDOCX-0096: Sticky Note More Badge Footer Placement

Status: Done

Owner: AI Agent

Epic: Epic-StickyNotes

Created: 2026-06-28

## Summary

Move the compact "more" badge for sticky-note previews to the right side of
the date in the card footer.

## Business Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Business value:

- Makes the truncation cue feel intentional and keeps the footer visually
  aligned.

## Functional Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-8: Sticky note preview badges should align with the footer metadata.

## Technical Context

Links:

- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Technical notes:

- The sticky note card footer currently renders the date separately from the
  `sticky-more` badge.
- The badge should live in the same footer row as the date so it reads as part
  of the footer metadata.

## Scope

In scope:

- Move the "more" badge into the card footer.
- Keep the badge compact and right-aligned.

Out of scope:

- Changing truncation rules.
- Changing the focused modal.

## Acceptance Criteria

- The date appears on the left of the footer.
- The "more" badge appears on the right of the footer when needed.
- The badge applies to both text and checklist previews.

## Implementation Plan

- Move the badge markup into the footer row.
- Adjust the footer layout so the badge aligns to the right.
- Verify the frontend build.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- No dedicated frontend test harness exists in this repo; verify with the
  frontend build.

If no unit tests are needed, explain why:

- This is a presentation-only layout change.

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
- `/Users/fahadpathan/Documents/ScholarDock/AI-Context/jira-tasks/SCHOLARDOCX-0096-sticky-note-more-badge-footer-placement.md`

Verification completed:

- `npm run build` in `/Users/fahadpathan/Documents/ScholarDock/frontend`

Unit tests added or updated:

- None

Follow-ups:

- Badge now sits to the right of the date in the card footer for both text and checklist previews.
