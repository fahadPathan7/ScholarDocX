# SCHOLARDOCX-0086: Track monthly AI-credit usage explicitly

Status: Done
Owner: AI Agent
Created: 2026-06-27

## Summary

"Used this month" for the active plan always shows **0** even though the user has
consumed credits (the all-time total is correct). Root cause: there is **no stored
monthly-used counter** — the value is *derived* in the UI as
`monthly_allowance - subscription_remaining`. As soon as a plan/allowance changes
mid-period, `subscription_remaining` exceeds the current `monthly_allowance`
(`refresh_balance` only re-syncs the bucket at month boundaries), the subtraction
goes negative, and `Math.max(0, …)` hides the real consumption that the ledger
records correctly.

Verified against the live DB: user 2 has `subscription_remaining = 4,999,951`
(≈ the 5M `max_user` grant) but `monthly_allowance = 2,000,000` (now `pro_user`),
with the ledger showing **9 subscription entries summing to −49** (genuine usage)
and `total_spent_tokens = 49`. Derived "used" = `max(0, 2M − 4,999,951) = 0`.

Fix: track monthly subscription usage **explicitly** (`subscription_used_this_period`),
incremented in `charge()`, reset on period rollover, exposed via `GET /ai-tokens/balance`,
and read directly by the three frontend sites instead of the fragile derivation.

## Functional Context

Links:

- Functional file: [AI-Context/functional/feature-ai-token-economy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-ai-token-economy.md)

Requirements:

- "Usage this month" reflects tokens actually consumed from the subscription bucket
  in the current period, independent of any mid-period plan/allowance change.

## Technical Context

Links:

- Technical file: [AI-Context/technical/ai-token-economy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/ai-token-economy.md)

Technical notes:

- Additive column `ai_token_balances.subscription_used_this_period INTEGER NOT NULL DEFAULT 0`.
- `charge()` increments it by `sub_used` (the subscription-bucket portion; the
  `mixed`-bucket charge's sub portion is already `sub_used`). Unlimited/free calls
  don't touch it.
- `refresh_balance()` zeroes it on the period-rollover UPDATE (new rows default to 0).
- `GET /ai-tokens/balance` returns `subscription_used` (= that column).
- One-time migration backfills it from `ai_token_ledger`
  (`SUM(-tokens_delta) WHERE balance_bucket IN ('subscription','mixed') AND
  substr(created_at,1,7) = subscription_period`) so existing activity (the admin's
  49) shows immediately rather than waiting for a period reset.
- Frontend `AiTokenBalance` gains `subscription_used`; `UsageModal`,
  `AiTokenWidget` (tooltip), and `AiTokenUsageButton` (topbar %) read it. The
  topbar "pool" becomes coherent (`used + remaining`) so it never reports a
  misleading allowance-only figure when the bucket was granted at a higher tier.

## Scope

In scope:

- `backend/app/db/connection.py` — migration: add column + ledger backfill.
- `backend/app/services/ai_tokens.py` — `charge()` increment, `refresh_balance()` reset.
- `backend/app/api/ai_tokens.py` — `subscription_used` in `/balance`.
- `frontend/src/contexts/TokenEconomyContext.tsx` — `subscription_used` on the type.
- `frontend/src/components/UsageModal.tsx`, `AiTokenWidget.tsx`,
  `AiTokenUsageButton.tsx` — read the counter.

Out of scope:

- Mid-period subscription-bucket reconciliation (clamping `remaining` to the current
  allowance on downgrade). The existing "grant holds until month-end" policy is
  unchanged; only the *used* metric is fixed. The coherent topbar pool
  (`used + remaining`) means the displayed numbers always add up without changing
  that policy.

## Acceptance Criteria

- After the fix, the active plan's "used this month" equals tokens consumed this
  period (49 for the seeded admin after backfill), not 0.
- A mid-period plan change no longer zeroes the monthly-used display.
- `total_spent_tokens` (all-time) is unaffected.
- tsc + build clean.

## Implementation Plan

- connection.py `migrate_database` — mirror the `purchased_total` ALTER pattern; add
  the column then backfill once.
- ai_tokens.py — `refresh_balance` period-rollover UPDATE adds
  `subscription_used_this_period = 0`; `charge` non-unlimited UPDATE adds
  `subscription_used_this_period = subscription_used_this_period + :sub`.
- api/ai_tokens.py `get_balance` — `"subscription_used": int(balance.get(...))`.
- Frontend — type + 3 call sites.

## Unit Test Plan

Unit tests needed: No (small additive accounting change covered by existing
token-pack tests + a direct DB check of the backfilled value).

## Verification Plan

- `cd frontend && npx tsc --noEmit`; `npm run build` clean.
- Restart backend so the migration runs; confirm
  `ai_token_balances.subscription_used_this_period = 49` for user 2 and that
  `/ai-tokens/balance` returns `subscription_used: 49`.
- UI: topbar tooltip + UsageModal "Subscription (this month)" show 49, not 0.

## Completion Notes

Changed files:

- backend/app/db/connection.py — migration: `subscription_used_this_period` column + one-time ledger backfill.
- backend/app/services/ai_tokens.py — `charge()` increments it; `refresh_balance()` zeroes on rollover.
- backend/app/api/ai_tokens.py — `subscription_used` in `GET /ai-tokens/balance`.
- frontend/src/contexts/TokenEconomyContext.tsx — `subscription_used` on `AiTokenBalance`.
- frontend/src/components/UsageModal.tsx — reads the counter; coherent grant denominator.
- frontend/src/components/AiTokenWidget.tsx — tooltip reads the counter.
- frontend/src/components/AiTokenUsageButton.tsx — explicit counter + coherent `used + remaining` pool.
- AI-Context/technical/ai-token-economy.md, AI-Context/functional/feature-ai-token-economy.md — updated.

Verification completed:

- `npx tsc --noEmit` clean; `npm run build` clean (2.17s).
- `pytest tests/test_ai_tokens_packs.py` → 26 passed (charge/reset behaviour intact).
- Live DB (workspace/db/app.db): `subscription_used_this_period = 49` for user 2 (matches the
  ledger's −49). `/balance` path returns `subscription_used: 49` (was derived as 0). All-time
  `total_spent_tokens` unchanged (49).

Follow-ups:

- The topbar % badge rounds to 0% for 49/5M — that is mathematically correct (negligible usage),
  not a regression; the absolute count in the tooltip/UsageModal now shows 49. Next period reset
  re-aligns remaining to the current allowance.
- Out of scope (left as-is): mid-period reconciliation of `subscription_remaining` against the
  current allowance on downgrade (the "grant holds until month-end" policy is unchanged).
