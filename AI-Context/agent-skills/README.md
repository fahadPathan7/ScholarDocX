# ScholarDock Agent Skills

This folder stores repo-carried `SKILL.md` files for AI agents working on ScholarDock.

These skills are project guidance artifacts, not product runtime code. Use them with the root rules in [AGENTS.md](/Users/fahadpathan/Documents/ScholarDock/AGENTS.md), [CLAUDE.md](/Users/fahadpathan/Documents/ScholarDock/CLAUDE.md), [CODE_RULES.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/CODE_RULES.md), and the active Jira task.

## Skill Map

- [scholardock-coding](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-coding/SKILL.md): product code changes.
- [scholardock-context-update](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-context-update/SKILL.md): AI-Context and Jira updates.
- [scholardock-test-cases](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-test-cases/SKILL.md): test planning and implementation.
- [scholardock-context-review](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-context-review/SKILL.md): context quality review.

- [scholardock-ai-integrations](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-ai-integrations/SKILL.md): optional AI/search provider work.
- [scholardock-security-privacy](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-security-privacy/SKILL.md): local-first security and privacy work.
- [scholardock-handoff](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills/scholardock-handoff/SKILL.md): completion notes and agent handoff.

## Selection Rule

For each task, load only the skills directly relevant to the request. If a task crosses areas, combine the minimum needed skills; for example, UI feature work usually uses `scholardock-coding`, `scholardock-context-update`, `scholardock-test-cases`, and `scholardock-handoff`.

