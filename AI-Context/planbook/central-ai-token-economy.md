# Planbook — Central AI Token Economy

Status: Draft (awaiting implementation Jira task)
Owner: AI Agent
Created: 2026-06-26
Related: SCHOLARDOCX-0081 (RBAC guard hardening), future Jira task TBD

---

## 1. Goal

Replace the count-based AI limits (X chats/day, Y chats/month, Z advisor-atlas
runs/month) with a single **central AI token economy**:

- Every AI call (chat, research, summarize, advisor-atlas passes, scholarship
  query generation) is metered by **real input + output tokens** and charged
  against the user's token balance.
- Users get a **monthly token allowance per subscription tier** (resets
  monthly, no rollover) and can **buy Extra Token packs** (Small/Medium/Large)
  via an admin-approved request flow.
- Role-based **can/can't use** permissions stay (provider gates, agents gate).
- The **daily/monthly count limits are removed** for AI usage.
- Scholarship Hunt **keeps** its daily/monthly **search** limits (Tavily/web
  search cost), but the **query-building** AI step no longer counts against
  those — it consumes AI tokens instead.

---

## 2. Current State (grounded in code)

- **Limit engine**: `app/auth/limits.py` — `check_and_increment_limit`,
  `get_user_limit`. Data in `role_limits(role, feature, limit_count,
  reset_period)` and `user_usage_stats(user_id, feature, current_count,
  last_reset_at)`. Includes a monthly plan-date guard.
- **AI features currently limited by counts**:
  - `ai_messages_per_session`, `daily_ai_chats`, `monthly_ai_chats`
    (`routes.py` ai endpoints).
  - `advisor_atlas_searches_per_month` (`advisor_atlas.py` create_run +
    refresh).
  - `news_searches_per_day`, `news_searches_per_month` (`news.py`; the
    query-preview AI step ALSO increments these today — must change).
  - Role gates that **stay**: `can_use_glm/gemini/groq/mistral`,
    `can_use_agents`, `can_use_web_search`, `web_searches_per_day/_month`.
- **Providers**: GLM, Gemini, Groq, Mistral (+ OpenRouter free model for news
  query gen). Model lists are hardcoded constants in `app/services/ai.py`.
- **CRITICAL GAP**: `_chat_with_glm/groq/mistral/gemini` (`ai.py:443-515`)
  return **only the answer text and discard the provider usage object**
  (`usage.prompt_tokens`/`completion_tokens` for the OpenAI-compatible ones;
  `usageMetadata.promptTokenCount`/`candidatesTokenCount` for Gemini). There
  is no real token accounting anywhere — only `len(text)//4` estimates used
  for context budgeting. **Capturing real usage is the foundation of this
  feature.**
- **`users` table** has no balance/credits columns. Greenfield accounting.
- **Existing request/approve pattern** to mirror: `plan_upgrade_requests` +
  `/admin/plan-requests/.../review` + `/auth/plans/request`.

---

## 3. Confirmed Design Decisions

| Decision | Choice | Implication |
|---|---|---|
| Pack purchase flow | **Request → admin approves** | New `ai_token_purchase_requests` table; mirrors plan-extension flow; payment settled outside app |
| Out-of-tokens behavior | **Hard stop** | Pre-check `balance > 0`; block with clear message + buy CTA; no negative balance debt |
| Monthly allowance lifecycle | **Monthly reset, no rollover** | Subscription bucket resets to tier cap each month; purchased bucket persists |

**Additional defaults (documented; flag if you want different):**

- **Two-currency model** (see §4): real $ cost tracked internally; users
  see/spend a unified **token** balance.
- **Consumption order**: subscription tokens consumed first, then purchased.
- **Purchased tokens never expire** (persistent until spent).
- **Every provider call is charged**, including internal/auxiliary calls
  (routing, background model, advisor-atlas analysis/vision passes, memory
  summaries). One user action can produce multiple charges.
- **Failed provider calls are voided** (no charge) when no usage object is
  returned; if the provider returns usage before erroring, that usage is
  charged (we were billed).
