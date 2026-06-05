# SCHOLAR-0069 — Repo-Carried Agent Skills

## Status
Done

## Owner
AI Agent

## Created
2026-06-06

## Summary
Create compact project-specific `SKILL.md` files for recurring ScholarDock AI-agent workflows: coding, context updates, test cases, context review, UI/UX, AI integrations, security/privacy, and handoff.

## Business Context
Links:
- Business file: `AI-Context/business/product-vision.md`

Business value:
- Improves AI-agent consistency and maintainability as ScholarDock grows.
- Reduces repeated context loading and helps preserve the local-first, privacy-first product direction.

## Functional Context
Links:
- Functional file: `AI-Context/workflows/ai-dlc-process.md`

Requirements:
- Agents should have concise, task-specific guidance for common work types.
- Skills should not replace the root rules, active Jira task, or AI-Context source of truth.

## Technical Context
Links:
- Technical file: `AI-Context/technical/project-structure.md`
- Technical file: `AI-Context/technical/testing-strategy.md`

Technical notes:
- Add repo-carried skills under `AI-Context/agent-skills/`.
- Each skill must use the standard `SKILL.md` frontmatter shape with `name` and `description`.
- Skills are documentation/context artifacts, not runtime code.

## Scope
In scope:
- Add an index for available ScholarDock agent skills.
- Add focused `SKILL.md` files for coding, context updates, test cases, context review, UI/UX, AI integrations, security/privacy, and handoff.
- Update root/context references so future agents can discover the skills.
- Verify skill frontmatter and repository links structurally.

Out of scope:
- Installing these skills into global Codex skill directories.
- Changing product runtime behavior.
- Adding scripts, dependencies, or app tests for docs-only skill artifacts.

## Acceptance Criteria
- `AI-Context/agent-skills/` exists with a clear index.
- Each skill folder contains a concise `SKILL.md` with valid frontmatter.
- Skills reference ScholarDock rules and constraints instead of duplicating the entire project context.
- Root/context docs point agents to the skill index.
- Verification confirms the expected skill files exist.

## Implementation Plan
1. Create `AI-Context/agent-skills/README.md`.
2. Create skill folders and `SKILL.md` files.
3. Update `AI-Context/README.md`, `AI-Context/technical/project-structure.md`, and `AGENTS.md` with discovery guidance.
4. Verify structure and frontmatter with shell checks.
5. Update this task with completion notes.

## Unit Test Plan
Unit tests needed:
- No

Planned tests:
- Structural file checks for skill paths and frontmatter.

If no unit tests are needed, explain why:
- This is documentation/context-only agent enablement with no product runtime behavior.

## File Size Check
Files expected to be edited:
- `AGENTS.md`
- `AI-Context/README.md`
- `AI-Context/technical/project-structure.md`
- `AI-Context/agent-skills/**/SKILL.md`
- `AI-Context/agent-skills/README.md`
- `AI-Context/jira-tasks/SCHOLAR-0069-agent-skills.md`

Line-count risk:
- Low

If any file exceeds 1000 lines, explain why.

## Verification Plan
- Confirm all expected skill files exist.
- Confirm each skill has `name` and `description` frontmatter.
- Review `git diff --check`.

## Completion Notes
Changed files:
- `AGENTS.md`
- `CLAUDE.md`
- `AI-Context/README.md`
- `AI-Context/technical/project-structure.md`
- `AI-Context/agent-skills/README.md`
- `AI-Context/agent-skills/scholardock-coding/SKILL.md`
- `AI-Context/agent-skills/scholardock-context-update/SKILL.md`
- `AI-Context/agent-skills/scholardock-test-cases/SKILL.md`
- `AI-Context/agent-skills/scholardock-context-review/SKILL.md`
- `AI-Context/agent-skills/scholardock-ui-ux/SKILL.md`
- `AI-Context/agent-skills/scholardock-ai-integrations/SKILL.md`
- `AI-Context/agent-skills/scholardock-security-privacy/SKILL.md`
- `AI-Context/agent-skills/scholardock-handoff/SKILL.md`
- `AI-Context/jira-tasks/SCHOLAR-0069-agent-skills.md`

Verification completed:
- `find AI-Context/agent-skills -maxdepth 2 -name 'SKILL.md' -print | sort` confirmed 8 skill files.
- `rg -n "^(name|description):" AI-Context/agent-skills/*/SKILL.md` confirmed each skill has required frontmatter fields.
- `wc -l ...` confirmed all touched files are below the file-size policy limits.
- `git diff --check` passed with no whitespace errors.

Unit tests added or updated:
- None. This was documentation/context-only agent enablement with no runtime behavior.

Follow-ups:
- Install or mirror these repo-carried skills into a global agent skill directory only if a future workflow requires automatic discovery outside the repository.
