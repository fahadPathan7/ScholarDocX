# SCHOLARDOCX-0110: Agentic Actions Across All Non-Admin Workspace Domains

Status: Done

Owner: AI Agent

Epic: Epic-AIAgentPlatform

Created: 2026-07-02

## Summary

Expand the AI chat agentic feature from the current project/sheet/row/sticky-note
scope to every user-owned workspace domain: documents and versions, email
templates and drafts, outreach logs, reminders, deadlines, universities,
programs, professors, applications, and research notes. Admin capabilities
(user management, roles, role limits, invites, tokens, app settings, model
management) are explicitly excluded and refused by the planner. Confirmed
execution enforces the same role-limit permissions the manual REST routes
enforce, so agents can never create more than the user's plan allows.

## Business Context

Links:

- Business file: [product-goals](../../business/README.md)

Business value:

- The assistant becomes a full local workspace operator, increasing the value
  of agent-enabled plans while keeping the local-first, privacy-first posture.
- Permission parity removes a quota-bypass loophole where the agent could
  create records past plan limits that manual UI flows would block.

## Functional Context

Links:

- Functional file: [feature-ai-assistant.md](../../functional/feature-ai-assistant.md)

Requirements:

- FR-5.x: Agentic workspace actions cover create/update/delete/read for all
  user-owned entity domains, keep plan-confirm-execute, and refuse admin tasks.

## Technical Context

Links:

- Technical file: [ai-integrations.md](../../technical/ai-integrations.md)

Technical notes:

- `backend/app/services/ai_actions.py` is 2005 lines (over the 1150 hard cap),
  so this task splits it as part of the same change:
  - `ai_actions.py` keeps `AiActionService` orchestration, planner prompts,
    heuristics, and plan normalization core.
  - `ai_actions_catalog.py` (new) owns the action registry: supported/read-only
    sets, limit-feature mapping, action descriptions, execution messages.
  - `ai_actions_workspace.py` (new) receives the existing project/sheet/row/
    sticky-note normalizers; `ai_actions_execute.py` (new) receives the
    executors and resolution helpers, both moved out of `ai_actions.py`.
  - `ai_actions_records.py` (new) implements the new domains with a
    spec-driven generic create/update/delete/list engine plus special actions
    (`add_document_version`, `complete_reminder`, `complete_deadline`,
    `log_outreach`, `mark_notifications_read`).
- Execution accepts the authenticated user and enforces `total_projects`,
  `total_sheets`, `sheets_per_project`, `total_records`, `records_per_sheet`,
  and `total_sticky_notes` via `check_and_increment_limit`/`get_user_limit`,
  mirroring `routes.py`. `can_use_agents` remains the boolean gate.
- All new writes go through `Store` CRUD; no provider output is executed.

## Scope

In scope:

- New agent actions for documents, document versions, email templates, email
  drafts, outreach logs, reminders, deadlines, universities, programs,
  professors, applications, research notes, notification mark-read.
- Planner prompt upgrade: new action docs/examples, admin-exclusion rule,
  foreign-key resolution by name (university/program/professor/template).
- Role-limit enforcement during `/ai/actions/execute`.
- File-size split of `ai_actions.py`.
- Unit tests for new normalizers, executors, admin refusal, and limit
  enforcement.

Out of scope:

- Admin actions of any kind (planner refuses them).
- Whiteboard canvas mutations (freeform JSON canvas; unsafe to edit blind).
- File uploads/binary media through the agent.
- Sending emails or any external side effects.
- Frontend changes (`FloatingAssistant.tsx` renders plans generically).

## Acceptance Criteria

- Agent can create, update, delete, and list records in every in-scope domain
  through plan-confirm-execute.
- Read-only plans still auto-execute; write plans still require confirmation.
- Requests for admin work return a clear refusal (no_action with message), and
  no admin action type exists in the registry.
- A free_user (or any role) cannot exceed `total_projects`, `total_sheets`,
  `sheets_per_project`, `total_records`, `records_per_sheet`, or
  `total_sticky_notes` through agent execution; violations raise the same 403
  UsageLimitExceeded the manual routes raise.
- Existing action tests keep passing; no file in the feature exceeds 1000
  lines after the split.

## Implementation Plan

- Create `ai_actions_catalog.py` with action sets, limit map, describe and
  message builders.
- Create `ai_actions_records.py` with domain specs + generic engine.
- Move existing executors/normalizers into `ai_actions_workspace.py`.
- Slim `ai_actions.py`: dispatch through the catalog, extend prompts, wire
  user/session into execute for limit checks.
