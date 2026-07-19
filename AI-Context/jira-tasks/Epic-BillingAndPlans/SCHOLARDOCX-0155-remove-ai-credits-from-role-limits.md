# SCHOLARDOCX-0155: Remove Monthly AI Credits From Role Limits

Status: Completed

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-19

## Summary

Completed the SCHOLARDOCX-0140 follow-up: removed every trace of `ai_tokens_per_month` from the Role Limits admin panel and its supporting backend code. Monthly AI credit allowance is now edited exclusively in Settings → Plan Pricing via the `plan_ai_credits_<tier>` app_settings keys. Added an idempotent migration to purge legacy `role_limits` rows on upgraded installs and removed dead backend code that referenced the old feature.

## Business Context

Links:
- Business file: N/A (admin UX consolidation)

Business value:
- Single source of truth for the monthly AI credit allowance (Plan Pricing), eliminating the duplicate/confusing entry in Role Limits
- Prevents admins from editing a stale role_limits value that no longer drives the actual allowance (since SCHOLARDOCX-0140 moved reads to app_settings)

## Functional Context

Links:
- Functional file: `AI-Context/functional/admin-settings.md` (implied)

Requirements:
- FR-1: The Role Limits admin panel no longer lists "Monthly AI Credit Allowance" for any role
- FR-2: The allowance is editable only in Settings → Plan Pricing (already true since SCHOLARDOCX-0140; now reinforced by removing the duplicate)
- FR-3: Upgraded installs have legacy `role_limits.ai_tokens_per_month` rows purged on the next `initialize_database()` run
- FR-4: Purchased-credits toggles (`can_purchase_token_packs`, `can_use_purchased_tokens`) remain in Role Limits under the "AI Credits" group

## Technical Context

Links:
- Technical file: `AI-Context/technical/api-boundaries.md` (pricing/credits endpoints)
- Technical file: `AI-Context/technical/local-storage-and-data.md` (app_settings keys)

Technical notes:
- `RoleLimitsTab.tsx`: removed the `ai_tokens_per_month` feature object from the "AI Credits" group in `featureGroups` and the matching entry from the (currently dead) `featureInfo` dict. The two purchased-credits toggles stay; the group name "AI Credits" still fits.
- `admin.py` `update_role_limit`: removed the now-unreachable `if feature == "ai_tokens_per_month":` force-reset branch (the equivalent force-reset for `plan_ai_credits_*` edits lives in `update_app_setting`).
- `ai_tokens.py`: removed the vestigial `AI_TOKENS_FEATURE` constant (no callers).
- `connection.py`: added `_drop_legacy_ai_tokens_role_limit(conn)` helper, called from `initialize_database()`. Idempotent `DELETE FROM role_limits WHERE feature = 'ai_tokens_per_month'` — no-op on fresh installs, cleans upgraded ones.
- Untouched (intentional): `auth.py` still injects `ai_tokens_per_month` into the `/auth/plans` response key for backward compatibility with user-facing consumers (PlanComparisonView, UsageModal, plans-data, accessErrors). The *response key name* is stable; only the storage location changed (SCHOLARDOCX-0140).

## Acceptance Criteria

- ✅ RoleLimitsTab no longer renders an "Monthly AI Credit Allowance" row for any role
- ✅ "AI Credits" group in RoleLimitsTab still shows the two purchased-credits toggles
- ✅ `initialize_database()` purges any `role_limits.ai_tokens_per_month` rows (idempotent)
- ✅ `update_role_limit` has no `ai_tokens_per_month` special-case branch
- ✅ `AI_TOKENS_FEATURE` constant removed (no callers)
- ✅ `/auth/plans` response still includes `ai_tokens_per_month` per tier (backward compat preserved)
- ✅ Frontend `tsc --noEmit` clean
- ✅ Backend test suites pass: `test_ai_tokens`, `test_ai_tokens_packs`, `test_plan_requests`, `test_limits_billing_guards`

## Implementation Plan

1. **Frontend RoleLimitsTab**: remove `ai_tokens_per_month` feature object from `featureGroups` + `featureInfo`
2. **Backend admin.py**: remove dead force-reset branch in `update_role_limit`
3. **Backend ai_tokens.py**: remove vestigial `AI_TOKENS_FEATURE` constant
4. **Backend connection.py**: add `_drop_legacy_ai_tokens_role_limit` migration helper, wire into `initialize_database`
5. **Tests**: update 3 stale tests in `test_ai_tokens.py` / `test_ai_tokens_packs.py` that asserted the *old* contract (row must survive) — these were already failing on `main` as SCHOLARDOCX-0140 follow-ups; rewrote to assert the new contract (row purged)
6. **Verification**: targeted pytest run + frontend typecheck

