# Technical: AI Token Economy

Full design lives in
[planbook/central-ai-token-economy.md](../planbook/central-ai-token-economy.md).
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
  subscription_used_this_period, purchased_remaining, purchased_total,
  last_reset_at, total_spent_tokens, total_spent_usd)`.
  `subscription_remaining` is the live bucket (decremented on charge, reset to the
  tier allowance at month rollover). `subscription_used_this_period` is the
  authoritative **monthly-used** counter (incremented on charge, zeroed on rollover)
  — see SCHOLARDOCX-0086. `total_spent_tokens`/`total_spent_usd` are all-time.
- `ai_token_ledger(user_id, model_id, provider, input_tokens, output_tokens,
  cost_usd, tokens_delta signed, source, balance_bucket, ref_id, note,
  created_at)` — append-only; negative delta = consumed, positive = granted.
- `ai_token_packs(code unique, display_name, token_amount, price_usd,
  is_active, sort_order)`.
- `ai_token_purchase_requests(user_id, pack_id, status, requested_at,
  reviewed_at/by, admin_notes)`.
- `app_settings` (monthly AI credit allowance, SCHOLARDOCX-0140/0155): keys
  `plan_ai_credits_<tier>` (free/general/pro/max). Edited in Settings → Plan
  Pricing. The legacy `role_limits.ai_tokens_per_month` row is purged on every
  `initialize_database()` and is no longer surfaced in the Role Limits admin UI.
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

## Monthly-used tracking (SCHOLARDOCX-0086 — implemented)

"Used this month" is **tracked**, not derived. The previous derivation
(`monthly_allowance - subscription_remaining`, clamped ≥ 0) collapsed to 0 whenever
`subscription_remaining` exceeded the current allowance — which happens after any
mid-period plan/allowance change, because `refresh_balance` only re-syncs the
subscription bucket at month boundaries. With a bucket granted at a higher tier
(e.g. 5M `max_user`) than the current plan (2M `pro_user`), the subtraction went
negative and hid the real consumption the ledger recorded.

- `subscription_used_this_period` is incremented by `sub_used` in `charge()` (the
  subscription-bucket portion; `mixed`-bucket charges already split their sub share
  into `sub_used`). Unlimited/free calls don't touch it.
- `refresh_balance()` zeroes it on the period-rollover UPDATE; new rows default to 0.
- `GET /ai-tokens/balance` returns it as `subscription_used`.
- The migration backfills it once from `ai_token_ledger`
  (`SUM(-tokens_delta) WHERE balance_bucket IN ('subscription','mixed') AND
  substr(created_at,1,7) = subscription_period`) so existing activity is reflected
  immediately.
- Frontend reads `balance.subscription_used` directly (`UsageModal`,
  `AiTokenWidget` tooltip, `AiTokenUsageButton` topbar %). The topbar "pool" is now
  `used + remaining` (coherent) instead of `monthly_allowance + purchased_total`, so
  the numbers always add up even when the live bucket was granted at a higher tier.
- The "grant holds until month-end" policy for `subscription_remaining` is
  **unchanged** — only the *used* metric is corrected; mid-period reconciliation of
  `remaining` against the current allowance is explicitly out of scope.


## AI Usage Capture — `app/services/ai.py`

`_chat_with_glm/groq/mistral/gemini` now return `(answer, usage)` where
`usage = {input_tokens, output_tokens}`:
- GLM/Groq/Mistral/OpenRouter (OpenAI-compatible): `usage.prompt_tokens` /
  `completion_tokens`.
- Gemini: `usageMetadata.promptTokenCount` / `candidatesTokenCount`.

`chat()` adds `usage`, `model_id`, `provider` to its return dict. `research()`
and `summarize_memory()` inherit usage via the `chat()` dict they return.

- **Research Expert (SCHOLARDOCX-0174)**:
  - Paper embedding generation calls the Jina AI API (`jina-embeddings-v4`, 1024 dims) and is billed as a flat fee, not token-metered — see "Research Expert Jina embedding billing" below.
  - Analytical paper queries call `AiService.chat(..., request_label="research_paper_analysis")` which automatically meters input/output tokens via `AiService.charge_tokens`.
  - Both embedding generation and paper analysis require pre-flight token balance validation (`ensure_can_spend`) and fail with HTTP 402 if credits are zero.
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
refresh, openBuyTokens, canPurchasePacks}`. Mounted in `main.tsx` between
`AuthProvider` and `UsageProvider`. Listens for the `scholardocx:out-of-tokens`
window event (any 402 anywhere) → opens the out-of-tokens modal + refreshes
balance. `openBuyTokens` no longer opens a modal — it emits
`emitNavigate("buy-credits")` (SCHOLARDOCX-0085); the context still hosts the
out-of-tokens modal app-globally, and its "Buy AI credits" CTA also navigates to
the page.

