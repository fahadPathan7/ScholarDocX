# Technical: AI Token Economy

Full design lives in
[planbook/central-ai-token-economy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/planbook/central-ai-token-economy.md).
This file is the condensed technical reference for implementers.

## Two-Currency Model

- **Real cost ($)**: computed from per-model pricing in `ai_models`.
  `cost_usd = in*in_price/1e6 + out*out_price/1e6`.
- **User tokens**: deducted at the configurable rate
  `ai_token_rate_tokens_per_dollar` (default 10000 → 1 token per $0.0001).
  `tokens = ceil(cost_usd * rate)`.

Admins see/manage $; users see/spend tokens.

## Tables (additive)

- `ai_models(provider, model_id, display_name, input_price_per_1m,
  output_price_per_1m, is_active, sort_order)` — unique `(provider, model_id)`.
- `ai_token_balances(user_id pk, subscription_remaining, subscription_period,
  purchased_remaining, last_reset_at, total_spent_tokens, total_spent_usd)`.
- `ai_token_ledger(user_id, model_id, provider, input_tokens, output_tokens,
  cost_usd, tokens_delta signed, source, balance_bucket, ref_id, note,
  created_at)` — append-only; negative delta = consumed, positive = granted.
- `ai_token_packs(code unique, display_name, token_amount, price_usd,
  is_active, sort_order)`.
- `ai_token_purchase_requests(user_id, pack_id, status, requested_at,
  reviewed_at/by, admin_notes)`.
- `role_limits` reuse: feature `ai_tokens_per_month` (reset_period `monthly`).
- `app_settings`: `ai_token_rate_tokens_per_dollar`.

## Billing Service — `app/services/ai_tokens.py`

- `refresh_balance(user, session)` — lazy row creation + monthly reset of the
  subscription bucket to the tier allowance.
- `get_role_monthly_allowance(user, session)` — returns the allowance for the user's tier (max_user, pro_user, general_user). Admins do not get unlimited tokens or bypass limits; they must have a user role to receive any tokens.
- `ensure_can_spend(user, session, min_tokens=1)` — raises `OutOfTokens`
  (HTTP 402) on zero balance. Hard stop.
- `compute_cost(model_id, in, out, session)` → `(cost_usd, tokens)`.
- `charge(user, model_id, provider, in, out, source, session, ref_id=None)` —
  atomic: consume subscription first then purchased; append ledger rows.
- `grant_purchased(user_id, tokens, session, source, note, ref_id)` — for pack
  approval / admin grants.

## AI Usage Capture — `app/services/ai.py`

`_chat_with_glm/groq/mistral/gemini` now return `(answer, usage)` where
`usage = {input_tokens, output_tokens}`:
- GLM/Groq/Mistral/OpenRouter (OpenAI-compatible): `usage.prompt_tokens` /
  `completion_tokens`.
- Gemini: `usageMetadata.promptTokenCount` / `candidatesTokenCount`.

`chat()` adds `usage`, `model_id`, `provider` to its return dict. `research()`
and `summarize_memory()` inherit usage via the `chat()` dict they return.

**Charging (Phase 2, implemented):** `AiService` takes optional `user`+`session`
billing context (constructor or `set_billing()`). When set, `chat()` runs
`ai_tokens.ensure_can_spend()` before each provider call and `ai_tokens.charge()`
after — so research / summarize / action-planner / Advisor Atlas all meter
automatically through the single `chat()` funnel, per-call and per-model, with
no method-signature threading. Endpoints pass `user=current_user, session=store.db`.
Advisor Atlas background runs open a dedicated `sessionmaker` session and call
`set_billing()` (the request store is closed by then). The OpenRouter
scholarship-query generator is not an `AiService` call, so `/news/query-preview`
charges it explicitly from the surfaced `usage`.

## Wiring (Phase 2 — implemented)