- **Super_admin**: treated as unlimited (no monthly cap) for usability.
- **10,000 tokens = $1** is stored as a configurable app_setting
  (`ai_token_rate_tokens_per_dollar`, default 10000), not a hardcoded literal.

---

## 4. Token Math (the core model)

Two money notions, bridged by the configurable rate:

```
real_cost_usd   = (input_tokens  * model.input_price_per_1m  / 1_000_000)
                + (output_tokens * model.output_price_per_1m / 1_000_000)

tokens_to_deduct = ceil(real_cost_usd * ai_token_rate_tokens_per_dollar)
                 # default rate 10000 → 1 token per $0.0001 of real cost
```

- **Admin** manages real per-model pricing (input + output per 1M tokens) →
  accurate provider cost tracking and reporting in **$**.
- **Users** are granted and spend **tokens**. Allowances and packs are
  denominated in tokens.
- **Pack pricing**: admin sets both `token_amount` and `price_usd`
  independently (the rate implies a fair value, but margin is admin-controlled).
- Deducted tokens are **integer** (ceil per charge to avoid undercharging).

Example: GLM-5.2 at $0.50/1M in, $2.00/1M out. A call using 2,000 in + 800 out
→ cost = (2000·0.5 + 800·2)/1e6 = $0.0026 → deducts 26 tokens.

---

## 5. Data Model (additive; SQLite)

Reuse the existing `role_limits` table for the **per-tier monthly allowance**
(feature key `ai_tokens_per_month`, `reset_period='monthly'`). Everything else
is new.

### 5.1 `ai_models` — model registry + real pricing (super_admin-managed)
| column | type | notes |
|---|---|---|
| id | int pk | |
| provider | text | glm/gemini/groq/mistral/openrouter |
| model_id | text | canonical id, e.g. `GLM-5.2` |
| display_name | text | picker label |
| input_price_per_1m | real | $ per 1M input tokens |
| output_price_per_1m | real | $ per 1M output tokens |
| is_active | int | 1 = selectable |
| created_at / updated_at | text | |

Seed from the existing hardcoded model lists with placeholder $0 pricing;
super_admin sets real values.

### 5.2 `ai_token_balances` — fast per-user balance (denormalized)
| column | type | notes |
|---|---|---|
| user_id | int pk → users | |
| subscription_remaining | int | tokens; resets monthly to tier cap |
| subscription_period | text | 'YYYY-MM' current bucket |
| purchased_remaining | int | tokens; persistent |
| last_reset_at | text | |
| total_spent_tokens | int | running lifetime spend (tokens) |
| total_spent_usd | real | running lifetime real cost |