- Update `routes.py` to pass `current_user` into `execute`.
- Extend tests; update functional and technical context.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Execute create/update/delete/list for each new domain (documents + version,
  email template + draft, outreach log with follow-up reminder, reminder
  complete, deadline, university → program → professor → application chain,
  research note).
- Plan-level admin refusal (e.g. "suspend user X" returns no_action/needs_info
  without actions).
- Limit enforcement: free_user hitting `total_projects`/`total_sticky_notes`
  through execute raises UsageLimitExceeded; unlimited user passes.
- Regression: existing `test_ai_actions.py` scenarios unchanged.

## File Size Check

Files expected to be edited:

- backend/app/services/ai_actions.py (split down from 2005 lines)
- backend/app/services/ai_actions_catalog.py (new)
- backend/app/services/ai_actions_workspace.py (new)
- backend/app/services/ai_actions_records.py (new)
- backend/app/api/routes.py
- backend/tests/test_ai_actions.py, backend/tests/test_ai_actions_records.py (new)

Line-count risk:

- Medium — mitigated by the mandated split; every resulting module targets
  under 1000 lines.

## Verification Plan

- Run backend test suite for ai action modules.
- Manual smoke: plan+execute a document create, a reminder create/complete,
  and an admin refusal through the service layer.

## Completion Notes

Changed files:

- `backend/app/services/ai_actions.py` — slimmed to orchestration (2005 →
  717 lines): planner prompts extended with record domains, admin-exclusion
  regex + refusal, records snapshot in planner context, dispatch through
  `WORKSPACE_EXECUTORS`/record engine, role-limit hooks (`enforce`,
  `limit_for`, `raise_limit`), heuristic fallback extended with record list
  targets and a broader capability clarification message.
- `backend/app/services/ai_actions_catalog.py` (new, 246 lines) — combined
  action registry, plan descriptions, execution messages. Rich read output is
  now detected by the presence of a `message` key; record writes contribute
  preformatted `line` fragments.
- `backend/app/services/ai_actions_workspace.py` (new, 573 lines) —
  sheet-workspace normalizers moved verbatim from `ai_actions.py`.
- `backend/app/services/ai_actions_execute.py` (new, 666 lines) —
  sheet-workspace executors + project/page resolution helpers. Create
  executors enforce `total_projects`, `total_sheets`, `sheets_per_project`,
  `total_records`, `records_per_sheet`, `total_sticky_notes`.
- `backend/app/services/ai_actions_records.py` (new, ~690 lines) —
  spec-driven engine for documents (+versions), email templates/drafts,
  outreach logs, reminders, deadlines, universities, programs, professors,
  applications, research notes, notification mark-read. Name-based FK
  resolution; explicit cascade for NOT NULL children
  (document→document_versions, university→programs); date normalization via
  `parse_date_value`; create normalizer accepts nested/`data`/flat payloads so
  planner output round-trips through confirm/execute.
- `backend/app/api/routes.py` — `/ai/actions/execute` passes
  `current_user`/session into the service for limit enforcement.
- `backend/tests/test_ai_actions_records.py` (new) — 11 tests.
- Context: `AI-Context/functional/feature-ai-assistant.md`,
  `AI-Context/technical/ai-integrations.md`.

Verification completed:

- `tests/test_ai_actions.py`, `tests/test_ai_actions_records.py`,
  `tests/test_ai.py`, `tests/test_store.py`: 40 passed.
- Full backend suite run: same 3 failures + 11 errors as the pre-change tree
  (verified via `git stash` comparison) — pre-existing advisor-atlas /
  openrouter-cost / auth-db-lock issues unrelated to this task.
- `import app.main` sanity check passed; frontend needs no changes
  (`FloatingAssistant.tsx` renders `summary` strings and auto-executes
  read-only plans generically).

Unit tests added or updated:

- New `test_ai_actions_records.py`: document lifecycle with versions and
  cascade delete, university→program→professor→application chain with
  name-based FK resolution, unknown-university error, outreach log with
  follow-up reminder + response-status update, reminder/deadline completion
  and due-reminder exclusion, email template + draft linking, research note +
  mark-notifications-read, normalized-plan round trip through execute,
  admin-request refusal (plan level), free_user role-limit enforcement
  (projects and sticky notes) and no-user skip path.

Follow-ups:

- Consider a `documents`-count role limit if plans should bound agent-created
  documents (only byte-based `total_documents_bytes` exists today and applies
  to file uploads, which the agent does not perform).
- Whiteboard canvas actions remain intentionally unsupported.
- Heuristic (no-provider) fallback creates for record domains ask for
  clarification rather than parsing free text; the provider path handles full
  parsing.