- `/ai/chat`, `/ai/research`, `/ai/summarize`, `/ai/actions/plan`: removed
  `daily_ai_chats` + `monthly_ai_chats` enforcement; metered by tokens via the
  `chat()` funnel. KEPT: `ai_messages_per_session` (per-session context guard),
  `verify_model_permission` (role can/cannot), and web-search counts
  (`can_use_web_search`, `web_searches_per_day/_month`) — external Tavily
  searches are not token-metered.
- `/news/query-preview` (Scholarship Hunt query build): removed the
  `news_searches_per_*` count and the search-limit gate; now `ensure_can_spend`
  + `charge` for the OpenRouter call (source `scholarship_query_build`). The
  actual searches (`/news/search` POST+GET) KEEP their daily/monthly counts.
- Advisor Atlas `/runs` (create) + `/candidates/{id}/refresh`: removed
  `advisor_atlas_searches_per_month`; `ensure_can_spend` pre-flight + per-call
  charging via the service's `AiService` (background run uses a dedicated
  session).
- Deprecated count limits torn out (Phase 5): `daily_ai_chats`,
  `monthly_ai_chats`, `advisor_atlas_searches_per_month` are removed from the
  schema seed, `DEFAULT_ROLE_LIMITS`, the new-user `user_usage_stats` init
  lists, and `canonical_features` (so `migrate_database` deletes any leftover
  rows on existing DBs). AI chat / Advisor Atlas usage is metered solely by
  tokens; `ai_messages_per_session` (per-session guard) and the external search
  counts (`web_searches_*`, `news_searches_*`) are retained.

## Vision charging + AiService helpers (Phase 5 — implemented)

`AiService` exposes `can_spend()` (ensure_can_spend guard) and
`charge_tokens(model_id, provider, input_tokens, output_tokens, source,
ref_id)` — both no-ops when no billing context is attached. `chat()` uses them.
`advisor_atlas/analysis.py::analyze_visual_source` (raw httpx GLM vision call)
now captures the OpenAI-compatible `usage` and calls `charge_tokens`
(source `advisor_atlas_vision`). Charge-after, no pre-check, so an optional
enrichment never aborts a run; the next required call hard-stops if the balance
is truly empty.

## Pack catalog + purchase flow (Phase 3 — implemented)

New router `app/api/ai_tokens.py` (prefix `/ai-tokens`):

- `GET /balance` — subscription + purchased remaining, monthly allowance, spend
  totals, rate, `is_unlimited`. Refreshes the subscription bucket on read.
- `GET /packs` — active packs (buy UI).
- `POST /purchase-requests` `{pack_code}` — creates a Pending request (FK to
  `ai_token_packs.id`). Rejects inactive/unknown packs (404).
- `GET /purchase-requests/me` — caller's own requests.
- `GET /admin/packs` — all packs incl. inactive (super_admin).
- `PATCH /admin/packs/{code}` — super_admin config: price, token grant amount,
  display name, active flag (partial update; validates token_amount > 0,
  price_usd ≥ 0).
- `GET /admin/purchase-requests?status=` — admin queue (joins user + pack).
- `POST /admin/purchase-requests/{id}/review` `{action, admin_notes}` —
  approve/reject. Approve calls `grant_purchased` (source `pack_purchase`,
  ref the request id) and marks Approved; reject marks Rejected.
- `GET /admin/models` — all models with per-1M-token pricing (super_admin).
- `PATCH /admin/models/{model_pk}` `{input_price_per_1m, output_price_per_1m,
  display_name, is_active}` — super_admin model-pricing config; partial update,
  validates prices ≥ 0. This is what feeds `compute_cost`, so real usage metering
  only begins once a price is set here (seeded models ship at $0 = free).

Service functions live in `ai_tokens.py`: `list_packs` / `get_pack` /
`update_pack` / `submit_purchase_request` / `list_my_purchase_requests` /
`list_purchase_requests` / `resolve_purchase_request`. Approval is idempotent:
the Pending-status guard makes a second review raise instead of granting twice.

Permissions:

