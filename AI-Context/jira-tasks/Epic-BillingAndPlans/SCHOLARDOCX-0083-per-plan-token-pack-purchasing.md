# SCHOLARDOCX-0083: Per-plan token-pack purchasing

Status: In Progress
Owner: AI Agent

Epic: Epic-BillingAndPlans
Created: 2026-06-27

## Summary

Purchasing extra AI token packs is a premium-tier privilege, not available to
every plan by default. Add a per-role boolean capability `can_purchase_token_packs`
(reusing the existing `role_limits` mechanism), enforce it on the purchase-request
endpoint, expose it through the balance response + plan data, surface it as a
toggle in the admin role-limits editor, and show it as a ✓/✗ feature row in the
"Choose your plan" view. Extension of the central AI token economy
([SCHOLARDOCX-0082](SCHOLARDOCX-0082-central-ai-token-economy.md)).

## Confirmed Decisions

- Default seeding: `free_user` = 0, `general_user` = 0, `pro_user` = 1,
  `max_user` = 1. (general_user is a $0/free tier — see `plan_price_general_*`.)
- Admin roles (`general_admin`, `super_admin`) are NOT seeded: the enforcement
  resolver (`get_primary_user_role`) ignores admin roles for non-`admin_` features,
  so admin rows would be inert. Admins test via a user-tier role (pro/max).
- Ineligible UX: keep the token widget + "Buy tokens" entry visible; opening Buy
  (or hitting out-of-tokens) shows an **upgrade upsell** linking to Choose Plan,
  instead of the pack list. Backend 403 is the backstop.

## Functional Context

Links:

- Functional file: [AI-Context/functional/feature-ai-token-economy.md](../../functional/feature-ai-token-economy.md)

## Technical Context

Links:

- Technical file: [AI-Context/technical/ai-token-economy.md](../../technical/ai-token-economy.md)

## Scope

In scope:

- New boolean role limit `can_purchase_token_packs` (seed + canonical + migration).
- `POST /ai-tokens/purchase-requests` 403 guard for ineligible plans.
- `can_purchase_packs` field on `GET /ai-tokens/balance`.
- Admin LimitsTab toggle + `FEATURE_LABELS` entry.
- Plan-comparison boolean feature row ("Extra AI tokens purchasable").
- Buy-flow upgrade upsell (TokenEconomyContext + BuyTokensModal + nav event + App listener).
- Backend tests.

Out of scope:

- Payment integration (unchanged — approval is the grant).
- Changing the request→approve flow itself.

## Implementation Plan

- backend/app/services/admin.py — `DEFAULT_ROLE_LIMITS` +4 user-tier entries.
- backend/app/db/connection.py — `canonical_features` + migration seed block.
- backend/app/db/schema.py — `SEED_SQL` +4 user-tier rows.
- backend/app/api/ai_tokens.py — `_require_feature("can_purchase_token_packs", ...)`
  guard in `submit_purchase_request`; `can_purchase_packs` in `get_balance`.
- backend/app/services/ai_tokens.py — read-only `can_purchase_packs(user, session)`.
- backend/tests/test_ai_tokens_packs.py — eligibility + seed + balance tests.
- frontend: AdminView.tsx, PlanComparisonView.tsx, TokenEconomyContext.tsx,
  BuyTokensModal.tsx, App.tsx, lib/tokenEvents.ts, lib/accessErrors.ts.

## Unit Test Plan

Unit tests needed: Yes.

- Ineligible role (free/general) submit → 403; eligible (pro/max) → 201/Pending.
- Seed/migration: 4 `can_purchase_token_packs` rows exist after init.
- Balance response `can_purchase_packs` reflects the caller's primary role.

## Verification Plan

- `pytest backend/tests/test_ai_tokens_packs.py` green; broader token suites no regressions.
- `npx tsc --noEmit` clean; `npm run build` clean.
- Manual: free → buy shows upsell; pro/max → pack list + Request; admin toggle
  persists; Choose Plan shows ✓ pro/max, ✗ free/general.
