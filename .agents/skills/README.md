# ScholarDocX Agent Skills

Repo-carried `SKILL.md` files for AI agents working on ScholarDocX. These are
project guidance artifacts, not product runtime code. Use them with the root
rules in [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md),
[CODE_RULES.md](../../AI-Context/CODE_RULES.md), and the active Jira task.

**This folder is the single source.** `.claude/skills/` and `.codex/skills/` are
symlinks into it. They used to be copies, and four of them had drifted — the
stale copies still described the persistence layer as SQLite long after the move
to PostgreSQL, so Claude and Codex sessions were being handed the wrong stack
while `.agents` was correct (SCHOLARDOCX-0205). Add a skill here and symlink it;
never copy.

## Skill Map

- [scholardocx-coding](scholardocx-coding/SKILL.md): product code changes.
- [scholardocx-context-update](scholardocx-context-update/SKILL.md): writing AI-Context and Jira files.
- [scholardocx-context-audit](scholardocx-context-audit/SKILL.md): auditing context for rot — phantom APIs, drifted duplicate rules, fossilised features, unverified claims.
- [scholardocx-test-cases](scholardocx-test-cases/SKILL.md): test planning and implementation.
- [scholardocx-ai-integrations](scholardocx-ai-integrations/SKILL.md): AI/search provider work.
- [scholardocx-security-privacy](scholardocx-security-privacy/SKILL.md): security and privacy work.
- [scholardocx-handoff](scholardocx-handoff/SKILL.md): completion notes and agent handoff.
- [jira-manager](jira-manager/SKILL.md): Epic/Story hierarchy for Jira task files.
- [supabase](supabase/SKILL.md): Supabase product/client work.
- [supabase-postgres-best-practices](supabase-postgres-best-practices/SKILL.md): Postgres query/schema optimization.

`scholardocx-context-review` was **removed** in SCHOLARDOCX-0205 and folded into
`scholardocx-context-audit`, which covers everything it did plus a mechanical
drift check. Two skills with near-identical trigger descriptions compete for the
same request, which is worse than one good skill.

### General web-design skills (adapted from [MengTo/Skills](https://github.com/MengTo/Skills))

Generic web-design playbooks scoped to ScholarDocX conventions. **Secondary** to
the project's own rules and visual system.

- [tailwindcss](tailwindcss/SKILL.md): Tailwind layout/typography/responsive/component patterns.
- [animation-systems](animation-systems/SKILL.md): product-grade motion (duration/easing/choreography/reduced-motion).
- [beautiful-shadows](beautiful-shadows/SKILL.md): polished layered neutral elevation via Tailwind arbitrary shadow utilities.

## Selection Rule

Load only the skills directly relevant to the request. If a task crosses areas,
combine the minimum needed — UI feature work usually means `scholardocx-coding`,
`scholardocx-context-update`, `scholardocx-test-cases`, and
`scholardocx-handoff`.
