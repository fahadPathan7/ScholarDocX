## Live Pricing on Landing Page (admin-configured, like profile page)

### Problem
The landing page `PricingSection.tsx` uses a **hardcoded** `PLANS` array (prices, features, points). These don't match what the admin configures via the Plan Pricing admin tab. The profile page's `PlanComparisonView` already fetches live data from `GET /auth/plans` — but that endpoint is **auth-gated**, and the landing page is for anonymous visitors.

### Approach
1. **Backend**: extract the existing `/auth/plans` assembly logic into a shared helper, then expose a **public** `GET /auth/plans/public` endpoint (no `get_current_user`) that returns the same marketing-safe payload (plans + pricing, minus any per-user data — it already returns none). The existing auth-gated `/auth/plans` is refactored to call the helper too (DRY — single source of truth).
2. **Frontend**: refactor `PricingSection.tsx` to fetch from `/auth/plans/public` on mount and render cards from the response. Keep the presentation mapping (variant/badge/cta) static, but drive **prices, feature values, and points** from the API. Reuse the `PlanComparisonView` feature→label mapping and formatters (extracted to a shared module) so wording is identical. Graceful fallback to the current hardcoded values if the fetch fails (landing page never breaks).

### Backend changes
**`backend/app/api/auth.py`**
- Extract the assembly logic from `get_plans` (lines 301–382) into a module-level function `_assemble_public_plans(store) -> dict` returning `{status, plans, pricing}`.
- `GET /plans` (auth-gated) → thin wrapper: `return _assemble_public_plans(store)`. Behavior unchanged for existing consumers.
- **NEW** `GET /plans/public` → `def get_public_plans(store)` with **no** `current_user` dependency; returns the same payload. Also remove the `print()` debug statements (leftover noise) during refactor.
- Out of scope: the credit side-effect on admin edit stays in `admin.py` untouched.

### Frontend changes
**`frontend/src/components/LandingPage/plans-data.ts` [NEW]**
- Shared types (`PlanLimits`, `PlansResponse`, `PricingResponse`) + the feature→label/format mapping (`coreFeatures` list) extracted/mirrored from `PlanComparisonView`, plus a `fetchPublicPlans()` helper and a `TIER_ORDER` constant.
- This avoids `PlanComparisonView` duplication and keeps labels in sync.

**`frontend/src/components/LandingPage/PricingSection.tsx`**
- Add `useEffect` to fetch `/auth/plans/public` on mount; store in state.
- While loading: render cards with a subtle skeleton shimmer (no layout shift / pop).
- On success: build cards from `plans[tier]` + `pricing`. Map the key features to human lines using the shared formatter (e.g. `total_projects` → "10 Active Projects", `total_documents_bytes` → "1 GB Storage", `ai_tokens_per_month` → "2M Monthly AI Credits", `total_sheets`/`total_whiteboards` → counts, "Unlimited" when `-1`).
- Prices: `pricing.plan_price_{tier}_{monthly|yearly}` (BDT), honoring the existing monthly/yearly toggle.
- On error: fall back to the current hardcoded `PLANS` so the landing page always renders.
- Keep static presentation: tier `variant` (popular=Pro, premium-dark=Max), CTA labels, descriptions.

### Files touched
- **Modified:** `backend/app/api/auth.py` (extract helper + add public endpoint + remove debug prints)
- **New:** `frontend/src/components/LandingPage/plans-data.ts`
- **Modified:** `frontend/src/components/LandingPage/PricingSection.tsx` (+ `PricingSection.css` for skeleton state)

### Jira
- Create `SCHOLARDOCX-0145` in `Epic-BillingAndPlans` (this is billing/pricing data plumbing, not pure UI polish).

### Verification
- `npm run build` + backend smoke check.
- Headless-Chrome: landing `/` pricing cards show admin-configured prices (change a price in admin, confirm it reflects).
- Anonymous fetch works (no token).
- Existing `/auth/plans` still returns the same payload for `PlanComparisonView` (no regression).
- Fail-safe: temporarily 404 the endpoint → landing falls back to hardcoded values.

### Out of scope
- No new tables, no admin UI changes, no change to how admin saves prices.
- Auth-gated endpoints (`/auth/usage`, `/auth/plans/requests`) untouched.
- The public endpoint exposes only plan limits/prices — these are already public-marketing data (same as what every SaaS shows on its pricing page); no per-user or private config leaks.