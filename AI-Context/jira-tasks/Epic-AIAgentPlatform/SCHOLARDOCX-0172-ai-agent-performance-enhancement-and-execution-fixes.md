# SCHOLARDOCX-0172: AI Agent Performance Enhancement and Execution Fixes

Epic: Epic-AIAgentPlatform

## Description

Fix core AI Agent performance, multi-action plan normalization, entity resolution, case-insensitive column key matching, and database schema alignment in ScholarDocX (`AiActionService`, `AiService`, `ai_actions_*.py`).

Identified issues fixed:
1. Multi-action plan context inheritance (`project_ref` and `sheet_ref` in `ai_actions_workspace.py` did not propagate project or sheet references from previous actions unless it was a `create_project` / `create_sheet` action).
2. Case-sensitive column key mapping in `row_for_columns`, `execute_update_row`, and `execute_bulk_update_rows` in `ai_actions_execute.py` silently dropped or duplicated column values when AI-supplied keys differed in casing.
3. Database schema mismatch in pinning/dashboard actions (`execute_pin_project`, `execute_unpin_project`, `execute_pin_sheet`, `execute_unpin_sheet`, `execute_add_to_dashboard`, `execute_remove_from_dashboard` used non-existent fields instead of `is_pinned` and `pinned_to_dashboard`).
4. Rigid exact-match lookup in `resolve_project`, `resolve_page`, and `_find_by_name` caused requests with slight naming differences or shorthand names to fail with `ValueError`.
5. `filter_rows_by_value` in `ai_actions_read.py` did not resolve `column_name` against sheet columns via `find_best_column`.
6. Refined `ACTION_PLANNER_SYSTEM_PROMPT` in `ai_actions.py` to enforce column key matching, date resolution, and clear multi-action structure.

## Acceptance Criteria

- [x] `project_ref` and `sheet_ref` inherit `project_id`, `project_name`, `sheet_id`, and `sheet_name` from earlier actions in multi-action plans.
- [x] `execute_add_rows`, `execute_update_row`, and `execute_bulk_update_rows` map AI-supplied row keys to page columns case-insensitively or via best column match.
- [x] Pinning and dashboard actions use `is_pinned` (integer 1/0) for sidebar and `pinned_to_dashboard` (integer 1/0) for dashboard across projects and project_sheets.
- [x] `resolve_project`, `resolve_page`, and `_find_by_name` perform case-insensitive substring fallback matching when exact match finds 0 records.
- [x] `filter_rows_by_value` maps `column_name` using `find_best_column` when `columns` is supplied.
- [x] System prompts in `ai_actions.py` provide clear instructions for multi-action execution and column matching.
- [x] Unit tests in `test_ai_actions_fixes.py` verify all fixes and edge cases.
- [x] AI-Context documentation is updated.

## Key Changes

- `backend/app/services/ai_actions_workspace.py`: Enhanced `project_ref` and `sheet_ref` to inspect `previous_actions` in reverse for existing project/sheet references.
- `backend/app/services/ai_actions_execute.py`: Added case-insensitive column key mapping in `row_for_columns`, `execute_update_row`, `execute_bulk_update_rows`; fixed pinning/dashboard schema fields (`is_pinned`, `pinned_to_dashboard`); added substring fallback in `resolve_project` and `resolve_page`.
- `backend/app/services/ai_actions_records.py`: Added substring fallback in `_find_by_name`.
- `backend/app/services/ai_actions_read.py`: Added `find_best_column` resolution in `filter_rows_by_value`.
- `backend/app/services/ai_actions.py`: Refined `ACTION_PLANNER_SYSTEM_PROMPT` and fixed `_target_sheet_block`.
- `backend/tests/unit/test_ai_actions_fixes.py`: Added comprehensive unit tests.
- `backend/tests/helpers.py`: Fixed `cleanup_user_records` connection rollback exception on `legacy_session`.
- `AI-Context/technical/ai-integrations.md`: Updated context document.

## Verification Plan & Results

- **Automated AI Unit Tests**: Ran `pytest backend/tests/unit/test_ai_actions.py backend/tests/unit/test_ai_actions_records.py backend/tests/unit/test_sheet_ask_ai_actions.py backend/tests/unit/test_ai_actions_fixes.py backend/tests/unit/test_ai.py` — 42/42 tests passed.
- **Full Backend Test Suite**: Ran `pytest backend/tests` — 469/469 tests passed cleanly with 0 errors.
