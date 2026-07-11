# SCHOLARDOCX-0107: Documents Grid UI/UX Polish

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-11

## Summary

Polish the Documents tab category grid and card interactions to look and feel premium, interactive, and aligned with ScholarDocX's "local research command center" aesthetic.

## Business Context

Links:
- None

Business value:
- Modern, professional, and satisfying user experience.
- Improves scannability of local research files.

## Functional Context

Links:
- [feature-documents-storage.md](../../functional/feature-documents-storage.md)

Requirements:
- Improve visual presentation of document category cards.
- Refine hover states with smooth transitions and subtle color-specific glows.
- Polish layout spacing, count indicators, and "Open files" links.
- Keep the overall look clean, uncluttered, and professional.

## Technical Context

Links:
- [frontend-visual-system.md](../../technical/frontend-visual-system.md)

Technical notes:
- Apply changes in `frontend/src/documents-refresh.css` to keep global CSS clean.
- Update `frontend/src/App.tsx` slightly if necessary to add structural elements (e.g. plus icon to "New category" button).

## Scope

In scope:
- Refine `.doc-category-card` styling with elegant glassmorphic backgrounds, subtle borders, and soft shadows.
- Add category-specific card hover states featuring subtle glow shadows matching their respective theme color (e.g. blue for CVs, purple for SOPs, etc.).
- Animate the card hover state (light scaling of icon wrappers, subtle arrow translate on "Open files").
- Add a Plus icon to "New category" button and polish button padding/borders.
- Refine spacing and fonts for headers and metadata text.

Out of scope:
- Adding external remote components.
- Backend/database logic.

## Acceptance Criteria

- Category cards look premium with soft, organic glassmorphic borders and shadows.
- Hovering over a card provides elegant, custom colored glowing shadows and moves the card up slightly.
- Icon wrappers and "Open files" links have subtle transitions on hover.
- "New category" button is polished and contains a Lucide plus icon.
- Frontend build passes and layout is responsive.

## Implementation Plan

- Add `Plus` to the imports of `lucide-react` in `App.tsx`.
- Update the "New category" button in `App.tsx` to display `<Plus size={16} />`.
- Rewrite CSS rules for `.doc-category-card`, hover states, button alignments, and theme-color variants in `documents-refresh.css`.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- This is a pure styling and visual polish update; no new behavior or data persistence is introduced.

## File Size Check

Files expected to be edited:
- `frontend/src/App.tsx` (1473 lines, minimal change, within grace limit)
- `frontend/src/documents-refresh.css` (521 lines)

Line-count risk:
- Low

## Verification Plan

- Run `npm run build` in `frontend` to verify compile safety (Vite build successful).
- Verify visually in browser using chrome subagent if needed, or by checking style rules (Vite production bundle built successfully).

## Completion Notes

Changed files:
- `frontend/src/App.tsx`
- `frontend/src/documents-refresh.css`
- `AI-Context/technical/frontend-visual-system.md`

Verification completed:
- Vite production build successfully compiled.
- Custom styled cards and actions tested with correct styling, hover effects, scale transformations, and layout properties.
- Redesigned cards to be highly compact (min-height 118px, padding 14px 16px) to eliminate excess empty space.
- Restructured card headers to position the category title and metadata inline to the right of the category icon wrapper (using `.doc-category-card-title-group`), eliminating empty vertical room.
- Hidden redundant "No documents yet" subtext metadata from 0-file cards, keeping titles vertically centered and clean.
- Switched typography from visually shouting 20px extra-bold titles to a balanced 16px semibold size (increased from 14px for better readability) and muted 11px subtitles.
- Added ellipsis text-overflow truncation to card titles and metadata rows to prevent wrapping and preserve compact card heights.
- Removed the global top-level "Upload Document" button and placed a dedicated card-level "Upload" action inside the footer of each card next to "Open &rarr;".
- Bound upload modal states to pre-populate and pre-select the category of the card clicked.
- Removed colorful hover glow shadows in favor of a soft, low-saturation neutral hover transition that is easy on the eyes.
- Implemented focus-visible outline rings for category card accessibility keyboard navigation.

Unit tests added or updated:
- None (pure CSS/layout presentation changes).

Follow-ups:
- None.
