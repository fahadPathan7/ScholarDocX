# SCHOLARDOCX-0186: Advisor Atlas Research History Cap (100 Runs, No Auto-Eviction)

Status: Completed

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

Advisor Atlas discovery runs ("research history") had no upper bound — a user could accumulate unlimited stored runs. Added a fixed cap of 100 runs per user, independent of plan. Once at the cap, starting a new search is rejected with a clear message; the user must delete an existing run (delete UI already existed) before starting another. No silent eviction of the oldest run.

## Functional Context

Requirement added: FR-9.60 in `AI-Context/functional/feature-advisor-atlas.md`.

## Technical Context

- `AdvisorAtlasRepository.count_runs(user_id)` (new) — `SELECT COUNT(*) FROM advisor_atlas_runs WHERE user_id = ?`.
- `POST /advisor-atlas/runs` (`create_run` in `app/api/advisor_atlas.py`) checks `count_runs(...) >= MAX_ADVISOR_ATLAS_RUNS` (100) right after the plan-gate check and before any AI-token/model checks — cheapest checks run first, consistent with the existing ordering in that endpoint. Raises `HTTPException(409)` with a message pointing at deleting an existing search.
- `DELETE /advisor-atlas/runs/{run_id}` already existed and is already wired up in the frontend history list (`AdvisorAtlasView.tsx`, trash icon) — no frontend change needed. The existing generic `onToast((error as Error).message)` catch in `createRun()` surfaces the new 409 message as-is.
- Cap is a fixed constant (`MAX_ADVISOR_ATLAS_RUNS = 100`), not admin-configurable — matches the existing static-cap pattern for Documents (`MAX_DOCUMENTS_PER_USER`) and research paper library (`max_research_papers_library`).

## Scope

In scope:
- `backend/app/api/advisor_atlas.py`: `MAX_ADVISOR_ATLAS_RUNS` constant, cap check in `create_run`.
- `backend/app/services/advisor_atlas/repository.py`: `count_runs`.
- `backend/tests/unit/test_advisor_atlas_history_cap.py` (new file — `test_advisor_atlas.py` is already past the 1150-line size cap).
- `AI-Context/functional/feature-advisor-atlas.md`: FR-9.60.

Out of scope:
- Any change to the delete UI/flow (already existed and works).
- Making the cap admin-configurable.

## Verification Plan

- `count_runs` verified directly against real production data: matches `len(list_runs(...))` exactly for the one existing real run.
- Backend reload (`uvicorn --reload`) confirmed clean after the change.
- Unit tests added (not run this session, per project policy): `test_count_runs_reflects_created_and_deleted_runs`, `test_create_run_rejects_once_history_cap_reached` (creates 100 runs via the repository directly — a plain SQL insert, no AI cost — then confirms the API endpoint raises 409 on the 101st, and that deleting one existing run frees a slot).

## Completion Notes

Changed files:
- `backend/app/api/advisor_atlas.py` — `MAX_ADVISOR_ATLAS_RUNS`, cap check in `create_run`.
- `backend/app/services/advisor_atlas/repository.py` — `count_runs`.
- `backend/tests/unit/test_advisor_atlas_history_cap.py` (new).
- `AI-Context/functional/feature-advisor-atlas.md` — FR-9.60.
- `frontend/src/components/admin/InfoTab.tsx` — added the "Research History (Advisor Atlas)" row to the Save & Storage Caps table (missed in the initial pass; every other fixed per-user cap in this codebase — Documents, Opportunity Library, Previous Searches, saved analyses — is listed there, and this one wasn't).
- `frontend/src/components/AdvisorAtlasView.tsx` / `advisor-atlas.css` — added a `{count}/100` badge next to "Research history" in the sidebar (turns red via `.atlas-history-count.full` at the cap), matching the visible count/limit pattern Research Expert's Library header already uses. `MAX_HISTORY = 100` is hardcoded in the frontend (matching `MAX_ADVISOR_ATLAS_RUNS` in the backend) since this cap isn't admin-configurable and isn't currently returned by `GET /advisor-atlas/runs`.

Verification completed:
- Confirmed `count_runs` correctness against live data.
- Confirmed backend reloads without error.
- Tests added, not executed (per project policy).
- `npx tsc --noEmit` clean after the InfoTab/AdvisorAtlasView additions.

Follow-ups:
- The `{count}/100` badge reads a hardcoded frontend constant rather than a value from the API. If `MAX_ADVISOR_ATLAS_RUNS` ever changes, `AdvisorAtlasView.tsx`'s `MAX_HISTORY` must be updated to match by hand.
