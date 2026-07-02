# SCHOLARDOCX-0117: Sheet Phase 5 - AI Glue and Row Peek

**Epic**: Epic-SheetRecords
**Status**: DONE
**Assignee**: AI Agent

## Objective
Implement the missing Row Peek Panel from Phase 4 and the AI Glue from Phase 5 in the Sheet planbook.

## Context
See `AI-Context/planbook/sheet-experience-upgrade.md` (Phase 4 and 5).

## Acceptance Criteria
- [x] Create a Row Peek Panel to view record details without opening the modal.
- [x] Add an "Ask AI" action to the Sheet toolbar that opens the FloatingAssistant with pre-filled context.
- [x] Smart template suggestion heuristics based on new sheet name (e.g., "scholarship" auto-selects Scholarship Tracker).

## Implementation Details
1. **Row Peek**: Created `RowPeekPanel.tsx`, added `peekRowIndex` state in `ProjectWorkspace.tsx`, and updated `SheetTable.tsx` to include an Eye icon on row hover.
2. **AI Glue**: Modified `FloatingAssistant.tsx` to listen to a custom `scholardocx:open-ai` event. Updated `SheetToolbar.tsx` with a Sparkles icon to dispatch the event from `ProjectWorkspace.tsx`.
3. **Smart Column Suggestion**: Added an `onChange` side effect to the Sheet Name field in `ProjectWorkspace.tsx`'s create sheet dialog.

## Verification
- Clean build (`npm run build`).
- TypeScript definitions are satisfied.

## Follow-up
- All phases from the Sheet Experience Upgrade planbook are now implemented.
