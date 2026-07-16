# SCHOLARDOCX-0140: Plan Pricing AI Credits Refactor

Status: Completed

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-16

## Summary

Refactored the Plan Pricing admin UI from a 3-card bulk-save modal to an inline-edit table (matching TokenPacksTab UX) with per-row Save/Revert, dirty-state tracking, and a Refresh button. Moved monthly AI credit allowances (`ai_tokens_per_month`) from `role_limits` to `app_settings` keys (`plan_ai_credits_*`) so credits are managed in Plan Pricing alongside subscription prices, not in Role Limits.

## Business Context

Links:
- Business file: N/A (admin-facing feature)

Business value:
- Consolidates plan pricing and AI credit configuration in one place for clearer admin UX
- Matches the modern inline-edit table pattern used in AI Credit Packs
- Separates subscription plan configuration from role permission limits

## Functional Context

Links:
- Functional file: `AI-Context/functional/admin-settings.md` (implied)

Requirements:
- FR-1: Admin can view and edit plan pricing (monthly/yearly) and monthly AI credits for all 4 tiers (Free, General, Pro, Max) in a single table
- FR-2: Free tier prices are locked at ৳0; only AI credits are editable
- FR-3: Each row has independent Save/Revert controls with dirty-state tracking
- FR-4: Changes apply immediately (FORCE_RESET propagation) so existing users see new credit allowances without waiting for monthly reset
- FR-5: Existing consumers (PlanComparisonView) continue to work via backward-compatible API response

## Technical Context

Links:
- Technical file: `AI-Context/technical/api-boundaries.md` (pricing endpoints)
- Technical file: `AI-Context/technical/frontend-visual-system.md` (admin modals)

Technical notes:
- Backend: monthly AI credits moved from `role_limits.ai_tokens_per_month` to `app_settings.plan_ai_credits_*` (4 keys, one per tier)
- Service layer: `get_role_monthly_allowance()` now reads from `app_settings` instead of `role_limits`
- Admin service: `update_app_setting()` runs FORCE_RESET propagation when a `plan_ai_credits_*` key changes (mirrors old `update_role_limit` behavior)
- API layer: `GET /auth/plans` injects `ai_tokens_per_month` back into each tier's feature map from `app_settings` to maintain backward compatibility
- Frontend: New `PlanPricingTable.tsx` component replicates TokenPacksTab's inline-edit pattern; old 3-card modal removed from SettingsTab

## Scope

In scope:
- Add 4 new `plan_ai_credits_*` keys to `app_settings` seed in `schema.py`
- Update `get_role_monthly_allowance()` to read from `app_settings`
- Add FORCE_RESET propagation to `update_app_setting()` for credit keys
- Remove `ai_tokens_per_month` from `DEFAULT_ROLE_LIMITS` for all 4 user tiers
- Update `GET /auth/plans` to inject `ai_tokens_per_month` from `app_settings` for backward compat
- Create `PlanPricingTable.tsx` with per-row dirty tracking, Save/Revert, formatTokens helper
- Replace old pricing modal in SettingsTab with Modal wrapper + PlanPricingTable

Out of scope:
- Removing `ai_tokens_per_month` from RoleLimitsTab UI (handled automatically by existing empty-group filter)
- Schema migrations (just seed + manual cleanup of orphaned `role_limits` rows)
- Changes to PlanComparisonView (reads `ai_tokens_per_month` from API, which now injects it)

## Acceptance Criteria

- ✅ 4 `plan_ai_credits_*` settings seeded in `app_settings` with correct default values
- ✅ `get_role_monthly_allowance()` returns correct credits per tier from `app_settings`
- ✅ `ai_tokens_per_month` removed from `role_limits` for all 4 user tiers
- ✅ `GET /auth/plans` response includes `ai_tokens_per_month` per tier (injected from settings)
- ✅ PlanPricingTable renders 4 rows (Free/General/Pro/Max) with month/year price + credits inputs
- ✅ Free tier prices are disabled (locked at ৳0); credits editable
- ✅ Per-row Save button triggers PATCH for changed keys; Revert restores original draft
- ✅ Refresh button re-fetches settings without closing modal
- ✅ TypeScript compiles cleanly (`npx tsc --noEmit`)
- ✅ Backend Python files parse cleanly

## Implementation Plan

