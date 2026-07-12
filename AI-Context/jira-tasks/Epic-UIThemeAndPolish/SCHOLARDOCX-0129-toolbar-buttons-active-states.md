# SCHOLARDOCX-0129: Toolbar Action Buttons Active Visual Polish

Status: DONE

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-12

## Summary

Add visual active selection indicators (active class toggle) to the main sheet toolbar buttons (Columns, Edit columns, Categorize, Date Colors, Email Config, and Views) when their menus, modals, or dropdown configurations are currently open/active.

## Business Context

Links:
- Business file: None.

Business value:
- Better visual clarity on what settings/modal panels are currently open.

## Functional Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Requirements:
- Toggle the active state on the toolbar buttons when clicked/open.

## Technical Context

Links:
- [SheetToolbar.tsx](../../../frontend/src/components/sheet/SheetToolbar.tsx)
- [ProjectWorkspace.tsx](../../../frontend/src/components/ProjectWorkspace.tsx)
- [visual-refresh.css](../../../frontend/src/visual-refresh.css)

Technical notes:
- Pass `isEmailConfigOpen` and `showDateColorConfig` as boolean inputs from `ProjectWorkspace.tsx` to `SheetToolbar.tsx`.
- Conditionally apply the `active` className to the button elements depending on their state values.

## Scope

In scope:
- Columns, Edit columns, Categorize, Date Colors, Email Config, and Views buttons active/open layout indicator styling.

## Acceptance Criteria

- When Columns dropdown, Categorize dropdown, Date Colors modal, Email Config modal, or Saved Views dropdown is active/open, the clicked button uses the active styled theme format (light mint background, teal border, green text).

## Verification Plan

- Run `npm run build` and `npm test` inside `frontend/`.

## Completion Notes

Changed files:
- `frontend/src/components/ProjectWorkspace.tsx` (passed `isEmailConfigOpen` and `showDateColorConfig` states to `SheetToolbar`)
- `frontend/src/components/sheet/SheetToolbar.tsx` (updated properties declaration and button className strings to toggle the `active` style class dynamically)

Verification completed:
- Production bundle builds successfully.
- All 59 unit tests pass cleanly.

Unit tests added or updated:
- None.

Follow-ups:
- None.
