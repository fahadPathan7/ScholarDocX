# SCHOLARDOCX-0057: Agentic AI Workspace Actions

Status: Done

Owner: AI Agent

Epic: Epic-AIAgentPlatform

Created: 2026-05-29

Completed: 2026-05-29

## Summary

Make the AI assistant able to prepare and execute local ScholarDocX workspace
actions after user confirmation. Add an About page guide that explains what the
agentic assistant can do.

## Business Context

Links:

- [decisions.md](../../business/decisions.md)

Business value:

- Reduces manual setup work for projects, sheets, rows, and notes while keeping
  the user in control of local data mutations.

## Functional Context

Links:

- [feature-ai-assistant.md](../../functional/feature-ai-assistant.md)
- [feature-project-workspace.md](../../functional/feature-project-workspace.md)
- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-5.5: AI can prepare project, sheet, row, and sticky-note actions, but only
  execute them after user confirmation.
- FR-7.1: Users can create projects.
- FR-7.3: Each project can contain multiple sheets.
- FR-7.5: A sheet can have editable, addable, and deletable rows.
- FR-8: Sticky notes support quick notes and checklists.

## Technical Context

Links:

- [ai-integrations.md](../../technical/ai-integrations.md)
- [api-boundaries.md](../../technical/api-boundaries.md)
- [security-privacy.md](../../technical/security-privacy.md)

Technical notes:

- Add plan-confirm-execute endpoints under `/ai/actions`.
- Use provider output only as structured intent; never execute arbitrary code.
- Execution must use existing `Store` methods and local SQLite data.
- Keep unsupported actions out of scope for MVP.

## Scope

In scope:

- Plan and confirm creation of projects.
- Plan and confirm creation of sheets in projects.
- Plan and confirm adding rows to sheets.
- Plan and confirm creating sticky notes/checklists.
- Ask follow-up questions when required fields are missing.
- Add an About page guide for examples and safeguards.
- Add focused backend tests.

Out of scope:

- Sending emails.
- Submitting applications.
- Uploading files.
- Editing or deleting existing data.
- Bulk import from files.
- Cloud automation.

## Acceptance Criteria

- Assistant recognizes supported workspace action requests.
- Missing information returns a clear follow-up question.
- Proposed actions render in chat with Confirm and Cancel controls.
- Confirm executes only supported workspace actions.
- About page explains supported AI action powers and safeguards.
- Tests cover missing-info planning and confirmed execution.

## Implementation Plan

- Create an AI action service with plan and execute methods.
- Add `/ai/actions/plan` and `/ai/actions/execute` routes.
- Update FloatingAssistant to request action plans before normal chat and render
  confirmation cards.
- Add About page agentic guide section.
- Add backend tests for planner validation and execution.

## Unit Test Plan

Unit tests needed:

- Yes.

Planned tests:

- Planning asks for missing sheet/project details.
- Confirmed plan creates a project, sheet, rows, and sticky note.
- Unsupported or ordinary chat messages return `no_action`.

If no unit tests are needed, explain why:

- Not applicable.

## File Size Check

Files expected to be edited:

- [routes.py](../../../backend/app/api/routes.py)
- [ai_actions.py](../../../backend/app/services/ai_actions.py)
- [FloatingAssistant.tsx](../../../frontend/src/components/FloatingAssistant.tsx)
- [AboutView.tsx](../../../frontend/src/components/AboutView.tsx)
- [about-refresh.css](../../../frontend/src/about-refresh.css)

Line-count risk:

- Medium. Existing `FloatingAssistant.tsx` is under 1000 lines but substantial;
  keep edits scoped.

If any file exceeds 1000 lines, explain why.

- Not expected.

## Verification Plan

- Run focused backend tests for AI actions.
- Run AI tests.
- Run frontend build and record unrelated failures if still present.
- Browser smoke the assistant action card and About guide if possible.

## Completion Notes

Changed files:

- [feature-ai-assistant.md](../../functional/feature-ai-assistant.md) - Added agentic workspace action behavior and confirmation rules.
- [ai-integrations.md](../../technical/ai-integrations.md) - Documented the plan-confirm-execute action flow.
- [requirements-index.md](../../functional/requirements-index.md) - Added FR-5.5 for confirmed AI workspace actions.
- [ai_actions.py](../../../backend/app/services/ai_actions.py) - Added action planning, validation, and local execution for projects, sheets, rows, and sticky notes.
- [routes.py](../../../backend/app/api/routes.py) - Added `/ai/actions/plan` and `/ai/actions/execute`.
- [FloatingAssistant.tsx](../../../frontend/src/components/FloatingAssistant.tsx) - Added action-plan detection, confirmation card rendering, and confirmed execution.
- [App.tsx](../../../frontend/src/App.tsx) - Refreshes workspace data after confirmed AI actions.
- [AboutView.tsx](../../../frontend/src/components/AboutView.tsx) - Added agentic AI guide content.
- [about-refresh.css](../../../frontend/src/about-refresh.css) - Styled the agentic AI guide section.
- [test_ai_actions.py](../../../backend/tests/test_ai_actions.py) - Added action planner and execution tests.

Verification completed:

- `python3 -m py_compile backend/app/services/ai_actions.py backend/app/api/routes.py` passes.
- `.venv/bin/pytest tests/test_ai_actions.py` passes: 3 passed.
- `.venv/bin/pytest tests/test_ai.py tests/test_ai_actions.py` passes: 14 passed.
- Full `.venv/bin/pytest` still has one unrelated failure:
  `test_create_sheet_with_single_default_table` expects `BSC cert`.
- `npm run build` still fails on unrelated ProjectWorkspace and Whiteboard
  TypeScript errors; no assistant/About errors were reported.
- Live endpoint smoke: `/api/ai/actions/plan` for "Create a new sheet" returns
  `needs_info` and asks for the project name.
- Browser smoke confirms the About page shows the Agentic AI guide.

Unit tests added or updated:

- Added tests for ordinary-chat `no_action`, missing sheet details, and confirmed creation of project, sheet, row, and sticky note.

Follow-ups:

- Add deeper navigation after execution, such as opening the newly created
  project/sheet automatically from the confirmation result.
- Add row import from uploaded CSV/XLSX as a separate confirmed action.
- Add editing existing rows/notes only after a stronger diff/review UI exists.
- Resolve unrelated ProjectWorkspace/Whiteboard TypeScript failures.
- Resolve unrelated sheet default column test failure.
