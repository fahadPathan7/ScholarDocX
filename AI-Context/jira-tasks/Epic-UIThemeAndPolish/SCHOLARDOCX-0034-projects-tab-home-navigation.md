# SCHOLARDOCX-0034: Projects Tab Returns To Projects Home

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-05-27

## Summary

Fix sidebar Projects navigation so clicking Projects opens the Projects root
screen instead of preserving and reopening the last selected project.

## Functional Context

Links:
- [feature-project-workspace.md](../../functional/feature-project-workspace.md)

## Technical Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)
- [file-size-and-modularity.md](../../technical/file-size-and-modularity.md)

## Requirements

- Sidebar Projects click should always show the Projects root/home screen.
- Existing explicit project navigation from dashboard, notifications, alerts,
  calendar events, and project cards should continue to open the target project.
- Avoid editing the oversized `ProjectWorkspace.tsx` unless needed.

## Verification Plan

- Run frontend build: `npm run build`.
- Browser-check that opening a project, leaving Projects, and clicking Projects
  again returns to the Projects home screen.

## Implementation Notes

- Added app-shell navigation handling so sidebar Projects is treated as an
  explicit Projects home action.
- Clearing `projectNavigationTarget` prevents stale explicit project targets
  from reopening.
- Added a keyed remount for `ProjectWorkspace` when the sidebar Projects tab is
  clicked, resetting internal selected project/sheet state without editing the
  oversized workspace component.
- Kept dashboard, notification, alert, and calendar navigation paths able to
  open a specific project through `projectNavigationTarget`.

## Changed Files

- `frontend/src/App.tsx`
- `AI-Context/functional/feature-project-workspace.md`

## Verification

- `npm run build` passed in `frontend`.
- Browser checked Projects home, project open, Dashboard -> Projects return,
  and direct Projects re-click from inside a project.
- Confirmed Projects home shows `New Project`, no project breadcrumb, and no
  `Project Dashboard` after sidebar Projects click.
