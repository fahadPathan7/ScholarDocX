# SCHOLARDOCX-0136: Consolidate scholarship hunt to a single permission

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-12

## Summary

Collapse three separate scholarship permission features (`can_use_scholarship_hunt`, `can_use_scholarship_analyze`, `can_use_scholarship_deep_hunt`) into one: `can_use_scholarship_hunt` now gates every scholarship hunt feature. Remove the other two as separate limits across backend enforcement, seed/baseline data, UI config, and dead code.

## Business Context

Links:

- Business file: n/a (RBAC simplification)

Business value:

- Three near-identical permission flags created admin overhead and user confusion (a user could have Hunt but not Analyze, or Deep Hunt but not Hunt, with no meaningful product distinction). One permission matches how the feature actually works — it's a single suite — and simplifies the admin role-limit matrix and plan comparison UI.

## Functional Context

Links:

- Functional file: AI-Context/functional/ (scholarship hunt)

Requirements:

- All scholarship hunt capabilities (search, catalog cycle-check, opportunity analyze, deep hunt) remain gated by the single `can_use_scholarship_hunt` plan limit.
- Existing Deep Hunt backend routes stay callable, now gated by the single permission.

## Technical Context

Links:

- Technical file: AI-Context/technical/security-privacy.md
- Enforcement: backend/app/api/news.py (`_charge_scholarship_hunt` — keeper), scholarship_opportunities.py (`_require_scholarship_analyze`), scholarship_deep_hunt.py (`_require_scholarship_deep_hunt_access`)
- Seeds: backend/app/db/schema.py, backend/app/db/connection.py, backend/app/services/admin.py
- Frontend: frontend/src/components/PlanComparisonView.tsx, admin/RoleLimitsTab.tsx, lib/accessErrors.ts

Technical notes:

- Only 3 runtime gate helpers exist. The keeper (`_charge_scholarship_hunt`) already uses the target key. The other two (`_require_scholarship_analyze`, `_require_scholarship_deep_hunt_access`) each reference their old key twice (once in `check_and_increment_limit`, once in `feature_plan_phrase`) — redirect both to `can_use_scholarship_hunt`.
- `connection.py` `canonical_features` set drives a `DELETE FROM role_limits WHERE feature NOT IN (...)` cleanup on init. Removing the two old keys from that set is what purges orphaned rows from existing user DBs.
- The `source="scholarship_hunt"` billing-ledger label (news.py:86, admin.py usage stats) is billing telemetry, NOT a permission — left untouched.
- Deep Hunt frontend (DeepHuntView.tsx, scholarshipDeepHuntApi.ts, deep-hunt.css) is already orphaned after the earlier tab removal — deleting as dead code.

## Scope

In scope:

- Redirect both backend gate helpers to `can_use_scholarship_hunt`.
- Prune the two old keys from all seed/baseline data (schema.py, connection.py, admin.py).
- Remove the two old keys from `canonical_features` so existing DB rows are purged.
- Update the one test that references the old key.
- Remove the two old keys from frontend display/config (PlanComparisonView, RoleLimitsTab, accessErrors).
- Delete orphaned Deep Hunt frontend files.

Out of scope:

- Deep Hunt backend routes/service/model — kept alive, just re-gated.
- Billing-ledger `source` labels.
- App.tsx (already correct).

## Acceptance Criteria

- `grep -rn "can_use_scholarship_analyze\|can_use_scholarship_deep_hunt" backend/ frontend/src/` returns zero source hits.
- `grep -rn "DeepHuntView\|scholarshipDeepHuntApi" frontend/src/` returns zero hits.
- Backend pytest passes.
- Frontend build succeeds.

## Implementation Plan

- [ ] Redirect `_require_scholarship_analyze` (scholarship_opportunities.py).
- [ ] Redirect `_require_scholarship_deep_hunt_access` (scholarship_deep_hunt.py).
- [ ] Prune schema.py SEED_SQL (8 lines).
- [ ] Prune connection.py (2 defaults blocks, free_user_defaults, canonical_features).
- [ ] Prune admin.py DEFAULT_ROLE_LIMITS (all role blocks).
- [ ] Update test_limits_billing_guards.py.
- [ ] Frontend: PlanComparisonView, RoleLimitsTab, accessErrors.
- [ ] Delete DeepHuntView.tsx, scholarshipDeepHuntApi.ts, deep-hunt.css.

## Unit Test Plan

Unit tests needed:

- Yes (update existing)

Planned tests:

- Rewrite `test_permission_only_check_commits_bootstrap_row` to use `can_use_scholarship_hunt`.

## File Size Check

Files expected to be edited:

- backend/app/api/scholarship_opportunities.py
- backend/app/api/scholarship_deep_hunt.py
- backend/app/db/schema.py
- backend/app/db/connection.py
- backend/app/services/admin.py
- backend/tests/test_limits_billing_guards.py
- frontend/src/components/PlanComparisonView.tsx
- frontend/src/components/admin/RoleLimitsTab.tsx
- frontend/src/lib/accessErrors.ts

Files deleted:

- frontend/src/components/news/DeepHuntView.tsx
- frontend/src/lib/scholarshipDeepHuntApi.ts
- frontend/src/components/news/deep-hunt.css

Line-count risk:

