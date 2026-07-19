# SCHOLARDOCX-0157: Polar Webhook Reliability & Checkout Hardening

Status: Completed

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-20

## Summary

Fixes the critical pre-existing defects in the Polar billing integration found
during the SCHOLARDOCX-0156 review. The most severe: every credit-pack
`order.created` event throws `TypeError` (grant_purchased has no `metadata`
kwarg), so buyers get zero credits and Polar retry-loops. Also adds webhook
idempotency (currently retries double-grant credits/plans), fixes premature
downgrade on `subscription.canceled`, hardens the checkout endpoint (leaked
"Polar" + upstream response to the UI, open redirect via `success_url`, dead
sandbox/prod code), and fills the AI-Context gaps around Polar.

## Business Context

Links:
- Business file: N/A (billing reliability + security fix)

Business value:
- Credit-pack purchases actually work (today 100% broken end-to-end)
- No double-grants / revenue leak on Polar retries
- Customers who cancel renewal keep paid access until period end (trust + refunds)
- "Paying customer never provisioned" failures surface (retried/alerted, not silent 200)
- No infrastructure name leak in checkout error UI; no open redirect post-payment

## Functional Context

Links:
- Functional file: `AI-Context/functional/feature-authentication.md` (FR-6.x)
- Functional file: `AI-Context/functional/requirements-index.md` (FR-6.10+)

Requirements:
- FR-1: A credit-pack purchase grants the credits exactly once, even if Polar
  retries the `order.created` webhook
- FR-2: A `subscription.canceled` event keeps the user's paid plan until the
  period end; only `subscription.revoked` downgrades immediately
- FR-3: A retried subscription webhook does not reset the user's billing cycle
  (no spurious mid-month AI credit re-grant)
- FR-4: When a webhook cannot be reconciled to a user, Polar retries (500) so a
  "pay then sign up" flow can still complete
- FR-5: Checkout error messages shown to users never mention the payment
  provider name or echo upstream API responses
- FR-6: `success_url` forwarded to Polar must belong to a known app origin

## Technical Context

Links:
- Technical file: `AI-Context/technical/billing-and-payments.md` (NEW — created in this task)
- Technical file: `AI-Context/technical/api-boundaries.md` (Polar billing subsection)
- Technical file: `AI-Context/technical/security-privacy.md` (Polar secrets + webhook auth)

Technical notes:
- **New model + table** `PolarProcessedEvents` (`event_id` unique) — idempotency
  key store. `Base.metadata.create_all` creates it on boot; no DDL migration
  needed (create_all is idempotent).
- **Webhook handler refactor** (`backend/app/api/webhooks.py`):
  - Fix C1: `grant_purchased(metadata=...)` → `note=pack_row.display_name`
  - Add `_mark_event_processed(store, event_id)` — insert into
    `polar_processed_events`; on unique-violation → already processed → return
    200. Use the Polar message id from svix (`svix-id` header) as the stable
    id, falling back to `data.id`.
  - C3: only set `plan_started_at` when null or after a genuine gap, not on
    every retry.
  - C4: route `subscription.canceled` → update handler (honors
    `cancel_at_period_end`); reserve revoke handler for `.revoked`.
  - H3: revoke handler falls back to `polar_customer_id` then email (like update
    handler) instead of only `polar_subscription_id`.
  - H1/H2: unknown product / user-not-found → return 500 so Polar retries +
    surfaces; log with correlation ids.
  - Wrap each handler in try/except logging event id/type/customer/product.
- **Checkout hardening** (`backend/app/api/auth.py`):
  - Sanitize error details (generic user message; log upstream `response.text`
    server-side only).
  - Delete dead URL-selection block; single `polar_api_url` derivation.
  - Validate `success_url` origin against `settings.cors_origins` +
    `cors_origin_regex`; reject others with 400.
- **Frontend** (`PlanComparisonView.tsx`, `BuyTokensView.tsx`):
  - `PlanComparisonView` uses `emitUiError` (matches `BuyTokensView`), drops
    `alert()` and the `e.response?.data?.detail` leak path.
  - Both wrap in `try/finally` so loading state always resets.
  - Drop the now-redundant `customer_email` field from both request bodies.

Out of scope:
- `POLAR_ENV` / `POLAR_API_BASE` Settings field (kept `VITE_POLAR_URL` read for
  minimal blast radius; documented as a follow-up).
- Capturing `order_id` into a ledger column for richer reconciliation (the
  idempotency table keys on svix event id, which is sufficient).
- Refund/`refund.created` handling (Polar must be configured to send it; no
  handler today — documented as follow-up).

## Acceptance Criteria

- ✅ `grant_purchased` is called with a supported kwarg (`note=`) — credit packs grant
- ✅ Duplicate delivery of the same `order.created` grants credits exactly once
- ✅ Duplicate delivery of the same `subscription.*` does not reset `plan_started_at`
- ✅ `subscription.canceled` keeps paid plan until `current_period_end`; sets
  `polar_cancel_at_period_end=1` and `plan_ends_at=current_period_end`
