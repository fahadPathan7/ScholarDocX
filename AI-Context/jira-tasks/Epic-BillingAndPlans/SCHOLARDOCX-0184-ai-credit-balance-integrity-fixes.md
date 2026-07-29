# SCHOLARDOCX-0184: AI Credit Balance Integrity — Live Leak Fix + Plan Pricing Edits Must Not Wipe Usage

Status: Completed

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-28

## Summary

A live incident surfaced where a user's AI credit usage display showed a figure far larger than their plan's monthly allowance ("930,004 / 1,000,000" for an account whose real lifetime spend was ~24,467). Root-caused to a chain of issues in the AI token economy: (1) `ai_token_packs`/`plan_ai_credits_*` had been corrupted by a test file that mutated production data with no restore path; (2) `subscription_used` was computed from a live-fetched allowance instead of the amount actually granted, so any pricing correction produced nonsense until the user's own next reset; (3) the mechanism used to make plan pricing edits apply immediately (`FORCE_RESET`) fully wiped usage and re-granted a fresh full pool — correct for a genuine plan/role change, wrong for an admin tweaking a tier's monthly credit value, since it both hands out free credits (cap raised) and fails to block a user already over a newly-lowered cap. Also found and fixed: a pending (not yet approved) AI credit pack purchase request re-priced itself off the live pack catalog instead of freezing the terms the user agreed to at submission.

## Business Context

Links:
- Business file: [AI-Context/business/business-overview.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/business/business-overview.md)

Business value:
- Real money is at stake: AI credits map directly to real backend API cost (10,000 credits ≈ $1). A user whose usage tracking desyncs from their real grant either gets over-blocked (churn risk) or under-blocked (the business silently eats the API cost).
- Admins must be able to correct a plan's monthly credit value and have it apply to active subscribers immediately (regulatory/business need — e.g. correcting a pricing mistake) — but that correction must adjust the cap, not reset the clock or hand out unearned credits.
- A pack purchase is a one-time transaction at an agreed price; the price must not float while a request sits in the admin review queue.

## Functional Context

Requirements:
- FR-1: `subscription_used` shown to a user must always equal their real spend against their real grant this cycle, regardless of when the admin last edited Plan Pricing.
- FR-2: When an admin lowers a tier's monthly credit allowance below what a user has already used this cycle, that user must be blocked from further subscription-bucket spend immediately (not reset to a fresh pool at the new, lower amount).
- FR-3: When an admin raises a tier's monthly credit allowance, an active user only gains the additional headroom (`new_allowance − already_used`) — never a full fresh allowance stacked on top of usage already accrued.
- FR-4: A plan pricing edit is not a new billing period — the user's own `subscription_period` / natural reset schedule must be unaffected by it.
- FR-5: A pending AI credit pack purchase request must display and, on approval, grant exactly the pack's `token_amount`/`price_usd` as they were at submission time, even if an admin edits the pack's catalog values before the request is reviewed.
- FR-6: Already-approved purchases remain (and always were) immune to later catalog edits — no change needed there, verified.

## Technical Context

