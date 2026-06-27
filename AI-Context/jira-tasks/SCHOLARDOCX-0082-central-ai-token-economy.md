# SCHOLARDOCX-0082: Central AI token economy

Status: Complete — Phases 1–5 implemented & verified (backend pytest green; frontend `tsc --noEmit` + `vite build` clean)

Owner: AI Agent

Created: 2026-06-26

## Summary

Replace count-based AI limits with a central, per-user AI token balance metered
by real input/output tokens. Monthly tier allowance + purchasable packs;
request→approve purchase flow; super_admin-only model pricing and pack config.
Full design: [planbook/central-ai-token-economy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/planbook/central-ai-token-economy.md).

## Confirmed Decisions

- Pack purchase: request → admin approves.
- Out of tokens: hard stop.
- Monthly allowance: resets monthly, no rollover; purchased tokens never expire.

## Functional Context

Links:

- Functional file: [AI-Context/functional/feature-ai-token-economy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-ai-token-economy.md)

## Technical Context

Links:

- Technical file: [AI-Context/technical/ai-token-economy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/ai-token-economy.md)
- Design: [AI-Context/planbook/central-ai-token-economy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/planbook/central-ai-token-economy.md)

## Scope

In scope (this task):

- Phase 1 foundation: token-economy tables + seed, `ai_tokens.py` billing
  service, real token-usage capture in `ai.py`, unit tests. No behavior change
  (not yet wired into endpoints).

Later phases (separate follow-ups under this task):

- Phase 2: wire charging into AI / Advisor Atlas / Scholarship Hunt endpoints;
  remove old count enforcement.
- Phase 3: packs + purchase request/approve flow.
- Phase 4: admin tabs + user balance/usage UI + out-of-tokens modal.
- Phase 5: teardown of deprecated limits, hardening.

Out of scope:

- Real payment integration.
- Token rollover; purchased-token expiry; negative-balance billing.

## Acceptance Criteria (Phase 1)

- New tables exist and seed cleanly on a fresh DB.
- `ai_tokens.py` correctly computes cost, resets monthly, consumes
  subscription-before-purchased, hard-stops at zero, treats super_admin as
  unlimited, grants purchased tokens.
- `_chat_with_*` capture real usage; `chat()` exposes `usage`/`model_id`/
  `provider`.
- Existing test suite has no new failures.

## Implementation Plan

- models.py: 5 new ORM models + Float import.
- schema.py: rate setting + `ai_tokens_per_month` role limits.
- connection.py: `_seed_ai_token_defaults` (models + packs) in
  `initialize_database`.
- ai.py: provider usage capture + chat() return keys.
- ai_tokens.py: billing service.
- tests/test_ai_tokens.py.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- cost math + ceil; monthly reset; bucket order (subscription→purchased);
  out-of-tokens hard stop; grant purchased; OpenAI + Gemini usage extraction.
  Note: Admin roles do NOT grant unlimited tokens.

## File Size Check

Files expected to be edited/created:

- backend/app/db/models.py
- backend/app/db/schema.py
- backend/app/db/connection.py
- backend/app/services/ai.py
- backend/app/services/ai_tokens.py (new)
- backend/tests/test_ai_tokens.py (new)
- AI-Context/functional/feature-ai-token-economy.md (new)
- AI-Context/technical/ai-token-economy.md (new)

Line-count risk:

- Low/Medium. New logic lives in dedicated files; watch ai.py (659) and
  services/admin.py (723) in later phases.

## Verification Plan

- `pytest tests/test_ai_tokens.py` green.
- Full `tests/` run: only the pre-existing failures (plan_requests date logic,
  ai fallback shared-state) — no new regressions.

## Completion Notes

Phase 1 (foundation, behind flag — no behavior change) is implemented and
verified. No endpoint yet reads or charges AI tokens; that wiring is Phase 2.

Changed files:

- backend/app/db/models.py — 5 new ORM models (AiModels, AiTokenBalances,
  AiTokenLedger, AiTokenPacks, AiTokenPurchaseRequests) + `Float` import.
