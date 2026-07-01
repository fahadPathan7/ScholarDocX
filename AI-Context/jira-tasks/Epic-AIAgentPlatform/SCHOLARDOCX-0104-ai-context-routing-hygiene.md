# SCHOLARDOCX-0104: AI Context Routing Hygiene

Status: Done

Owner: AI Agent

Epic: Epic-AIAgentPlatform

Created: 2026-07-02

## Summary

Clean up AI-facing context and agent guidance so future agents load the right files, use the correct skill locations, avoid duplicate Jira IDs, and understand known large-file debt without over-refactoring unrelated code.

## Business Context

Links:

- Business file: `AI-Context/business/product-vision.md`

Business value:

- Reduces AI-agent confusion and prevents context drift from causing incorrect edits.
- Keeps the local-first product easier to maintain across Codex, Claude, and other AI coding agents.

## Functional Context

Links:

- Workflow file: `AI-Context/workflows/ai-dlc-process.md`
- Workflow file: `AI-Context/workflows/context-update-checklist.md`

Requirements:

- Agents should discover the right root rules, context folders, skill files, and Jira stories without relying on stale absolute paths or obsolete folder names.

## Technical Context

Links:

- Technical file: `AI-Context/technical/project-structure.md`
- Technical file: `AI-Context/technical/file-size-and-modularity.md`
- Technical file: `AI-Context/technical/testing-strategy.md`

Technical notes:

- This is documentation and context maintenance only.
- Keep changes narrow and avoid product runtime edits.

## Scope

In scope:

- Fix stale workspace links in AI-facing docs.
- Replace nonexistent context-file examples with real context targets.
- Make `.agents/skills`, `.claude/skills`, and `.codex/skills` the canonical skill locations.
- Normalize Jira task ID guidance to `SCHOLARDOCX-####`.
- Move the root-level refresh task into an Epic story.
- Resolve duplicate Jira story IDs by assigning unique IDs to later duplicates.
- Record known large source files as scoped technical debt.

Out of scope:

- Product runtime changes.
- Large historical rewrite of every old Jira note.
- Refactoring source code files.

## Acceptance Criteria

- Root and context entrypoints point to the current repository path or use relative links.
- Skill indexes point to the actual repo-carried skill folders.
- Jira guidance says stories live under Epic folders and use `SCHOLARDOCX-####`.
- No duplicate `SCHOLARDOCX-####` story filenames remain.
- No new story file remains directly under `AI-Context/jira-tasks/`.
- Known large files are documented as scoped debt.

## Implementation Plan

- Replace stale absolute path references from the old workspace name.
- Patch root/context entrypoints for real file names and relative links.
- Update skill README indexes.
- Move/rename ambiguous Jira task files.
- Update this task with verification.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- Structural shell checks for stale paths, duplicate Jira IDs, root-level story files, and stale skill-index links.

If no unit tests are needed, explain why:

- Documentation/context-only maintenance with no runtime behavior.

## File Size Check

Files expected to be edited:

- `AGENTS.md`
- `CLAUDE.md`
- `AI-Context/README.md`
- `AI-Context/CODE_RULES.md`
- `AI-Context/technical/README.md`
- `AI-Context/technical/project-structure.md`
- `AI-Context/technical/file-size-and-modularity.md`
- `AI-Context/jira-tasks/README.md`
- `.agents/skills/README.md`
- `.claude/skills/README.md`
- `.codex/skills/README.md`
- Selected Jira task files

Line-count risk:

- Low

If any file exceeds 1000 lines, explain why.

## Verification Plan

- Check for stale old-workspace absolute paths.
- Check no `AI-Context/agent-skills` links remain in living indexes.
- Check no root-level story files remain under `AI-Context/jira-tasks/`.
- Check no duplicate `SCHOLARDOCX-####` story filenames remain.
- Run `git diff --check`.

## Completion Notes

Changed files:

- Root/context entrypoints: `AGENTS.md`, `CLAUDE.md`, `AI-Context/README.md`, `AI-Context/CODE_RULES.md`.
- Skill indexes: `.agents/skills/README.md`, `.claude/skills/README.md`, `.codex/skills/README.md`.
- Technical context: `AI-Context/technical/README.md`, `AI-Context/technical/project-structure.md`, `AI-Context/technical/file-size-and-modularity.md`.
- Jira index and stories: `AI-Context/jira-tasks/README.md`, this task, and existing Epic stories normalized with explicit `Epic:` fields.
- Existing Jira stories normalized with parseable top-level `Status:` fields.
- Historical absolute workspace paths converted to portable relative references or plain code paths.
- Historical rebrand notes rewritten so the current project identity is always `ScholarDocX`.
- Renamed duplicate/root tasks:
  - `SCHOLARDOCX-0105-state-preserving-global-refresh.md`
  - `SCHOLARDOCX-0106-readable-visual-refinement.md`
  - `SCHOLARDOCX-0107-sheet-group-header-and-row-index.md`
  - `SCHOLARDOCX-0108-gemini-pro-no-auto-select.md`

Verification completed:

- Passed: `git diff --check`.
- Passed: stale old-workspace path scan returned no matches.
- Passed: legacy-name drift scan returned no current project-identity matches in AI-facing docs; project identity remains `ScholarDocX`.
- Passed: absolute repository Markdown-link scan returned no matches; repo links are relative.
- Passed: Markdown link checker found 0 broken local links.
- Passed: absolute workspace path scan returned no matches.
- Passed: obsolete `AI-Context/agent-skills` Markdown-link scan returned no matches.
- Passed: nonexistent context-file examples scan returned no matches.
- Passed: duplicate `SCHOLARDOCX-####` story filename scan returned no matches.
- Passed: root-level Jira story scan found only `README.md`, `epic-template.md`, and `task-template.md`.
- Passed: every Epic story file has an explicit `Epic:` field.
- Passed: every Epic story file has a parseable top-level `Status:` field.

Unit tests added or updated:

- None. This was documentation/context-only maintenance with no product runtime behavior.

Follow-ups:

- Existing historical Jira notes still vary in status formatting (`Status:` versus `## Status`); standardize only when touching those tasks for related work.