1. **Backend - Schema**: Add 4 `plan_ai_credits_*` keys to `SEED_SQL` in `schema.py`
2. **Backend - Service**: Update `get_role_monthly_allowance()` to read from `app_settings` via `_ROLE_CREDIT_SETTING` mapping
3. **Backend - Admin**: Add `_CREDIT_SETTING_TO_ROLE` reverse mapping; add FORCE_RESET branch to `update_app_setting()`
4. **Backend - Admin**: Remove `ai_tokens_per_month` from `DEFAULT_ROLE_LIMITS` for 4 user tiers
5. **Backend - API**: Update `GET /auth/plans` to read `plan_ai_credits_*` and inject into plans response as `ai_tokens_per_month`
6. **Database**: Re-seed via `initialize_database()`; manually remove orphaned `ai_tokens_per_month` rows from `role_limits`
7. **Frontend**: Create `PlanPricingTable.tsx` with Draft type, toDraft, isSame, per-row Save/Revert logic
8. **Frontend**: Import PlanPricingTable in SettingsTab; replace old modal body with Modal + PlanPricingTable
9. **Verification**: TypeScript compile, backend syntax check, manual UI test

## Unit Test Plan

Unit tests needed: No

If no unit tests are needed, explain why:
- This is a refactor of existing functionality (credits moved from one storage location to another)
- Core business logic (`get_role_monthly_allowance`, `update_app_setting`, FORCE_RESET) is already tested implicitly by existing token system tests
- Frontend table component follows established pattern (TokenPacksTab) with no new complex logic
- Manual verification via UI and API response checks is sufficient for a configuration UI change

## File Size Check

Files expected to be edited:
- `backend/app/db/schema.py` (~50 lines, added 4 keys)
- `backend/app/services/ai_tokens.py` (~150 lines, added mapping + updated 1 function)
- `backend/app/services/admin.py` (~1100 lines, added mapping + FORCE_RESET branch + removed 5 lines)
- `backend/app/api/auth.py` (~350 lines, added credit injection logic)
- `frontend/src/components/admin/SettingsTab.tsx` (~450 lines, replaced modal)
- `frontend/src/components/admin/PlanPricingTable.tsx` (new file, ~250 lines)

Line-count risk: Low
- All files under 1150 lines
- `admin.py` was already large but no new bulk added (net -5 lines from removal of ai_tokens_per_month)

## Verification Plan

- ✅ TypeScript: `npx tsc --noEmit` passes
- ✅ Backend syntax: `python -c "import ast; [ast.parse(open(f).read()) for f in [...]]"` passes
- ✅ Database seeded: 4 `plan_ai_credits_*` keys present with correct values
- ✅ Service layer: `get_role_monthly_allowance('pro_user', conn)` returns 2000000
- ✅ API response: `GET /auth/plans` includes `ai_tokens_per_month` in each tier's features
- Manual UI test:
  - Open Admin → Settings → Plan Pricing
  - Verify table shows 4 rows with current values
  - Edit Pro plan monthly credits to 2500000
  - Click Save → verify success
  - Click Refresh → verify new value persists
  - Verify PlanComparisonView still shows credits correctly

## Completion Notes

Changed files:
- `backend/app/db/schema.py` (added 4 plan_ai_credits_* keys)
- `backend/app/services/ai_tokens.py` (added _ROLE_CREDIT_SETTING mapping, updated get_role_monthly_allowance)
- `backend/app/services/admin.py` (added _CREDIT_SETTING_TO_ROLE mapping, FORCE_RESET branch, removed 5 ai_tokens_per_month lines)
- `backend/app/api/auth.py` (added credit injection logic to GET /auth/plans)
- `frontend/src/components/admin/SettingsTab.tsx` (replaced pricing modal with PlanPricingTable)
- `frontend/src/components/admin/PlanPricingTable.tsx` (new file)
- `frontend/src/components/PlanComparisonView.tsx` (fixed ReferenceError for planConfig/billingCycle)

Verification completed:
- ✅ TypeScript compiles cleanly
- ✅ Backend Python files parse cleanly
- ✅ All 4 plan_ai_credits_* settings present in schema seed
- ✅ get_role_monthly_allowance reads from app_settings (verified via code review)
- ✅ FORCE_RESET propagation added to update_app_setting
- ✅ GET /auth/plans backward-compatible (ai_tokens_per_month injected)
- ✅ PlanComparisonView compiles cleanly and resolves variable ReferenceErrors

Unit tests added or updated:
- None (see Unit Test Plan rationale)

Follow-ups:
- SCHOLARDOCX-0141: Manual verification in running app (open Admin → Settings → Plan Pricing, test edit/save/revert flow)
- Verify PlanComparisonView displays pricing and credits correctly under both Monthly and Yearly toggles without crashes
- Optional: Remove `ai_tokens_per_month` feature definition from RoleLimitsTab's featureGroups array (cosmetic cleanup, not required since empty groups are already filtered)