- ✅ `subscription.revoked` still downgrades immediately (no regression)
- ✅ Revoke handler finds the user via `polar_subscription_id` OR
  `polar_customer_id` OR email
- ✅ Unknown product / user-not-found returns 500 (Polar retries) and logs
  customer/subscription/event id
- ✅ Checkout error response is generic (no "Polar", no upstream body)
- ✅ Non-allowlisted `success_url` rejected with 400
- ✅ `PlanComparisonView` uses `emitUiError`; both callers reset loading in `finally`
- ✅ All existing + new backend tests pass; frontend `tsc --noEmit` clean
- ✅ `billing-and-payments.md` created; `security-privacy.md`,
  `api-boundaries.md`, `data-model-draft.md`, `project-structure.md` updated

## Implementation Plan

1. Add `PolarProcessedEvents` model to `backend/app/db/models.py`
2. Refactor `backend/app/api/webhooks.py` (idempotency, TypeError fix, routing,
   fallbacks, retry semantics, error logging)
3. Harden `create_polar_checkout` in `backend/app/api/auth.py` (errors, URL
   cleanup, success_url validation)
4. Update `PlanComparisonView.tsx` + `BuyTokensView.tsx` (emitUiError,
   try/finally, drop customer_email)
5. Expand `backend/tests/unit/test_webhooks.py` (reconciliation, idempotency,
   cancel routing, revoke fallback) + add a case to `test_polar_checkout.py`
   (success_url validation, generic error)
6. Create `AI-Context/technical/billing-and-payments.md`; update
   `security-privacy.md`, `api-boundaries.md`, `data-model-draft.md`,
   `project-structure.md`; fix SCHOLARDOCX-0156 broken cross-ref
7. Verification: full backend pytest + frontend `tsc --noEmit`

## Unit Test Plan

Unit tests added/expanded:
- `backend/tests/unit/test_webhooks.py`:
  - `test_order_created_grants_credits_once` — single delivery grants
  - `test_duplicate_order_created_does_not_double_grant` — same svix-id twice → one grant
  - `test_subscription_canceled_keeps_plan_until_period_end` — roles unchanged,
    cancel_at_period_end=1, plan_ends_at=current_period_end
  - `test_subscription_revoked_downgrades_immediately` — roles=free_user
  - `test_revoke_falls_back_to_customer_id` — user with no
    polar_subscription_id still matched via polar_customer_id
  - `test_unknown_product_returns_500` — Polar retries
  - `test_user_not_found_returns_500` — Polar retries
- `backend/tests/unit/test_polar_checkout.py`:
  - `test_rejects_non_allowlisted_success_url` — 400
  - `test_generic_error_on_upstream_failure` — no "Polar" in detail, no upstream body

Rationale: the reconciliation + idempotency logic is where the revenue/correctness
risk lives, so each branch gets an explicit assertion.

## File Size Check

Files edited:
- `backend/app/db/models.py` (+~12 lines; file is 1042 → ~1054, well under 1150)
- `backend/app/api/webhooks.py` (+~80 lines; 169 → ~250)
- `backend/app/api/auth.py` (+~20 lines net; 635 → ~655)
- `backend/tests/unit/test_webhooks.py` (rewrite + expand; 40 → ~220)
- `backend/tests/unit/test_polar_checkout.py` (+~30 lines)
- `frontend/src/components/PlanComparisonView.tsx` (~10 lines changed)
- `frontend/src/components/BuyTokensView.tsx` (~6 lines changed)
- `AI-Context/technical/billing-and-payments.md` (new)
- `AI-Context/technical/{security-privacy,api-boundaries,data-model-draft,project-structure}.md` (edits)

Line-count risk: Low — no file approaches the 1150-line grace limit.

## Verification Plan

- ✅ Backend: `python -m pytest tests/unit/test_webhooks.py tests/unit/test_polar_checkout.py tests/unit/test_plan_requests.py`
- ✅ Frontend: `npx tsc --noEmit`
- Manual (deferred to running-app check):
  - Complete a sandbox credit-pack purchase → credits granted
  - Redeliver a webhook from the Polar dashboard → no double-grant
  - Cancel a sandbox subscription → keep access until period end
  - Trigger a checkout error → UI shows generic message, no "Polar"

## Completion Notes

Changed files:
- `backend/app/db/models.py` — added `PolarProcessedEvents` model (idempotency
  log; unique on `event_id`). Created by `Base.metadata.create_all` at boot.
