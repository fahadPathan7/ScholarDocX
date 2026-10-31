# SCHOLARDOCX-0212: Remove accumulated one-off fix/patch scratch files + codify the no-leftovers rule

Status: Done

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-10-31

## Summary

60 one-off scratch files had accumulated in the repo: `fix_*` / `patch_*` /
`migrate_*` / `check_*` / `rewrite_*` scripts, scratch SQL, fix-summary
`.md` files, a committed `backend.log`, empty SQLite fossils, and legacy
root-level probe "tests". All were leftovers from fixes that had already
landed. Removed them all and added a standing rule (AGENTS.md STRICT
ENFORCEMENTS + CODE_RULES.md) that such files are deleted in the same task
once the fix is verified.

## Business Context

Links:

- Business file: `business/decisions.md`
- Technical file: `technical/coding-standards.md`

Business value:

- Repo stays scannable for humans and AI agents; fix scripts don't masquerade
  as product code or tests.

## Functional Context

Links:

- Functional file: N/A (no product behaviour change)

Requirements:

- N/A

## Technical Context

Links:

- `technical/coding-standards.md`, root `AGENTS.md` ("NO LEFTOVER ONE-OFF
  FIX SCRIPTS")

Technical notes:

- Deleted (tracked, via `git rm`): 10 repo-root scratch files
  (`FIX_STUCK_PAPERS_README.md`, `RESEARCH_EXPERT_FIX_COMPLETE.md`,
  `fix_stuck_papers.py`, `fix_stuck_papers.sql`, `query_db.py`,
  `test_all_settings.py`, `test_db.py`, `test_db_insert.py`,
  `test_polar.py`, `test_user_email.py`); 32 backend-root scratch files
  (`add_polar_*`, `patch_*`, `fix_*`, `check_*`, `migrate_polar`,
  `restore_webhooks`, `update_db_limits`, `backend.log`, root-level
  `test_*.py` probes); 3 backend one-off scripts (`scripts/fix_compat.py`,
  `scripts/fix_imports.py`, `scripts/probe_openalex.py`); 15
  `scripts/legacy/*` fossils.
- Deleted (untracked): empty `backend/data.db`, `backend/scholardocx.db`
  (0 bytes, pre-Postgres fossils).
- Kept: `backend/scripts/create_superadmin.py` (recurring ops tool,
  referenced by SCHOLARDOCX-0139/0149) and all root `scripts/` tooling
  wired into `make check`.
- `.gitignore`: added `*.log` (`*.db` was already covered).
- `backend/pytest.ini`: comment updated — root scratch tests are gone but
  `testpaths = tests` stays as a standing guard.

## Scope

In scope:

- Deletion + rule codification + guard verification.

Out of scope:

- Any product code change.

## Acceptance Criteria

- No `fix_*`/`patch_*`/`migrate_*`/`probe_*`/scratch SQL/fix-summary md
  files remain at repo root, `backend/` root, or `scripts/legacy/`.
- `make guard-context` green.
- Rule recorded in AGENTS.md + CODE_RULES.md.

## Implementation Plan

- [x] Inventory + reference check (AGENTS/CLAUDE/README/Makefile/.github/
      AI-Context/scripts).
- [x] `git rm` tracked files; `rm` untracked fossils.
- [x] `.gitignore` + `backend/pytest.ini` updates.
- [x] Rules in AGENTS.md (STRICT ENFORCEMENTS + Expected Agent Behavior)
      and CODE_RULES.md (Architecture Rules).

## Unit Test Plan

Unit tests needed:

- No (deletion of dead files; no behaviour introduced).

## File Size Check

Files expected to be edited:

- N/A (net −60 files)

Line-count risk:

- Low

## Verification Plan

- `git status` shows exactly the intended deletions.
- No imports of removed modules anywhere in app/tests/scripts/Makefile/CI.
- `make guard-context`: ok (6716 symbols resolve).

## Completion Notes

Changed files:

- 60 deletions; `.gitignore`, `backend/pytest.ini`, `AGENTS.md`,
  `AI-Context/CODE_RULES.md` updated.

Verification completed:

- Import sweep clean; guard-context green.

Unit tests added or updated:

- N/A (deletion only)

Follow-ups:

- None.