Technical notes:
- `ai_token_balances.subscription_remaining` is the live spendable balance; the new `subscription_granted` column freezes what was actually granted at the last reset, so "used" (`granted − remaining`) is immune to a later live allowance read.
- `ai_token_purchase_requests` previously had no `token_amount`/`price_usd` columns of its own — every read (`_request_select()`) joined live to `ai_token_packs`. Added frozen columns, populated at `submit_purchase_request()` time.
- `AdminService.update_app_setting()` previously set `subscription_period = 'FORCE_RESET'` for every user on the affected tier when a `plan_ai_credits_<tier>` setting changed — `refresh_balance()` treats any period mismatch as a genuine month-boundary rollover (full reset, no rollover of leftover, usage back to 0). That code path is correct and untouched for its other two callers (`update_user_roles` / `resolve_plan_request` — a role/tier change for a specific user, and `reset_role_limits` — an explicit admin "reset to defaults" action); it is wrong for a live value tweak affecting many already-active users at once.
- New behavior in `update_app_setting()`: a single SQL `UPDATE` computes `used_so_far = GREATEST(0, subscription_granted − subscription_remaining)` per affected row, then sets `subscription_granted = new_allowance` and `subscription_remaining = GREATEST(0, new_allowance − used_so_far)`. `subscription_period` is left untouched.
- Root cause of the original corruption: a prior session's test file (`test_ai_tokens_packs.py`) mutated `ai_token_packs` and `plan_ai_credits_*` for test isolation, but 5 of its `finally` blocks called `_restore_ai_token_packs(settings, packs_snapshot)` without the `settings_snapshot` argument, silently skipping the `app_settings` restore. Fixed (see Follow-ups history in git log / earlier session), and production values were manually restored via direct SQL — which is what first surfaced this deeper bug, since a direct SQL edit to `app_settings` bypasses `update_app_setting()`'s reset/adjust side effect entirely. Affected users were remediated by re-running the (now-fixed) adjustment logic by hand.

## Scope

In scope:
- `backend/app/db/models.py`: `AiTokenBalances.subscription_granted`, `AiTokenPurchaseRequests.token_amount`/`price_usd`.
- `backend/app/db/connection.py`: `_add_subscription_granted_column`, `_add_purchase_request_price_snapshot_columns` migrations.
- `backend/app/services/ai_tokens.py`: `refresh_balance()` sets `subscription_granted`; `_request_select()` reads frozen `r.token_amount`/`r.price_usd`; `submit_purchase_request()` snapshots pack terms at insert time.
- `backend/app/api/ai_tokens.py`: `get_balance()` computes `subscription_used` from `subscription_granted`, not a freshly re-fetched allowance.
- `backend/app/services/admin.py`: `update_app_setting()` adjusts affected balances in place instead of `FORCE_RESET`.
- `backend/tests/unit/test_ai_tokens_packs.py`: regression tests for all of the above.
- Production data: one-time remediation of the 4 real user rows affected by the original corruption + bypassed reset.

Out of scope:
- Changing `FORCE_RESET` behavior for role/tier changes or the explicit "reset role limits" admin action — those remain full resets, which is correct there.
- Prorating mid-cycle price changes for *paid* subscription price (`plan_price_*`), as opposed to credit *allowance* (`plan_ai_credits_*`) — not raised, not touched.

## Acceptance Criteria

- [x] `subscription_used` is computed from `subscription_granted`, immune to a live `plan_ai_credits_*` re-read.
- [x] Lowering a tier's allowance below a user's current usage sets `subscription_remaining = 0` immediately, leaves `subscription_period` untouched.
- [x] Raising a tier's allowance grants only the additional headroom above usage already accrued.
- [x] A pending purchase request's displayed and granted amount is frozen at submission time, unaffected by a later pack catalog edit.
- [x] Already-approved purchases confirmed immune to later catalog edits (no code change needed, verified by code inspection).
- [x] Migrations are idempotent (`ADD COLUMN IF NOT EXISTS` + one-time backfill), safe on every boot.
- [x] Production data remediated: `ai_token_packs`, `plan_ai_credits_*`, and the 4 real users' `ai_token_balances` rows corrected.

## Implementation Plan

1. Add `subscription_granted` to `ai_token_balances` (model + migration + backfill).
2. Wire `subscription_granted` through `refresh_balance()`'s insert and period-rollover paths.
3. Change `get_balance()` to compute `subscription_used` from `subscription_granted`.
4. Add `token_amount`/`price_usd` to `ai_token_purchase_requests` (model + migration + backfill); snapshot at `submit_purchase_request()`; read frozen values in `_request_select()`.
5. Replace `update_app_setting()`'s `FORCE_RESET` (for `plan_ai_credits_*` keys only) with an in-place adjustment UPDATE preserving usage.
6. Remediate the 4 live user balance rows and the previously-corrupted `ai_token_packs` / `plan_ai_credits_*` app_settings values.