- Low (all edits are small removals/redirects; net reduction).

## Verification Plan

- grep checks for old keys + dead files.
- `python -m pytest -q` in backend.
- `npm run build` in frontend.

## Completion Notes

Changed files:

Backend (enforcement redirects):
- backend/app/api/scholarship_opportunities.py — `_require_scholarship_analyze` now checks `can_use_scholarship_hunt`; updated error message wording.
- backend/app/api/scholarship_deep_hunt.py — `_require_scholarship_deep_hunt_access` now checks `can_use_scholarship_hunt`; updated docstring (top of file + helper) and error message wording. Routes stay alive, re-gated.

Backend (seed/baseline prune):
- backend/app/db/schema.py — removed `can_use_scholarship_analyze` and `can_use_scholarship_deep_hunt` from all 4 user-role SEED_SQL blocks (8 lines).
- backend/app/db/connection.py — deleted the two `*_permission_defaults` INSERT blocks, removed the two keys from `free_user_defaults`, and removed them from `canonical_features` (so the cleanup DELETE purges orphaned rows from existing user DBs on next init).
- backend/app/services/admin.py — removed the two keys from all 5 `DEFAULT_ROLE_LIMITS` role blocks.

Backend (tests):
- backend/tests/test_limits_billing_guards.py — `test_permission_only_check_commits_bootstrap_row` now uses `can_use_scholarship_hunt` (the test's purpose is transaction isolation, not the specific key).

Frontend (config/display):
- frontend/src/components/PlanComparisonView.tsx — removed the `can_use_scholarship_deep_hunt` extendedFeatures row.
- frontend/src/components/admin/RoleLimitsTab.tsx — removed the `can_use_scholarship_deep_hunt` feature entry; broadened the hunt description to cover the whole suite.
- frontend/src/lib/accessErrors.ts — removed the two old label entries.

Frontend (dead code deletion):
- frontend/src/components/news/DeepHuntView.tsx — DELETED (orphaned after earlier tab removal).
- frontend/src/lib/scholarshipDeepHuntApi.ts — DELETED (only consumer was DeepHuntView).
- frontend/src/components/news/deep-hunt.css — DELETED (only used by DeepHuntView).

AI-Context:
- AI-Context/technical/api-boundaries.md — updated Analyze + Deep Hunt gating descriptions to reference `can_use_scholarship_hunt`.
- AI-Context/technical/ai-token-economy.md — added a consolidation note at the top of the scholarship billing sections.

### Correction: Deep Hunt feature restored

The user clarified that the intent was permission consolidation ONLY, not feature removal. The Deep Hunt UI had been removed earlier based on an over-broad interpretation of "don't show scholarship deep hunt as focused view." The deletion of the orphaned frontend files during this task compounded that error. The Deep Hunt feature has been fully restored:

- Restored from git: `frontend/src/components/news/DeepHuntView.tsx`, `frontend/src/lib/scholarshipDeepHuntApi.ts`, `frontend/src/components/news/deep-hunt.css`.
- Re-added to `ScholarshipNewsView.tsx`: the `DeepHuntView` import, `Library` icon import, `canUseDeepHunt` derivation (now reads `can_use_scholarship_hunt` — the single consolidated permission), the Deep Hunt tab button, the info-popover entry, the `"deep-hunt"` type union member, and the render block.
- The Deep Hunt feature now works exactly as before, gated by the single `can_use_scholarship_hunt` permission instead of the removed `can_use_scholarship_deep_hunt`.

Verification completed:

- `grep -rn "can_use_scholarship_analyze\|can_use_scholarship_deep_hunt" backend/app backend/tests frontend/src` → zero source hits.
- `grep -rn "canUseDeepHunt\|DeepHuntView\|scholarshipDeepHuntApi" frontend/src` → zero hits.
- `python -m pytest tests/test_limits_billing_guards.py tests/test_news_service.py tests/test_store.py tests/test_scholarship_opportunities.py` → 50 passed.
- `npm run build` → ✓ built in 2.32s.
- NOTE: 3 pre-existing pytest collection errors exist (`test_api.py`, `test_openrouter.py`, `test_openrouter_cost.py` at `backend/` root — June-dated stragglers, not in `tests/`, unrelated to this task).

Post-restoration verification:
- `npm run build` → ✓ built in 2.46s.
- Deep Hunt tab, render block, and `canUseDeepHunt` (reading `can_use_scholarship_hunt`) all confirmed present in ScholarshipNewsView.tsx.

Unit tests added or updated:

- Updated `test_permission_only_check_commits_bootstrap_row` (redirected to `can_use_scholarship_hunt`). No new test needed — the consolidation redirects existing gates rather than adding behavior.

Follow-ups:

- The Deep Hunt backend service/model/routes stay alive and callable, now gated by the single permission. If full backend decommission is ever desired, that's a separate task (router registration in main.py, the `scholarship_deep_hunt_runs` table model, and the background service).
- The `source="scholarship_hunt"` / `source="scholarship_deep_hunt_search"` billing-ledger labels are intentionally untouched — they are billing telemetry, not permissions.
- The 3 pre-existing root-level test stragglers (`test_api.py`, `test_openrouter.py`, `test_openrouter_cost.py`) should be cleaned up or moved into `tests/` in a separate housekeeping task.
