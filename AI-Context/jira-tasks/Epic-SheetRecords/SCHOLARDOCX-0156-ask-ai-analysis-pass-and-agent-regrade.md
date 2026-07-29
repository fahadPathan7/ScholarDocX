# SCHOLARDOCX-0156: Sheet Ask AI — Analysis Pass, Agent Re-Grade, and Planner Data Access

Status: Superseded (backend half shipped; frontend catalog plan replaced by SCHOLARDOCX-0179)

**2026-07-28 update**: this task's backend pieces (the `ai_actions_analyze.py`
analysis pass, `_target_sheet_block` row injection in `ai_actions.py`) were
implemented and are live. Its frontend half — the re-graded 9-agent catalog
below (`application-readiness`, `email-follow-up`, `funding-scan`, etc.) and
the "send explicit selected row numbers" fix — was never implemented; the
production catalog stayed on the pre-0156 agent list until a direct user
report ("commands are too heavy for AI") prompted a narrower redesign in
`SCHOLARDOCX-0179`, which supersedes the catalog plan below (it keeps
whole-sheet analytical agents like `deadline-risk`/`daily-action-plan`;
0179 replaces those with row/column-scoped presets instead per updated
user direction). The row-numbers fix and the row-injection-window gap this
task never closed are both completed in 0179. Leaving this file as a
historical record of the root-cause diagnosis rather than deleting it.

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-07-19

## Summary

User report (2026-07-19): the sheet **Ask AI** feature "is not working fine" — the AI cannot perform the actions it advertises. Concrete failure: two visibly duplicate rows exist in a sheet, but the **Find duplicate entries** agent answers with a raw row dump (`Rows in ttt: … Total: 4 rows`) and never identifies the duplicates.

Root cause (confirmed by code trace): the Ask AI pipeline is **plan → execute → dump**. No LLM ever sees the row data.

1. The planner (`ACTION_PLANNER_SYSTEM_PROMPT` + `_workspace_snapshot`) receives **schema only** — project/sheet names, column names/types, row counts. Zero cell values.
2. For any analytical question ("find duplicates", "what's missing", "what should I work on today") the best the planner can do is emit `get_rows` (read-only ⇒ `auto_execute`).
3. The executor returns all rows, but `execution_message()` renders only the first 10 rows × first 3 fields as the **final** chat message.
4. There is no second LLM pass to reason over the read results. Analytical agents degenerate into "dump a truncated preview".

The same blindness cripples the transform agents: **Write outreach emails**, **Fill empty cells**, and **Compare selected rows** need per-row data (and, for compare, the *actual selected row numbers*, which the frontend never sends), none of which the planner has.

This task: (a) add a post-execution **analysis pass** so read results are actually reasoned over, (b) inject **target-sheet row data into the planner** when the message carries `sheet_id` (Ask AI prompts always do), so per-row writes and comparisons work, (c) **re-grade the agent catalog** against explicit criteria, remove low-value agents, add student-preparation agents, (d) judge and tighten the planner background prompt, (e) send real selected-row numbers for selection agents.

## Business Context

Links:

- Business file: AI-Context/business/product-overview.md

Business value:

- Ask AI is a core differentiator (turns the sheet into a workspace agent). A visible "it can't even find duplicates" failure destroys trust in the whole AI layer. The re-graded catalog focuses on what applicants actually need when *preparing* applications: readiness of documents/tests, outreach follow-ups, funding, deadlines, and daily priorities.

## Functional Context

Links:

- Functional file: AI-Context/technical/api-boundaries.md
- Prior task: SCHOLARDOCX-0150 (prompt catalog, revisions 1–6)

Requirements:

- FR-1: When an Ask AI (or any forceAction) request auto-executes a read-only plan, the final assistant message MUST be an LLM analysis of the full read results that directly answers the user's question — never a raw truncated dump. If the analysis call fails, fall back to the existing formatted execution message.
- FR-2: When the user's message carries a `sheet_id`, the planner prompt MUST include that sheet's rows (bounded) so per-row write prompts (draft emails, fill gaps) and comparisons can be planned concretely.
- FR-3: Selection-aware prompts MUST name the selected rows explicitly (1-based row numbers), not just a count.
- FR-4: The agent catalog MUST be graded against the criteria below; agents graded C+ or lower are removed; new agents must target application preparation.
- FR-5: Every catalog agent must be deliverable end-to-end by the plan → execute → analyze pipeline (verified by tests).

### Agent grading criteria

