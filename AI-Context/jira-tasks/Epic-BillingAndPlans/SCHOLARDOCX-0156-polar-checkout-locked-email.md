# SCHOLARDOCX-0156: Lock (non-editable) Email on Polar Checkout Page

Status: Completed

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-20

## Summary

On Polar's hosted checkout page, the customer email must be pre-filled from the
authenticated ScholarDocX user and **disabled (non-editable)**, so the buyer
cannot type a different address. Today the backend drops the email entirely and
Polar shows an empty, editable field — a typo there breaks webhook
reconciliation (the order/subscription webhook cannot match the buyer to a
`users` row and silently fails to grant the plan/credits).

## Business Context

Links:
- Business file: N/A (checkout reliability fix)

Business value:
- Eliminates the "paid but plan/credits not granted" failure mode caused by
  email typos on the Polar checkout page
- Tightens the ScholarDocX↔Polar customer link so renewal, upgrade, and
  extra-credit events always reconcile to the right account
- Improves checkout UX (one less field to fill in)

## Functional Context

Links:
- Functional file: `AI-Context/functional/feature-authentication.md`
- Functional file: `AI-Context/functional/requirements-index.md` (FR-6.x billing)

Requirements:
- FR-1: The Polar hosted checkout email field is pre-filled with the user's
  ScholarDocX account email and cannot be edited
- FR-2: Returning customers (with a stored `polar_customer_id`) reuse their
  existing Polar customer; new customers get one created on first checkout
- FR-3: Webhook reconciliation (`/webhooks/polar`) continues to match the buyer
  to a `users` row — no regression for either new or returning customers

## Technical Context

Links:
- Technical file: `AI-Context/technical/api-boundaries.md` (Polar billing subsection)
- Technical file: `AI-Context/technical/billing-and-payments.md` (full Polar design — SCHOLARDOCX-0157)
- Technical file: `AI-Context/technical/security-privacy.md` (Polar Billing Security section — SCHOLARDOCX-0157)

Technical notes:
- **Root cause:** `create_polar_checkout` in `backend/app/api/auth.py:431-435`
  builds the Polar `/checkouts/` request with only `product_id` + `success_url`.
  The `customer_email` field accepted by `PolarCheckoutPayload` is silently
  dropped from `req_body`.
