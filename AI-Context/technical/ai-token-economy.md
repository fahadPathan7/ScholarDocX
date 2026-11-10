# Technical: AI Credit Economy

How credits work. **How a provider call must be billed is owned by
[billing-contract.md](billing-contract.md)** (the API, enforcement points, gates, and the checklist for
adding a provider); this file does not restate it. Code names: tokens in code and the database,
"credits" in anything users read. Original design: [planbook/central-ai-token-economy.md](../planbook/central-ai-token-economy.md).

## Two currencies

- **Real cost ($)**: from per-model pricing in `ai_models`: `cost_usd = in*in_price/1e6 + out*out_price/1e6`.
- **User credits**: `tokens = ceil(cost_usd * rate)` with `app_settings.ai_token_rate_tokens_per_dollar`
  (default 10000, i.e. 1 credit per $0.0001).

Admins see and manage dollars; users see and spend credits. Seeded models ship at $0, so real metering
starts once a price is set in the admin Model Pricing tab. Admins do not get unlimited credits and do not
bypass limits.

## Tables

- `ai_models`: provider, model id, display name, input/output price per 1M, active, sort order; unique on (provider, model id).
- `ai_token_balances` (one row per user): `subscription_remaining` (live monthly bucket, reset to the tier allowance at month rollover), `subscription_used_this_period` (tracked monthly-used counter, zeroed on rollover), `purchased_remaining` / `purchased_total` (never expire), `total_spent_tokens` / `total_spent_usd` (all time).
- `ai_token_ledger`: append-only; negative `tokens_delta` = consumed, positive = granted; carries model, provider, token counts, cost, `source`, `balance_bucket`, `ref_id`.
- `ai_token_packs` and `ai_token_purchase_requests`: the pack catalog and the request/approval queue.
- `app_settings`: `plan_ai_credits_<tier>` (free/general/pro/max monthly allowance, edited in Settings -> Plan Pricing) and the rate above. The legacy `role_limits.ai_tokens_per_month` row is purged on every `initialize_database()`.

## Spending rules

- A charge consumes the subscription bucket first, then purchased credits, atomically, writing ledger rows. A zero balance hard-stops with HTTP 402 (`OutOfTokens`); the frontend turns any 402 into the out-of-credits flow, not a toast.
- "Used this month" is tracked (`subscription_used_this_period`), not derived. Deriving it as allowance minus remaining went negative after mid-period plan changes. The grant "holds until month end" policy for `subscription_remaining` is unchanged.
- Token-metered calls go through `AiService.chat()` (`backend/app/services/ai.py`), which captures provider `usage` (input/output tokens) and charges. Optional enrichment (for example Advisor Atlas vision) is charge-after with no pre-check so it never aborts a run.
- Metering replaced the old count limits: `daily_ai_chats`, `monthly_ai_chats`, and Advisor Atlas search counts no longer exist. Retained limits: `ai_messages_per_session`, model permission checks, and external search counts (`web_searches_*`, `news_searches_*`).
- Provider fees that are not token-metered are flat fees set in admin Settings -> External APIs & Agents Pricing: `tavily_*`, `jina_call_cost_usd` (0.002), `openalex_call_cost_usd` (0.001), and a per-hit Brave cost (read via `get_brave_call_cost_per_hit_usd`).

## Packs and purchases (router `/ai-tokens`, `backend/app/api/ai_tokens.py`)

- User: `GET /balance` (remaining, allowance, spend totals, rate, `subscription_used`, `can_purchase_packs`), `GET /packs`, `POST /purchase-requests {pack_code}`, `GET /purchase-requests/me`.
- Admin: `/admin/packs` and `/admin/models` (super_admin only; partial updates validated), `/admin/purchase-requests` queue and `.../{id}/review` approve/reject (permission `admin_manage_token_requests`).
- Approval calls `grant_purchased` (source `pack_purchase`) and is idempotent: the Pending-status guard makes a second review raise instead of granting twice. There is no payment gateway in this flow; approval is the grant.
- Buying packs is gated per plan by the boolean role limit `can_purchase_token_packs` (free/basic 0, pro/max 1). `GET /balance` reports it via a read-only check (`can_purchase_packs`) that mirrors the guard without writing usage rows, so the buy UI matches the API. When off, the buy page shows an upgrade upsell.

## Frontend

