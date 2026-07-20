# SCHOLARDOCX-0158: Validate Polar product_id at checkout boundary

Status: Done

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-20

## Summary

A live `app_settings.polar_product_id_pro_monthly` row contained the test
sentinel string `"polar_prod_pro_monthly"` instead of a real Polar product
UUID. The checkout endpoint forwarded it unchanged to Polar, which rejected it
with a 422 `RequestValidationError`. Add backend validation so any non-UUID
`product_id` is rejected at the API boundary with a clear error and never
surfaced as a working checkout button.

## Business Context

Links:

- Business file: `AI-Context/business/` (billing & plans)

Business value:

- Prevents a silent checkout break when a Polar product-id setting is missing
  or populated with a placeholder. Users currently hit a generic "Checkout
  session could not be created" error only after a round-trip to Polar.

## Functional Context

Links:

- Functional file: `AI-Context/functional/` (billing & plans)

Requirements:

- Checkout must fail fast with an actionable message when the configured
  product id is invalid.
- The `/auth/plans` payload must not advertise a buy button for tiers whose
  product id is not yet configured (or is malformed).

## Technical Context

Links:

- Technical file: `AI-Context/technical/api-boundaries.md` (Polar billing)

Technical notes:

- Product ids are stored as `app_settings` rows keyed
  `polar_product_id_{basic,pro,max}_{monthly,quarterly}` and
  `polar_extra_credits_id_{1..4}`. There are no `POLAR_PRODUCT_*` env vars.
- `create_polar_checkout` (`backend/app/api/auth.py:443`) forwards
  `payload.product_id` to Polar with no validation.
- `_assemble_public_plans` (`auth.py:321`) returns the raw string values into
  `pricing.polar_product_id_*`, which the frontend reads and posts back.
- The sentinel `"polar_prod_pro_monthly"` originates from
  `backend/tests/unit/test_webhooks.py:46` and leaked into a live row.
- Polar product ids are UUIDs (e.g. `5b1f3a2c-...-...-...`).

## Scope

In scope:

- Add UUID-shape validation in `create_polar_checkout` → 400 with a generic
  user-facing message (no infrastructure name leak).
- Server-side warning log including the offending value for diagnosis.
- Filter malformed/missing product ids out of `_assemble_public_plans` so the
  frontend never renders a buy button it cannot fulfill.
- Update `test_polar_checkout.py`: shared fixture uses a valid UUID; add tests
  for the new validation and the `_assemble_public_plans` filter.
- Update `api-boundaries.md` with the validation contract.

Out of scope:

- Seeding real Polar UUIDs (data fix; admin must enter via Settings UI).
- Migrating any other sentinel values out of live data.
- Changing webhook handling (it already resolves keys via `get_app_setting`).

## Acceptance Criteria

- [ ] `POST /auth/plans/checkout` with `product_id="polar_prod_pro_monthly"`
      returns 400 before any HTTP call to Polar.
- [ ] `POST /auth/plans/checkout` with a valid UUID-shaped `product_id` still
      forwards to Polar unchanged (existing behavior preserved).
- [ ] Upstream error response from Polar never echoes provider name or body to
      the client (existing AGENTS.md rule preserved).
- [ ] `/auth/plans` omits `polar_product_id_*` keys whose value is not a UUID
      from `pricing`, so the frontend cannot offer a broken checkout.
- [ ] New unit tests pass; existing polar/webhook tests unchanged.

## Implementation Plan

- [ ] `auth.py`: add `_is_uuid_shape(value)` helper; call it in
      `create_polar_checkout` after the success_url check; raise `HTTPException`
      400 with a generic message + `logger.warning`.
- [ ] `auth.py`: in `_assemble_public_plans`, skip assigning into `pricing`
      when the key is `polar_product_id_*` / `polar_extra_credits_id_*` and the
      value fails the UUID check.
- [ ] `test_polar_checkout.py`: change `payload()` `product_id` to a real UUID;
      add `test_rejects_non_uuid_product_id`, `test_accepts_valid_uuid_product_id`,
      and a `_assemble_public_plans` filter test.
- [ ] `api-boundaries.md`: document the validation rule under the Polar section.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Non-UUID product_id rejected with 400 before Polar call.
- Valid UUID product_id forwarded unchanged.
- `_assemble_public_plans` drops malformed `polar_product_id_*` / `polar_extra_credits_id_*`.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `backend/app/api/auth.py` (680 → ~700)
- `backend/tests/unit/test_polar_checkout.py` (206 → ~240)
- `AI-Context/technical/api-boundaries.md` (356 → ~365)

Line-count risk:

- Low

If any file exceeds 1000 lines, explain why.

- N/A — all target files stay well under the 1000-line limit.

## Verification Plan

- `cd backend && python -m pytest tests/unit/test_polar_checkout.py -v`
- `cd backend && python -m pytest tests/unit/test_webhooks.py -v` (unchanged)
- Manual: with a malformed value in `app_settings`, hitting
  `/auth/plans/checkout` returns 400 instantly (no Polar round-trip latency).

## Completion Notes

Changed files:

- `backend/app/api/auth.py` — added `_is_uuid_shape()` + `_UUID_RE` near
  `_is_allowlisted_success_url`; wired validation into `create_polar_checkout`
  (rejects non-UUID `product_id` with 400 + generic message before any Polar
  call); made `_assemble_public_plans` omit malformed `polar_product_id_*` /
  `polar_extra_credits_id_*` values from the `pricing` payload.
- `backend/tests/unit/test_polar_checkout.py` — shared `payload()` fixture now
  uses a real UUID (`5b1f3a2c-...`); added `test_rejects_non_uuid_product_id`
  (6 parametrized cases incl. the leaked sentinel), `test_accepts_valid_uuid_product_id`,
  and `test_assemble_public_plans_filters_non_uuid_product_ids`.
- `AI-Context/technical/api-boundaries.md` — documented the `product_id`
  UUID-boundary validation contract on `/auth/plans/checkout` and the
  `_assemble_public_plans` filter on `/auth/plans{,/public}`.

Verification completed:

- `python -m pytest tests/unit/test_polar_checkout.py -v` → 15 passed
  (8 pre-existing + 7 new). Existing tests were updated only where they
  referenced the old non-UUID fixture value; no behavioral assertions weakened.
- Webhook/payment paths intentionally NOT exercised by tests (per user
  instruction); payment flow is verified manually after the data fix below.

Unit tests added or updated:

- `test_rejects_non_uuid_product_id` (6 parametrized)
- `test_accepts_valid_uuid_product_id`
- `test_assemble_public_plans_filters_non_uuid_product_ids`
- Updated: `payload()` fixture, `test_forwards_product_id_and_success_url`,
  `test_known_customer_forwards_product_id_and_success_url` to use `PRODUCT_UUID`.

Follow-ups:

- **DATA FIX (required, admin-only):** the live
  `app_settings.polar_product_id_pro_monthly` row currently holds the test
  sentinel `polar_prod_pro_monthly`. Replace it (and verify the other 5 plan
  keys + 4 token-pack keys) with the real Polar product UUIDs from the Polar
  dashboard via the admin Settings → Polar product IDs tab. The backend will
  now refuse to even offer checkout until this is correct.
- After the data fix, manually verify a sandbox checkout completes and the
  webhook reconciles the subscription (payment/webhook paths are not covered
  by automated tests).
- Consider auditing `app_settings` for any other leaked test sentinels
  (`grep -r 'polar_prod_'`) and adding a DB-level sanity check or migration
  guard so test fixtures cannot be seeded against shared/production Postgres.