- backend/app/db/schema.py — `ai_token_rate_tokens_per_dollar` setting +
  `ai_tokens_per_month` role limits (general_user 500k, pro 2M, max 5M,
  general_admin 1M, super_admin -1).
- backend/app/db/connection.py — `_seed_ai_token_defaults()`: seeds 16 models
  from provider defaults at $0 pricing + 3 packs (small 100k/$10, medium
  500k/$40, large 1.5M/$100). Idempotent (INSERT OR IGNORE).
- backend/app/services/ai.py — `_chat_with_glm/groq/mistral/gemini` now return
  `(answer, usage)`; `_extract_openai_usage` / `_extract_gemini_usage` helpers;
  `chat()` exposes `usage` / `model_id` / `provider` on every return path.
- backend/app/services/ai_tokens.py (new) — billing service: refresh_balance
  (lazy monthly reset, no rollover), ensure_can_spend (402 hard stop),
  compute_cost (ceil, $→tokens), charge (subscription-first then purchased,
  super_admin logs-0), grant_purchased.
- backend/tests/test_ai_tokens.py (new) — 13 tests.
- backend/tests/test_ai.py — 3 provider mocks updated to `(answer, usage)`
  contract; added usage/model_id/provider assertions.

Verification completed:

- `pytest tests/test_ai_tokens.py tests/test_ai.py` → 25 passed.
- Full `tests/` (excluding 3 pre-existing collection-error files) → 148 passed,
  4 failed — all 4 are the known pre-existing failures (test_plan_requests ×3
  date-logic expecting 2026-06-06 vs today; test_ai fallback shared-state that
  passes in isolation). No new regressions.
- Fresh-DB init verified: 5 `ai_*` tables, 16 models, 3 packs, rate=10000, 5
  role-allowance rows.

Follow-ups:

- Phase 4: admin tabs (model pricing, packs, per-tier monthly max) + user
  balance/usage widget + out-of-tokens modal.
- Phase 5: teardown of deprecated count limits, hardening.

## Phase 3 — pack catalog + purchase flow (complete)

Pack catalog (super_admin config) + request→approve purchase flow, with
`grant_purchased` on approval.

Changed files:

- backend/app/api/ai_tokens.py (new) — `/ai-tokens` router: balance, packs,
  purchase-requests (submit + me), admin packs CRUD (super_admin), admin
  purchase-request queue + review (`admin_manage_token_requests`).
- backend/app/services/ai_tokens.py — `list_packs` / `get_pack` / `update_pack`
  / `submit_purchase_request` / `list_my_purchase_requests` /
  `list_purchase_requests` / `resolve_purchase_request` (approve→grant,
  reject→status; Pending-guard idempotency).
- backend/app/main.py — register the `/ai-tokens` router.
- backend/app/db/connection.py — `ai_tokens_per_month` +
  `admin_manage_token_requests` into `canonical_features`; seed
  `admin_manage_token_requests` for general_admin + super_admin.
- backend/app/db/schema.py — seed `admin_manage_token_requests` rows.
- backend/app/services/admin.py — `ai_tokens_per_month` (all 5 roles) +
  `admin_manage_token_requests` (admin roles) into `DEFAULT_ROLE_LIMITS`
  (prevents `reset_role_limits` from wiping the allowance).
- backend/tests/test_ai_tokens_packs.py (new) — 20 tests.
- AI-Context/technical/ai-token-economy.md — Phase 3 section.

Verification:

- `pytest tests/test_ai_tokens_packs.py` → 20 passed.
- Related suites (ai_tokens, ai, advisor_atlas, news, ai_actions) → 67 passed.
- Full suite (excl. pre-existing test_admin_notifications collection error):
  170 passed, 4 failed — only the known pre-existing failures
  (test_plan_requests ×3 date-logic, test_ai fallback shared-state flake that
  passes in isolation). No new regressions.

Notable fix: `ai_tokens_per_month` was absent from `canonical_features`, so
`migrate_database` deleted it every init (it survived only because `SEED_SQL`
re-inserted afterward), and `reset_role_limits` would have wiped a role's
monthly allowance. Both now corrected.

## Phase 5 — teardown + hardening (complete)

Removed the dead AI-count limits and metered the vision path.

Changed files:

