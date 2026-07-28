# SCHOLARDOCX-0179: Sheet Ask AI — row/column-scoped catalog (replaces whole-sheet agents)

Status: Done

Owner: AI Agent

Epic: Epic-SheetRecords

Created: 2026-07-28

## Summary

User report: the sheet **Ask AI** menu's commands (screenshot: "Compare
these rows side by side", "Smart-fill this cell", "What deadlines are
coming up?", plus the hidden "Find incomplete rows", "Find duplicate
entries", "What should I work on today?", "Write outreach emails for each
row", "Fill all empty cells", "Add a summary for each row") are "too heavy
for AI." Direction: remove them and replace with presets scoped to a
single row or a single column, allowing 2-3 columns for anything that
genuinely needs it. Every remaining preset must be something the agent can
actually deliver, and if a preset can't complete because the sheet/row/
column doesn't have enough data, the agent must say so instead of guessing
or failing silently.

## Root cause analysis (why the old catalog was unreliable)

Traced the actual plan → execute pipeline (`backend/app/services/
ai_actions.py`, `ai_actions_analyze.py`):

1. **Planner output is capped at `max_tokens=1200`** for the entire JSON
   plan (`AiActionService.plan`). Any preset that needs the model to
   generate unique written content for *every row* (draft emails, per-row
   summaries, per-row inferred fills) produces one `update_row` action per
   row, each carrying real generated text — at ~150-200 tokens per
   personalized sentence/email, this blows the 1200-token budget past
   roughly 5-8 rows. Beyond that the plan silently truncates, returns
   invalid JSON, or the model just doesn't attempt all rows. This is a
   hard ceiling, not a prompt-wording problem.
2. **`_target_sheet_block` (added by SCHOLARDOCX-0156, already shipped)
   only ever sends the sheet's first 30 rows'** real cell values into the
   planner prompt. A single-row tool aimed at a row beyond index 30 (a
   perfectly normal thing to do on a 500-row sheet) had literally zero
   visibility into that row's actual data, so it could only guess.
3. Whole-sheet, multi-signal reads (deadline risk, missing info, duplicates,
   daily action plan) go through a **second, separate LLM pass**
   (`analyze_results`, bounded to ~150-200 rows / 12k chars via
   `serialize_results_for_analysis`) and are honestly truncation-flagged —
   these are not fundamentally broken the way the write agents are, but
   they promise a sheet-wide answer while only ever actually seeing a
   bounded slice, which reads as overpromising for large sheets.
4. **`compare-selected` never told the planner which rows were selected** —
   `AskAiContext` only carried a `selectionCount` number, never the actual
   row indices, so "compare ONLY the selected rows" had no way to resolve
   which rows those were.

