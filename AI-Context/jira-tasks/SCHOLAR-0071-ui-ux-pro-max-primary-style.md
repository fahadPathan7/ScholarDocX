# SCHOLAR-0071 — UI/UX Pro Max As Primary UI Style

## Status
Done

## Owner
AI Agent

## Created
2026-06-06

## Summary
Promote the installed `ui-ux-pro-max` skill from supplemental design guidance to ScholarDock's primary UI style authority for all UI/UX work.

## Business Context
Links:
- Business file: `AI-Context/business/product-vision.md`

Business value:
- Keeps ScholarDock's interface quality consistent across future AI-agent work.
- Reduces visual drift as multiple agents modify dashboards, tables, modals, forms, documents, and assistant surfaces.

## Functional Context
Links:
- Functional file: `AI-Context/agent-skills/README.md`
- Functional file: `AI-Context/workflows/ai-dlc-process.md`

Requirements:
- UI/UX work must treat `ui-ux-pro-max` as the primary design/style source.
- ScholarDock-specific AI-DLC, local-first, privacy, and product-workspace constraints remain higher priority.

## Technical Context
Links:
- Technical file: `AI-Context/technical/frontend-visual-system.md`
- Technical file: `AI-Context/technical/coding-standards.md`

Technical notes:
- This is a context/policy update only.
- No product runtime UI code changes are included.

## Scope
In scope:
- Update AI-Context to establish `ui-ux-pro-max` as the main UI style authority.
- Update root agent guidance so AI agents enforce the rule.
- Update the ScholarDock UI/UX skill wrapper to require the upstream skill first.
- Verify context files and whitespace.

Out of scope:
- Refactoring existing UI to match the policy.
- Running browser verification, because no runtime UI changed.

## Acceptance Criteria
- `AI-Context/technical/frontend-visual-system.md` states that `ui-ux-pro-max` is the primary UI style authority.
- `AGENTS.md` and `CLAUDE.md` enforce `ui-ux-pro-max` for UI/UX work.
- `AI-Context/agent-skills/scholardock-ui-ux/SKILL.md` tells agents to load/use `ui-ux-pro-max` before ScholarDock-specific UI constraints.
- The policy clearly says ScholarDock constraints override generic style suggestions when they conflict.

## Implementation Plan
1. Update frontend visual system context.
2. Update root/agent guidance.
3. Update the ScholarDock UI/UX wrapper skill.
4. Run structural and whitespace verification.
5. Update completion notes.

## Unit Test Plan
Unit tests needed:
- No

Planned tests:
- Documentation/context verification only.

If no unit tests are needed, explain why:
- This is a context-only policy change with no runtime behavior.

## File Size Check
Files expected to be edited:
- `AGENTS.md`
- `CLAUDE.md`
- `AI-Context/agent-skills/README.md`
- `AI-Context/agent-skills/scholardock-ui-ux/SKILL.md`
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/jira-tasks/SCHOLAR-0071-ui-ux-pro-max-primary-style.md`

Line-count risk:
- Low

If any file exceeds 1000 lines, explain why.

## Verification Plan
- Search for the primary UI style rule across context files.
- Run `git diff --check`.

## Completion Notes
Changed files:
- `AGENTS.md`
- `CLAUDE.md`
- `AI-Context/agent-skills/README.md`
- `AI-Context/agent-skills/scholardock-ui-ux/SKILL.md`
- `AI-Context/technical/frontend-visual-system.md`
- `AI-Context/jira-tasks/SCHOLAR-0071-ui-ux-pro-max-primary-style.md`

Verification completed:
- `rg -n "primary UI style authority|main UI style authority|TD-009|ui-ux-pro-max" ...` confirmed enforcement language across root docs, AI-Context, the ScholarDock UI/UX skill, and this Jira task.
- `wc -l ...` confirmed touched context files are well below the file-size limit.
- `git diff --check` passed with no whitespace errors.

Unit tests added or updated:
- None. This is a context-only policy change with no product runtime behavior.

Follow-ups:
- Future UI/UX Jira tasks should explicitly note that `ui-ux-pro-max` was loaded and applied, or explain why the task was not UI/UX work.
