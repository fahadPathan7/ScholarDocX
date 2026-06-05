# ScholarDock Agent Skills

This folder stores repo-carried `SKILL.md` files for AI agents working on ScholarDock.

These skills are project guidance artifacts, not product runtime code. Use them with the root rules in [AGENTS.md](/Users/fahadpathan/Documents/ScholarDock/AGENTS.md), [CLAUDE.md](/Users/fahadpathan/Documents/ScholarDock/CLAUDE.md), [CODE_RULES.md](/Users/fahadpathan/Documents/ScholarDock/CODE_RULES.md), and the active Jira task.

## Skill Map

- [scholardock-coding](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-coding/SKILL.md): product code changes.
- [scholardock-context-update](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-context-update/SKILL.md): AI-Context and Jira updates.
- [scholardock-test-cases](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-test-cases/SKILL.md): test planning and implementation.
- [scholardock-context-review](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-context-review/SKILL.md): context quality review.
- [scholardock-ui-ux](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-ui-ux/SKILL.md): UI/UX implementation and polish.
- [scholardock-ai-integrations](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-ai-integrations/SKILL.md): optional AI/search provider work.
- [scholardock-security-privacy](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-security-privacy/SKILL.md): local-first security and privacy work.
- [scholardock-handoff](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-handoff/SKILL.md): completion notes and agent handoff.

## Selection Rule

For each task, load only the skills directly relevant to the request. If a task crosses areas, combine the minimum needed skills; for example, UI feature work usually uses `scholardock-coding`, `scholardock-ui-ux`, `scholardock-context-update`, `scholardock-test-cases`, and `scholardock-handoff`.

## Upstream UI/UX Skill

ScholarDock also carries the upstream `ui-ux-pro-max` skill from `nextlevelbuilder/ui-ux-pro-max-skill` for agent-specific discovery. It is installed in project-local agent folders such as `.claude/skills/ui-ux-pro-max`, `.codex/skills/ui-ux-pro-max`, and `.gemini/skills/ui-ux-pro-max`.

For ScholarDock UI/UX work, `ui-ux-pro-max` is the primary UI style authority. Use it first for visual quality, interaction, accessibility, layout, typography, color, motion, forms, navigation, and data readability; then apply [scholardock-ui-ux](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-ui-ux/SKILL.md) to enforce this product's AI-DLC, local-first, app-workspace, and browser-verification constraints.
