# SCHOLARDOCX-0140 — Sticky Notes: Fix Race Condition on Create/Update

**Epic**: Epic-StickyNotes  
**Type**: Bug Fix  
**Status**: Done  
**Priority**: Medium

## Problem

`saveNote` in `StickyNotesView.tsx` had no submission guard. Rapid double-clicks on "Create note" or "Save note" would fire multiple concurrent `api.post` / `api.patch` calls, creating duplicate notes or writing conflicting updates.

Additionally, errors from the API were unhandled — an exception would leave `isSaving` stuck and give the user no feedback.

## Solution

Applied the standard race-condition guard pattern from `CODE_RULES.md` ("Preventing Race Conditions in Async Form Submissions"):

1. Added `isSaving` boolean state (`useState(false)`).
2. Early-return guard at the top of `saveNote`: `if (isSaving) return;`.
3. Wrapped the async API calls in `try/finally` — `setIsSaving(true)` before, `setIsSaving(false)` in `finally`.
4. Added `catch` block: logs error and calls `onToast("Failed to save note. Please try again.")`.
5. Both **Submit** and **Cancel** buttons are `disabled={isSaving}` during the in-flight request.
6. Submit button text updates to `"Creating..."` / `"Saving..."` while in progress.

## Changed Files

- `frontend/src/components/StickyNotesView.tsx`
  - Added `isSaving` state
  - Refactored `saveNote` with guard + try/catch/finally
  - Updated modal footer buttons to use `disabled={isSaving}` and dynamic label

## Notes

- `deleteNote`, `toggleSavedItem`, and `togglePin` are lower-risk (confirmation dialog / optimistic update) and were not in scope for this task.
- No new API surface — backend unchanged.
