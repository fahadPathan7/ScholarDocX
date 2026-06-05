# SCHOLAR-0070 — Project UI/UX Pro Max Skill Install

## Status
Done

## Owner
AI Agent

## Created
2026-06-06

## Summary
Install the upstream `nextlevelbuilder/ui-ux-pro-max-skill` into ScholarDock as a project-local skill for multiple AI-agent folder conventions.

## Business Context
Links:
- Business file: `AI-Context/business/product-vision.md`

Business value:
- Gives all AI agents working in this repository stronger UI/UX guidance while preserving ScholarDock's local-first AI-DLC process.

## Functional Context
Links:
- Functional file: `AI-Context/workflows/ai-dlc-process.md`
- Functional file: `AI-Context/agent-skills/README.md`

Requirements:
- UI/UX work in ScholarDock should automatically use `ui-ux-pro-max` when available.
- Project-local agent skill folders should make the upstream skill discoverable to common AI coding assistants.

## Technical Context
Links:
- Technical file: `AI-Context/technical/project-structure.md`
- Technical file: `AI-Context/technical/frontend-visual-system.md`

Technical notes:
- Upstream repository: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`
- Installed upstream commit: `b7e3af80f6e331f6fb456667b82b12cade7c9d35`
- The project already has a concise ScholarDock-specific wrapper at `AI-Context/agent-skills/scholardock-ui-ux/SKILL.md`; this task adds the upstream full skill package beside agent-specific config folders.

## Scope
In scope:
- Install the full upstream `ui-ux-pro-max` skill into project-local agent skill folders.
- Preserve ScholarDock root rules as higher priority than generic UI/UX guidance.
- Update context and Jira notes with installation paths and verification.

Out of scope:
- Changing product UI code.
- Running visual browser verification, because no runtime UI changed.
- Overwriting user secrets or local agent settings.

## Acceptance Criteria
- Project-local `ui-ux-pro-max` skill folders exist for common AI-agent conventions.
- Installed skill files include `SKILL.md`, `data/`, and `scripts/` where the upstream skill expects them.
- Root/context docs explain that `ui-ux-pro-max` augments but does not override ScholarDock AI-DLC rules.
- Verification confirms expected files and frontmatter exist.

## Implementation Plan
1. Inspect upstream repo structure and commit.
2. Install/copy the full skill package into project-local agent folders.
3. Update `AGENTS.md`, `CLAUDE.md`, `AI-Context/agent-skills/README.md`, and `AI-Context/technical/project-structure.md`.
4. Verify file structure, frontmatter, scripts, and whitespace.
5. Update completion notes.

## Unit Test Plan
Unit tests needed:
- No

Planned tests:
- Structural file checks only.

If no unit tests are needed, explain why:
- This installs documentation/skill assets only and does not change product runtime behavior.

## File Size Check
Files expected to be edited:
- `AGENTS.md`
- `CLAUDE.md`
- `AI-Context/agent-skills/README.md`
- `AI-Context/technical/project-structure.md`
- project-local agent skill folders
- `AI-Context/jira-tasks/SCHOLAR-0070-project-ui-ux-pro-max-install.md`

Line-count risk:
- Low for handwritten context files. Upstream `SKILL.md` is intentionally large as vendor skill content.

If any file exceeds 1000 lines, explain why.
- The upstream `ui-ux-pro-max/SKILL.md` is vendor skill content and should remain intact for install fidelity.

## Verification Plan
- Confirm agent-local skill folders exist.
- Confirm `SKILL.md`, `data/`, and `scripts/` exist for full skill installs.
- Confirm frontmatter includes `name: ui-ux-pro-max`.
- Run `git diff --check`.

## Completion Notes
Changed files:
- `.gitignore`
- `AGENTS.md`
- `CLAUDE.md`
- `AI-Context/agent-skills/README.md`
- `AI-Context/technical/project-structure.md`
- `.agents/skills/ui-ux-pro-max/`
- `.augment/skills/ui-ux-pro-max/`
- `.claude/skills/ui-ux-pro-max/`
- `.codebuddy/skills/ui-ux-pro-max/`
- `.codex/skills/ui-ux-pro-max/`
- `.continue/skills/ui-ux-pro-max/`
- `.cursor/skills/ui-ux-pro-max/`
- `.factory/skills/ui-ux-pro-max/`
- `.gemini/skills/ui-ux-pro-max/`
- `.github/prompts/ui-ux-pro-max/`
- `.kilocode/skills/ui-ux-pro-max/`
- `.kiro/steering/ui-ux-pro-max/`
- `.opencode/skills/ui-ux-pro-max/`
- `.qoder/skills/ui-ux-pro-max/`
- `.roo/skills/ui-ux-pro-max/`
- `.trae/skills/ui-ux-pro-max/`
- `.warp/skills/ui-ux-pro-max/`
- `.windsurf/skills/ui-ux-pro-max/`
- `AI-Context/jira-tasks/SCHOLAR-0070-project-ui-ux-pro-max-install.md`

Verification completed:
- `git ls-remote https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git HEAD` confirmed upstream commit `b7e3af80f6e331f6fb456667b82b12cade7c9d35`.
- Skill installer helper successfully installed the upstream path `.claude/skills/ui-ux-pro-max` into a temporary destination and then into `.claude/skills/ui-ux-pro-max`.
- Structural checks confirmed 18 project-local installs with `SKILL.md` or `PROMPT.md`, `data/`, and `scripts/`.
- `rg -n "^name: ui-ux-pro-max" ...` confirmed installed skill frontmatter.
- `python3 .codex/skills/ui-ux-pro-max/scripts/search.py "ScholarDock dashboard table accessible" --domain ux -n 3` returned relevant UX results, proving the copied scripts/data work.
- `git check-ignore -v` confirmed `.claude/settings.local.json` remains ignored while `.claude/skills/` and `.cursor/skills/` are trackable.
- `git diff --check` passed with no whitespace errors.

Unit tests added or updated:
- None. This installed documentation/skill assets only and did not change product runtime behavior.

Follow-ups:
- Restart agent tools that cache skills so they discover the new project-local skill folders.
