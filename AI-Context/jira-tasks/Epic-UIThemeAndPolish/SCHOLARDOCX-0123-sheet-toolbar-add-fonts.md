# SCHOLARDOCX-0123: Add Arial and Other Beautiful Fonts to Sheet Typography

Status: DONE

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-12

## Summary

Expand the available font options in the cell formatting toolbar (`CellStyleBar`) to include Arial, Helvetica, Verdana, Trebuchet MS, Calibri, Garamond, and Times New Roman (in addition to standard System Sans, Serif/Georgia, and Monospace).

## Business Context

Links:
- Business file: None.

Business value:
- Provides users with more typographic options to format and presentation-polish their worksheets.

## Functional Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Requirements:
- Add 5-10 beautiful, universally available system/offline-safe fonts.
- Users must be able to select these fonts from the font-family dropdown.

## Technical Context

Links:
- [sheetModel.ts](../../../frontend/src/components/sheet/sheetModel.ts)
- [CellStyleBar.tsx](../../../frontend/src/components/sheet/CellStyleBar.tsx)

Technical notes:
- Update `CellStyle` type in `sheetModel.ts` to allow a broader `fontFamily` type (string).
- Expand `FONT_FAMILIES` record with the new font stacks.
- Update `FONT_LABELS` and dropdown rendering logic in `CellStyleBar.tsx` to display all expanded options dynamically.

## Scope

In scope:
- Typographic family expansion in the data model and format toolbar dropdown.

Out of scope:
- Installing dynamic Google Fonts from CDN (retains offline/local-first security constraints).

## Acceptance Criteria

- Font family dropdown offers: System, Arial, Helvetica, Verdana, Trebuchet MS, Calibri, Georgia, Garamond, Times New Roman, and Monospace.
- Selected font applies correctly to cells.

## Implementation Plan

- Modify the `fontFamily` property type of `CellStyle` in `sheetModel.ts` to `string`.
- Add new font stacks to `FONT_FAMILIES` in `sheetModel.ts`.
- Expand `FONT_LABELS` and update dropdown logic in `CellStyleBar.tsx`.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- This is an extension of configuration keys and UI choices; existing tests already verify that selected `fontFamily` gets mapped to CSS correctly.

## File Size Check

Files expected to be edited:
- `frontend/src/components/sheet/sheetModel.ts`
- `frontend/src/components/sheet/CellStyleBar.tsx`

Line-count risk:
- Low (both files are well below 1000 lines).

## Verification Plan

- Run `npm run build` and `npm test` inside `frontend/`.

## Completion Notes

Changed files:
- `frontend/src/components/sheet/sheetModel.ts` (expanded `FONT_FAMILIES` mapping and broad-typed `fontFamily` as string)
- `frontend/src/components/sheet/CellStyleBar.tsx` (updated `FONT_LABELS` definitions, dropdown cast, and label resolver)
- `AI-Context/technical/frontend-visual-system.md` (documented expanded system font stacks list)

Verification completed:
- Production bundle builds successfully.
- All 59 unit tests pass cleanly.

Unit tests added or updated:
- None.

Follow-ups:
- None.
