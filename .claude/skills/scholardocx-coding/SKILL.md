---
name: scholardocx-coding
description: Use for ScholarDocX product code changes in the React/Vite frontend, FastAPI backend, SQLite data layer, secure file workspace, services, schemas, and API boundaries. Applies when implementing features, fixing bugs, refactoring source files, or changing runtime behavior.
---

# ScholarDocX Coding

## Required Start

1. Read root rules: `AGENTS.md`, `CLAUDE.md`, `AI-Context/CODE_RULES.md`.
2. Read `AI-Context/README.md`, the active Jira task, and only relevant business, functional, and technical context.
3. If behavior is new or changed, update context before product code.
4. Check line count before editing any large source file:

```bash
wc -l path/to/file
```

## Implementation Rules

- Preserve secure personal workspace behavior: SQLite and secure files for user data.
- Keep external AI/search calls behind backend services.
- Do not add telemetry, analytics, cloud persistence, remote databases, or required paid infrastructure.
- Use existing project patterns before adding abstractions **except modals** — always
  use `<Modal>` from `frontend/src/components/Modal.tsx` for main-content dialogs.
  Never copy inline `<div className="modal-backdrop modal-backdrop-main">` from other
  files (legacy debt). See AGENTS.md "Modal backdrop blur".
- Keep API routes thin, validation explicit, and persistence logic in repositories or services.
- Keep React components focused; extract components/hooks/helpers when a file is near the size limit.
- Never commit real secrets or API keys.

## Before Editing

- Identify affected files with `rg` and nearby tests.
- Read current implementation before changing it.
- Record scope, file-size risk, and test plan in the Jira task.

## Done Means

- Code compiles or the failure is documented.
- Meaningful behavior has focused tests.
- Context and Jira task list changed files, decisions, verification, and follow-ups.