1. **Actionability** — the plan/execute/analyze pipeline can fully deliver the promised outcome today.
2. **Prep value** — maps to a real application-preparation workflow (documents, tests, deadlines, outreach, funding, decisions).
3. **Non-redundancy** — not already obvious from the grid at a glance, and not overlapping another agent.
4. **Reliability** — bounded, deterministic LLM behavior; low hallucination surface; writes stay behind the Confirm/Cancel UI.

### Grades (current 9 agents)

| Agent | Grade | Verdict |
|---|---|---|
| deadline-risk | A | KEEP — core prep concern; deterministic date math + analyst summary. |
| missing-info | B− | REMOVE — absorbed into the stronger `application-readiness` agent. |
| find-duplicates | A | KEEP — high data-hygiene value; works once the analysis pass exists. |
| daily-action-plan | A− | KEEP — converts data into a concrete to-do list. |
| draft-emails | B+ | KEEP — feasible now that the planner sees row data; per-plan row cap. |
| fill-empty-cells | B | KEEP (reframed "Smart-fill missing info") — writes stay behind confirmation. |
| row-summaries | C+ | REMOVE — cosmetic transform, low prep value. |
| compare-selected | A− | KEEP — decision aid; fixed by sending explicit selected row numbers. |
| fill-cell | C | REMOVE — narrow convenience, redundant with `fill-empty-cells`. |

### New student-preparation agents

| Agent | Grade | Promise |
|---|---|---|
| application-readiness | A+ | "Am I ready to apply?" — per-row checklist of missing materials (CV, SOP, LORs, transcripts, test scores, fee, portal) and key fields; supersedes `missing-info`. |
| email-follow-up | A | "Who should I follow up with?" — rows where outreach went out but no response / follow-up date passed, as a nudge list. |
| funding-scan | A− | "Where is the funding?" — rows with funding flags/details, summarized and prioritized. |

Final catalog (9): analyze = deadline-risk, application-readiness, email-follow-up, find-duplicates, funding-scan, daily-action-plan; transform = draft-emails, fill-empty-cells; selection = compare-selected.

## Technical Context

Links:

- Technical file: AI-Context/technical/api-boundaries.md
- Technical file: AI-Context/technical/ai-integrations.md

Technical notes:

- **Analysis pass (new module `backend/app/services/ai_actions_analyze.py`)**: `ACTION_ANALYST_SYSTEM_PROMPT` + result serialization with hard bounds (strip `page`/`project` blobs and `_`-internal keys, cap rows and cell lengths, ~12k char budget, truncation flag). `AiActionService.analyze_results(message, results, model, user, session)` calls `AiService.chat` with the analyst prompt (metered via the existing billing context). Provider failure ⇒ return `None` ⇒ caller falls back to `execution_message`.
- **Execute endpoint extension**: `AiActionExecutePayload` gains optional `message` + `model`. The `/ai/actions/execute` route becomes `async`; after the sync execute, when `message` is present and every executed action is in `READ_ONLY_ACTIONS`, it runs the analysis pass and replaces the response `message` (raw dump kept as `raw_message`).
- **Planner data access**: `_build_planner_prompt` extracts `(project_id|sheet_id): "<id>"` from the message (Ask AI prompts embed both) and injects a bounded `TARGET SHEET DATA` block (columns + up to ~80 rows, trimmed cells, size-capped) alongside `CURRENT WORKSPACE`. Only ID-targeted messages get this; generic chat planning is unchanged.
- **Planner prompt judgment (background prompt)**: keep the strong ID-targeting rules; add Rule 12 (analysis questions ⇒ plan `get_rows`/smart read — a second analyst pass reasons over results; never attempt to answer in `message`), Rule 13 (when TARGET SHEET DATA is present, generate concrete per-row writes; row_index is 0-based in shown order; cap ~20 `update_row`/`add_rows` actions per plan and say so in `message` when truncating). Adjust parsing rule 17, which previously claimed reads are never needed before writes — true for schema-only planning, wrong now.
- **Frontend**: `FloatingAssistant.tsx` auto-execute branch passes `message` + `model` in the execute payload. `askAiPrompts.ts` replaced with the re-graded catalog; `buildAskAiContext` emits explicit selected row numbers. `AskAiMenu.tsx` icon map updated for new agent IDs.
- No new external services; no infra names in UI copy; writes still require Confirm/Cancel.

## Scope

In scope:

- `backend/app/services/ai_actions_analyze.py` (NEW)
- `backend/app/services/ai_actions.py` — planner prompt rules 12/13, target-sheet data injection, `analyze_results` method
- `backend/app/api/routes.py` — execute payload + async analysis hook
- `frontend/src/components/sheet/askAiPrompts.ts` — re-graded catalog + selection row numbers
- `frontend/src/components/sheet/AskAiMenu.tsx` — icon map
- `frontend/src/components/FloatingAssistant.tsx` — execute payload (message/model)
- `backend/tests/unit/test_sheet_ask_ai_actions.py` — re-mapped to the new catalog
- `backend/tests/unit/test_sheet_ask_ai_analysis.py` (NEW)

Out of scope:

- Native LLM function/tool calling (prompt-JSON flow retained).
- Auto-executing writes (still Confirm/Cancel).
- Analysis pass for non-read plans or for plans executed via the Confirm button.
- Changing the general chat system prompt (`SCHOLARDOCX_SYSTEM_PROMPT` judged: adequate, no change).

## Acceptance Criteria

- AC-1: With a sheet containing two identical rows, **Find duplicate entries** returns an answer that names the duplicate value(s) and their row numbers (verified in test with a mocked provider).
- AC-2: The planner prompt for an Ask AI message contains the target sheet's row data; for messages without IDs it does not.
- AC-3: Analysis failure (no provider / provider error) falls back to the old formatted execution message; execute never 500s because of the analysis step.
- AC-4: Compare-selected prompt text contains the explicit 1-based selected row numbers.
- AC-5: Removed agents (missing-info, row-summaries, fill-cell) no longer appear in the menu; the three new agents render with descriptions and route correctly.
- AC-6: `pytest tests/unit/test_sheet_ask_ai_actions.py tests/unit/test_sheet_ask_ai_analysis.py` passes; `test_ai_actions.py` / `test_ai_actions_records.py` no regressions.
- AC-7: `npm run build` passes with no TS errors.
- AC-8: No infrastructure service names in user-facing copy.

## Implementation Plan

1. `ai_actions_analyze.py`: analyst system prompt, bounded serializer, truncation flag.
2. `ai_actions.py`: `analyze_results` method; `_target_sheet_data` extraction + bounded injection into `_build_planner_prompt`; planner rules 12/13; rule 17 wording.
3. `routes.py`: payload fields; async analysis hook with fallback.
4. Frontend: catalog rewrite, selection row numbers, icon map, execute payload.
5. Tests: re-map executor tests to new catalog; new analysis tests (serializer bounds, injection, duplicate e2e with mocked provider, fallback).
6. Run backend tests + `npm run build`; update context files.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Serializer: strips internal blobs, caps size, sets truncation flag (pure unit).
- Sheet-ID extraction from prompt messages (pure unit).
- Planner prompt includes target rows only when `sheet_id` present (live DB, skipif pattern).
- Duplicate e2e: seed duplicate rows → execute `get_rows` → `analyze_results` with monkeypatched `AiService.chat` → canned analysis returned as final message.
- Fallback: provider failure ⇒ `analyze_results` returns `None`, route uses `execution_message`.
- Re-mapped per-agent executor tests for the new catalog (readiness/follow-up/funding via `get_rows`+`filter_rows`; draft-emails via `add_column`+`update_row`).

## File Size Check

Files expected to be edited:

- `backend/app/services/ai_actions_analyze.py` (NEW, ~200 lines)
- `backend/app/services/ai_actions.py` (762 → ~950 lines)
- `backend/app/api/routes.py` (621 → ~660 lines)
- `frontend/src/components/sheet/askAiPrompts.ts` (281 → ~300 lines)
- `frontend/src/components/sheet/AskAiMenu.tsx` (420 → ~425 lines)
- `frontend/src/components/FloatingAssistant.tsx` (1104 → ~1108 lines, small payload edit)

Line-count risk:

- Low. All files stay under the 1000-line target except `FloatingAssistant.tsx`, which is already in the grace band and gains only ~4 lines.

## Verification Plan

- `pytest tests/unit/test_sheet_ask_ai_analysis.py tests/unit/test_sheet_ask_ai_actions.py -v`
- `pytest tests/unit/test_ai_actions.py tests/unit/test_ai_actions_records.py` (regression)
- `npm run build` in `frontend/`
- Manual dev check: duplicate rows → Find duplicate entries names them; readiness agent lists missing materials per row; compare-selected compares the right rows.

## Completion Notes

Changed files:

- (pending)

Verification completed:

- (pending)

Unit tests added or updated:

- (pending)

Follow-ups:

- (pending)