This matches a previously-diagnosed-but-never-finished task,
`SCHOLARDOCX-0156` (Epic-SheetRecords) — its backend half (the analysis
pass, `_target_sheet_block`) shipped, but its planned frontend catalog
rewrite and "send explicit selected row numbers" fix were never
implemented; the catalog in production still had the pre-0156 agent list.
**This task supersedes 0156's frontend plan** with a narrower design per
the current, more specific user direction (row/column scope rather than
0156's "keep some whole-sheet agents, add three more"). SCHOLARDOCX-0156
is marked Superseded, not Done — its shipped backend pieces (analysis
pass, target-row injection) are reused here.

## Functional Context

Links: `AI-Context/functional/feature-ai-assistant.md`

- Row-scoped, column-scoped, and small-selection presets replace the prior
  whole-sheet catalog. Every preset must name, in its own instructions,
  what to do when the targeted row/column has no usable data: say so
  plainly, name what's missing, and never fabricate a value.

## Technical Context

Links: `AI-Context/technical/ai-integrations.md`

- `ai_actions.py::_target_sheet_block` extended to parse an optional
  `(row_index: N)` or `(row_indices: [N,M,...])` marker from the message
  and guarantee those specific rows are included in the injected data even
  when outside the first-30-rows window — required so row-scoped tools
  work correctly on any row of any size sheet, not just the top of a small
  one.
- `askAiPrompts.ts`: `AskAiContext` gains `selectedRowIndices: number[]`
  (already available from the `selectedRows: Set<number>` prop, just never
  surfaced); new `rowTarget()`/`selectedRowsTarget()` helpers embed the
  structured markers above.
- Column-scoped presets (`column-missing`, `column-breakdown`) route
  through `filter_rows` (operator `is_empty`) / `get_column_values` —
  both backend-computed over the full row set via the Store, not limited
  by the 30-row planner-injection window, so they are accurate at any
  sheet size without needing the row-injection fix.

## Scope

In scope:
- `backend/app/services/ai_actions.py` — `_target_sheet_block` row-index
  injection; planner rule for "say so when a targeted row isn't visible."
- `frontend/src/components/sheet/askAiPrompts.ts` — full catalog rewrite.
- `frontend/src/components/sheet/AskAiMenu.tsx` — group labels/order/icons.
- Tests: `backend/tests/unit/test_ai_actions.py` (or a focused new test
  file) for the row-injection parsing; a new frontend
  `askAiPrompts.test.ts` for catalog visibility/build-output shape.

Out of scope:
- SCHOLARDOCX-0156's proposed `application-readiness`/`email-follow-up`/
  `funding-scan` whole-sheet agents — superseded by the narrower row/
  column-scope direction in this task.
- New backend action types (reuses `update_row`, `add_column`,
  `filter_rows`, `get_column_values`, `get_deadlines`/`analyze_sheet`,
  `get_rows` — all already supported).
- Changing the 1200-token planner output cap itself (the fix is scoping
  presets to fit comfortably under it, not raising the ceiling).

## Acceptance Criteria

- [ ] The old whole-sheet write/analysis presets (missing-info,
      find-duplicates, daily-action-plan, draft-emails, fill-empty-cells,
      row-summaries) no longer appear in the menu.
- [ ] New row-scoped presets (summarize this row, draft an email for this
      row, next step for this row) and column-scoped presets (find rows
      missing this column, break down this column's values) appear and
      are gated on a focused cell.
- [ ] `compare-selected`'s built message contains the actual 1-based
      selected row numbers, not just a count.
- [ ] A row-scoped prompt targeting a row beyond the planner's default
      30-row injection window still gets that row's real data (verified
      by a backend test on `_target_sheet_block`).
- [ ] Every prompt's `build()` output explicitly instructs the model to
      say so (not guess) when the targeted row/column lacks the data
      needed to complete the request.
- [ ] `cd frontend && npx tsc --noEmit` clean.

## Unit Test Plan

- Backend: `_target_sheet_block` — with a `row_index` beyond 30, the
  returned block includes that row; with `row_indices`, all named rows are
  included; absent markers behaves as before (first 30 only).
- Frontend: `askAiPrompts.test.ts` — `visiblePrompts()` gating per group;
  `rowTarget`/`selectedRowsTarget` embed the expected markers;
  `compare-selected`'s build() includes 1-based row numbers.

## Verification Plan

- `pytest backend/tests/unit/test_ai_actions.py` (scoped to the new/edited
  tests, per the "run scoped tests" rule in `CODE_RULES.md`)
- `cd frontend && npx vitest run src/components/sheet/askAiPrompts.test.ts`
- `cd frontend && npx tsc --noEmit`

## Completion Notes

Changed files:

Backend:
- `backend/app/services/ai_actions.py` — `_target_sheet_block` now also
  calls new static method `_extract_targeted_row_indices` (parses
  `(row_index: N)` / `(row_indices: [N,M,...])` from the message) and
  injects those specific rows' real data even when outside the default
  first-30-rows window (capped at 20 extra rows). Added Parsing Rule 18 to
  `ACTION_PLANNER_SYSTEM_PROMPT`: when a named row isn't in TARGET SHEET
  DATA, or exists but is empty of the needed fields, return `needs_info`
  naming the gap instead of guessing; same for a named column that doesn't
  exist.

Frontend:
- `frontend/src/components/sheet/askAiPrompts.ts` — full catalog rewrite.
  `AskAiPromptGroup` changed from `analyze | transform | selection` to
  `row | column | compare | deadlines`. `AskAiContext` gained
  `selectedRowIndices: number[]` (was previously only exposed as a count).
  New `rowTarget()`/`selectedRowsTarget()` helpers embed the structured
  markers the backend now parses. Removed: `missing-info`,
  `find-duplicates`, `daily-action-plan`, `draft-emails`,
  `fill-empty-cells`, `row-summaries` (all whole-sheet/multi-row-write).
  Added: `row-summary`, `row-email-draft`, `row-next-step`,
  `column-missing`, `column-breakdown`. Kept + tightened: `fill-cell`,
  `compare-selected` (now names actual selected row numbers),
  `deadline-risk`. Every `build()` includes an explicit "say so instead of
  guessing" instruction for missing data. `visiblePrompts()` rewritten for
  the new group semantics (row/column need a focused cell; compare needs
  2+ selected rows; deadlines always visible).
- `frontend/src/components/sheet/AskAiMenu.tsx` — `GROUP_LABELS`,
  `GROUP_ORDER`, `PROMPT_ICONS`, and the `grouped` accumulator updated for
  the new group/prompt IDs.

Context:
- `AI-Context/functional/feature-ai-assistant.md` — corrected the stale
  "no large tables sent to the LLM" claim (SCHOLARDOCX-0156 already
  changed this) and documented the new row/column-scope constraint.
- `AI-Context/functional/requirements-index.md` — FR-5.7.
- `AI-Context/technical/ai-integrations.md` — new "Sheet Ask AI menu: scale
  constraints and row-targeting" section documenting the 1200-token
  planner cap, the 30-row injection window and its row-index-marker fix,
  the per-preset scope rationale, and the existing analysis-pass pattern
  this extends.
- `AI-Context/jira-tasks/Epic-SheetRecords/SCHOLARDOCX-0156-...md` — marked
  Superseded with a pointer to this task (see that file for the full
  handoff note).

Tests:
- `backend/tests/unit/test_sheet_ask_ai_actions.py` — added
  `test_extract_targeted_row_indices_parses_single_and_multi` (pure),
  `test_target_sheet_block_includes_row_beyond_default_window` (live DB:
  35-row sheet, row_index 33 targeted, confirms it's injected with real
  data alongside the default 0-29 window and that row 30 is NOT pulled in
  for free), `test_target_sheet_block_without_row_marker_stays_within_
  default_window` (no marker → unchanged prior behavior).
- `frontend/src/components/sheet/askAiPrompts.test.ts` (NEW) — 18 tests:
  `buildAskAiContext` selection-index/group-column handling,
  `visiblePrompts` gating per group, `rowTarget`/`selectedRowsTarget`
  marker output, every catalog prompt's build() output contains an
  explicit no-data admission, `compare-selected` names real row numbers.

Verification completed:
- `npx vitest run src/components/sheet/askAiPrompts.test.ts` — 18/18 pass.
- `pytest tests/unit/test_sheet_ask_ai_actions.py` — 13/13 pass (10
  pre-existing + 3 new), against live Supabase Postgres.
- `cd frontend && npx tsc --noEmit` — clean.
- Confirmed no stale references to removed prompt IDs anywhere in
  `frontend/src`.

Follow-ups:
- Row-scoped tools (`row`/`column` groups) are gated on a focused cell
  only; a single row selected via checkbox (no focused cell) does not
  currently surface them, since there's no plumbed single-selected-row
  index for that case. Matches the pre-existing `fill-cell` precedent;
  extending it is a small follow-up if it comes up.
- SCHOLARDOCX-0156's proposed `application-readiness`/`email-follow-up`/
  `funding-scan` whole-sheet agents are not implemented — deliberately out
  of scope per the narrower row/column-scope direction here.