**402 handling** (`src/lib/api.ts`): a 402 response dispatches
`emitOutOfTokens()` and throws, *before* the generic `scholardocx:ui-error`
channel — so out-of-tokens is a dedicated buy-flow modal, not a toast. All
token-economy cost is shown to users in tokens; $ stays admin-only.

**Balance widget** (`src/components/AiTokenWidget.tsx`): a compact pill showing
remaining subscription tokens (+ purchased if any) with a red/amber/emerald colour
shift by remaining. It renders a `<button>` by default (opens the buy page via
`openBuyTokens`) but accepts `interactive={false}` to render a non-interactive
`<span>` — used as the trailing balance indicator inside the Profile card's
"Buy More AI Credits" action row (SCHOLARDOCX-0085), avoiding a nested button. The
`is_unlimited` field is reserved for future extensibility but currently always
returns false (no role grants unlimited tokens).

**Buy flow (`src/components/BuyTokensView.tsx` — a full page as of
SCHOLARDOCX-0085, replacing the former `BuyTokensModal`): hidden `buy-credits`
view mirroring `PlanComparisonView` chrome (back button + title + Packs/My
Requests toggle). Lists active packs (`GET /packs`) as plan-style cards with a
Request action (`POST /purchase-requests`), the user's request history
(`GET /purchase-requests/me`) rendered in a full-width container (`w-full` with filter pills and enhanced card layout, SCHOLARDOCX-0160), and a live balance strip. Renders the upgrade
upsell (→ Choose Plan) when `canPurchasePacks` is false. Request → admin approves
→ tokens granted (never expire). No payment gateway — approval is the grant.

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

## Scholarship opportunity extraction billing (Epic-ScholarshipHunt)

> **Consolidated in SCHOLARDOCX-0136:** `can_use_scholarship_analyze` and
> `can_use_scholarship_deep_hunt` no longer exist as separate limits. The
> single `can_use_scholarship_hunt` permission now gates the entire
> scholarship suite (search, catalog cycle-check, Analyze, and Deep Hunt).
> The notes below describe the original per-feature gating for history; the
> enforcement helpers in `scholarship_opportunities.py` and
> `scholarship_deep_hunt.py` now check `can_use_scholarship_hunt`.

- `POST /scholarship-opportunities/analyze` (Phase 1 of the scholarship
  pipeline) is gated by a new boolean role limit `can_use_scholarship_analyze`
  (free/general = 0, pro/max = 1) checked via
  `check_and_increment_limit(user, "can_use_scholarship_analyze", 0, session)`
  — a permission check, not a count decrement, mirroring
  `can_use_scholarship_hunt`.
- The actual extraction call is metered like any other `AiService` call:
  `ensure_can_spend` before, `charge(..., source="scholarship_analyze")`
  after, via `AiService.set_billing()` — same funnel as Advisor Atlas.
- No new count-based limit key (`scholarship_analyze_daily`, etc.) was added.
  This follows the same direction as the Phase 5 teardown below: count limits
  on AI-metered actions were removed in favor of a boolean plan gate + token
  cost, and a new count key would work against that.
- ~~"Check current cycle" on a catalog entry reuses the existing
  `can_use_scholarship_hunt` gate and flat-fee Tavily billing
  (`_charge_scholarship_hunt` in `backend/app/api/news.py`) — no new quota
  key.~~ SUPERSEDED (SCHOLARDOCX-0176): the catalog is static-only. The
  "Check current cycle" endpoint, `_charge_scholarship_hunt`, and the
  Tavily-backed catalog path are all removed. Browsing the catalog is free
  and makes zero network calls.

## Deep Hunt run billing (SCHOLARDOCX-0125, Phase 5)

