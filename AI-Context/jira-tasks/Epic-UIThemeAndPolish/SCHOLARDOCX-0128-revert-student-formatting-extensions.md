# SCHOLARDOCX-0128: Revert Student-Focused Cell Formatting Extensions

Status: DONE

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-12

## Summary

Revert the student-focused cell formatting extensions (text wrapping, status badges, inline progress bars, and border highlights) as requested by the user, while keeping the visual font expansion, font dropdown squeezing layout fix, and Date Colors modal visual polish.

## Scope

In scope:
- Revert additions in `sheetModel.ts`, `CellStyleBar.tsx`, `SheetTableRow.tsx`, `SheetRecordFields.tsx`, and `cell-formatting.css` related to wrap, badge, progress, and border properties.

## Verification Plan

- Run `npm run build` and `npm test` inside `frontend/` to confirm all code builds and runs perfectly.

## Completion Notes

Changed files:
- `frontend/src/components/sheet/sheetModel.ts` (removed `wrap`, `badge`, `progress`, and `border` properties from the `CellStyle` interface definition)
- `frontend/src/components/sheet/CellStyleBar.tsx` (removed WrapText, Tag, Percent, and Square Lucide icons, constants BADGE_LABELS / BORDER_LABELS, and layout button panels)
- `frontend/src/components/sheet/SheetTableRow.tsx` (removed dynamically applied text-wrap and border classes/styles from `<td>` elements)
- `frontend/src/components/SheetRecordFields.tsx` (removed custom select badge, progress bar, and text wrapping rendering definitions from `CellRenderer`)
- `frontend/src/cell-formatting.css` (deleted stylesheet configurations for `.cs-cell-wrap`, `.cs-badge`, progress, and border classes)
- `AI-Context/technical/frontend-visual-system.md` (reverted visual system description modifications)

Verification completed:
- Production bundle builds successfully.
- All 59 unit tests pass cleanly.

Unit tests added or updated:
- None.

Follow-ups:
- None.