## Unit Test Plan

Tests updated (all were pre-existing failures on `main` — SCHOLARDOCX-0140 leftovers):
- `test_ai_tokens.py::test_seed_defaults`: replaced the `role_limits` allowance assertion with (a) presence-check for all four `plan_ai_credits_*` app_settings keys and (b) `legacy_count == 0`. Does not assert specific seeded values — they are admin-editable and the shared Postgres test DB may carry non-default values.
- `test_ai_tokens_packs.py::test_ai_tokens_per_month_in_canonical_set` → renamed to `test_ai_tokens_per_month_purged_from_role_limits`: now seeds a legacy row directly, re-runs `initialize_database`, and asserts the row is gone.
- `test_ai_tokens_packs.py::test_reset_role_limits_preserves_ai_tokens_allowance` → renamed to `test_reset_role_limits_drops_ai_tokens_allowance`: asserts the row is `None` after `reset_role_limits` (since `DEFAULT_ROLE_LIMITS` no longer seeds it).
- Updated the `test_ai_tokens_packs.py` module docstring (it claimed the old behavior).

## File Size Check

Files edited:
- `frontend/src/components/admin/RoleLimitsTab.tsx` (-5 lines)
- `backend/app/services/admin.py` (-14 lines)
- `backend/app/services/ai_tokens.py` (-1 line)
- `backend/app/db/connection.py` (+15 lines)
- `backend/tests/unit/test_ai_tokens.py` (rewritten assertion block)
- `backend/tests/unit/test_ai_tokens_packs.py` (rewrote 2 tests + docstring)

Line-count risk: Low — net reduction in the largest files.

## Verification Plan

- ✅ Targeted: 3 updated tests pass (`test_seed_defaults`, `test_ai_tokens_per_month_purged_from_role_limits`, `test_reset_role_limits_drops_ai_tokens_allowance`)
- ✅ Suite: `test_ai_tokens` + `test_ai_tokens_packs` + `test_plan_requests` + `test_limits_billing_guards` all pass
- ✅ Frontend `tsc --noEmit` clean
- ✅ No `ai_tokens_per_month` references remain in `admin.py` / `ai_tokens.py` / `RoleLimitsTab.tsx`
- Manual (deferred to user): open Admin → Role Limits and confirm no "Monthly AI Credit Allowance" row; open Admin → Settings → Plan Pricing and confirm "Monthly AI Credits" column still editable

## Completion Notes

Changed files:
- `frontend/src/components/admin/RoleLimitsTab.tsx` (removed feature from `featureGroups` + `featureInfo`)
- `backend/app/services/admin.py` (removed dead force-reset branch in `update_role_limit`)
- `backend/app/services/ai_tokens.py` (removed vestigial `AI_TOKENS_FEATURE` constant)
- `backend/app/db/connection.py` (added `_drop_legacy_ai_tokens_role_limit`, wired into `initialize_database`)
- `backend/tests/unit/test_ai_tokens.py` (rewrote `test_seed_defaults` assertion for new storage)
- `backend/tests/unit/test_ai_tokens_packs.py` (rewrote 2 stale tests + module docstring for new contract)

Verification completed:
- ✅ 3 targeted tests pass
- ✅ Full suite (`test_ai_tokens`, `test_ai_tokens_packs`, `test_plan_requests`, `test_limits_billing_guards`) passes
- ✅ Frontend `tsc --noEmit` clean
- Manual running-app check deferred to user

Decisions:
- Untouched: `auth.py` keeps injecting `ai_tokens_per_month` into `/auth/plans` response (backward compat for user-facing UI). Only the *storage* and *admin edit surface* moved.
- Fixed 3 pre-existing stale tests (failing on `main`) rather than leaving them broken — they tested the old contract that SCHOLARDOCX-0140 already changed.
- `featureInfo` dict in RoleLimitsTab appears to be entirely dead code (no consumers found). Removed only the `ai_tokens_per_month` entry; flagged the broader dead-code cleanup as a follow-up rather than expanding scope.

Follow-ups:
- Optional: remove the entire dead `featureInfo` dict from `RoleLimitsTab.tsx` (~100 lines, no consumers)
- Manual check in running app: Role Limits panel + Plan Pricing table
