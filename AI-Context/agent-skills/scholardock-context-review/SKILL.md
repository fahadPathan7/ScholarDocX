---
name: scholardock-context-review
description: Use for reviewing ScholarDock AI-Context, Jira tasks, root rules, and handoff notes for correctness, drift, duplication, missing acceptance criteria, incomplete decisions, and conflicts with the local-first product constraints.
---

# ScholarDock Context Review

## Review Order

1. Root rules: `AGENTS.md`, `CLAUDE.md`, `AI-Context/CODE_RULES.md`.
2. `AI-Context/README.md` and workflow files.
3. Active or recently changed Jira tasks.
4. Relevant business, functional, and technical files.

## Findings To Prioritize

- Conflicts with local-first, privacy-first, or zero-infrastructure constraints.
- Missing or stale Jira task status.
- Feature behavior described in code but absent from context.
- Context that promises behavior not implemented.
- Large duplicated sections that should be linked instead.
- Missing acceptance criteria or verification notes.
- Decisions captured only in chat or task notes instead of decision files.

## Output Shape

Lead with findings by severity and file reference. If there are no findings, say that clearly and name any residual risk or unchecked area.

## Fixing Context

When asked to fix context, keep edits narrow. Update the Jira task with changed context files and the review result.