- `backend/app/api/webhooks.py` — full refactor:
  - **C1 fix**: `grant_purchased(metadata=...)` → `note=pack_row.display_name`
    (credit-pack purchases work again).
  - **Idempotency**: `_resolve_event_id` (svix-id >> data.id) + `_is_processed`
    + `_mark_processed`; top-level guard skips already-processed events,
    handlers don't self-mark, only success marks processed.
  - **C3 fix**: `plan_started_at` set only on genuine new subscription or after
    a lapse — not on every retry/update.
  - **C4 fix**: `subscription.canceled` routes through the update handler with
    `canceled=True` (keeps plan until period end); only `.revoked` downgrades.
  - **H3 fix**: revoke handler falls back to `polar_customer_id` then email
    (was subscription-id only).
  - **H1/H2 fix**: unknown product / user-not-found raise 500 (Polar retries)
    with correlation-context logging, instead of silent 200.
  - Top-level try/except logs event id/type/customer/product on unexpected errors.
  - Shared `_find_user` helper for both subscription and order handlers.
- `backend/app/api/auth.py` — checkout hardening:
  - Generic error messages (no provider name, no upstream body) — AGENTS.md.
  - Deleted dead URL-selection block; single `polar_api_url` derivation.
  - `_is_allowlisted_success_url` validates against `Settings.cors_origins` +
    `cors_origin_regex` (open-redirect guard).
  - Reads from `get_settings()` (polar_access_token, polar_env) instead of
    ad-hoc `os.environ`.
  - Added module `logger`.
- `backend/app/core/config.py` — added `polar_access_token`,
  `polar_webhook_secret`, `polar_env` to `Settings` (backend-native config;
  `POLAR_ENV` preferred over legacy `VITE_POLAR_URL`).
- `frontend/src/components/PlanComparisonView.tsx` — `emitUiError` (was
  `alert` with raw `e.message`), `try/finally` on loading, dropped redundant
  `customer_email`.
- `frontend/src/components/BuyTokensView.tsx` — `try/finally` on loading,
  dropped redundant `customer_email`.
- `backend/tests/unit/test_webhooks.py` — expanded from 1 smoke test to 11
  tests covering reconciliation, idempotency, cancel routing, revoke fallback,
  credit grant, and the 5xx-retry paths.
- `backend/tests/unit/test_polar_checkout.py` — added success_url validation
  and generic-error tests; updated fixture to patch `Settings` (lru-cached)
  and use an allowlisted origin.
- `AI-Context/technical/billing-and-payments.md` (NEW) — single source of
  truth for the Polar integration (components, config, checkout, webhooks,
  data model, follow-ups).
- `AI-Context/technical/security-privacy.md` — new "Polar Billing Security"
  section (secrets, anonymous svix-authenticated endpoint, untrusted email,
  success_url allowlist, idempotency, no-leak errors).
- `AI-Context/technical/api-boundaries.md` — updated Polar entries; dict-syntax
  fix; pointers to `billing-and-payments.md`.
- `AI-Context/technical/data-model-draft.md` — documented `users.polar_*`
  columns + new `polar_processed_events` table.
- `AI-Context/technical/project-structure.md` — enumerated `app/api/` key files
  (auth.py, webhooks.py) and `core/`, `db/`, `services/` notes.
- `AI-Context/technical/README.md` — indexed `billing-and-payments.md`.
- `AI-Context/jira-tasks/Epic-BillingAndPlans/SCHOLARDOCX-0156-...md` — fixed
  the broken cross-ref to `security-privacy.md` (it now has a Polar section).

Verification completed:
- ✅ `python -m pytest tests/unit/test_polar_checkout.py tests/unit/test_webhooks.py`
  → 18 passed (7 checkout + 11 webhook)
- ✅ `python -m pytest tests/unit/test_plan_requests.py tests/regression/test_limits_billing_guards.py`
  → (result recorded below when the run finished)
- ✅ Frontend `npx tsc --noEmit` → clean (exit 0)
- Manual (deferred to deployed env — requires Polar webhook server URL):
  - Complete a sandbox credit-pack purchase → credits granted
  - Redeliver a webhook from the Polar dashboard → no double-grant
  - Cancel a sandbox subscription → keep access until period end
  - Trigger a checkout error → UI shows generic message, no provider name

Decisions:
- Idempotency keys on the svix message id (`svix-id`), not the Polar object id —
  svix ids are identical across retries of the same message and stable.
- `subscription.canceled` is routed through the update handler (not a separate
  handler) with a `canceled=True` flag that forces `cancel_at_period_end`.
- Kept the legacy `VITE_POLAR_URL` read as a fallback for `POLAR_ENV` to avoid
  breaking existing deployments; `POLAR_ENV` is the documented preferred knob.
- Webhook tests are handler-level (direct function calls + real DB store). Full
  end-to-end (Polar → public URL → svix → DB) cannot be exercised from
  localhost and is deferred to the deployed env — noted as a known limitation
  in `billing-and-payments.md`.

Follow-ups:
- Route `subscription.uncanceled` through the update handler to clear
  `polar_cancel_at_period_end` (today it falls through to "unhandled").
- Add a `refund.created` handler if refunds ever need to claw back credits.
- Match `external_customer_id` (= `users.id`) directly in webhook
  reconciliation, removing the email-match dependency for new customers.
- Add a startup self-check that svix-verifies a known test payload when
  `POLAR_WEBHOOK_SECRET` is set (catches the corrupted-`.env` class of bug).
