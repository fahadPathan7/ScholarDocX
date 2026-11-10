# Billing And Payments (Polar)

Plans and credit packs are paid through Polar. ScholarDocX never sees card details: Polar hosts checkout,
charges the customer, and tells us through signed webhooks. This file covers checkout, webhook
reconciliation, and idempotency. Secrets and webhook authentication: [security-privacy.md](security-privacy.md).
Endpoint contracts: [api-boundaries.md](api-boundaries.md). Billing of provider calls and the credit economy:
[billing-contract.md](billing-contract.md), [ai-token-economy.md](ai-token-economy.md). User columns: [data-model.md](data-model.md).

```text
Frontend (PlanComparisonView / BuyTokensView)
   | POST /auth/plans/checkout { product_id, success_url }
   v
create_polar_checkout  (derives the customer from current_user)
   | POST {provider}/checkouts/   (server-side bearer key)
   v
Polar hosted checkout (email pre-filled and disabled)  ->  buyer pays
   v
Polar signed webhook (svix) -> POST /webhooks/polar -> verify, dedup, reconcile, grant
```

## Config (server-side env only)

| Env var | Purpose |
|---|---|
| `POLAR_ACCESS_TOKEN` | Bearer key for `POST /checkouts/` (required for checkout) |
| `POLAR_WEBHOOK_SECRET` | svix verification key (required for webhooks) |
| `POLAR_ENV` | `sandbox` selects the sandbox API; anything else is production |

These live on `Settings` (`polar_access_token`, `polar_webhook_secret`, `polar_env`). The backend still tolerates the legacy `VITE_POLAR_URL` for sandbox detection; `POLAR_ENV` is the backend-native knob. Never add a `VITE_`-prefixed variable for backend behaviour.

## Checkout (`POST /auth/plans/checkout`)

Auth required; returns `{status, url}` for the hosted checkout. The customer sent to Polar derives from `current_user`, never from `payload.customer_email` (spoofable): a returning customer (`users.polar_customer_id`) is sent as `customer_id`; a new one as `external_customer_id = users.id` plus `customer_email = users.email`. A known-customer identifier is what makes the hosted page show the email pre-filled and disabled, preventing typos that would break webhook reconciliation. `success_url` is validated against the CORS origins; `product_id` must be a canonical UUID (so an unset placeholder returns 400 before any provider call); upstream errors are logged server-side and the user sees a generic message ("Checkout session could not be created."). Frontend callers use `emitUiError` and reset loading in `finally`. The helper is `_create_polar_checkout_session` in `backend/app/api/auth.py`.

## Webhooks (`POST /webhooks/polar`)

Anonymous, authenticated only by the svix signature. Returns `{"status":"ok"}`, 5xx on retry-worthy failures (so Polar retries), 400 on signature failure.

- **Verification**: `_verify_polar_webhook` runs before any DB write; a missing `POLAR_WEBHOOK_SECRET` returns 500 (fail closed). It tries the candidate secret encodings derived from `POLAR_WEBHOOK_SECRET` (base64-decoded with and without the `whsec_` prefix, and raw UTF-8). Test suites mock product settings with the autouse `mock_webhook_settings` fixture so real settings are preserved.
- **Idempotency**: `polar_processed_events` dedups by the svix message id (`svix-id`, falling back to `data.id`). Flow: resolve the event id; skip with 200 if already processed; dispatch; on success mark processed and commit; on an `HTTPException` re-raise without marking; on an unexpected exception log event id, type, customer, and product, return 500, and do not mark. The unique constraint on `event_id` is the dedup point; a concurrent insert raising `IntegrityError` counts as already processed. Handlers never mark themselves processed.
- **User reconciliation** (`_find_user`): match `users.polar_customer_id == data.customer_id`; on a miss match `users.email == data.customer.email` and backfill `polar_customer_id`. If neither matches the handler raises 500 so Polar retries (a "pay then sign up" order has time to complete) and logs the miss. A future improvement is matching `external_customer_id` (= `users.id`) directly.

| Polar event | Handler | Effect |
|---|---|---|
| `subscription.created` / `.updated` | `handle_subscription_updated` | Map product to role; set the plan window |
| `subscription.canceled` | `handle_subscription_updated` (`canceled=True`) | Keep the plan until period end; `polar_cancel_at_period_end=1` |
| `subscription.uncanceled` | `handle_subscription_uncanceled` | Clear the cancel flag; restore renewal fields; roles untouched |
| `subscription.revoked` | `handle_subscription_revoked` | Immediate downgrade to `free_user` |
| `order.created` | `handle_order_created` | Grant credit-pack credits |
| other | logged as unhandled | 200 |

`.canceled` (scheduled) is distinct from `.revoked` (immediate); routing `.canceled` through the revoke handler once downgraded paying customers early. `refund.created` is not handled; add a handler if refunds should claw back credits.

- **Plan-start guard**: `plan_started_at` anchors the monthly credit cycle (`ai_tokens._current_period`). Set it only on a genuine new subscription (null) or after the plan lapsed (`plan_ends_at` in the past), never on every webhook, or a retried delivery would flip the cycle and re-grant the allowance.
- **Admin roles are preserved** when `handle_subscription_updated` runs (`super_admin`, `system_admin`, `general_admin`). The admin UI disables manual role edits for active Polar subscribers (`polar_subscription_id` set and `polar_cancel_at_period_end == 0`). `POST /auth/plans/portal` creates a Polar customer-session URL (`POST /v1/customer-sessions/`) for managing the subscription online. The Profile subscription card uses `getUserPlanStatus` in `lib/auth.ts`, which accepts `plan_renews_at` as a fallback so active online subscriptions show correctly.
- **Credit grants**: `grant_purchased(user_id, tokens, *, session, source, note=None, ref_id=None)`; the webhook passes `note=pack_row.display_name`. There is no `metadata` parameter: passing one raises `TypeError` and silently breaks every pack purchase (SCHOLARDOCX-0157 regression; do not reintroduce).

## Plan dates

Columns and their meaning are in [data-model.md](data-model.md). **Free plans never expire** (SCHOLARDOCX-0170): `free_user` carries only `plan_started_at`, and `plan_ends_at` is always NULL, in admin role updates (`AdminService.update_user_roles`), admin user creation (`create_user`), plan-request resolution (`resolve_plan_request`), and self-registration (invite, Google). The Polar revoke webhook is the one exception: it sets `plan_ends_at = now` as the cancellation boundary, then swaps the role to `free_user`. Correspondingly `plan_source` resolves to `none` for any row whose roles contain `free_user`, regardless of `signup_method` or a stale `plan_ends_at`; the `getPlanSource` fallback in `UsersTab.tsx` mirrors this, and the admin UI hides plan-duration controls when `free_user` is selected.

## Known limitations

- **Static pricing fallback** (SCHOLARDOCX-0210): the landing `PricingSection` and `PlanComparisonView` fetch live prices and limits; when the backend is unreachable they fall back to the shared snapshot in `frontend/src/components/LandingPage/plan-defaults.ts` (`STATIC_PLANS`, `STATIC_PRICING`; monthly prices 2.49 / 5.99 / 11.99 USD as of 2026-08-06, not the backend seed). `PlanComparisonView` then shows an amber banner and disables checkout, manage, and request. **Re-snapshot `plan-defaults.ts` whenever an admin changes prices or limits.**
- Webhook tests are handler-level (direct calls against a real DB store). End to end (Polar, public URL, svix, DB) can only be verified on a deployed environment with the webhook URL configured in Polar.
