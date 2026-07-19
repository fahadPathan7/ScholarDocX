# SCHOLARDOCX-0150: Sheet Ask AI Prompt Catalog

Status: Done

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-07-19

## Summary

Replace the single generic "analyze this sheet" prompt behind the sheet **Ask AI** button with a dropdown catalog of 8–10 context-aware, action-oriented prompts (plus a custom-text option). Selected prompts pre-fill the Lumi assistant and route through the existing `/ai/actions/plan` → `/ai/actions/execute` layer so the AI can genuinely create/update/fill rows, add columns, and categorize data — not just return prose.

## Business Context

Links:

- Business file: AI-Context/business/product-overview.md

Business value:

- The sheet is where applicants do their hardest tracking work (universities, professors, deadlines, applications). A generic chat prompt gives generic help. Context-aware, action-oriented prompts let users trigger real workflow automations (draft outreach, categorize, score priorities, find gaps) in one click — turning AI from a chatbot into a workspace agent.

## Functional Context

Links:

- Functional file: AI-Context/technical/api-boundaries.md

Requirements:

- FR-1: Clicking **Ask AI** opens a dropdown catalog of prompts grouped by Analyze / Fill & Transform / Selection-aware, anchored to the button.
- FR-2: Each prompt is built from live sheet context (project name, sheet name, column names/types, row count, current selection / focused cell) so the AI targets the correct sheet unambiguously.
- FR-3: Picking a prompt pre-fills the Lumi assistant input (manual send, per user decision 2026-07-19). No auto-send.
- FR-4: Action-oriented prompts route through `/ai/actions/plan` and surface the existing Confirm/Cancel UI for writes.
- FR-5: A "Write your own…" text input lets the user type a custom prompt.
- FR-6: Selection-aware prompts only appear when rows are selected or a cell is focused.
- FR-7: Works identically in the full-screen sheet view (`/sheet/fullscreen`).

## Technical Context

Links:

- Technical file: AI-Context/technical/api-boundaries.md
- Related: existing agentic layer in `backend/app/services/ai_actions*.py` (`add_rows`, `update_row`, `bulk_update_rows`, `filter_rows`, `analyze_sheet`, `add_column`, `get_column_values`, `get_deadlines`, etc.) — reused as-is, no backend changes.

Technical notes:

- The pre-fill bridge (`scholardocx:open-ai` CustomEvent with `{ contextMessage }`) and FloatingAssistant listener (`FloatingAssistant.tsx:177-187`) already exist and are reused unchanged.
- `looksLikeWorkspaceAction` (`FloatingAssistant.tsx:53-58`) already routes action-looking messages to `/ai/actions/plan`; the prompts are phrased as imperative action requests to trigger it.
- Sheet context (`sheet.columns`, `sheet.rows`, `sheet.focusedCell`, `sheet.selectedRows`, `selectedProject`, `selectedSheet`, `selectedPage`) is already in scope at `ProjectWorkspace.tsx:741`.
- No cell values are sent in context (schema + selection only) — matches the planner's design, which uses read actions to inspect values.
- No modal is used (lightweight dropdown), so the AGENTS.md modal/backdrop blur rule does not apply.

## Scope

In scope:

- `frontend/src/components/sheet/askAiPrompts.ts` (NEW) — types, `buildAskAiContext`, ~9 prompts.
- `frontend/src/components/sheet/AskAiMenu.tsx` (NEW) — dropdown component.
- `frontend/src/components/sheet/SheetToolbar.tsx` — replace single Ask AI button with `<AskAiMenu>`; prop `onAskAI` → `onAskAi(message)`.
- `frontend/src/components/ProjectWorkspace.tsx` — build `AskAiContext`, wire `onAskAi` to dispatch the pre-fill event.

Out of scope:

- Native LLM function-calling / tool-calling (existing prompt-JSON plan flow suffices).
- New backend action types (catalog uses actions that already exist).
- Auto-send (user chose pre-fill, manual send).
- Sending cell values in context (user chose schema + selection only).
- Backend changes.

## Acceptance Criteria

- AC-1: **Ask AI** opens a dropdown with grouped prompts (Analyze, Fill & Transform, Selection-aware when applicable).
- AC-2: Each prompt's built message embeds the correct project name, sheet name, and column list.
- AC-3: Selecting a prompt opens Lumi with the message pre-filled (not auto-sent).
- AC-4: Action-oriented prompts route to `/ai/actions/plan` on send and show Confirm/Cancel for writes.
- AC-5: "Write your own…" input dispatches a custom prompt through the same pre-fill path.
- AC-6: Selection-only prompts appear only when rows are selected / a cell is focused.
- AC-7: Behavior is identical in normal and full-screen sheet views.
- AC-8: `npm run build` passes with no TS errors.
- AC-9: No infrastructure service names appear in user-facing copy.