- **Polar API contract** ([Checkout docs](https://polar.sh/docs/features/checkout/session)):
  - Passing `customer_id` (Polar internal ID) OR `external_customer_id` (our own
    ID) → customer is "known" → **email pre-filled AND disabled** on the hosted
    page.
  - Passing only `customer_email` → email pre-filled but **still editable**.
- **Fix:** use `current_user` as the authoritative customer source (NOT the
  client-supplied `payload.customer_email`, which is spoofable):
  - Returning customer (`current_user["polar_customer_id"]` set) → pass
    `customer_id`.
  - New customer (no `polar_customer_id`) → pass
    `external_customer_id = current_user["id"]` (user UUID) +
    `customer_email = current_user["email"]`. Polar creates a new customer with
    our external ID set and locks the email.
- **Webhook compatibility** (`backend/app/api/webhooks.py:76-87, 142-152`):
  reconciliation matches by `data.customer_id` → `Users.polar_customer_id`,
  then falls back to `data.customer.email` → `Users.email` (and backfills
  `polar_customer_id`). Both paths remain valid; new customers still reconcile
  via the email fallback until a future enhancement matches by
  `external_customer_id` directly.

Out of scope:
- Frontend cleanup: `PlanComparisonView.tsx` / `BuyTokensView.tsx` still send
  `customer_email` in the payload — harmless but now redundant (backend ignores it).
- Webhook enhancement: match by `external_customer_id` (= user UUID) directly
  instead of relying on the email fallback for new customers (noted as follow-up).

## Acceptance Criteria

- ✅ `create_polar_checkout` passes Polar a customer identifier derived from
  `current_user` for every authenticated request
- ✅ Returning customer (`polar_customer_id` present) → `req_body.customer_id`
  is set; `external_customer_id` is NOT set
- ✅ New customer (no `polar_customer_id`) → `req_body.external_customer_id` +
  `req_body.customer_email` are set from `current_user`; `customer_id` is NOT set
- ✅ The email sent to Polar is `current_user["email"]`, never the client-supplied
  `payload.customer_email`
- ✅ `product_id` and `success_url` are forwarded unchanged
- ✅ Unit tests cover both branches (known customer, new customer) and the
  email-source assertion
- ✅ Existing webhook smoke test still passes (no reconciliation regression)

## Implementation Plan

1. **Backend API** (`backend/app/api/auth.py`, `create_polar_checkout`):
   - Add customer-identification logic to `req_body` using `current_user`
   - Add an inline comment explaining why `current_user` is authoritative over
     `payload.customer_email`
   - Leave `PolarCheckoutPayload.customer_email` in place for backward compat
2. **Backend tests** (`backend/tests/unit/test_polar_checkout.py`, new):
   - Use the direct-function-call pattern (`test_plan_requests.py` style) — call
     `create_polar_checkout(payload, current_user_dict)` with a `FakeClient`
     monkeypatched onto `httpx.AsyncClient` so no network call is made
   - Cases: known customer, new customer, email source, product/success_url forwarding
3. **Context** (`AI-Context/technical/api-boundaries.md`):
   - Add a "Polar billing" subsection under `## Future API Areas` documenting
     the `/auth/plans/checkout` contract, the customer-identification rule, and
     the `/webhooks/polar` two-step reconciliation
4. **Verification**: backend pytest for the new test file + the existing webhook smoke test

## Unit Test Plan

Unit tests added:
- `backend/tests/unit/test_polar_checkout.py`:
  - `test_known_customer_passes_customer_id` — user with `polar_customer_id` →
    `req_body["customer_id"]` set, no `external_customer_id`
  - `test_new_customer_passes_external_id_and_email` — user without
    `polar_customer_id` → `req_body["external_customer_id"]` = user id,
    `req_body["customer_email"]` = user email, no `customer_id`
  - `test_uses_current_user_email_not_payload_email` — even when
    `payload.customer_email` differs from `current_user["email"]`, Polar
    receives `current_user["email"]`
  - `test_forwards_product_id_and_success_url` — both fields forwarded unchanged

Rationale: the customer-identification branching is the only behavior change and
has security/reconciliation implications, so each branch and the email-source
rule get explicit assertions.

## File Size Check

Files edited:
- `backend/app/api/auth.py` (~+10 lines in `create_polar_checkout`; file is 620 lines → well under the 1150 grace limit)
- `backend/tests/unit/test_polar_checkout.py` (new, ~80 lines)
- `AI-Context/technical/api-boundaries.md` (~+15 lines)

Line-count risk: Low — no file approaches the 1150-line grace limit.

## Verification Plan

- ✅ Backend: `python -m pytest tests/unit/test_polar_checkout.py tests/unit/test_webhooks.py`
- Manual (deferred to running-app check):
  - Trigger a Polar **sandbox** checkout for a user with no `polar_customer_id` →
    Polar page shows the user's email pre-filled and disabled
  - Trigger a sandbox checkout for a returning user (with `polar_customer_id`) →
    same: email pre-filled and disabled

## Completion Notes

Changed files:
- `backend/app/api/auth.py` — `create_polar_checkout` now derives the Polar
  customer identifier from `current_user` (`customer_id` for known customers,
  `external_customer_id` + `customer_email` for new customers) instead of
  dropping it. Client-supplied `payload.customer_email` is ignored.
- `backend/tests/unit/test_polar_checkout.py` (new) — 5 unit tests covering
  known-customer branch, new-customer branch, email-source rule, and
  product/success_url forwarding for both branches.
- `AI-Context/technical/api-boundaries.md` — added "Polar billing" entries for
  `/auth/plans/checkout` (customer-identification rule) and `/webhooks/polar`
  (two-step reconciliation contract) under `## Future API Areas`.

Verification completed:
- ✅ `python -m pytest tests/unit/test_polar_checkout.py tests/unit/test_webhooks.py`
  → 6 passed (5 new checkout tests + existing webhook smoke test)
- Manual running-app check deferred to user (sandbox checkout for a new user
  and a returning user — confirm Polar page shows email pre-filled and disabled)

Decisions:
- Use `current_user` (not `payload.customer_email`) as the authoritative email
  source — the payload field is client-supplied and spoofable.
- New customers are keyed to ScholarDocX via `external_customer_id = user.id`
  (UUID), so Polar's customer registry mirrors our `users.id`. Returning
  customers reuse their existing Polar customer via `polar_customer_id`.
- Did NOT remove `PolarCheckoutPayload.customer_email` — the frontend still
  sends it; leaving it avoids a coordinated frontend/backend change and the
  field is simply ignored.

Follow-ups:
- Frontend cleanup: stop sending `customer_email` from `PlanComparisonView.tsx`
  and `BuyTokensView.tsx` (harmless but redundant now).
- Webhook enhancement: match by `external_customer_id` (= user UUID) directly
  in `webhooks.py` instead of relying on the email fallback for new customers —
  would let first-purchase reconciliation survive even if Polar ever changes
  how it echoes the email.
