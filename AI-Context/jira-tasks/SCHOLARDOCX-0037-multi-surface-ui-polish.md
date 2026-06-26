# SCHOLARDOCX-0037: Multi Surface UI Polish

Status: Done

Owner: AI Agent

Created: 2026-05-28

## Summary

Polish several visible UI surfaces based on screenshot feedback: sidebar brand,
notification panel position, Documents grouped list layout, timezone dropdown,
project sheet counts, and empty calendar behavior.

## Functional Context

Links:
- [feature-documents-storage.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-documents-storage.md)
- [feature-project-workspace.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md)
- [feature-about-profile.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-about-profile.md)

## Technical Context

Links:
- [frontend-visual-system.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)
- [file-size-and-modularity.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/file-size-and-modularity.md)

## Requirements

- Improve the sidebar brand block visual treatment.
- Move the notification panel down so it aligns more like the AI chat panel.
- Make Documents groups use a non-congested full-width list layout.
- Show file date metadata without the word "Uploaded".
- Change Profile timezone to a dropdown with GMT offset details.
- Show labeled sheet counts on project cards.
- Render the month calendar even when there are no events, focused on today.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check Documents, Profile timezone, Projects, empty calendar modal,
  notification panel, and sidebar brand/collapsed state.

## Implementation Notes

- Updated the Documents page to use a full-width stacked category list with
  readable document rows and date-only file metadata.
- Updated Profile timezone to a dropdown with GMT offset labels.
- Added labeled sheet-count badges to project cards.
- Kept the full calendar visible when there are no events, focused on the
  current date with the empty-state message in the side panel.
- Polished the sidebar brand card and aligned the notification panel top offset
  with the AI chat panel.

## Changed Files

- `/Users/fahadpathan/Documents/ScholarDocX/frontend/src/App.tsx`
- `/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/CalendarMonthView.tsx`
- `/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/ProfileView.tsx`
- `/Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/ProjectWorkspace.tsx`
- `/Users/fahadpathan/Documents/ScholarDocX/frontend/src/visual-refresh.css`
- `/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-about-profile.md`
- `/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-documents-storage.md`
- `/Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/feature-project-workspace.md`

## Verification

- Passed: `npm run build` in `/Users/fahadpathan/Documents/ScholarDocX/frontend`.
- Browser checked Documents page layout: category groups stack full-width, rows
  are readable, and no `Uploaded:` label is shown.
- Browser checked Profile: timezone renders as a dropdown with GMT labels.
- Browser checked Projects: cards show labeled sheet counts.
- Browser checked empty project calendar: modal renders a 42-day month grid,
  highlights today's date, and shows the empty message in the day side panel.
- Browser checked notification panel top offset and collapsed sidebar icon
  sizing.