## Implementation Plan

1. `askAiPrompts.ts`: define `AskAiPrompt` + `AskAiContext` types, `buildAskAiContext` helper, and the prompt array (Analyze: summarize / deadlines / gaps / next-steps; Transform: draft emails / categorize / priority score / enrich; Selection: act-on-selected / fill-cell).
2. `AskAiMenu.tsx`: popover dropdown mirroring the existing `showDataMenu` pattern; grouped clickable rows; footer custom-text input; calls `onPick(message)`.
3. `SheetToolbar.tsx`: swap the single button for `<AskAiMenu ctx={ctx} onPick={onAskAi} />`; change prop signature `onAskAI: () => void` → `onAskAi: (message: string) => void`.
4. `ProjectWorkspace.tsx`: `buildAskAiContext(...)` from in-scope sheet state; `onAskAi` dispatches `scholardocx:open-ai` with `{ contextMessage }`.

## Unit Test Plan

Unit tests needed:

- No

Planned tests:

- N/A — frontend has no configured test runner; these are UI-orchestration changes verified by `npm run build` and manual flow checks. Backend behavior is unchanged.

If no unit tests are needed, explain why:

- Frontend has no test harness; changes are UI flows verified manually. No backend / data-layer change.

## File Size Check

Files expected to be edited:

- `frontend/src/components/sheet/askAiPrompts.ts` (NEW, ~150 lines)
- `frontend/src/components/sheet/AskAiMenu.tsx` (NEW, ~120 lines)
- `frontend/src/components/sheet/SheetToolbar.tsx` (~500 lines, small edit)
- `frontend/src/components/ProjectWorkspace.tsx` (~1200 lines, small edit to handler)

Line-count risk:

- Low for new files. `ProjectWorkspace.tsx` is near the 1000-line grace limit already; this edit is a handler swap (~10 lines net) and does not push it meaningfully over. A future split is a separate task.

## Verification Plan

- `npm run build` in `frontend/` (tsc + vite) — no TS errors.
- Manual dev-session checks:
  1. Open a sheet → Ask AI dropdown shows grouped prompts.
  2. Selection prompts appear only with a selection / focused cell.
  3. Pick an action prompt → Lumi pre-fills with correct names/columns.
  4. Send → routes to `/ai/actions/plan`, Confirm/Cancel for writes.
  5. Custom text → pre-fills.
  6. Full-screen sheet — same menu works.

## Completion Notes

Revision (2026-07-19, user feedback): the original prompts were too vague ("empty cells / incomplete rows" was meaningless) and descriptions were hidden behind hover. Reworked the catalog to be **concrete and metric-driven**, made descriptions fully visible inline, and changed send behavior to **auto-send on a fresh chat**.

Revision 2 (2026-07-19, user feedback): prompts targeted sheets by name, which is ambiguous — a user can have multiple projects or sheets with the same name, so the AI could mis-target. Switched to **ID-based targeting**: prompts now reference the exact `project_id` + `sheet_id`. Verified the backend already supports this — the action planner resolves `project_id`/`sheet_id` before falling back to names (`ai_actions_workspace.py:45-65`, `ai_actions_execute.py:27-60`), and the workspace snapshot already exposes these IDs to the model.

Revision 3 (2026-07-19, user feedback "the ai is failing to do stuff"): the ID-based prompts still failed because the `ACTION_PLANNER_SYSTEM_PROMPT` and `_build_planner_prompt` documented ONLY `project_name`/`sheet_name` in the action schema — the model was never told it could emit `project_id`/`sheet_id`, so it ignored the IDs the frontend sent and either fell back to ambiguous names or returned `needs_info`. Root cause was a **prompt-schema gap**, not a runtime bug: the executor already accepted IDs (verified by direct execution probe), but the planner didn't know to emit them. Also clarified that a single plan may contain multiple sequential actions (read-then-write), which several transform prompts need ("add a column and fill it").

Changed files (revision 3):

