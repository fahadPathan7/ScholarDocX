# SCHOLARDOCX-0030 — Profile Avatar Picker Refresh

## Status
Completed

## Summary
Improve the profile avatar chooser UX and replace inline-generated avatars with local static avatar images that are bundled with the frontend.

## Scope
- Improve avatar selection presentation inside Profile view.
- Ensure selected-state visibility is clear.
- Keep initials fallback as a first-class option.
- Add downloaded avatar image assets to frontend media path.
- Keep stored profile value as avatar ID (no schema change).

## Functional Context Updates
- Updated `AI-Context/functional/feature-about-profile.md` with FR-8.5 and FR-8.6.

## Implementation Notes
- Added local avatar files under `frontend/public/media/avatars`.
- Updated avatar data source to point to static media paths.
- Updated profile picker markup to include labels and improved card-like avatar choices.
- Added dedicated avatar picker styles for layout, selected state, and initials fallback.

## Changed Files
- `frontend/src/components/ProfileView.tsx`
- `frontend/src/data/avatars.ts`
- `frontend/src/styles.css`
- `frontend/public/media/avatars/*.png`
- `AI-Context/functional/feature-about-profile.md`

## Validation
- Frontend production build succeeds:
  - `npm --prefix /Users/fahadpathan/Documents/ScholarDocX/frontend run build`

## Follow-ups
- Optional: add keyboard focus-visible styling specific to avatar options.
- Optional: allow user-uploaded custom avatar in addition to presets.