A balance row is lazily created on first AI touch / login. Monthly reset is
evaluated on read (compare `subscription_period` to current month; if stale,
reset `subscription_remaining` to the user's tier allowance and bump period).

### 5.3 `ai_token_ledger` — append-only audit of every charge
| column | type | notes |
|---|---|---|
| id | int pk | |
| user_id | int → users | |
| model_id | text | denormalized for history |
| provider | text | |
| input_tokens | int | |
| output_tokens | int | |
| cost_usd | real | real per-model cost |
| tokens_charged | int | tokens deducted (post-rate) |
| source | text | chat/research/summarize/agent_plan/agent_exec/advisor_atlas/news_query/memory |
| balance_bucket | text | 'subscription' or 'purchased' (or split rows) |
| ref_id | int null | e.g. ai_conversation_id / advisor run_id |
| created_at | text | |

Append-only. The authoritative history; `ai_token_balances` is the
denormalized fast-read projection.

### 5.4 `ai_token_packs` — purchasable pack catalog (super_admin-managed)
| column | type | notes |
|---|---|---|
| id | int pk | |
| code | text unique | small/medium/large |
| display_name | text | |
| token_amount | int | tokens granted on approval |
| price_usd | real | |
| is_active | int | |
| sort_order | int | |

Seed Small/Medium/Large placeholders.

### 5.5 `ai_token_purchase_requests` — user request → admin approve
Mirrors `plan_upgrade_requests`.
| column | type | notes |
|---|---|---|
| id | int pk | |
| user_id | int → users | |
| pack_id | int → ai_token_packs | |
| status | text | Pending/Approved/Rejected |
| requested_at | text | |
| reviewed_at / reviewed_by | text / int | |
| admin_notes | text | |

On **approval**: grant `pack.token_amount` to `purchased_remaining`, write a
ledger row (`source='purchase'`, `balance_bucket='purchased'`,
`tokens_charged` negative-equivalent grant), audit-log.

### 5.6 (optional) `ai_token_admin_adjustments`
For manual admin grants/deductions with a reason, so manual tweaks are
auditable separate from consumption. Could fold into ledger with
`source='admin_grant'`.

**Migration**: additive only. Add via `migrate_database()` ALTER checks +
`Base.metadata.create_all`. Backfill: every existing user gets a balance row;
`subscription_remaining` seeded to their tier allowance for the current month;
`purchased_remaining = 0`. Old count features (`daily_ai_chats`, etc.) stay in
`role_limits`/`user_usage_stats` but are **no longer enforced** (deprecated,
not dropped, to preserve history).

---

## 6. Token Accounting Flow (per AI call)

Implemented in a new `app/services/ai_tokens.py` (the single billing chokepoint).

1. **Pre-check (gate)**: `ensure_can_spend(user, min_tokens=1)` — load/refresh
   balance (lazy monthly reset); if `subscription_remaining + purchased_remaining
   <= 0` → raise `OutOfTokens` → endpoint returns **402 Payment Required** (or
   403) with `{detail, balance, buy_more_url}`. (Hard stop.)
2. **Execute** the AI call via the refactored provider methods that now return
   `(answer, usage)`.
3. **Charge**: compute `cost_usd` from the model's pricing + `usage`; compute
   `tokens_to_deduct`; within a transaction:
   - consume from `subscription_remaining` first, then `purchased_remaining`;
   - append ledger row(s);
   - update balance totals.
4. **Failure handling**: if the provider call errors with no usage → no charge;
   if it returns usage then errors → charge the usage returned.

`charge()` must be **atomic** (single SQLite transaction) to avoid balance
drift under concurrent requests from the same user. Token deduction happens
**after** the call (output tokens are unknown until the provider responds); the
only overshoot is the final call that brings the balance from positive to ≤0,
after which the next call is hard-stopped. (A reservation/estimate variant is
listed in §14 as a later hardening.)

The existing `verify_model_permission` (provider gate) runs **before** the
token pre-check so role gating still applies.

---

## 7. AI Service Changes (`app/services/ai.py`, `ai_actions.py`)

- Refactor each `_chat_with_*` to return `(answer, usage)`:
  - GLM/Groq/Mistral (OpenAI-compatible): `usage = data.get("usage", {})`;
    `input=usage.get("prompt_tokens",0)`, `output=usage.get("completion_tokens",0)`.
  - Gemini: `um = data.get("usageMetadata",{})`;
    `input=um.get("promptTokenCount",0)`, `output=um.get("candidatesTokenCount",0)`.
  - OpenRouter (news query gen): same as OpenAI-compatible.
- Thread `usage` + resolved `model_id` up through `chat()`/`research()`/
  `summarize_memory()` so their return dicts include
  `{usage:{input,output}, model_id, provider}` alongside `answer`/`mode`.
- Do **not** charge inside `ai.py` (keep it provider-agnostic). Charging stays
  in the API/service layer using the returned usage — this keeps `ai.py`
  testable and avoids DB coupling in the provider layer.

---

## 8. Limit-Layer & Endpoint Changes

### Remove (stop enforcing counts) — replaced by token metering
- `routes.py`: drop `daily_ai_chats`, `monthly_ai_chats`, and the
  `ai_messages_per_session` checks in `/ai/chat`, `/ai/research`,
  `/ai/actions/plan`. Replace with `ensure_can_spend(user)`.
- `advisor_atlas.py`: drop `advisor_atlas_searches_per_month` increment in
  `create_run` and `refresh_candidate`; replace with `ensure_can_spend` before
  starting, and charge after each internal provider call.
- `news.py` `/news/query-preview`: **remove** the
  `news_searches_per_month/_day` increment (query-building must not count as a
  search); instead charge AI tokens for the query-generation call.

### Keep
- `verify_model_permission` → `can_use_<provider>` (role gate).
- `can_use_agents` gate on agent endpoints.
- `/news/search` (Tavily) and web-search `can_use_web_search` +
  `web_searches_per_day/_month` **unchanged** (these are real search-cost
  limits, not AI-token limits).

### Charge points (after refactor)
| Endpoint / path | Charges tokens for |
|---|---|
| `/ai/chat` | the chat call |
| `/ai/research` | routing call + main call (+ Tavily unaffected) |
| `/ai/summarize` | summarize call |
| `/ai/actions/plan`, `/ai/actions/execute` | each agent provider call |
| `/advisor-atlas/runs` (+ resume) | every internal AI pass (discovery, analysis, vision, summaries) |
| `/news/query-preview` | query-generation call only |
| `/news/search` | none (Tavily; search-count limit persists) |

---

## 9. Admin Backend (`app/api/admin.py` + `app/services/admin.py`)

All new destructive/config endpoints use **super_admin only**. Reuse
`require_super_admin` (already exists) or the existing feature-flag pattern via
a new `admin_manage_ai_billing` flag granted only to super_admin.

- `GET/POST/PATCH/DELETE /admin/ai/models` — model registry + pricing CRUD
  (super_admin).
- `GET/POST/PATCH/DELETE /admin/ai/packs` — pack catalog CRUD (super_admin).
- `GET/PATCH /admin/limits` — already exists; the `ai_tokens_per_month` feature
  for each role is set here (admin-managed; super_admin for admin-tier roles).
- `GET /admin/users/{id}` — extend response with token balance + recent ledger.
- `GET /admin/ai/token-requests` + `POST /admin/ai/token-requests/{id}/review`
  — approve/reject purchase requests (mirrors plan-request review).
- `POST /admin/users/{id}/ai/grant` — manual token grant/deduction with reason
  (super_admin; audited).

Report read endpoints (any admin): `GET /admin/ai/usage-summary` (aggregate $
spend by user/model), `GET /admin/ai/ledger` (filterable).

---

## 10. User-Facing Backend (`app/api/auth.py`, new `app/api/ai_billing.py`)

- `GET /api/ai/balance` → `{subscription_remaining, purchased_remaining,
  total_tokens, monthly_cap, used_this_month_tokens, used_this_month_usd,
  reset_date}` (frontend token widget).
- `GET /api/ai/usage` → paginated ledger for the user.
- `GET /api/ai/packs` → active pack catalog (public-ish; needed pre-login? no —
  auth-required; shown in buy flow).
- `POST /api/ai/token-requests` → submit a pack purchase request
  (one pending at a time, like plan requests).
- `GET /api/ai/token-requests` → user's own request history.

The 402/403 "out of tokens" response from AI endpoints carries enough info for
the frontend to show a buy CTA.

---

## 11. Frontend

- **Profile / Usage widget**: token balance (subscription + purchased), monthly
  cap, used-this-month, reset date, recent spend. Replaces/augments current
  usage display.
- **AI chat / Advisor Atlas / Scholarship Hunt**: surface a small live token
  balance chip; on 402/403 out-of-tokens, show modal: "You're out of AI tokens"
  with **Buy more** → pack picker → submit request.
- **Buy tokens flow**: pick Small/Medium/Large → confirm → submit request →
  "Request submitted, pending admin approval" state (mirrors plan-extension
  UX). Show pending request status.
- **Admin panel** (new tabs, super_admin-gated in the nav):
  - **AI Models & Pricing** — table of models, edit input/output $ per 1M,
    activate/deactivate.
  - **AI Token Packs** — edit Small/Medium/Large token amounts + prices.
  - **Token Allowances** — per-role monthly cap (reuses limits UI).
  - **Token Purchase Requests** — queue + approve/reject (like plan requests).
  - **User detail** — token balance, lifetime spend, manual grant, ledger.
- Guard the super_admin-only tabs via the existing role check in the shell
  (UX only — backend enforces, per SCHOLARDOCX-0081).

---

## 12. Permissions Summary

| Action | Who |
|---|---|
| Use AI (any provider call) | Any active user with `can_use_<provider>` **and** token balance > 0 |
| View own balance/usage | The user |
| Buy token pack (request) | The user |
| Set per-tier monthly token allowance | admin (super_admin for admin-tier roles) |
| Configure **model pricing** | **super_admin only** |
| Configure **token packs** (price/amount) | **super_admin only** |
| Approve purchase requests | admin |
| Manual grant/deduction | super_admin |
| View aggregate usage / ledger | admin |

---

## 13. API Endpoint Catalog (new)

```
# User
GET  /api/ai/balance
GET  /api/ai/usage
GET  /api/ai/packs
POST /api/ai/token-requests
GET  /api/ai/token-requests

# Admin (super_admin unless noted)
GET/POST/PATCH/DELETE /api/admin/ai/models
GET/POST/PATCH/DELETE /api/admin/ai/packs
GET  /api/admin/ai/token-requests          (admin)
POST /api/admin/ai/token-requests/{id}/review   (admin)
GET  /api/admin/ai/usage-summary           (admin)
GET  /api/admin/ai/ledger                  (admin)
POST /api/admin/users/{id}/ai/grant        (super_admin)
GET  /api/admin/limits  PATCH /api/admin/limits/{role}/{feature}  (exists; add ai_tokens_per_month)
```

---

## 14. Edge Cases & Open Questions

- **Mid-run exhaustion (Advisor Atlas)**: pre-check before starting a run;
  charge each internal call as it happens. If balance hits 0 mid-run, the
  in-flight run completes (already-incurred provider cost is real); the next
  run is blocked. Document this to users.
- **Charging precision / overshoot**: post-call charging means the final call
  can dip the balance slightly below the true stop point. Acceptable for v1.
  Optional v2: reserve an input-token estimate upfront, reconcile after.
- **Provider returns no usage**: treat as 0 tokens / no charge (some error
  paths), but log it so the admin can spot mis-metering.
- **Default model pricing at seed**: $0 placeholders until super_admin sets
  real values. Decide policy: block AI until pricing is set, or allow at $0
  (free) — recommend **allow but warn** so first-run isn't broken; surface
  unpriced models in the admin panel.
- **Configurable rate**: confirm `ai_token_rate_tokens_per_dollar` should be
  admin-editable (super_admin) vs hardcoded env. Recommend app_setting,
  super_admin-editable.
- **Concurrency**: SQLite single-writer transaction per charge prevents drift;
  verify the Store session handling supports nested charge + response write.
- **Backfill fairness**: existing users get current-month allowance on
  migration; decide whether pro-rated. Recommend full allowance (simple).

---

## 15. Phased Implementation Plan

**Phase 0 — Jira + context** (AI-DLC protocol): create Jira task; update
`functional/` (new AI-token feature file) + `technical/security-privacy.md` /
`authentication-and-identity.md` (token economy = part of the authz/billing
surface). This planbook entry is the design source.

**Phase 1 — Foundation (no behavior change yet)**
- Refactor `_chat_with_*` to return usage; thread usage+model_id through
  `chat/research/summarize`. Add unit tests proving usage is captured per
  provider shape.
- New tables: `ai_models`, `ai_token_balances`, `ai_token_ledger`,
  `ai_token_packs`, `ai_token_purchase_requests`. Migration + seed defaults.
- `app/services/ai_tokens.py`: balance read/refresh, cost math, charge(),
  ensure_can_spend(). Unit tests for math + monthly reset + bucket order.

**Phase 2 — Wire charging (feature-flagged off → on)**
- Add `ensure_can_spend` + `charge` at each charge point (§8).
- Keep old count limits co-enforced behind a flag during rollout, then flip:
  remove count enforcement, rely on tokens.

**Phase 3 — Packs + purchase flow**
- Pack catalog CRUD (super_admin), purchase-request submit/approve, ledger
  grants on approval. User buy flow backend.

**Phase 4 — Admin + user UX**
- Admin tabs (models, packs, allowances, requests, usage). User balance
  widget, out-of-tokens modal, buy flow.

**Phase 5 — Teardown & hardening**
- Remove deprecated count enforcement cleanly; reservation-based pre-charge
  if desired; usage reports; concurrency soak test.

---

## 16. Testing Strategy

- **Unit**: provider usage extraction (each provider shape); cost math + ceil;
  monthly reset logic; bucket consumption order (subscription→purchased);
  out-of-tokens hard stop; pack grant on approval; manual grant audit.
- **Integration (TestClient)**: a chat call deducts tokens and writes a ledger
  row; balance hits 0 → next call 402; purchase request approve → purchased
  balance increases; super_admin-only endpoints reject general_admin (per
  SCHOLARDOCX-0081 patterns); `/news/query-preview` no longer increments
  search counts but does charge tokens; `/news/search` still enforces search
  counts and charges no tokens.
- **Migration**: fresh DB seeds balances/models/packs; existing DB backfills
  balances without losing `user_usage_stats` history.

---

## 17. Risks

- **Usage capture correctness** is the linchpin — a mis-parsed provider shape
  silently meters 0 tokens (free AI) or wrong tokens. Mitigate with per-provider
  unit tests + admin "unpriced/zero-usage" report.
- **Cost runaway** if a model is mispriced ($0) or rate mis-set. Mitigate:
  super_admin-only config, usage reports, optional per-user daily token ceiling
  (future).
- **Behavioral breakage**: removing count limits is a visible UX change;
  communicate via the balance widget and out-of-tokens messaging.
- **File-size**: `ai.py` is already 659 lines and `admin.py` 341/`services/
  admin.py` 723. New code goes in `ai_tokens.py` and a new `api/ai_billing.py`
  to stay under the 1000-line rule (CODE_RULES); watch `services/admin.py`.

---

## 18. Out of Scope (v1)

- Real payment integration (local-first; request/approve only).
- Token rollover (confirmed: no rollover).
- Rollover/expiry of purchased tokens (confirmed: never expire).
- Negative-balance/overage billing (confirmed: hard stop).
- Per-user daily token ceilings / spend alerts (future hardening).
- Refund flow beyond void-on-failure.
- Auto-pack recommendation / usage forecasting.

---

## 19. File Impact (expected)

New:
- `backend/app/services/ai_tokens.py`
- `backend/app/api/ai_billing.py`
- `AI-Context/functional/feature-ai-token-economy.md` (Phase 0)

Modified:
- `backend/app/services/ai.py` (usage capture)
- `backend/app/services/ai_actions.py` (thread usage)
- `backend/app/api/routes.py` (remove counts, add charge)
- `backend/app/api/advisor_atlas.py` (remove count, add charge)
- `backend/app/api/news.py` (decouple query-build from search count)
- `backend/app/api/admin.py` + `backend/app/services/admin.py` (model/pack/
  request endpoints)
- `backend/app/api/auth.py` (balance/usage endpoints) — note: also touched by
  SCHOLARDOCX-0081
- `backend/app/db/models.py`, `schema.py`, `connection.py` (new tables/seed)
- `backend/app/auth/limits.py` (optional helper for token allowance lookup)
- Frontend: profile/usage widget, admin tabs, buy flow, out-of-tokens modal

Line-count risk: **Medium**. Keep new logic in dedicated files; split
`services/admin.py` if it crosses 1150 after additions (CODE_RULES).