- backend/app/services/ai.py — `AiService.can_spend()` + `charge_tokens()`
  helpers; `chat()` refactored to use them.
- backend/app/services/advisor_atlas/analysis.py — `analyze_visual_source`
  captures GLM `usage` and charges via `charge_tokens` (source
  `advisor_atlas_vision`).
- backend/app/db/connection.py — dropped `daily_ai_chats`, `monthly_ai_chats`,
  `advisor_atlas_searches_per_month` from `canonical_features`; removed the
  `advisor_atlas_limit_defaults` seed block.
- backend/app/db/schema.py — removed the 9 deprecated role_limits seed rows.
- backend/app/services/admin.py — removed the 9 deprecated `DEFAULT_ROLE_LIMITS`
  entries + the 3 features from the new-user `user_usage_stats` init list.
- backend/app/api/auth.py — removed the 3 features from the new-user usage
  stats init list.
- backend/tests/test_advisor_atlas_limits.py — removed 3 dead count-limit tests;
  added `test_deprecated_count_limits_are_removed`.
- backend/tests/test_advisor_atlas.py — vision test FakeAiService gained a
  no-op `charge_tokens`.
- backend/tests/test_ai_tokens.py — +2 tests for `charge_tokens`/`can_spend`.

Verification:

- `pytest tests/test_ai_tokens*.py tests/test_advisor_atlas*.py` → 80 passed.
- Full suite (excl. pre-existing test_admin_notifications collection error):
  170 passed, 4 failed — only the known pre-existing failures (plan_requests ×3
  date-logic, test_ai fallback shared-state flake). No new regressions.

Retained (by design): `ai_messages_per_session`, `web_searches_*`,
`news_searches_*`. Deprecated count limits fully removed (no longer seeded or
enforced).

## Phase 2 — endpoint wiring (complete)

Charging funnels through `AiService.chat()` via instance billing
(`user`+`session` on the service): `ensure_can_spend` before each provider
call, `charge` after. research/summarize/action-planner/Advisor Atlas inherit
it automatically through the single `chat()` funnel.

Changed files:

- backend/app/services/ai.py — `AiService(user=, session=)` + `set_billing()`;
  `ensure_can_spend` + `charge` in `chat()`.
- backend/app/services/ai_tokens.py — added `load_user_dict(user_id, session)`.
- backend/app/services/ai_actions.py — `plan()` accepts + forwards user/session.
- backend/app/api/routes.py — `/ai/chat`, `/ai/research`, `/ai/summarize`,
  `/ai/actions/plan` pass user/session; removed `daily/monthly_ai_chats`.
  Kept per-session limit, model permission, web-search counts.
- backend/app/api/news.py + news_query_generator.py — `/news/query-preview`
  ensure_can_spend + charge (OpenRouter usage surfaced); removed news count +
  search-limit gate. Search endpoints keep counts.
- backend/app/api/advisor_atlas.py + services/advisor_atlas/service.py —
  create_run pre-flight `ensure_can_spend` (no count); refresh sets billing;
  background `run()` opens a dedicated session + `set_billing`.
- tests: test_advisor_atlas_limits.py (4 tests rewritten for token gating),
  test_news_feedback.py + test_news_query_generator.py (usage surface),
  test_ai_tokens.py (+2 integration tests through chat()).

Verification:

- `pytest tests/test_ai_tokens.py tests/test_ai.py tests/test_advisor_atlas*.py
  tests/test_news*.py tests/test_ai_actions.py` → all green.
- Full suite (excl. 3 pre-existing collection-error files): 148 passed, 4
  failed — only the known pre-existing failures (test_plan_requests ×3
  date-logic, test_ai fallback shared-state). No new regressions.

## Phase 4 — frontend (complete)

User-facing token UI + super_admin config tabs. Backend model-pricing endpoints
were a Phase 4a gap (listed below) and were added before the admin tab.

Backend additions (Phase 4a):

- backend/app/services/ai_tokens.py — `list_models` / `_model_row` /
  `update_model(model_pk, *, session, input_price_per_1m, output_price_per_1m,
  display_name, is_active)` (partial update, prices ≥ 0, None if not found).
