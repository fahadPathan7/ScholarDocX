# SCHOLARDOCX-0154: Yearly → Quarterly Billing Cycle

Status: Completed

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-19

## Summary

Renamed the user-facing billing cycle from "Yearly" to "Quarterly" across the system. Prices and AI credit allowances are unchanged; only the cycle name, the plan-extension duration (365 → 90 days), and the period suffix (`/ yr` → `/ qtr`, `/ year` → `/ quarter`) changed. Includes an idempotent DB migration that drops the legacy `plan_price_*_yearly` settings keys and backfills `plan_upgrade_requests.billing_cycle` from `'yearly'` to `'quarterly'`.

## Business Context

Links:
- Business file: N/A (pricing/packaging change)

Business value:
- Shorter commitment window (quarter vs year) lowers signup friction for new paid users
- Aligns renewal cadence with academic term boundaries better than a full year

## Functional Context

Links:
- Functional file: `AI-Context/functional/requirements-index.md` (FR-6.10)
- Functional file: `AI-Context/functional/feature-authentication.md`

Requirements:
- FR-1: Users can request upgrade/extension using a monthly or quarterly billing cycle (was yearly)
- FR-2: Quarterly cycle grants a 90-day plan window; monthly remains 30 days
- FR-3: All UI surfaces (plan comparison, landing pricing, admin pricing table) show "Quarterly" with `/ qtr` or `/ quarter` suffix
- FR-4: Existing data migrated: stored `billing_cycle='yearly'` rows become `'quarterly'`; legacy `plan_price_*_yearly` settings keys removed

## Technical Context

Links:
- Technical file: `AI-Context/technical/api-boundaries.md` (pricing endpoints)
- Technical file: `AI-Context/technical/local-storage-and-data.md` (settings keys)

Technical notes:
- DB keys renamed: `plan_price_general_yearly` / `plan_price_pro_yearly` / `plan_price_max_yearly` → `_quarterly` (values unchanged: 0 / 500 / 1500 BDT)
- `PlanRequestPayload.billing_cycle` Literal changed from `["monthly","yearly"]` to `["monthly","quarterly"]`
- `_calculate_plan_extension_window` and `resolve_plan_request` use `90 if billing_cycle == "quarterly" else 30`
- Idempotent migration in `initialize_database()` via new `_migrate_yearly_to_quarterly(conn)` helper — runs on every init, both statements are no-ops once nothing matches (same pattern as the existing `jwt_secret_key` cleanup)
- Frontend: `isYearly`→`isQuarterly` state, `yearlyPrice`→`quarterlyPrice` field, `plan_price_*_yearly`→`_quarterly` literals across all billing UI

Out of scope:
- `RoleLimitsTab.tsx` "Yearly" heading — documents `reset_period` values for usage counters ("resets on January 1st"), unrelated to billing
- `scholarship_catalog.py` "Annual stipend" and `test_ai_actions_records.py` `days_ahead: 365` — unrelated to billing

## Acceptance Criteria

- ✅ `billing_cycle` Literal accepts `"quarterly"` and rejects `"yearly"` at the API boundary
- ✅ Quarterly plan extension/upgrade grants a 90-day window; monthly unchanged at 30 days
- ✅ All three `plan_price_*_quarterly` keys seeded; legacy `_*_yearly` keys absent after init
- ✅ `plan_upgrade_requests.billing_cycle='yearly'` rows backfilled to `'quarterly'` on init
- ✅ PlanComparisonView shows Monthly/Quarterly toggle, posts `billing_cycle: "quarterly"`, displays `/ qtr`
- ✅ Landing page PricingSection shows Quarterly toggle with `/ quarter`, no "Save up to 30%" text
- ✅ PlanPricingTable shows "Quarterly Price (৳)" column; validation message says "Quarterly price"
- ✅ Backend tests pass (21 passed in test_plan_requests + test_limits_billing_guards)
- ✅ Frontend `tsc --noEmit` clean

## Implementation Plan

1. **Backend schema** (`schema.py`): rename 3 seed keys to `_quarterly`
2. **Backend migration** (`connection.py`): add `_migrate_yearly_to_quarterly()` helper, call from `initialize_database()`
3. **Backend API** (`auth.py`): update `Literal` type + 3 `setdefault` keys
4. **Backend service** (`admin.py`): update 2 date-math sites (365→90, "yearly"→"quarterly"); rename `create_user` `1_year` preset → `1_quarter` (90 days)
5. **Backend tests** (`test_plan_requests.py`): update seed values + 1 date assertion (2027-06-06 → 2026-09-04)
6. **Frontend PlanComparisonView**: rename state/fields/labels/suffix/option values
7. **Frontend plans-data**: rename type field, period values, `resolvePrice` param type
8. **Frontend PricingSection + CSS**: rename state/fields/labels, drop "Save up to 30%" text
9. **Frontend PlanPricingTable**: rename keys/fields/column header/validation message
10. **Frontend UsersTab**: rename `1_year` plan-duration preset → `1_quarter` ("1 Quarter", 90 days) in both create-user and edit-roles flows
11. **Verification**: backend pytest + frontend `tsc --noEmit`

