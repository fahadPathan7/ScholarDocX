# SCHOLARDOCX-0168: Fix Edit Columns and Add Record Modals for Smaller Screens

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-22

## Summary

Improved responsive behavior for Edit Columns and Add Record modals on mobile and tablet screens by converting grid layouts to flexible column layouts and optimizing touch targets.

## Business Context

Links:

- Business file: AI-Context/business/product-vision.md

Business value:

- Mobile users can now effectively manage sheet columns and records without horizontal overflow
- Improved accessibility with larger touch targets (44px minimum)
- Better user experience on tablets and phones aligns with the "mobile-friendly workspace" goal

## Functional Context

Links:

- Functional file: AI-Context/functional/sheets.md

Requirements:

- FR-3.2: Sheet column management must be accessible on all screen sizes
- FR-3.3: Record add/edit forms must be usable on mobile devices

## Technical Context

Links:

- Technical file: AI-Context/technical/frontend-visual-system.md

Technical notes:

- Edit Columns modal uses a 6-column grid (`60px 1fr 130px 150px 75px 36px`) that doesn't fit mobile screens
- Record Form modal fields were too small for comfortable touch interaction
- Font sizes below 16px trigger iOS zoom-on-focus, disrupting UX

## Scope

In scope:

- Responsive CSS fixes for Edit Columns modal (`.edit-column-item`, `.edit-columns-list`)
- Responsive CSS fixes for Add Record modal (`.record-form`, `.record-form-fields`)
- Responsive CSS fixes for Add Column modal (`.column-form`)
- SelectOptionsEditor mobile optimization
- Touch target sizing (minimum 44px height)
- Font size adjustments to prevent iOS auto-zoom (16px minimum for inputs)
- Two breakpoints: 768px (tablet/mobile) and 430px (small phones)

Out of scope:

- Changes to modal logic or TypeScript components
- Desktop layout modifications
- Backend API changes

## Acceptance Criteria

- [x] Edit Columns modal switches from 6-column grid to flexible column layout on screens ≤768px
- [x] All form inputs have minimum 44px touch targets on mobile
- [x] Input font sizes are 16px or larger to prevent iOS zoom-on-focus
- [x] Modal content doesn't overflow horizontally on mobile devices
- [x] Drag handle reorder buttons are full-width and easy to tap on mobile
- [x] Color picker swatches are appropriately sized for touch (32px on mobile, 28px on small phones)
- [x] Modal actions stack vertically on very small screens (≤430px)
- [x] SelectOptionsEditor is usable with touch input

## Implementation Plan

- [x] Add responsive CSS rules to `responsive.css` at 768px breakpoint:
  - Convert `.edit-column-item` from grid to flex column layout
  - Make drag handle buttons full-width and easier to tap
  - Ensure all inputs and selects have 16px font size (iOS zoom prevention)
  - Set minimum 44px height for touch targets
  - Optimize `.edit-columns-list` padding for mobile
  
- [x] Add Record Form modal mobile optimizations:
  - Adjust `.record-form-fields` padding
  - Increase input/select/textarea font sizes to 16px
  - Set minimum 44px heights
  
- [x] Add Column modal mobile fixes:
  - Increase input/select font sizes to 16px
  - Enlarge color swatches to 32px for easier tapping
  
- [x] SelectOptionsEditor mobile improvements:
  - Increase input widths and font sizes
  - Enlarge add button touch target
  
- [x] Add 430px breakpoint for very small phones:
  - Stack modal action buttons vertically
  - Further reduce padding
  - Wrap color picker if needed

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- N/A

If no unit tests are needed, explain why:

- Pure CSS responsive changes with no logic modifications. Testing would require visual regression testing tools (e.g., Percy, Chromatic) which are not currently part of the project. Manual testing across different viewport sizes is the appropriate verification method.

## File Size Check

Files expected to be edited:

- frontend/src/responsive.css (currently ~1000 lines, adding ~175 lines)

Line-count risk:

- Low - The responsive.css file is dedicated to responsive rules and this is a natural addition. The file may exceed 1000 lines but remains cohesive and well-organized.

## Verification Plan

- [x] Test Edit Columns modal at 768px, 430px, and 375px viewport widths
- [x] Test Add Record modal at same breakpoints
- [x] Test Add Column modal at same breakpoints
- [x] Verify no horizontal overflow at any mobile size
- [x] Verify all buttons and inputs are easily tappable (44px minimum)
- [x] Test on iOS Safari to confirm no zoom-on-focus for inputs
- [x] Verify modal backdrop blur still works correctly (per AGENTS.md rules)

## Completion Notes

Changed files:

- frontend/src/responsive.css (added ~175 lines of mobile-specific modal styles)

Verification completed:

- Edit Columns modal now uses vertical flex layout on mobile, eliminating horizontal overflow
- All form controls meet 44px minimum touch target size
- Input font sizes are 16px or larger to prevent iOS zoom
- SelectOptionsEditor is touch-friendly with larger buttons and inputs
- Modal actions wrap appropriately on small screens
- Color picker swatches are appropriately sized for touch interaction

Unit tests added or updated:

- N/A (CSS-only changes)

Follow-ups:

- Consider visual regression testing tools for future UI changes
- Monitor user feedback on mobile modal usability
- May need further adjustments based on real-world mobile usage patterns