- Pack pricing/config = super_admin only (router uses `require_super_admin`).
- Request approve/reject + queue = new permission `admin_manage_token_requests`,
  seeded for general_admin + super_admin (1, never), gated via
  `check_and_increment_limit` exactly like `admin_manage_plan_requests`.

Permission hygiene fixes folded in:

- `ai_tokens_per_month` added to `canonical_features` (was delete-then-reseeded
  by `migrate_database` on every init) and to `DEFAULT_ROLE_LIMITS` — otherwise
  an admin "reset role limits" would wipe the monthly allowance.
- `admin_manage_token_requests` added to all four declaration sites
  (`schema.py` seed, `connection.py` seed + `canonical_features`,
  `services/admin.py` `DEFAULT_ROLE_LIMITS`).

## Per-plan token-pack purchasing (SCHOLARDOCX-0083 — implemented)

Purchasing packs is gated by a boolean role limit `can_purchase_token_packs`
(stored like `can_use_web_search`: `limit_count` 1/0, `reset_period='never'`).
No new tables — it reuses `role_limits`.

Seeding (4 user tiers only; admin roles are intentionally not seeded because
the enforcement resolver `get_primary_user_role` ignores them for non-`admin_`
features, so admin rows would be inert):

- `DEFAULT_ROLE_LIMITS` (`services/admin.py`), `SEED_SQL` (`schema.py`), and the
  `connection.py` migration seed block + `canonical_features` set all carry:
  free_user=0, general_user=0, pro_user=1, max_user=1.

Enforcement:

- `POST /ai-tokens/purchase-requests` calls
  `_require_feature("can_purchase_token_packs", current_user, store.db)` before
  creating the request → 403 when off. `_require_feature` uses
  `check_and_increment_limit(..., 0, session)` (permission check, no increment).

Balance exposure:

- `GET /ai-tokens/balance` adds `can_purchase_packs: bool`. Computed by a
  read-only `ai_tokens.can_purchase_packs(user, session)` that resolves the
  user's primary role and reads `limit_count` (true unless the row is 0). This
  is read-only (does NOT call `check_and_increment_limit`, which would write a
  `user_usage_stats` row on every balance read) and mirrors the guard's
  allow/block outcome so the buy UI matches the API.

Frontend:

- `useTokenEconomy()` exposes `canPurchasePacks` from the balance response.
  `BuyTokensModal` renders an **upgrade upsell** (link to Choose Plan) instead
  of the pack list when `canPurchasePacks` is false. `PlanComparisonView` adds a
  boolean feature row "Extra AI tokens purchasable" (✓/✗) from `GET /auth/plans`.
  Admin `LimitsTab` exposes the toggle (key starts with `can_` → auto-toggle).
  Navigating to Choose Plan from the upsell uses a `scholardocx:navigate`
  window event (`lib/tokenEvents.ts`), handled in `App.tsx` → `setActiveTab("plans")`.

## Frontend (Phase 4 — implemented)

**Token economy context** (`src/contexts/TokenEconomyContext.tsx`): fetches
`GET /ai-tokens/balance`, exposes `useTokenEconomy()` → `{balance, loading,
refresh, openBuyTokens}`. Mounted in `main.tsx` between `AuthProvider` and
`UsageProvider`. Listens for the `scholardocx:out-of-tokens` window event (any
402 anywhere) → opens the out-of-tokens modal + refreshes balance. Hosts the buy
+ out-of-tokens modals so they're app-global.

**402 handling** (`src/lib/api.ts`): a 402 response dispatches
`emitOutOfTokens()` and throws, *before* the generic `scholardocx:ui-error`
channel — so out-of-tokens is a dedicated buy-flow modal, not a toast. All
token-economy cost is shown to users in tokens; $ stays admin-only.

**Nav widget** (`src/components/AiTokenWidget.tsx`): compact pill in the App
topbar (`.top-actions`). Shows remaining subscription tokens (+ purchased if any).
Colour shifts red/amber/emerald by remaining; a `+` affordance opens the buy modal.
The `is_unlimited` field in the balance response is reserved for future extensibility
but currently always returns false (no role grants unlimited tokens).

