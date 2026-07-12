# SCHOLARDOCX-0124: Expand Fonts and Fix Dropdown Squeezing

Status: DONE

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-12

## Summary

1. Add 5 more offline-safe system fonts (Palatino, Goudy Old Style, Bookman Old Style, Optima, and Century Gothic) to the sheet font presets.
2. Fix the flex squeezing issue where the font selection label is partially cut off/squished in compact mode.

## Business Context

Links:
- Business file: None.

Business value:
- Better visual polish for font names.
- More beautiful typography options.

## Functional Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Requirements:
- Add Palatino, Goudy, Bookman, Optima, and Century Gothic.
- Prevent dropdown labels from being squished or cut off.

## Technical Context

Links:
- [sheetModel.ts](../../../frontend/src/components/sheet/sheetModel.ts)
- [CellStyleBar.tsx](../../../frontend/src/components/sheet/CellStyleBar.tsx)
- [cell-formatting.css](../../../frontend/src/cell-formatting.css)

Technical notes:
- Update `FONT_FAMILIES` in `sheetModel.ts`.
- Update `FONT_LABELS` in `CellStyleBar.tsx`.
- Add `flex-shrink: 0;` to toolbar buttons and dropdown elements in `cell-formatting.css`.

## Scope

In scope:
- Five new font stacks.
- CSS layout fix for toolbar item squeezing.

Out of scope:
- Dynamic Google Fonts.

## Acceptance Criteria

- Toolbar buttons and font dropdown labels are never squished or clipped.
- Dropdown has 15 fully functional fonts.

## Implementation Plan

- Update `sheetModel.ts` and `CellStyleBar.tsx` with the new fonts.
- Add `flex-shrink: 0;` rules in `cell-formatting.css`.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- Pure CSS and configuration-level change.

## File Size Check

Files expected to be edited:
- `frontend/src/components/sheet/sheetModel.ts`
- `frontend/src/components/sheet/CellStyleBar.tsx`
- `frontend/src/cell-formatting.css`

Line-count risk:
- Low.

## Verification Plan

- Run `npm run build` and `npm test` inside `frontend/`.

## Completion Notes

Changed files:
- `frontend/src/components/sheet/sheetModel.ts` (added Palatino, Goudy, Bookman, Optima, and Century Gothic stacks)
- `frontend/src/components/sheet/CellStyleBar.tsx` (updated FONT_LABELS mappings for the 5 new fonts)
- `frontend/src/cell-formatting.css` (added `flex-shrink: 0` to `.csb-group`, `.csb-btn`, and `.csb-dropdown` classes to resolve text label squeezing)
- `AI-Context/technical/frontend-visual-system.md` (documented expanded system font stacks list)

Verification completed:
- Production bundle builds successfully.
- All 59 unit tests pass cleanly.

Unit tests added or updated:
- None.

Follow-ups:
- None.
