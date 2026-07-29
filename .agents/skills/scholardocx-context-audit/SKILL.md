---
name: scholardocx-context-audit
description: Use to audit ScholarDocX AI-DLC context for rot — AI-Context files, AGENTS.md, CLAUDE.md, CODE_RULES.md, skills, and Jira tasks. Finds phantom APIs, duplicated rules that have drifted apart, fossilised descriptions of removed features, aspirational structure written as fact, and unverified enforcement claims. Use for periodic context health checks, before a large feature lands, after a refactor moves or renames code, when an agent has just been misled by context, or when asked to review/audit/clean up context.
---

# ScholarDocX Context Audit

Context is read as instructions. A wrong sentence in AI-Context does not sit
harmlessly — it propagates into code the next agent writes, and into the
conclusions a reviewer draws. Audit it like code, not like documentation.

## Run the mechanical pass first

```bash
make guard-context
```

`scripts/check-context-drift.py` verifies that every repo path, markdown link,
and backticked code symbol in **living** context resolves to something real. Fix
everything it reports before starting the judgment pass — those are certainties,
and clearing them shrinks the surface you have to read.

## Living vs point-in-time

Get this distinction right before editing anything.

| Living — must match today | Point-in-time — must NOT be "corrected" |
|---|---|
| `business/`, `functional/`, `technical/`, `workflows/` | `jira-tasks/` |
| `AI-Context/README.md`, `CODE_RULES.md` | `planbook/` |
| `AGENTS.md`, `CLAUDE.md`, skills | completion notes, changed-file lists |

A finished task naming a file that was later deleted is an accurate record of
what shipped. Rewriting it to match today destroys the history that makes the
decision trail readable. Only living context tracks the present.

## The seven rot classes

Search for these by name. Each was found in the SCHOLARDOCX-0205 audit.

1. **Phantom API** — context names a function, endpoint, role limit, or table
   that does not exist. `charge_ai_tokens` appeared 28 times and had never
   existed. The mechanical pass catches symbols; you must still check endpoint
   paths, `role_limits` feature names, and table names by hand.
2. **Duplicated normative rules** — the same rule stated in three files, each
   drifted differently, with no way to tell which is authoritative. Fix by
   choosing one home and replacing the others with a link. Never "sync" copies.
3. **Fossilised removal** — a deleted feature still described in the present
   tense. Look for anything the code no longer has: removed quotas, replaced
   providers, retired UI. Say what replaced it and cite the task.
4. **Aspirational-as-actual** — a "suggested structure" or planned design that
   was never built, indistinguishable from a description of reality. Either
   delete it or label it explicitly as not built.
5. **Unverified enforcement claim** — "X is billed / gated / validated" written
   as fact when nobody checked. SCHOLARDOCX-0204 found four such claims that
   were false in code. **Verify at the call site before believing a claim, even
   one written in bold.**
6. **Cross-tree divergence** — `.agents/skills`, `.claude/skills`, and
   `.codex/skills` holding different copies of one skill. Prefer symlinks to
   `.agents/skills/` so divergence is structurally impossible.
7. **Orphaned context** — a file nothing links to and no reading path reaches.
   Either wire it into `AI-Context/README.md` or delete it.

## Product-constraint conflicts

Flag anything in context that contradicts the standing constraints, wherever it
appears — these outrank a convenient local wording:

- Privacy-first: no user application data leaving the machine beyond the
  declared providers.
- No paid infrastructure by default.
- The persistence story in [technical/](../../../AI-Context/technical) is the
  authority on the stack. If a skill or context file names a different database,
  it is the file that is wrong, not the code — check before "fixing" either.

## Jira task hygiene

Task files are point-in-time, but three things must still be true of them:

- Status reflects reality (no `In Progress` on shipped work).
- Acceptance criteria are testable, not aspirational prose.
- Completion notes record changed files, verification actually performed, and
  follow-ups — and say plainly what was *not* verified.

A decision recorded only in a task's notes is misfiled. Move it to
[decisions.md](../../../AI-Context/business/decisions.md) and link back.

## Judgment pass

Work living context file by file. For each, ask:

- **Does it contradict another file?** Note both locations; do not fix one side
  silently.
- **Does it describe behaviour the code no longer has?** Check the code. Do not
  infer from a neighbouring paragraph.
- **Does it restate a rule that lives elsewhere?** Replace with a link.
- **Is it a rule with no single home?** Give it one and point everything at it.
- **Would an agent reading only this file write correct code?** That is the bar.
  Compact is good; ambiguous is not.

## Reporting

Lead with severity, and separate what you verified from what you inferred:

- **Wrong** — context contradicts code. Cite file:line on both sides.
- **Stale** — describes something removed. Name the task that removed it.
- **Duplicated** — same rule in N places. Name the one that should survive.
- **Unverifiable** — you could not confirm it either way. Say so; do not guess.

If there are no findings, say that plainly and name what you did not check.

## Fixing

- Fix living context; leave task files and planbook alone.
- Prefer deleting a wrong claim over softening it. A hedged wrong sentence still
  misleads.
- When you remove a claim, say what replaced it and cite the task — a bare
  deletion invites the next agent to reinvent what was removed on purpose.
- Record structural decisions in [decisions.md](../../../AI-Context/business/decisions.md),
  not only in the audit's Jira task.
- Re-run `make guard-context`, then `make guards`, before reporting done.

## Related

- `scholardocx-context-update` — the write path (creating/refining context and
  Jira files). This skill is the read-and-verify path.
- [AI-Context/README.md](../../../AI-Context/README.md) — the map, including
  which file owns which rule.
