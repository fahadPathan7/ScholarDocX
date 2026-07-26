# ScholarDocX Agent Skills

This folder stores repo-carried `SKILL.md` files for AI agents working on ScholarDocX.

These skills are project guidance artifacts, not product runtime code. Use them with the root rules in [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md), [CODE_RULES.md](../../AI-Context/CODE_RULES.md), and the active Jira task.

## Skill Map

- [scholardocx-coding](scholardocx-coding/SKILL.md): product code changes.
- [scholardocx-context-update](scholardocx-context-update/SKILL.md): AI-Context and Jira updates.
- [scholardocx-test-cases](scholardocx-test-cases/SKILL.md): test planning and implementation.
- [scholardocx-context-review](scholardocx-context-review/SKILL.md): context quality review.

- [scholardocx-ai-integrations](scholardocx-ai-integrations/SKILL.md): optional AI/search provider work.
- [scholardocx-security-privacy](scholardocx-security-privacy/SKILL.md): local-first security and privacy work.
- [scholardocx-handoff](scholardocx-handoff/SKILL.md): completion notes and agent handoff.
- [supabase](supabase/SKILL.md): Supabase product/client work.
- [supabase-postgres-best-practices](supabase-postgres-best-practices/SKILL.md): Postgres query/schema optimization.

### General web-design skills (adapted from [MengTo/Skills](https://github.com/MengTo/Skills))
These are generic web-design playbooks, scoped to ScholarDocX conventions. They are **secondary** to the project's own rules and visual system.

- [tailwindcss](tailwindcss/SKILL.md): Tailwind layout/typography/responsive/component patterns.
- [animation-systems](animation-systems/SKILL.md): product-grade motion (duration/easing/choreography/reduced-motion).
- [beautiful-shadows](beautiful-shadows/SKILL.md): polished layered neutral elevation via Tailwind arbitrary shadow utilities.

## Selection Rule

For each task, load only the skills directly relevant to the request. If a task crosses areas, combine the minimum needed skills; for example, UI feature work usually uses `scholardocx-coding`, `scholardocx-context-update`, `scholardocx-test-cases`, and `scholardocx-handoff`.