- `POST /scholarship-deep-hunt/runs` (and `/resume`) are gated by a new
  boolean role limit `can_use_scholarship_deep_hunt` (free/general = 0,
  pro/max = 1) — same `check_and_increment_limit(user,
  "can_use_scholarship_deep_hunt", 0, session)` shape as
  `can_use_advisor_atlas`, not `can_use_scholarship_analyze`'s flat-fee
  cousin. This follows Advisor Atlas's model, not the plain Hunt tab's.
- Each of a run's extraction calls (up to ~12 per run) goes through the same
  `scholarship_extraction_service.extract()` → `AiService.chat()` path as
  Phase 1's Analyze, so it is metered identically:
  `ensure_can_spend` pre-flight in the API layer, then the background
  service attaches billing via `AiService.set_billing(load_user_dict(...))`
  before running, same as Advisor Atlas's background runs.
- Tavily search calls inside a run (up to 3 passes) are **not** charged a
  flat fee. They are recorded as zero-cost ledger rows via
  `AiService.record_external_search(source="scholarship_deep_hunt_search")`,
  mirroring Advisor Atlas's own search calls — cost stays 0, but the call
  still surfaces in the admin Tavily usage dashboard.
- No new count-based daily/monthly limit key was added for Deep Hunt, for
  the same reason `can_use_scholarship_analyze` didn't get one: count limits
  on AI-metered actions were removed project-wide in the Phase 5 teardown
  above in favor of gate + token cost.

## Research Expert Jina embedding billing (SCHOLARDOCX-0174)

Jina AI (`jina-embeddings-v4`) generates the vector embeddings used by the
Research Expert feature for paper chunk storage and analysis-query retrieval.
Unlike the AI-metered providers above, Jina is billed as a **flat fee per user
operation** — the same model Tavily uses for web/Scholarship Hunt searches.

- **Setting key**: `app_settings.jina_call_cost_usd` (default `0.002`), seeded
  by `schema.py` SEED_SQL and editable in the admin **Settings → External APIs
  & Agents Pricing** modal (`SettingsTab.tsx`). Read at call time via
  `get_jina_call_cost_usd(session)` in `ai_tokens.py`.
- **Charge**: `charge_flat_fee(user, session, cost_usd, source=...)`, **exactly
  one** fee per user-visible operation, raised **after** every Jina HTTP batch
  for that operation has returned successfully (so a paper needing 20 batches
  still costs one fee, and a failed run costs nothing). Lives in
  `ResearchPaperService._charge_jina_embedding()`, invoked via the
  `charge_source` parameter of `_generate_embeddings()`:
  - upload → `source="jina_embedding"`
  - retry → `source="jina_embedding_retry"`
  - analyze query embedding → `source="jina_embedding_query"`
- **Single-charge invariant**: `_generate_embeddings()` is the only place a Jina
  fee is raised, and it raises at most one. Callers that wrap it (such as
  `_generate_single_embedding()`) pass their own `charge_source` rather than
  charging separately. Fixed in SCHOLARDOCX-0180: the query path previously
  charged inside `_generate_embeddings` *and* again in
  `_generate_single_embedding`, billing every analysis question twice.
- **Correct setting key**: `_charge_jina_embedding()` reads the price through
  `ai_tokens.get_jina_call_cost_usd()`. Also fixed in SCHOLARDOCX-0180: it
  previously queried a `research_paper_jina_cost_usd` key that is seeded nowhere,
  so it always fell through to a hardcoded `0.005` and silently ignored whatever
  an admin had configured. Combined with the double charge, an analysis query
  cost `2 × 0.005 = 0.01` USD-equivalent against a configured price of `0.002`.
- **Pre-flight**: `ensure_can_spend()` runs before each call and raises
  `OutOfTokens` (HTTP 402) on insufficient balance.
- **Gate**: no separate Jina role limit — access is covered by the existing
  `can_use_research_reader` gate (Pro/Max). Jina is a hard dependency of the
  feature, so disabling Research Expert disables Jina transitively.
- **Dashboard**: the admin dashboard reports `jina_total` — count of ledger
  rows whose `source` is one of the three Jina labels (alongside the existing
  `tavily_*` counts).
- **What changed**: the prior token-metered path (`ai_tokens.charge(...,
  provider="jina", model_id="jina-embeddings-v4")`) was **removed** in favor of
  the flat fee so pricing is admin-configurable in one place. The `ai_models`
  row for `jina-embeddings-v4` remains as a pricing reference only and no
  longer drives billing.

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
