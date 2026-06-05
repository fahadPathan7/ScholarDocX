---
name: scholardock-context-update
description: Use when creating, refining, or auditing ScholarDock AI-Context files and Jira task files. Applies before new features, feature modifications, architecture changes, requirement changes, task completion notes, and context maintenance.
---

# ScholarDock Context Update

## Read First

- `AI-Context/README.md`
- `AI-Context/workflows/ai-dlc-process.md`
- `AI-Context/workflows/context-update-checklist.md`
- Active file in `AI-Context/jira-tasks/`

## Update Targets

- Business context: user value, privacy/cost posture, scope, personas, success metrics, decisions.
- Functional context: workflows, visible behavior, entities, acceptance criteria, requirement IDs.
- Technical context: architecture, storage, APIs, data model, integrations, security, testing, file organization.
- Jira task: status, scope, plan, tests, changed files, verification, follow-ups.

## Style

- Keep context compact and scannable.
- Prefer links to repeating long descriptions.
- Use existing IDs where possible; create new IDs only when needed.
- Record decisions in the decision file, not only in task notes.
- Do not turn one context file into a project brain.

## Completion Checklist

- The Jira task links relevant context.
- Acceptance criteria are testable.
- Out-of-scope items are explicit.
- Test decisions are recorded.
- Implementation notes match the final files.
