# SCHOLARDOCX-0234: UI audit cleanup (short-screen modals, stray scripts)

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

Follow-up sweep after the layout-freedom / clipping / modal fixes.

## Changes

- Deleted seven one-off scripts from `frontend/` (`patch_*`, `rename_tokens*`,
  `restore_*`, `remove_amount_inputs`) per AGENTS.md "no leftover fix scripts".
- `visual-refresh.css`: at `max-height: 760px`, `.modal-backdrop-main` top padding
  drops from 80px to 20px and `.modal-backdrop-main > .modal-panel` may use the
  whole work surface (`max-height: calc(100% - 8px)`); header/footer stay fixed and
  the body scrolls. Found because the Upload Document modal overflowed the work
  surface by ~80px at 1280x600.

## Verification

Playwright (mocked API, empty data): all in-app pages show no clipped containers at
1280x600, 1440x800, 390x700. Modals checked at 1280x600 (New category, Upload,
Create note, New Project): fully inside the work surface after the change.
Not verified: Plans / Buy credits (mock data shape failed to render), pages with
large real datasets, sheet modals (need a project with a sheet).

## Not done

Splitting oversized files (UsersTab, ProjectWorkspace, App, ResearchExpertView,
FloatingAssistant, styles.css, visual-refresh.css, backend ai_tokens/models) and
folding old CSS layers — separate refactor tasks. A Playwright smoke test for
"no clipped page roots" was not added (the repo has no browser-test setup).
