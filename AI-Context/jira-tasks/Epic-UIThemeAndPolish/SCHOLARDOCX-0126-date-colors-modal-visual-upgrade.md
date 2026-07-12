# SCHOLARDOCX-0126: Date Colors Modal Visual Upgrade

Status: DONE

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-12

## Summary

Redesign the "Date Colors" configuration modal to match the premium natural academic visual system guidelines. This includes applying the dark blurred backdrop, soft layered panel shadows, customized number inputs, status-dot indicator rings, custom note callouts, and unified action button styles.

## Business Context

Links:
- Business file: None.

Business value:
- A polished, high-fidelity modal interface that fits seamlessly with the workspace design.

## Functional Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Requirements:
- Modal backdrop must use the dark blurred gradient.
- Settings rows must feature clear status-dot indicators.
- Number inputs and footer buttons must follow the design tokens.

## Technical Context

Links:
- [DateColorConfigModal.tsx](../../../frontend/src/components/sheet/DateColorConfigModal.tsx)
- [cell-formatting.css](../../../frontend/src/cell-formatting.css)

Technical notes:
- Update markup in `DateColorConfigModal.tsx` to use semantic classes.
- Add CSS definitions for the modal elements at the end of `cell-formatting.css`.

## Scope

In scope:
- Layout and aesthetics of the Date Colors modal.
- Input fields, note cards, and action buttons within this modal.

Out of scope:
- Logic changes to how date highlights are determined (already verified).

## Acceptance Criteria

- The backdrop is blurred with a subtle dark radial gradient.
- The panel has a clean layout, equal alignment, and premium border-radius/shadows.
- The urgent (red) and upcoming (yellow) rows have clearly visible status indicator dots with glow rings.
- The note block uses the mint theme token.

## Implementation Plan

- Append CSS styles to `frontend/src/cell-formatting.css`.
- Update JSX in `frontend/src/components/sheet/DateColorConfigModal.tsx`.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- Pure CSS/JSX visual upgrade.

## File Size Check

Files expected to be edited:
- `frontend/src/components/sheet/DateColorConfigModal.tsx`
- `frontend/src/cell-formatting.css`

Line-count risk:
- Low.

## Verification Plan

- Run `npm run build` to verify there are no compilation errors.
- Run `npm test` to verify all unit tests pass.

## Completion Notes

Changed files:
- `frontend/src/components/sheet/DateColorConfigModal.tsx` (updated modal structure to use class names and removed inline styles)
- `frontend/src/cell-formatting.css` (appended styles for `.date-colors-*` backdrop, panel, header, status indicators with glow rings, customized inputs, mint note card, and secondary/primary action buttons)

Verification completed:
- Production bundle builds successfully.
- All 59 unit tests pass cleanly.

Unit tests added or updated:
- None.

Follow-ups:
- None.
