# Context Update Checklist

Use this checklist before and after implementation.

## Before Coding

- Is there an active Jira task?
- Does the task link relevant business context?
- Does the task link relevant functional context?
- Does the task link relevant technical context?
- Are acceptance criteria clear?
- Are out-of-scope items clear?
- Are file-size risks identified?
- Are unit tests needed for this feature? If not, is the reason documented?

## Update Business Context If

- Product goal changes.
- Target user changes.
- Privacy or cost posture changes.
- A feature changes user value or product scope.
- A business decision is made.

## Update Functional Context If

- User workflow changes.
- Requirement changes.
- Acceptance criteria change.
- New entity or relationship is introduced.
- Existing feature behavior changes.

## Update Technical Context If

- Stack changes.
- Project structure changes.
- API contract changes.
- Database schema changes.
- File storage behavior changes.
- AI provider behavior changes.
- Security or privacy implementation changes.
- Testing strategy changes.

## After Coding

- Mark verification results in the Jira task.
- Record changed files.
- Record important decisions.
- Record follow-ups.
- Record unit tests added, updated, or intentionally skipped with reason.
- Confirm context still matches implementation.
- Update root README when project status, setup commands, stack decisions, MVP scope, or major policies change.
