# Billing And Payments (Polar)

External billing is handled by Polar (the payment provider). ScholarDocX never
sees or stores card details — Polar hosts the checkout, charges the customer,
and notifies us via signed webhooks. This file is the single source of truth
for how the two endpoints, the reconciliation contract, and the idempotency
guarantees fit together. Keep it in sync with `api-boundaries.md` (which lists
the endpoints) and `security-privacy.md` (which covers the secrets).

Related: `api-boundaries.md` § Polar billing, `security-privacy.md` § Polar
secrets & webhook auth, `data-model-draft.md` § users.polar_*,
SCHOLARDOCX-0156 (locked checkout email), SCHOLARDOCX-0157 (reliability +
hardening).

## Components

```
[Frontend: PlanComparisonView / BuyTokensView]
        |  POST /auth/plans/checkout  { product_id, success_url }
        v
[auth.create_polar_checkout]  -- derives customer id from current_user
        |  POST {provider}/checkouts/   (server-side bearer key)
        v
[Polar hosted checkout]  -- email pre-filled + DISABLED (SCHOLARDOCX-0156)
        |
 buyer pays
        v
[Polar]  -- signed webhook (svix)
        v
[POST /webhooks/polar]  -- svix verify, dedup, reconcile, grant
```

## Config (server-side env, never exposed to the frontend)

| Env var | Purpose | Default |
|---|---|---|
| `POLAR_ACCESS_TOKEN` | Bearer key for `POST /checkouts/` | (required for checkout) |
| `POLAR_WEBHOOK_SECRET` | svix verification key for `/webhooks/polar` | (required for webhooks) |
| `POLAR_ENV` | `sandbox` → sandbox API, anything else → production | `""` (production) |

SCHOLARDOCX-0157: these live on the `Settings` class (`polar_access_token`,
`polar_webhook_secret`, `polar_env`). The backend also tolerates `VITE_POLAR_URL`
(legacy) for sandbox detection; `POLAR_ENV` is the preferred, backend-native
knob. Do not introduce a frontend `VITE_`-prefixed var for backend behavior.

## Checkout (`POST /auth/plans/checkout`)

Auth required. Returns `{status, url}` where `url` is the hosted checkout URL
the browser navigates to.

**Customer identification (SCHOLARDOCX-0156).** The customer id sent to Polar is
derived from `current_user`, NEVER from `payload.customer_email` (spoofable):
- Returning customer (`users.polar_customer_id` set) → `customer_id`
- New customer → `external_customer_id = users.id` (UUID) +
  `customer_email = users.email`

Passing Polar a known-customer identifier is what makes the hosted page render
the email field pre-filled AND disabled (prevents the email typos that used to
break webhook reconciliation).

**Hardening (SCHOLARDOCX-0157).**
- `success_url` is validated against the app's CORS origins (`Settings.cors_origins`
  + `cors_origin_regex`) before being forwarded — blocks open-redirect abuse.
- Upstream error responses are logged server-side only; the user-facing detail
  is generic ("Checkout session could not be created."), never the provider name
  or upstream body (AGENTS.md: no infrastructure exposure).
- Frontend callers use `emitUiError` (not `alert`) and reset loading in `finally`.

## Webhooks (`POST /webhooks/polar`)

Anonymous — authenticated solely by the svix signature. Returns `{"status":"ok"}`
on success, 5xx on transient/retry-worthy failures (so Polar retries), 400 on
signature failure.

### Signature verification
- svix `Webhook.verify(payload, headers)` runs BEFORE any DB write.
- Missing `POLAR_WEBHOOK_SECRET` → 500 (fail closed; never accept unsigned).
- svix natively enforces presence of `svix-id` / `svix-signature` / `svix-timestamp`
  and a ±5 min replay window.

