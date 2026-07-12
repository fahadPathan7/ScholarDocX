# SCHOLARDOCX-0121: Sheet Toolbar Alignment for Row Scope Label

Status: DONE

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-12

## Summary

Reposition the "Applying to X selected rows" badge/text to the left of the `CellStyleBar` in the sheet toolbar header, rather than to its right.

## Business Context

Links: None.

Business value:
- Better user readability and alignment of elements in the toolbar.

## Functional Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Requirements:
- The "Applying to X selected rows" label must be rendered before (to the left of) the formatting bar (`CellStyleBar`).

## Technical Context

Links:
- [SheetToolbar.tsx](../../../frontend/src/components/sheet/SheetToolbar.tsx)

Technical notes:
- Update the layout within `SheetToolbarActions` inside `SheetToolbar.tsx`.

## Scope

In scope:
- Repositioning the `{hasSelection && <span className="format-rail-scope">...</span>}` label before the `<CellStyleBar>` inside `SheetToolbarActions`.

Out of scope:
- Multi-cell formatting.
- Any other styling changes to `CellStyleBar`.

## Acceptance Criteria

- When multiple rows are selected, the text "Applying to X selected rows" appears to the left of the formatting bar.

## Implementation Plan

- Swap the rendering order of `CellStyleBar` and the `hasSelection` span in `SheetToolbar.tsx`.

## Unit Test Plan

Unit tests needed:
- No (for JSX reordering itself), but fixed a pre-existing date filtering timezone test bug.

If no unit tests are needed, explain why:
- The primary UI change is a purely visual JSX child order change without any functional logic or state mutation.

## File Size Check

Files expected to be edited:
- `frontend/src/components/sheet/SheetToolbar.tsx`

Line-count risk:
- Low (file is 490 lines, well below the 1000 line limit).

## Verification Plan

- Run `npm run build` inside `frontend/` to ensure the project compiles successfully.
- Run `npm test` inside `frontend/` to ensure all tests pass.

## Completion Notes

Changed files:
- `frontend/src/components/sheet/SheetToolbar.tsx` (swapped layout order of `CellStyleBar` and row scope label)
- `frontend/src/components/sheet/sheetFilters.ts` (fixed date preset timezone comparison issue to resolve failing unit test)
- `AI-Context/technical/frontend-visual-system.md` (documented layout expectation)

Verification completed:
- `npm run build` runs and compiles cleanly without errors.
- `npm test` runs and all 59 unit tests pass.

Unit tests added or updated:
- Fixed a date preset calculation logic bug that was causing the `filters next-7-days preset` unit test to fail in timezones outside UTC.

Follow-ups:
- None.
