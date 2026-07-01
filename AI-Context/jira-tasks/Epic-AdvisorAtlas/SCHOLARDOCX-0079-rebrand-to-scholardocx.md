# SCHOLARDOCX-0079: Rebrand to ScholarDocX

Status: Done

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-06-26

## Summary

Rename the product from its legacy pre-rebrand name to ScholarDocX across display text, docs, all technical identifier casings, agent-skill folders, and Jira task IDs, while preserving existing local user data via an automatic migration shim.

## Business Context

Links:

- Business file: [AI-Context/business/decisions.md](../../business/decisions.md) (BD-009)

Business value:

- New brand identity applied consistently so the product name matches everywhere a user or contributor sees it.

## Functional Context

Links:

- Functional file: N/A (no behavior change beyond key names)

Requirements:

- No user-visible functional change. Existing chat history, AI settings, and login persist across the rename.

## Technical Context

Links:

- Technical file: [AI-Context/technical/local-storage-and-data.md](../../technical/local-storage-and-data.md)

Technical notes:

- Identifier casings renamed from legacy pre-rebrand forms to ScholarDocX / scholardocx / SCHOLARDOCX / scholarDocX / scholar_docx / scholar-docx, and task IDs moved to `SCHOLARDOCX-NNNN`.
- New file: frontend/src/lib/migrateStorageKeys.ts — one-time copy of legacy localStorage keys + the auth token to the new names, guarded by a `scholarDocX_keys_migrated` flag. Invoked from frontend/src/main.tsx before render.
- 7 agent-skill folders and 71 Jira task files renamed via git mv; their README indexes and internal cross-refs were updated by the bulk replace.
- DB file path is workspace-relative (workspace/db/app.db), so the root-folder rename does not move user data.

## Scope

In scope:

- Bulk identifier rename across tracked text files.
- localStorage + token migration shim and bootstrap wiring.
- Skill folder and Jira file renames.
- Decision log (BD-009) and this tracking task.

Out of scope:

- backend/backend.log (historical runtime log, left as-is).
- Root directory rename (manual final step).

## Acceptance Criteria

- All identifier casings use the new name; straggler grep is clean except backend.log and the migration shim.
- frontend build (tsc + vite) passes.
- Backend imports; FastAPI title is "ScholarDocX API".
- Existing local settings/history/login survive (migration shim verified).

## Implementation Plan

- Bulk sed over all tracked text files (excluding node_modules, .git, .pytest_cache, workspace, backend.log), then a targeted fix for the gitignored .env.
- Add migrateStorageKeys.ts; call from main.tsx; simplify the FloatingAssistant legacy webSearch block.
- git mv skill folders and Jira files.
- Update decisions.md (BD-009), task-template.md prefix, and create this task.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- Pure rename plus a small, deterministic client-side migration shim. Verified by build + manual localStorage check.

## File Size Check

Files expected to be edited:

- ~150+ files (bulk replace), plus migrateStorageKeys.ts (new), main.tsx, FloatingAssistant.tsx, decisions.md, task-template.md.

Line-count risk:

- Low

## Verification Plan

- npm --prefix frontend run build
- backend: python -c "import app.main"; pytest
- Straggler grep checked legacy pre-rebrand casing variants and old `SCHOLAR-NNNN` task IDs while excluding generated dependency folders and logs.
- Manual: load app with legacy keys present, confirm login/settings/history persist.

## Completion Notes

Changed files:

- ~150+ content files; new frontend/src/lib/migrateStorageKeys.ts; frontend/src/main.tsx; frontend/src/components/FloatingAssistant.tsx; AI-Context/business/decisions.md; AI-Context/jira-tasks/task-template.md; 7 skill folders renamed; 71 Jira files renamed; .env / .env.example.

Verification completed:

- Straggler grep clean (excludes backend.log + migration shim).
- Frontend build and backend import pass (see task notes).

Unit tests added or updated:

- None.

Follow-ups:

- Rename the legacy project root directory to `~/Documents/ScholarDocX` manually, then reopen the project.