## Unit Test Plan

Unit tests needed:
- Yes

Planned tests (added, not run — per project policy, tests are created/updated but only executed when explicitly requested):
- `test_subscription_used_immune_to_mid_cycle_plan_pricing_edit` — allowance edit doesn't corrupt `subscription_used` for an existing grant.
- `test_resolve_approve_grants_amount_frozen_at_submission` — pack edit mid-review doesn't change what a pending request grants.
- `test_lowering_plan_credits_blocks_once_usage_exceeds_new_cap` — lower cap below usage blocks immediately, period untouched.
- `test_raising_plan_credits_grants_only_the_additional_headroom` — higher cap grants only the delta, not a fresh full pool.

## File Size Check

Files expected to be edited:
- `backend/app/db/models.py`, `backend/app/db/connection.py`, `backend/app/services/ai_tokens.py`, `backend/app/api/ai_tokens.py`, `backend/app/services/admin.py`, `backend/tests/unit/test_ai_tokens_packs.py`

Line-count risk:
- Low — all additive/localized changes.

## Verification Plan

- `cd backend && .venv/bin/pytest tests/unit/test_ai_tokens_packs.py -q` (not run this session — run when explicitly requested).
- Manual: local `uvicorn --reload` (already running against the same DB in this environment) picked up all migrations cleanly on save; confirmed via `information_schema.columns` queries and a live screenshot of the public pricing page reflecting corrected credit values end-to-end.

## Completion Notes

Changed files:
- `backend/app/db/models.py` — added `AiTokenBalances.subscription_granted`, `AiTokenPurchaseRequests.token_amount`/`price_usd`.
- `backend/app/db/connection.py` — added `_add_subscription_granted_column`, `_add_purchase_request_price_snapshot_columns`, wired into `initialize_database()`.
- `backend/app/services/ai_tokens.py` — `refresh_balance()` sets `subscription_granted` on grant/reset; `_request_select()` reads frozen `r.token_amount`/`r.price_usd`; `submit_purchase_request()` snapshots the pack's current terms into the new request-row columns.
- `backend/app/api/ai_tokens.py` — `get_balance()` computes `subscription_used` from `subscription_granted`.
- `backend/app/services/admin.py` — `update_app_setting()` adjusts `ai_token_balances` in place (preserving usage) instead of `FORCE_RESET`, scoped only to `plan_ai_credits_*` keys.
- `backend/tests/unit/test_ai_tokens_packs.py` — 4 new regression tests (see Unit Test Plan); also fixed 5 pre-existing tests that were silently skipping the `app_settings` restore (the original corruption vector).
- Production data: corrected `ai_token_packs` (Small/Medium Plus/Large/Extra Large → real $/credit values), `plan_ai_credits_free/general/pro/max` (→ 500/9,000/28,000/70,000), and remediated the 4 real users' `ai_token_balances` rows.

Verification completed:
- Confirmed via direct DB inspection that migrations applied and backfilled correctly (local `uvicorn --reload` runs against the same Postgres instance in this environment).
- Confirmed via the public landing page (`/`) that corrected credit values flow end-to-end through the real API.

Unit tests added or updated:
- See Unit Test Plan above — added, not executed this session.

Follow-ups:
- `backend/app/db/schema.py`'s fresh-install `SEED_SQL` defaults for `plan_ai_credits_*` (free=0, general=500000, pro=2000000, max=5000000) still don't match the real business values used in production — only matters for a brand-new install, not live data, but worth aligning if a fresh install is ever spun up for real.
- Consider whether `plan_price_*` (paid subscription price, as opposed to credit allowance) should also get a "no accidental instant reflect" review — not investigated this session, wasn't in scope.
