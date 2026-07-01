# SCHOLARDOCX-0058: AI Chat Workflow Upgrade — Smart GET & Expanded CRUD

Status: In Progress

Owner: AI Agent

Epic: Epic-AIAgentPlatform

Created: 2026-05-30

## Summary

Upgrade the AI chat workflow with massively improved system prompts, expanded
CRUD action types (35+ actions), and intelligent GET operations that understand
semantic column matching, date-aware queries, and analytical row filtering.

## Business Context

Links:

- [decisions.md](../../business/decisions.md)

Business value:

- Users can ask natural-language analytical questions about their workspace data
  ("which rows have deadlines this month?", "how many have I applied to?")
- Full CRUD coverage means users can manage every aspect of their workspace
  through the AI assistant.
- Smarter system prompts improve response quality and reduce confusion.

## Functional Context

Links:

- [feature-ai-assistant.md](../../functional/feature-ai-assistant.md)
- [feature-project-workspace.md](../../functional/feature-project-workspace.md)
- [feature-sticky-notes.md](../../functional/feature-sticky-notes.md)

Requirements:

- FR-5.5: AI can prepare workspace actions with user confirmation.
- FR-5.6 (new): AI can answer analytical questions about sheet data.
- FR-5.7 (new): AI understands semantic column names for queries.

## Technical Context

Links:

- [ai-integrations.md](../../technical/ai-integrations.md)
- [api-boundaries.md](../../technical/api-boundaries.md)

Technical notes:

- Extract read/analytical logic into `ai_actions_read.py` to keep files under
  1000 lines.
- Inject current date into planner prompts for date-aware queries.
- Enhanced workspace snapshot includes column names and types per sheet.
- All new READ actions are auto-executed (no confirmation needed).
- All new WRITE actions require confirmation.

## Scope

In scope:

- Rewrite all 4 system prompts (Action Planner, Chat, Router, Memory).
- Add 15+ new action types (both READ and WRITE).
- Smart GET engine with semantic column matching, date-aware analysis.
- Row filtering by value, status, boolean flag, text contains.
- Rich formatted results (markdown tables, counts, summaries).
- Enhanced workspace snapshot with column info.
- Updated chat_workflow.md documentation.
- Unit tests for new analytical functions.

Out of scope:

- Frontend UI changes (existing action card UI handles new types).
- Sending emails or submitting applications.
- Cloud services or remote data.

## Acceptance Criteria

- AI can answer "which rows have deadlines within 10 days?" accurately.
- AI can answer "how many have I applied from [sheet]?" accurately.
- AI matches semantic column names ("deadline" → "Application Deadline").
- All new WRITE actions (rename, duplicate, etc.) work with confirmation.
- Existing tests still pass.
- New tests cover semantic matching and date analysis.

## Implementation Plan

- Create `ai_actions_read.py` with smart GET execution engine.
- Update `ai_actions.py` with new actions, prompts, and snapshot.
- Rewrite `chat_workflow.md`.
- Update AI context files.
- Add tests.

## Unit Test Plan

Unit tests needed:

- Yes.

Planned tests:

- Semantic column matching finds partial/case-insensitive matches.
- Date analysis correctly identifies upcoming/overdue deadlines.
- Row filtering by boolean, text, and select values.
- New action type normalization.
- Existing tests still pass.

## File Size Check

Files expected to be edited:

- [ai_actions.py](../../../backend/app/services/ai_actions.py) — currently 1230 lines, will be reduced by extracting read logic.
- [ai_actions_read.py](../../../backend/app/services/ai_actions_read.py) — new file.
- `chat_workflow.md` historical workflow note
- [feature-ai-assistant.md](../../functional/feature-ai-assistant.md)
- [ai-integrations.md](../../technical/ai-integrations.md)

Line-count risk:

- Splitting read logic into a new file keeps both under 1000 lines.
