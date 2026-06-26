# ScholarDocX Agent Skills

This folder stores repo-carried `SKILL.md` files for AI agents working on ScholarDocX.

These skills are project guidance artifacts, not product runtime code. Use them with the root rules in [AGENTS.md](/Users/fahadpathan/Documents/ScholarDocX/AGENTS.md), [CLAUDE.md](/Users/fahadpathan/Documents/ScholarDocX/CLAUDE.md), [CODE_RULES.md](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/CODE_RULES.md), and the active Jira task.

## Skill Map

- [scholardocx-coding](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/agent-skills/scholardocx-coding/SKILL.md): product code changes.
- [scholardocx-context-update](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/agent-skills/scholardocx-context-update/SKILL.md): AI-Context and Jira updates.
- [scholardocx-test-cases](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/agent-skills/scholardocx-test-cases/SKILL.md): test planning and implementation.
- [scholardocx-context-review](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/agent-skills/scholardocx-context-review/SKILL.md): context quality review.

- [scholardocx-ai-integrations](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/agent-skills/scholardocx-ai-integrations/SKILL.md): optional AI/search provider work.
- [scholardocx-security-privacy](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/agent-skills/scholardocx-security-privacy/SKILL.md): local-first security and privacy work.
- [scholardocx-handoff](/Users/fahadpathan/Documents/ScholarDocX/AI-Context/agent-skills/scholardocx-handoff/SKILL.md): completion notes and agent handoff.

## Selection Rule

For each task, load only the skills directly relevant to the request. If a task crosses areas, combine the minimum needed skills; for example, UI feature work usually uses `scholardocx-coding`, `scholardocx-context-update`, `scholardocx-test-cases`, and `scholardocx-handoff`.

