# SCHOLARDOCX-0214: Landing pricing pre-fetch default must show configured values, never Basic $0

Status: Done

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-10-31

## Summary

The landing page pricing advertisement can show "Basic — 0 USD" before the
plans fetch resolves. Cause: the backend's seed default for
`plan_price_general_monthly` is `"0"` (schema.py / auth.py setdefault), and
`PricingSection` renders instantly from the localStorage cache
(`lp_plans_cache_v1`). A browser that ever loaded the page against an
unconfigured backend cached the zero-priced payload and renders it on every
visit; the fetch-failure path also prefers that stale cache over the static
snapshot. Fix: never render an unconfigured (zero/missing-price) cached
payload, and merge live pricing over the static snapshot so a paid tier can
never display $0.

## Business Context

Links:

- Business file: AI-Context/business/product-overview.md
- Prior task: SCHOLARDOCX-0210 (static pricing fallback)

Business value:

- Advertising a paid plan at $0 is a trust and revenue bug on the public
  landing page — the first surface new users see.

## Functional Context

Requirements:

- Pre-fetch (cache or static fallback) display must equal the
  admin-configured snapshot: Free 0 USD/forever (1 project, 5 MB, 500
  credits, no extras); Basic 2.49 USD (3 projects, 30 MB, 9K credits, no
  extras); Pro 5.99 USD (10, 50 MB, 28K, all extras); Max 11.99 USD (50,
  300 MB, 70K, all extras); quarterly 6.49/15.99/31.99.
- Live DB values still win wherever they are configured (positive prices).

## Technical Context

Links:

- `frontend/src/components/LandingPage/plans-data.ts` (cache + resolvers)
- `frontend/src/components/LandingPage/plan-defaults.ts` (static snapshot)
- `frontend/src/components/LandingPage/PricingSection.tsx` (render paths)

Technical notes:

- Seed default prices are `"0"` on the backend; treat non-positive paid-tier
  prices as "unconfigured" on the frontend display path.
- No backend changes (DB/app_settings remain the source of truth).

## Scope

In scope:

- `plan-defaults.ts`: `withConfiguredPricing` + `isPricingConfigured`
  helpers; doc note.
- `PricingSection.tsx`: guard the fresh-cache render and stale-cache
  failure path; sanitize live pricing before render/cache-save.

Out of scope:

- Backend seed values or admin config flow.
- PlanComparisonView inline `|| '2.49'` fallbacks (cover missing but not
  "0" — follow-up).

## Acceptance Criteria

- With a poisoned cache (zero prices), first paint shows the snapshot
  values from the screenshot for all four tiers.
- With a configured cache/live payload, admin values render unchanged.
- No paid tier can render "0 USD" on the landing pricing section.

## Unit Test Plan

Unit tests needed:

- No (frontend has no test runner for this module; behaviour verified by
  code path review + tsc/build).

## File Size Check

Files expected to be edited:

- plan-defaults.ts (+~40), PricingSection.tsx (~10 lines changed)

Line-count risk:

- Low

## Verification Plan

- `npx tsc --noEmit` + `npm run build` in frontend.

## Completion Notes

Changed files:

- `frontend/src/components/LandingPage/plan-defaults.ts` — added
  `isPricingConfigured()` and `withConfiguredPricing()` guards (+doc block
  explaining the seed-"0" root cause).
- `frontend/src/components/LandingPage/PricingSection.tsx` — fresh-cache
  render and stale-cache failure path only accept configured payloads; the
  live payload is sanitized (`withConfiguredPricing`) before render AND
  before `saveCachedPlans`, so a zero-priced cache entry can never be
  written either.

Verification completed:

- `npx tsc --noEmit` clean; `npm run build` succeeds.
- Confirmed via dev server: with the backend down (plans fetch failing),
  the pricing section renders the static snapshot — Free 0 USD / forever,
  Basic 2.49 USD, Pro 5.99 USD, Max 11.99 USD with the full 8-feature
  cards; quarterly 6.49/15.99/31.99.
- The static snapshot (`STATIC_PLANS` / `STATIC_PRICING`) already matched
  the requested values item-for-item (projects, storage, credits, extras,
  descriptions) — the bug was only the poisoned-cache render path.

Unit tests added or updated:

- None (frontend has no runner covering this module; logic reviewed by
  path).

Follow-ups:

- `PlanComparisonView.tsx` inline fallbacks (`pricing?.X || '2.49'`) cover
  missing keys but would still pass a live "0" through — same guard could
  be applied there if an unconfigured backend is ever used signed-in.
- Consider validating plan prices > 0 in the Admin panel / backend so the
  source of truth can't be "0" in the first place.
