# SCHOLARDOCX-0132: Columns and Categorize Dropdown Menu Row Spacing Polish

Status: DONE

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-12

## Summary

Reduce row gaps and item padding inside the Columns visibility dropdown menu and the Categorize dropdown menu for a more compact and polished look.

## Business Context

Links:
- Business file: None.

Business value:
- Compact lists permit easier scanning and viewing of list items without excessive vertical scrolling.

## Functional Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Requirements:
- Make option rows in "Columns" and "Categorize" menus tighter and closer together.

## Technical Context

Links:
- [SheetToolbar.tsx](../../../frontend/src/components/sheet/SheetToolbar.tsx)

Technical notes:
- Reduce column dropdown list container gap to `0.125px` and item padding to `0.2px 8px`, `fontSize: 12px`. Set checkbox margin to `0`. Style header to use uppercase `11px` bold styling.
- Reduce group dropdown list container gap to `0.125px` and item padding to `0.2px 8px`, `fontSize: 12px`. Set radio button margin to `0`. Style header to use uppercase `11px` bold styling.

## Scope

In scope:
- Columns visibility dropdown list row spacing.
- Categorize by column dropdown list row spacing.

## Verification Plan

- Run `npm run build` and `npm test` inside `frontend/`.

## Completion Notes

Changed files:
- `frontend/src/components/sheet/SheetToolbar.tsx` (reduced CSS `gap` property in drop menu containers to `0.125px`, `padding` property in row label elements to `0.2px 8px`, item font-size to `12px`, and updated headers to use dense uppercase styling)

Verification completed:
- Production bundle builds successfully.
- All 59 unit tests pass cleanly.

Unit tests added or updated:
- None.

Follow-ups:
- None.