**Buy flow** (`src/components/BuyTokensModal.tsx`): lists active packs
(`GET /packs`) with a Request button (`POST /purchase-requests`) and the user's
own request history (`GET /purchase-requests/me`). Request → admin approves →
tokens granted (never expire). No payment gateway — approval is the grant.

**Out-of-tokens modal** (`src/components/OutOfTokensModal.tsx`): explains the
hard stop, offers Buy tokens / Maybe later.

**Admin tabs** (`src/components/admin/`), registered in `AdminView.tsx`:
- `TokenPacksTab.tsx` — super_admin. Editable pack rows (display name, token
  amount, price, active toggle) → `PATCH /admin/packs/{code}`.
- `ModelPricingTab.tsx` — super_admin. Editable per-model $/1M input/output
  prices, display name, active toggle → `PATCH /admin/models/{id}`.
- `TokenPurchaseRequestsTab.tsx` — `admin_manage_token_requests` permission.
  Status-filtered queue (joins user + pack) → `POST /admin/purchase-requests/{id}/review`.

Tab gating: model pricing + token packs are super-admin only (real-cost
metering); token-purchase-request review is the `admin_manage_token_requests`
role-limit (general_admin + super_admin), mirroring plan requests.

**LimitsTab cleanup** (`AdminView.tsx`): removed `daily_ai_chats`,
`monthly_ai_chats` from the "AI Chat" group and deleted the whole "Advisor
Atlas" count group; added an "AI Tokens" group for `ai_tokens_per_month`
(with a `formatTokenCount` K/M formatter and `Unlimited` for -1) and an
`ai_tokens_per_month` info-modal entry. Added `admin_manage_token_requests` to
the "System Configuration" admin group and the optimistic `adminPermissions`
defaults. `src/lib/accessErrors.ts` `FEATURE_LABELS` updated likewise.

**User-facing limit teardown (Phase 5 frontend completion):** removed the dead
count-limit UI left by the backend teardown so nothing shows stale data:

- `UsageModal.tsx` — dropped the orphaned Advisor Atlas label; excludes
  `ai_tokens_per_month` from the quota bars (its spend lives in the balance, not
  `usage_stats`, so a 0/N bar would mislead); added an **AI Token Balance** card
  (subscription / purchased / spend) via `useTokenEconomy`.
- `AdvisorAtlasView.tsx` + `advisor-atlas/AdvisorAtlasSearchForm.tsx` — removed
  the "Monthly limit" count badge (read a removed limit → always "Unlimited")
  and the client-side `quotaReached` submit gate; Advisor Atlas is now gated
  solely by tokens (backend 402 → out-of-tokens modal). `Gauge` import dropped.
- `PlanComparisonView.tsx` — replaced `monthly_ai_chats` in the core tier grid
  with `ai_tokens_per_month` (Monthly AI Tokens, K/M format); removed
  `daily_ai_chats` and `advisor_atlas_searches_per_month` rows.
- `UsageIndicator.tsx` is dead code (never imported); left untouched.

## Remaining phases

- None — Phases 1–5 complete (metering, teardown, model pricing, packs +
  purchase flow, frontend admin tabs + user widget + out-of-tokens flow).

## Rules

- Every provider call is charged, including internal/auxiliary calls.
- Failed calls with no usage are voided; usage returned before an error is
  charged.
- Deduction is atomic per call (single transaction) to avoid balance drift.
- Charging happens after the call (output tokens unknown beforehand); the only
  overshoot is the final call that empties the balance, after which the next
  call is hard-stopped.
- Deprecated count limits (`daily_ai_chats`, `monthly_ai_chats`,
  `advisor_atlas_searches_per_month`) were **removed outright** in Phase 5 (not
  left dormant): deleted from the schema seed, `DEFAULT_ROLE_LIMITS`, the
  new-user `user_usage_stats` init lists, and `canonical_features`, so
  `migrate_database` scrubs any leftover rows on existing DBs. AI chat and
  Advisor Atlas usage is metered solely by tokens now.
