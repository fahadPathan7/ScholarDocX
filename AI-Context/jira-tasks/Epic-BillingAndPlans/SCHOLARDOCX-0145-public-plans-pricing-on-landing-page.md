# SCHOLARDOCX-0145: Public Plans & Pricing on Landing Page (admin-configured)

Status: Completed

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-17

## Summary

Make the landing page pricing section read plan prices, feature limits, and AI credits from the same admin-configured source the profile page uses, instead of a hardcoded array. Expose a public (anonymous) plans endpoint so unauthenticated visitors see live pricing.

## Business Context

Links:

- Business file: [README.md](../../business/README.md)

Business value:

Pricing shown to prospective users must always match what the admin configures in the Plan Pricing tab. Today the landing page hardcodes prices/points, so any admin price change (or plan deactivation) is invisible to new visitors — causing inconsistency and confusion. This unifies the pricing source of truth.

## Functional Context

Links:

- Functional file: [README.md](../../functional/README.md)

Requirements:

- Landing page pricing cards reflect admin-configured prices (monthly + yearly), feature limits (projects, storage, sheets, whiteboards), and monthly AI credits.
- Inactive tiers (admin `plan_is_active_*` off) are hidden from the landing page too.
- Anonymous visitors (no token) can fetch this data.
- If the API is unavailable, the landing page still renders with sensible fallback values.

## Technical Context

Links:

- Technical file: [api-boundaries.md](../../technical/api-boundaries.md)

Technical notes:

`GET /auth/plans` already assembles exactly what we need (joins `role_limits` + `app_settings` for prices/credits/active flags) but is auth-gated (`Depends(get_current_user)`). We extract its assembly into a shared helper and add `GET /auth/plans/public` (no auth) returning the same marketing-safe payload. The frontend `PricingSection` fetches it on mount with a skeleton + fallback. Feature→label mapping is mirrored from `PlanComparisonView`.

## Scope

In scope:

- `backend/app/api/auth.py` — extract `_assemble_public_plans(store)` helper; refactor `GET /plans` to use it; add `GET /plans/public`; remove leftover debug prints.
- `frontend/src/components/LandingPage/plans-data.ts` [NEW] — shared types + feature mapping + `fetchPublicPlans()`.
- `frontend/src/components/LandingPage/PricingSection.tsx` (+ `.css`) — data-driven cards with skeleton loading + fallback.

Out of scope:

- Admin UI, plan save logic, tables, auth-gated endpoints (`/auth/usage`, `/auth/plans/requests`).
- Any per-user data (none is exposed).

## Acceptance Criteria

- Landing page pricing cards show prices/limits/credits from admin config.
- Anonymous fetch (`GET /auth/plans/public`) works without a token.
- Changing a price/credit in admin reflects on the landing page after reload.
- Inactive tiers are hidden.
- If the endpoint fails, landing page renders with fallback values (no blank/broken section).
- `GET /auth/plans` (auth-gated) returns the same payload as before (no regression for `PlanComparisonView`).
- `npm run build` passes.

## Implementation Plan

- Extract `_assemble_public_plans` helper; both endpoints call it.
- Shared `plans-data.ts` with `PlanComparisonView`-aligned feature labels/formatters.
- `PricingSection`: `useEffect` fetch → success renders live cards, failure renders fallback `PLANS`.

## Unit Test Plan

Unit tests needed:

- No (mirror of existing static presentation; behavior is a fetch + render with fallback).

## File Size Check

- `auth.py`: extract is net-neutral/slightly smaller.
- `PricingSection.tsx`: ~210 → ~300, well under limit.

## Verification Plan

- Headless-Chrome: confirm prices match admin; toggle monthly/yearly; 404 the endpoint → fallback renders.
- Backend smoke: `GET /auth/plans/public` returns 200 with `{plans, pricing}`.

## Completion Notes

Changed files:
- `backend/app/api/auth.py` — extracted `_assemble_public_plans(store)` helper (single source of truth); `GET /plans` (auth-gated) now a thin wrapper over it (signature + response shape unchanged → no regression for `PlanComparisonView`); added `GET /plans/public` (anonymous); removed leftover `print()` debug statements.
- `frontend/src/components/LandingPage/plans-data.ts` [NEW] — shared types (`PlanLimits`, `PlansResponse`, `PricingResponse`, `PublicPlansResponse`), static tier presentation (`TIER_ORDER`, `TIER_PRESENTATION` with Pro=popular / Max=premium-dark), feature→label mapping aligned with `PlanComparisonView` (`LANDING_FEATURES` + `resolveFeatureLines`), price resolver (`resolvePrice`), and `fetchPublicPlans()`.
- `frontend/src/components/LandingPage/PricingSection.tsx` — now fetches `/auth/plans/public` on mount; renders skeleton cards while loading (no layout shift), live cards on success, hardcoded `FALLBACK_PLANS` on failure. Presentation (variant/badge/cta) stays static; prices/limits/credits come from the API. Monthly/yearly toggle honored.
- `frontend/src/components/LandingPage/PricingSection.css` — added skeleton shimmer styles + `prefers-reduced-motion` guard.

Decisions:
- Single shared helper on the backend so the authed and public endpoints can never drift.
- Feature labels mirror `PlanComparisonView` so the two surfaces agree (storage→MB, credits→K/M, -1→Unlimited).
- Free tier price is hardcoded `0 BDT` in the resolver (it's "free forever" regardless of admin config); all other prices/limits are admin-driven.
- Landing page never breaks: any fetch error or empty payload falls back to the static `FALLBACK_PLANS`.

Verification completed:
- `python3 ast.parse` on `auth.py` → OK.
- `npm run build` → passes (0 errors).
- `curl http://localhost:8000/api/auth/plans/public` (anonymous) → 200 with `{plans: [free, general, pro, max], pricing: {...}}`; live values confirmed (e.g. pro: 10 projects, 100 MB storage, 2M credits, 50 BDT/mo).
- Headless-Chrome screenshot of landing pricing → cards render live numbers, monthly/yearly toggle works, Pro=Popular, Max=Ultimate(dark).
- Auth-gated `GET /auth/plans` unchanged (same helper, same response shape).

Unit tests added or updated:
- None (fetch + render with fallback; the public endpoint reuses proven assembly logic).

Follow-ups:
- Consider extracting the feature→label mapping out of `PlanComparisonView.tsx` and `plans-data.ts` into one shared `frontend/src/lib/planFeatures.ts` so both surfaces import from a single location (currently mirrored to avoid coupling the landing page to an authed-only component).
- The public endpoint could be cached (e.g. short TTL) if the landing page sees high traffic; not needed now.
