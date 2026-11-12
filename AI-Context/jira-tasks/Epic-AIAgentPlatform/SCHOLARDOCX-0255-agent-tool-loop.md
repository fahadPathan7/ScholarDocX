# SCHOLARDOCX-0255: Agent tool loop (tool-connected assistant)

Status: Done

Owner: AI Agent

Epic: Epic-AIAgentPlatform

Created: 2026-11-12

## Summary

The workspace agent was a single-shot JSON planner with regex routing. A real
session ("add one row after row 4" → "add empty row" → "all empty new row" →
"confirm") never added the row and ended with plain chat claiming "I've added a
new row". This task connects the assistant to its workspace actions as tools,
in a bounded tool-calling loop, and fixes the bugs behind that session.

## Business Context

Links:

- Business file: N/A (reliability of an existing paid feature)

Business value:

- The assistant must actually do what it says, and never say it did something
  it did not.

## Functional Context

Links:

- Functional file: AI-Context/functional/feature-ai-assistant.md

Requirements:

- Reads (show, count, find, analyse) run automatically inside the turn.
- Every write is proposed as a plan with Confirm/Cancel; nothing changes
  without the user confirming.
- Follow-up replies ("empty is fine", "confirm", "yes, row 5") stay with the
  agent instead of falling through to plain chat.
- Plain chat never claims a workspace change.

## Technical Context

Links:

- Technical file: AI-Context/technical/ai-integrations.md
- Technical file: AI-Context/technical/billing-contract.md

Root causes found:

1. `add_rows` dropped empty rows and reported `row_values` missing, so a blank
   row was impossible and the planner kept asking for values.
2. The planner asked for confirmation in prose (status `needs_info`, no Confirm
   button) instead of returning a confirmable plan.
3. Routing was a frontend regex: "confirm" (no pending plan) and other short
   follow-ups went to plain `/ai/chat`; the backend's own regex gate would also
   have returned `no_action` for them.
4. Plain chat had no tools and no rule against claiming actions, so it read the
   conversation and announced a row it never added.
5. The planner saw no prior turns as structured history, only a summary
   string, and could not look anything up before deciding.
6. `add_rows` could only append ("after row 4" was not expressible).

Design:

- `AiService.chat_with_tools` — one OpenAI-compatible tool-calling request
  (GLM, Groq, Mistral; Gemini via its OpenAI-compatible endpoint), charged
  per call exactly like `chat` (pre-flight + charge after response).
- `ai_agent.run_agent_turn` — bounded loop (max 5 model calls) with two tools:
  - `run_read_action`: any read action from the catalog; normalized and
    executed immediately; bounded results fed back to the model.
  - `propose_changes`: the only path to a write; normalized with the existing
    normalizers; invalid/missing fields are returned to the model as a tool
    error so it can fix them or ask the user; a valid proposal ends the turn
    as `needs_confirmation` (Confirm button). Writes never execute in the loop.
  - A text reply ends the turn as `answered`.
- `AiActionService.plan` runs the loop first when a provider is configured and
  falls back to the existing single-shot planner on provider errors or when
  the model cannot call tools. `follow_up=True` skips the backend regex gate.
- Execution stays on `/ai/actions/execute` (unchanged role limits, resync).
- `add_rows` accepts blank rows, `count`, and `insert_after_row` (1-based).
- Plain chat system prompt: never claim a workspace change was made.
- Frontend: messages following an agent reply route to the agent; the last
  turns are sent as structured `history`; `answered` renders as a normal reply.

Billing: each loop step is one charged provider call (max 5 per user message),
pre-flighted by `can_spend`. No new provider, no new paid service.

## Scope

In scope:

- backend: ai.py, ai_agent.py (new), ai_actions.py, ai_actions_workspace.py,
  ai_actions_execute.py, ai_actions_catalog.py, api/routes.py, tests.
- frontend: FloatingAssistant.tsx.

Out of scope:

- Exposing the tools over an external MCP server (the in-process registry is
  MCP-shaped; an external server is not needed for the product).
- Streaming.

## Acceptance Criteria

- "add one row after row 4" on a 4-row sheet produces a Confirm plan for one
  blank row at position 5; Confirm adds it.
- "how many rows are in ttt" is answered from a real read in one turn.
- Typing "confirm" with no pending plan never yields a claimed change.
- Provider without tool support falls back to the legacy planner.

## Implementation Plan

- As in Design.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests (`backend/tests/unit/test_ai_agent_loop.py`, fake provider):

- read tool → result fed back → `answered`
- propose blank row with insert position → `needs_confirmation`
- proposal with missing fields → tool error → model fixes it
- write sent to `run_read_action` is refused
- step cap returns a plain message
- tool-calling unsupported → legacy planner fallback
- blank-row normalizer + insert-position executor

## File Size Check

Files expected to be edited:

- ai.py (909 → ~1010, within the 1150 feature grace), ai_actions.py (924 →
  ~960), FloatingAssistant.tsx.

Line-count risk:

- Medium

## Verification Plan

- Backend modules compile; billing and context guards; frontend type-check;
  unit tests when the venv is rebuilt.

## Completion Notes

Changed files:

- backend/app/services/ai.py (`chat_with_tools`; chat prompt no-claim rule)
- backend/app/services/ai_agent.py (new: tool loop, tools, prompt)
- backend/app/services/ai_actions.py (`ACTION_EXAMPLES_TEXT`, agent-first
  `plan`, `history` / `follow_up`)
- backend/app/services/ai_actions_workspace.py, ai_actions_execute.py,
  ai_actions_catalog.py (blank rows, `count`, `insert_after_row`)
- backend/app/api/routes.py (`AiChatTurn`, `history`, `follow_up`)
- frontend/src/components/FloatingAssistant.tsx (follow-up routing, history,
  `answered`; a new request marks still-pending cards `superseded` — no
  buttons, "Not run … nothing was changed" — and unconfirmed proposals are
  tagged as such in the history sent to the agent)
- AI-Context/technical/ai-integrations.md,
  AI-Context/functional/feature-ai-assistant.md

Verification completed:

- In a throwaway venv (backend requirements): app imports cleanly;
  test_ai_agent_loop.py 9/9 pass; non-DB Research Expert tests pass.
- Billing guard and context-drift guard pass; frontend type-check passes.
- DB-backed suites (existing ai_actions tests, the new billing regression
  case) not run: the test Postgres (docker-compose.test.yml, port 5433) is down
  because Docker is not running.
- Not exercised against a live provider yet.

Unit tests added or updated:

- New: backend/tests/unit/test_ai_agent_loop.py.
- New case: test_agent_tool_calling_step_charges_the_user in
  backend/tests/regression/test_limits_billing_guards.py.

Follow-ups:

- Confirm GLM-5.3 / the selected model accepts `tools` on the z.ai coding
  endpoint; otherwise the legacy planner keeps serving (by design).
- ai.py is 1012 lines; split provider adapters before the next AI feature.