- `TokenEconomyContext` (`src/contexts/`) loads the balance, exposes `useTokenEconomy()` (`balance`, `refresh`, `openBuyTokens`, `canPurchasePacks`), and hosts the out-of-credits modal (triggered by the `scholardocx:out-of-tokens` event from any 402 in `src/lib/api.ts`). `openBuyTokens` navigates to the full-page Buy Credits view (`BuyTokensView`).
- `AiTokenWidget` (balance pill, red/amber/emerald by remaining), `AiTokenUsageButton` (top-bar usage), and `UsageModal` (balance card plus quota bars; `ai_tokens_per_month` is excluded from the bars because its spend lives in the balance).
- Admin tabs in `src/components/admin/`: `TokenPacksTab` and `ModelPricingTab` (super_admin), `TokenPurchaseRequestsTab` (`admin_manage_token_requests`).
- Cross-view navigation uses the `scholardocx:navigate` window event (`lib/tokenEvents.ts`).

## How specific features are billed

Gates: `can_use_scholarship_hunt` covers the whole scholarship suite (search, Analyze, Deep Hunt); Research Expert uses `can_use_research_reader`; Advisor Atlas uses `can_use_advisor_atlas`. All are plan checks (`limit_count` 1/0), not counters.

- **Scholarship Analyze and Deep Hunt extraction** go through `AiService.chat()`: pre-flight in the API layer, then the background service attaches billing before running. Deep Hunt search uses Brave and charges every raw hit before filtering, with a worst-case pre-flight at run creation ([ai-integrations.md](ai-integrations.md)). The scholarship catalog is static, free, and makes no network calls.
- **Search cache** (`services/search_cache.py`): 15-minute, per-user, in-process. A cache hit is not a provider call, so it is not charged; keys always include the user id.
- **Worst-case pre-flight ceilings**: `/ai/research` (Tavily fee plus a conservative answer ceiling from `RESEARCH_MAX_INPUT_TOKENS` / `RESEARCH_MAX_OUTPUT_TOKENS` in `services/ai.py`), Research Expert analysis (`estimate_analysis_cost` in `research_paper_estimates.py`, shipped as `analysis_cost_estimate`), and Advisor Atlas run creation (`estimate_run_cost` in `services/advisor_atlas/cost_estimate.py`, shipped as `cost_estimate`). If real usage still exceeds a ceiling the flow fails 402 with honest copy.
- **Research Expert embeddings (Jina)**: one flat charge per user operation (`charge_source` values `jina_embedding`, `_retry`, `_query`): `jina_call_cost_usd` plus the input tokens priced from the `ai_models` row for the embedding model. It is raised only after every Jina batch for that operation succeeds, so a failed run costs nothing. **Single-charge invariant**: `_generate_embeddings()` is the only place the fee is raised; wrappers pass `charge_source` and never charge again (a double charge once billed every analysis question twice, SCHOLARDOCX-0180). The price is read through `get_jina_call_cost_usd`, never a hardcoded fallback.
- **Advisor Atlas OpenAlex**: a flat fee, `openalex_call_cost_usd`, charged once per professor resolved (one metered search; lookups after it are free), on the call rather than the match, and only when a request was actually issued (`OpenAlexClient.attempted_metered_call`). Deep runs only. Pre-flight with `AiService.can_spend_external()`; a user at zero skips enrichment. The single charge site is `_attach_scholarly_record` in `advisor_atlas/service.py`; the client never bills. `charge_external_call` and `external_billing_cost` never raise, so a billing error cannot fail a run.
- **Advisor Atlas Tavily and vision** are charged via `charge_external_call` and `charge_tokens`; out-of-credits stops the work (Discovery's per-candidate handler re-raises `OutOfTokens`).
- The admin dashboard counts calls per provider from ledger `source` values (`tavily_*`, `jina_*`, `openalex_author_lookup`).

## Structural guarantees

The call-site rules and the static guard (`make guard-billing`) live in [billing-contract.md](billing-contract.md). Related invariants that live in this domain:

- `app/auth/plan_state.py` is the only place plan expiry is applied; `get_current_user` and `load_user_dict` both use it, so a background run resolves the same tier as a live request. `load_user_dict` returns no roles for a suspended account.
- A missing `role_limits` row denies (`check_and_increment_limit` raises, `get_user_limit` returns 0, with an ERROR log). A test asserts every dynamically referenced feature has a `DEFAULT_ROLE_LIMITS` entry; keep it passing before adding a gate. New limits must be declared in all seed sites (`schema.py`, `connection.py` seed and `canonical_features`, `services/admin.py` `DEFAULT_ROLE_LIMITS`).
- `compute_cost` resolves an unknown model through `_lookup_price` (exact model, then the provider house rate), logs an ERROR when neither resolves, and `validate_model_pricing()` runs at startup.
- A "record but do not charge" helper must not exist (BD-011); a test asserts `record_external_search` stays gone.

## Rules

- All costs shown to users are in credits; dollars stay admin-only.
- Never raise a second charge for one user-visible operation.
- Pack purchases are request-and-approve; the purchased bucket never expires.
