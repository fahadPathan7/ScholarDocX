# SCHOLARDOCX-0105: State-Preserving Global Refresh

Status: Done

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-07-02

## Description
The global "Refresh" button previously caused the entire active tab component (like `ProjectWorkspace`) to unmount and remount by changing its `key` prop. This resulted in the loss of all local UI state, such as the user's scroll position, open modals, or selected sheets, providing a poor user experience.

The objective was to update the refresh mechanism to trigger a data re-fetch in the background without unmounting the components, preserving the user's UI state.

## Implementation Details
1. **Removed Key-Based Remounting**: Modified `App.tsx` to stop incrementing the `key` prop (e.g., `projectWorkspaceHomeKey`) when the refresh button is clicked.
2. **Introduced `refreshTrigger`**: Added a new `refreshTrigger` state (number) in `App.tsx` that increments on every refresh.
3. **Propagated Trigger**: Passed `refreshTrigger` as a prop down to all main tab components (`ProjectWorkspace`, `StickyNotesView`, `WhiteboardView`, `AdvisorAtlasView`, `ScholarshipNewsView`, and `DocumentView`).
4. **Data Re-fetching**: Added `useEffect` hooks in each of the tab components to listen for changes to `refreshTrigger`. When it changes, the components invoke their respective data-loading functions (e.g., `refreshProjects()` in `ProjectWorkspace.tsx`, `loadNotes()` in `StickyNotesView.tsx`) to pull fresh data silently.
5. **State Preservation**: Because the `key` prop remains stable, React no longer destroys and recreates the component tree, ensuring that all local UI states (scroll position, open forms, active inputs) are fully retained during a refresh.

## Completion Notes

Changed files:

- `frontend/src/App.tsx`
- Main tab components that accept `refreshTrigger`

Verification completed:

- Historical note says code was implemented across the frontend components.

Unit tests added or updated:

- Not recorded in the original root-level note.

Follow-ups:

- Keep new Jira story files inside an Epic folder.