### Idempotency (SCHOLARDOCX-0157)
Polar retries undelivered webhooks. The `polar_processed_events` table dedups by
the svix message id (`svix-id` header; falls back to `data.id`). The flow in
`polar_webhook`:
1. `_resolve_event_id` → pick `svix-id` (or `data.id`).
2. `_is_processed` → if seen, return 200 (skip).
3. Dispatch to handler. (Handlers do NOT mark themselves processed.)
4. On success: `_mark_processed` + commit. On `HTTPException` (5xx): re-raise
   (Polar retries), do NOT mark processed.
5. On unexpected exception: log correlation context (event id/type/customer/
   product), return 500, do NOT mark processed.

The unique constraint on `polar_processed_events.event_id` is the dedup point —
a concurrent insert raises `IntegrityError`, treated as "already processed".

### User reconciliation (`_find_user`)
Two-step lookup, used by both subscription and order handlers:
1. `users.polar_customer_id == data.customer_id`
2. On miss: `users.email == data.customer.email`, then backfill `polar_customer_id`

If neither matches → the handler raises 500 (so Polar retries, giving a
"pay then sign up" flow time to complete) and logs the miss with the
customer id + event id.

### Event routing
| Polar event | Handler | Effect |
|---|---|---|
| `subscription.created` / `.updated` | `handle_subscription_updated` | Map product → role; set plan window |
| `subscription.canceled` | `handle_subscription_updated` (with `canceled=True`) | Keep plan until period end; `polar_cancel_at_period_end=1` |
| `subscription.revoked` | `handle_subscription_revoked` | Immediate downgrade to `free_user` |
| `order.created` | `handle_order_created` | Grant credit-pack tokens |
| (other) | logged as unhandled | returns 200 |

SCHOLARDOCX-0157 (C4): `.canceled` (scheduled) is distinct from `.revoked`
(immediate). Routing `.canceled` through the revoke handler prematurely
downgraded paying customers — fixed.

### Plan-start guard (C3)
`plan_started_at` anchors the AI-token billing cycle
(`ai_tokens._current_period`). It is set ONLY on a genuine new subscription
(`plan_started_at` is null) or after the plan had lapsed (`plan_ends_at` in the
past). It is NOT reset on every webhook — otherwise a retried delivery would
flip the cycle index and re-grant the monthly allowance.

### Credit grants (`grant_purchased`)
Signature: `(user_id, tokens, *, session, source, note=None, ref_id=None)`.
The webhook call uses `note=pack_row.display_name`. There is NO `metadata`
parameter — passing one raises `TypeError` and silently breaks every credit-pack
purchase (SCHOLARDOCX-0157 C1 regression; do not reintroduce).

## Data model (`users`)

| Column | Purpose |
|---|---|
| `polar_customer_id` | Polar's customer id; backfilled on first webhook match |
| `polar_subscription_id` | Polar subscription id (null for pack-only buyers) |
| `polar_cancel_at_period_end` | 1 if `.canceled` was received |
| `plan_started_at` | Cycle anchor for monthly AI credit allowance |
| `plan_renews_at` | `current_period_end` while active |
| `plan_ends_at` | `current_period_end` while scheduled-to-cancel; set on revoke |

New table `polar_processed_events(id, event_id UNIQUE, event_type, processed_at)`
is the webhook idempotency log.

## Known limitations / follow-ups
- Webhook tests are handler-level (direct function calls with a real DB store).
  Full end-to-end (Polar → public URL → svix → DB) can only be verified against
  a deployed environment with the webhook server URL configured in Polar — it
  cannot be exercised from localhost.
- `subscription.uncanceled` is not explicitly routed (falls through to
  "unhandled"). If a user un-cancels, `polar_cancel_at_period_end` stays 1 until
  the next `.updated` event clears it. Route it through the update handler when
  this becomes a real flow.
- `refund.created` is not handled. If you ever issue refunds and want to claw
  back credits, add a handler.
- Reconciliation for brand-new customers still relies on the email fallback.
  A future enhancement could match `external_customer_id` (= `users.id`)
  directly, removing the email-match dependency entirely.