- backend/app/api/ai_tokens.py — `GET /admin/models` (super_admin) +
  `PATCH /admin/models/{model_pk}` (super_admin) + `ModelUpdatePayload`.
- backend/tests/test_ai_tokens_packs.py — +model-pricing tests (list/update,
  compute_cost flow, super_admin gating).

Frontend (Phase 4):

- frontend/src/contexts/TokenEconomyContext.tsx (new) — `TokenEconomyProvider`
  fetches `/ai-tokens/balance`, exposes `useTokenEconomy()`, hosts buy +
  out-of-tokens modals, listens for the `scholardocx:out-of-tokens` event.
  Mounted in main.tsx (AuthProvider > TokenEconomyProvider > UsageProvider).
- frontend/src/lib/tokenEvents.ts (new) — `emitOutOfTokens()` dispatcher.
- frontend/src/lib/api.ts — 402 → `emitOutOfTokens` + throw (separate from the
  generic ui-error toast channel).
- frontend/src/components/AiTokenWidget.tsx (new) — nav pill (unlimited ∞ /
  remaining subscription + purchased, colour by remaining, + affordance).
- frontend/src/components/BuyTokensModal.tsx (new) — pack catalog + Request +
  my-requests status.
- frontend/src/components/OutOfTokensModal.tsx (new) — hard-stop explainer.
- frontend/src/components/admin/ModelPricingTab.tsx (new) — super_admin
  per-model $/1M editor → `PATCH /admin/models/{id}`.
- frontend/src/components/admin/TokenPacksTab.tsx (new) — super_admin pack
  editor → `PATCH /admin/packs/{code}`.
- frontend/src/components/admin/TokenPurchaseRequestsTab.tsx (new) —
  `admin_manage_token_requests` queue → `POST review` (mirrors PlanRequestsTab).
- frontend/src/App.tsx — `AiTokenWidget` in the topbar `.top-actions`.
- frontend/src/components/AdminView.tsx — 3 new tabs registered (model pricing +
  token packs gated on `isSuperAdmin`; token requests on
  `admin_manage_token_requests`); `admin_manage_token_requests: true` added to
  optimistic `adminPermissions` defaults; LimitsTab featureGroups cleanup
  (removed daily/monthly_ai_chats + the Advisor Atlas count group; added "AI
  Tokens" group with `formatTokenCount` K/M formatter; added
  `admin_manage_token_requests` to the System Configuration admin group) +
  matching featureInfo/description updates; new lucide icons (Coins, Package,
  CircleDollarSign).
- frontend/src/lib/accessErrors.ts — FEATURE_LABELS: removed deprecated counts,
  added `ai_tokens_per_month` + `admin_manage_token_requests`.

Phase 5 frontend teardown (dead count-limit UI removed so nothing shows stale
data):

- frontend/src/components/UsageModal.tsx — removed orphaned Advisor Atlas label;
  excludes `ai_tokens_per_month` from quota bars (spend is in the balance, not
  usage_stats); added an AI Token Balance card via `useTokenEconomy`.
- frontend/src/components/AdvisorAtlasView.tsx +
  advisor-atlas/AdvisorAtlasSearchForm.tsx — removed the "Monthly limit" count
  badge (read a removed limit) and the client-side `quotaReached` submit gate;
  Advisor Atlas gated solely by tokens now (backend 402 → out-of-tokens modal).
- frontend/src/components/PlanComparisonView.tsx — core tier row
  `monthly_ai_chats` → `ai_tokens_per_month` (Monthly AI Tokens, K/M format);
  removed `daily_ai_chats` + `advisor_atlas_searches_per_month` rows.
- frontend/src/components/UsageIndicator.tsx — dead code (never imported); left.

Verification:

- `npx tsc --noEmit` → clean (exit 0).
- `npm run build` (tsc -b + vite build) → ✓ 1933 modules transformed, built.
  Only pre-existing warnings (newsApi dynamic-import + chunk size), unrelated.

Tab gating (per spec): model pricing + pack config = super_admin only (drives
real-cost metering); token-purchase-request review = `admin_manage_token_requests`
role-limit (general_admin + super_admin), mirroring plan requests.