- `backend/app/services/ai_actions.py` — `ACTION_PLANNER_SYSTEM_PROMPT`: added Critical Rule 10 (ID-BASED TARGETING — every workspace action accepts `project_id`/`sheet_id` instead of names; mandatory use when the user supplies IDs) and Critical Rule 11 (MULTI-ACTION PLANS — a plan may chain read-then-write actions). `_build_planner_prompt`: added an ID-BASED TARGETING examples block (`add_column`, `add_rows`, `update_row`, `bulk_update_rows`, `get_rows`, `filter_rows`, `analyze_sheet` all shown with `project_id`/`sheet_id`) and parsing rules 16 (must prefer IDs when present) and 17 (multi-action fill patterns).
- `backend/tests/unit/test_sheet_ask_ai_actions.py` (NEW) — 10 end-to-end tests, one per agentic prompt, feeding the executor the exact ID-based action the planner would emit and asserting the data lands correctly. Covers: application-status-breakdown (`filter_rows`), funding-totals (`get_rows` sum), deadline-risk (`analyze_sheet`), response-rate (`get_column_values`), draft-emails (`add_column`), categorize (`add_column` + `bulk_update_rows`), priority-score (`add_column` + 3× `update_row`), rank-by-fit (same), act-on-selected (`bulk_update_rows`), fill-cell (`update_row`). All 10 pass.

Verification completed (revision 3):

- `pytest tests/unit/test_sheet_ask_ai_actions.py -v` → **10 passed** (every agentic prompt's underlying action executes correctly by ID end-to-end against live Supabase Postgres).
- Direct execution probe confirmed `add_column` + `add_rows` + `bulk_update_rows` by `project_id`/`sheet_id` mutate the correct sheet's `rows_json`/`columns_json`.
- `pytest tests/unit/test_ai_actions.py tests/unit/test_ai_actions_records.py` → 11 passed, 3 failed. **All 3 failures are pre-existing DB pollution** (leftover `P0/P1/P2` projects in the shared test DB from prior runs) — verified by `git stash` + re-run on baseline: the same tests fail identically without my changes. They call `service.execute(plan)` directly and never touch the planner prompt I edited.

Unit tests added or updated:

- `backend/tests/unit/test_sheet_ask_ai_actions.py` (NEW, 10 tests).
- `backend/tests/unit/test_ai_actions_records.py` — fixed 3 pre-existing flaky tests that were polluting the shared Supabase DB (see revision 4).

Revision 4 (2026-07-19, "fix failed ones"): the 3 pre-existing failures in `test_ai_actions_records.py` were a test-isolation bug, not a product bug. Root cause: those tests created rows with no `current_user_id` (so `user_id = NULL`), asserted via `[0]` indexing or `len() == N` (which break when stale rows accumulate), and only `session.close()`'d in `finally` without deleting the rows they created. The conftest `_NULLABLE_USER_TABLES` cleanup list was also missing the record-domain tables (`universities`, `programs`, `professors`, `applications`, `document_versions`), so those NULL-user_id rows never got swept.

Fix (two layers):
- Made the 3 tests hermetic: unique per-run names (UUID tag), assert against rows-by-name instead of `[0]`/`len()`, and delete their own rows in `finally` (child-first FK order). Verified durable across two consecutive runs.
- Extended `tests/conftest.py::_NULLABLE_USER_TABLES` with the record-domain tables in proper child-before-parent order, so any NULL-user_id pollution is swept regardless of which test created it.
- One-time manual sweep of the 15 accumulated stale rows (1 professor, 6 programs, 8 universities) so the DB starts clean.

Changed files (revision 4):
- `backend/tests/unit/test_ai_actions_records.py` — added `uuid` + `sqlalchemy.text` imports; rewrote `test_academic_catalog_chain_resolves_names`, `test_normalized_plan_round_trips_through_execute`, `test_execute_without_user_skips_limit_checks` to be hermetic.
- `backend/tests/conftest.py` — added `document_versions`, `professors`, `programs`, `universities` to `_NULLABLE_USER_TABLES` (already had `applications`, `documents`, `reminders`, etc.); reordered child-first.

Verification (revision 4):
- `pytest tests/unit/test_ai_actions_records.py::test_academic_catalog_chain_resolves_names tests/unit/test_ai_actions_records.py::test_normalized_plan_round_trips_through_execute tests/unit/test_ai_actions_records.py::test_execute_without_user_skips_limit_checks` → **3 passed**, twice consecutively (durability check).

Verification completed:

- `npm run build` in `frontend/` → passes (tsc -b typecheck + vite build). Only pre-existing warnings (chunk-size, dynamic/static import overlap) unrelated to this change.
- Manual flow checks left for the user in a dev session: dropdown renders with full descriptions, picking a prompt opens Lumi on a new chat and sends immediately with the correct project_id/sheet_id, action prompts still route to `/ai/actions/plan` with Confirm/Cancel, custom-text auto-sends and is scoped to the right sheet, full-screen sheet parity. Not automated (no frontend test runner).

Unit tests added or updated:

- None (no frontend test runner; backend unchanged).

Follow-ups:

- Extend the catalog with degree-type-aware prompts (e.g. PhD-specific outreach templates).
- `ProjectWorkspace.tsx` is near the 1000-line grace limit — a future split is tracked separately.