## Unit Test Plan

Unit tests updated:
- `backend/tests/unit/test_plan_requests.py`:
  - Two `'yearly'` SQL literals → `'quarterly'` (request seed + insert)
  - `test_approve_expired_plan_extension_starts_from_approval_time`: assertion `2027-06-06` → `2026-09-04` (90 days from the fixed `now` of 2026-06-06, since the plan had expired)

Rationale: the date math is the only behavior change; the rest is a mechanical rename that the type system (frontend) and Literal validation (backend) enforce.

## File Size Check

Files edited:
- `backend/app/db/schema.py` (key renames, no net change)
- `backend/app/db/connection.py` (+22 lines for migration helper)
- `backend/app/api/auth.py` (4 line changes)
- `backend/app/services/admin.py` (2 line changes)
- `backend/tests/unit/test_plan_requests.py` (3 line changes)
- `frontend/src/components/PlanComparisonView.tsx` (mechanical rename)
- `frontend/src/components/LandingPage/plans-data.ts` (mechanical rename)
- `frontend/src/components/LandingPage/PricingSection.tsx` (mechanical rename)
- `frontend/src/components/LandingPage/PricingSection.css` (comment)
- `frontend/src/components/admin/PlanPricingTable.tsx` (mechanical rename)

Line-count risk: Low — no file approaches the 1150-line grace limit.

## Verification Plan

- ✅ Backend: `python -m pytest tests/unit/test_plan_requests.py tests/regression/test_limits_billing_guards.py` → 21 passed
- ✅ Frontend: `npx tsc --noEmit` → clean
- Manual (deferred to running-app check):
  - PlanComparisonView: toggle Quarterly, verify `/ qtr` suffix and `billing_cycle: "quarterly"` in request payload
  - Landing page: Quarterly toggle shows `/ quarter`
  - Admin Plan Pricing: "Quarterly Price (৳)" column, save flow works
  - Fresh DB init: `_*_yearly` keys absent, `_*_quarterly` keys present with values 0/500/1500

## Completion Notes

Changed files:
- `backend/app/db/schema.py` (3 seed keys renamed to `_quarterly`)
- `backend/app/db/connection.py` (added `_migrate_yearly_to_quarterly`, called from `initialize_database`)
- `backend/app/api/auth.py` (`Literal` type + 3 `setdefault` keys)
- `backend/app/services/admin.py` (2 date-math sites: 365→90, "yearly"→"quarterly"; `create_user` `1_year`→`1_quarter`)
- `backend/tests/unit/test_plan_requests.py` (2 SQL literals + 1 date assertion)
- `frontend/src/components/PlanComparisonView.tsx` (full rename)
- `frontend/src/components/LandingPage/plans-data.ts` (type + values + param)
- `frontend/src/components/LandingPage/PricingSection.tsx` (full rename, dropped "Save up to 30%")
- `frontend/src/components/LandingPage/PricingSection.css` (comment)
- `frontend/src/components/admin/PlanPricingTable.tsx` (full rename)
- `frontend/src/components/admin/UsersTab.tsx` (`1_year`→`1_quarter` preset: 2 state types, edit-roles day count 365→90, 2 UI option arrays)

Verification completed:
- ✅ 21 backend tests pass (test_plan_requests + test_limits_billing_guards)
- ✅ Frontend `tsc --noEmit` clean (re-run after UsersTab + create_user preset rename)
- ✅ Backend `admin.py` + `api/admin.py` parse cleanly
- Manual running-app check deferred to user

Decisions:
- Quarter defined as 90 days (matches the 30-day monthly approximation already in use)
- Discount messaging ("Save up to 30%") removed — a quarterly cycle does not carry a yearly discount
- Full rename of DB keys + stored values (per user decision); idempotent migration handles existing installs

Follow-ups:
- Verify in running app: toggle behavior, request payload, admin table, and a fresh-DB init on Supabase
- Optional: backfill any audit log `details.billing_cycle` entries that recorded `'yearly'` (not done — audit logs are historical record)
