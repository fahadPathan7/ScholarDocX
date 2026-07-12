# SCHOLARDOCX-0125: Dropdown Font Icon & Label Alignment

Status: DONE

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-12

## Summary

Fix the vertical alignment issue in the font selection dropdown button where the "Aa" prefix text icon and the font family name are offset and not aligned in a straight line.

## Business Context

Links:
- Business file: None.

Business value:
- Pristine alignment and visual balance for sheet toolbar controls.

## Functional Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Requirements:
- The "Aa" text prefix and the selected font name must be perfectly aligned vertically.

## Technical Context

Links:
- [CellStyleBar.tsx](../../../frontend/src/components/sheet/CellStyleBar.tsx)
- [cell-formatting.css](../../../frontend/src/cell-formatting.css)

Technical notes:
- Update the styles on the "Aa" prefix `span` inside `CellStyleBar.tsx` to use inline-flex and line-height normalizations.
- Refine `.csb-dropdown-label` and `.csb-dropdown-btn` in `cell-formatting.css` to enforce consistent baseline/center alignment.

## Scope

In scope:
- Aligning font prefix text and font label within the family dropdown button.

Out of scope:
- Other dropdown menu elements.

## Acceptance Criteria

- The "Aa" prefix and the font name label are centered perfectly on the same vertical axis.

## Implementation Plan

- Set `display: inline-flex`, `align-items: center`, and `line-height: 1` on the icon prefix span in `CellStyleBar.tsx` and the label class in `cell-formatting.css`.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- Aesthetic CSS alignment change.

## File Size Check

Files expected to be edited:
- `frontend/src/components/sheet/CellStyleBar.tsx`
- `frontend/src/cell-formatting.css`

Line-count risk:
- Low.

## Verification Plan

- Build the project and verify no errors.
- Run tests and ensure they are all passing.

## Completion Notes

Changed files:
- `frontend/src/components/sheet/CellStyleBar.tsx` (updated `Aa` span style to use `inline-flex` and set line-height to 1)
- `frontend/src/cell-formatting.css` (updated `.csb-dropdown-btn` and `.csb-dropdown-label` to use `inline-flex`, flex alignment, and line-height normalized to 1)

Verification completed:
- Production bundle builds successfully.
- All 59 unit tests pass cleanly.

Unit tests added or updated:
- None.

Follow-ups:
- None.
