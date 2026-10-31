# SCHOLARDOCX-0210: Show static plan data when the backend is down instead of stale/error states

Status: In Progress

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-08-06

## Summary

Both pricing surfaces (the public landing `PricingSection` and the authenticated
`PlanComparisonView`) fetch plan prices and per-tier limits from the backend.
When the backend is down or still booting, the landing page showed a stale,
incomplete hardcoded table (seed prices 0/50/180, only 4 features) and the
authenticated view showed a hard red "Failed to load subscription plans" error.
Replace both with a shared static snapshot of the live admin-configured values so
the table is always visible and accurate.

## Business Context

Links:

- Business file: `business/decisions.md`
- Technical file: `technical/billing-and-payments.md`

Business value:

- Visitors to the landing page always see real, current pricing — no stale
  numbers that contradict the live site.
- Logged-in users can review plan features offline instead of hitting a dead
  error screen.
- Plan actions (checkout, manual upgrade requests) are correctly disabled while
  the backend is unreachable, so users never get a confusing failure mid-flow.

## Functional Context

Links:

- Functional file: N/A (no behaviour change while the backend is up)

Requirements:

- When the backend is unreachable, the pricing tables render with the last-known
  admin-configured values (prices, storage, credits, feature flags) as a
  read-only view.
- Action buttons that require the backend are disabled with an explanatory hint.

## Technical Context

Links:

- `technical/billing-and-payments.md`

Technical notes:

- A new shared module `frontend/src/components/LandingPage/plan-defaults.ts`
  exports `STATIC_PLANS` (per-tier feature limits, shaped like the `/auth/plans`
  response) and `STATIC_PRICING` (price strings). These are a snapshot of the
  live admin values as of 2026-08-06 (NOT the backend seed defaults, which are
  0/50/180).
- `PricingSection.tsx` now builds its `FALLBACK_PLANS` from `STATIC_PLANS` /
  `STATIC_PRICING` via the existing `resolveFeatureLines` / `resolvePrice`
  resolvers, so the offline table matches the live render shape (all 8
  features, identical formatting) instead of the old stale 4-feature table.
- `PlanComparisonView.tsx` catches a `/auth/plans` failure and falls back to
  `STATIC_PLANS` / `STATIC_PRICING`, setting an `offline` flag. The flag drives
  an amber banner ("Showing plan info. Plan actions are unavailable until the
  connection returns.") and disables the checkout / manage / request buttons.
- The inline `|| '50'` / `|| '180'` / `|| '500'` / `|| '1500'` fallback literals
  in `PlanComparisonView` (used when a single pricing key is missing from an
  otherwise-successful response, and in the request-modal total) were updated to
  the live values (`5.99` / `11.99` / `15.99` / `31.99` etc.).

## Scope

In scope:

- `frontend/src/components/LandingPage/plan-defaults.ts` (new).
- `frontend/src/components/LandingPage/PricingSection.tsx` — derive fallback from shared defaults.
- `frontend/src/components/PlanComparisonView.tsx` — static fallback + offline banner + disabled actions + updated inline fallbacks.

Out of scope:

- No backend change.
- No change to the admin Plan Pricing editor.
- Polar product IDs are not in the static snapshot (they are empty at seed time and only relevant to checkout, which is disabled offline anyway).

## Acceptance Criteria

- With the backend down, the landing pricing table shows 4 tiers × 8 features with prices 0 / 2.49 / 5.99 / 11.99 USD (monthly) and the correct storage / credit / feature values.
- With the backend down, the authenticated plan comparison renders the same table read-only, shows an amber offline banner, and disables all plan action buttons.
- With the backend up, behaviour is unchanged (live data renders as before).

## Implementation Plan

- Add `plan-defaults.ts`.
- Rewire `PricingSection` fallback.
- Add offline fallback + banner + button disabling to `PlanComparisonView`.
- Update inline fallback literals.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- This is presentational fallback logic. Verification is visual (backend up vs
  down) and a successful production build. The static values themselves are a
  snapshot, not derived logic.

## File Size Check

Files expected to be edited:

- `plan-defaults.ts` (new, ~150 lines)
- `PricingSection.tsx` (net smaller — removed ~50 stale lines, added ~15)
- `PlanComparisonView.tsx` (~30 lines added across three sites)

Line-count risk:

- Low (all well under 1000).

## Verification Plan

- `npm run build` (TypeScript + Vite build) passes with the new imports and types.
- Manual: with backend down, confirm both tables render the static snapshot and the authenticated actions are disabled.

## Completion Notes

Changed files:

- `frontend/src/components/LandingPage/plan-defaults.ts` (new) — `STATIC_PLANS` + `STATIC_PRICING`, a snapshot of the live admin-configured values as of 2026-08-06.
- `frontend/src/components/LandingPage/PricingSection.tsx` — `FALLBACK_PLANS` now derived from the shared static defaults via `resolveFeatureLines` / `resolvePrice` (full 8-feature cards, accurate prices) instead of the stale 4-feature hardcoded table; re-added `ResolvedFeature` import for `CardProps`.
- `frontend/src/components/PlanComparisonView.tsx` — `/auth/plans` failure now falls back to `STATIC_PLANS`/`STATIC_PRICING` with an `offline` flag; amber offline banner under the header; action buttons disabled with "Unavailable" label while offline; inline `||` price fallbacks updated from seed values (0/50/180/500/1500) to live values (2.49/5.99/11.99/6.49/15.99/31.99) in both the plan cards and the request-modal total.

Verification completed:

- `npm run build` (`tsc -b` + `vite build`) passes — 2629 modules transformed, no type errors. (Pre-existing chunk-size and sheetPaste dynamic-import warnings only.)
- `python3 scripts/check-context-drift.py` passes — all living-context symbols/paths resolve.
- Backend-up behaviour unchanged by construction (the static fallback only triggers on `/auth/plans` failure).

Unit tests added or updated:

- None (presentational fallback logic; the static values are a snapshot, not derived logic).

Follow-ups:

- If admin changes plan prices/limits, re-snapshot `plan-defaults.ts` to keep the offline fallback accurate.
- Manual check (backend down) still wanted: confirm the landing table shows 4×8 features at 0/2.49/5.99/11.99 and the authenticated view shows the amber banner + disabled buttons.
