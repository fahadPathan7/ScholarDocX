# Technical: Billing Contract

**The single normative source for how a provider call gets billed.** AGENTS.md,
[AI-Context/README.md](../README.md), [ai-integrations.md](ai-integrations.md),
and [ai-token-economy.md](ai-token-economy.md) all point here. If you are about
to restate any of this in another file, link instead — three drifted copies of
this contract is what SCHOLARDOCX-0205 had to clean up.

Every name below is verified against the code. `scripts/check-context-drift.py`
fails the build if any stops resolving, so this file cannot rot silently.

## The rule

Every external provider call made on a user's behalf is charged to that user.
No exemptions. Background task, fallback path, retry, a model the vendor prices
at $0, a result that got filtered out and never shown — all still billed. The
operator never absorbs provider cost. See
[BD-011](../business/decisions.md).

## The API

All of it lives in `backend/app/services/ai_tokens.py`.

| Purpose | Function |
|---|---|
| Pre-flight (raises `OutOfTokens`, HTTP 402) | `ensure_can_spend(user, session, min_tokens=1)` |
| Token-metered charge | `charge(user, *, model_id, provider, input_tokens, output_tokens, source, session, ref_id=None)` |
| Flat-fee charge | `charge_flat_fee(user, session, cost_usd, source, ref_id=None)` |
| Price a call without charging | `compute_cost(model_id, input_tokens, output_tokens, session, provider=None)` |
| Load a user for background billing | `load_user_dict(user_id, session)` |
| Startup pricing sanity check | `validate_model_pricing(session, settings)` |

Inside a service holding an `AiService`, prefer its helpers — they carry the
billing context and no-op safely when none is attached:

- `set_billing(user, session)` — attach the context (background runs do this first)
- `can_spend()` / `can_spend_external()` — pre-flight
- `charge_tokens(model_id=, provider=, input_tokens=, output_tokens=, source=)`
- `charge_external_call(cost_usd=, source=)` — flat-fee external call
- `external_billing_cost(getter)` — read an admin-configured price

Role gates come from `backend/app/auth/limits.py`:
`check_and_increment_limit(user, feature, increment, session)` (pass `0` for a
permission-only check) and `get_user_limit(user, feature, session)`.

> There is no `charge_ai_tokens`, `check_available_tokens`,
> `check_flat_fee_balance`, or `get_ai_token_balance`. Those names appeared 28
> times across AGENTS.md and AI-Context and never existed in the codebase.

## Enforcement locations

Billing belongs at the service entry point that has both the user and the
session — not inside a provider adapter, which has neither.

| Surface | Entry point | Shape |
|---|---|---|
| `/ai/chat`, `/ai/summarize` | `AiService.chat()` | `can_spend()` then `charge_tokens()` |
| `/ai/research` | `AiService.research()` | Tavily flat fee charged at the search it pays for |
| `/ai/actions/plan` | route → `AiActionService.plan()` | gate at the route, billing context passed down |
| Scholarship Analyze | `ScholarshipExtractionService.extract()` | both the primary call and the OpenRouter fallback |
| Deep Hunt run | `ScholarshipDeepHuntService.run()` | `load_user_dict` + `set_billing`, then per-hit + per-call |
| Advisor Atlas run | `AdvisorAtlasService.run()` | `load_user_dict` + `set_billing`, then per search/analysis/lookup |
| Research Expert | `ResearchPaperService` upload / retry / analyze | one embedding charge per operation + the analysis call |

Background runs are not a special case. They load the user with
`load_user_dict` — which applies plan expiry and refuses suspended accounts —
and charge that user.

## Gates that exist

Seeded in `DEFAULT_ROLE_LIMITS` (`backend/app/services/admin.py`) and editable
per role in admin → Role Limits:

`can_use_glm`, `can_use_gemini`, `can_use_groq`, `can_use_mistral`,
`can_use_web_search`, `can_use_agents`, `can_use_scholarship_hunt`,
`can_use_advisor_atlas`, `can_use_research_reader`, `can_use_brain_games`,
`can_purchase_token_packs`, `can_use_purchased_tokens`,
`ai_messages_per_session`, `research_papers_per_month`.

A feature with **no** `role_limits` row is denied, not allowed. Ship the
`DEFAULT_ROLE_LIMITS` entry in the same change as the gate.

> Per-search count limits (`web_searches_per_month`, `news_searches_per_day`,
> `advisor_atlas_searches_per_month`, and siblings) were removed outright in
> Phase 5 — metering is by credits now. Do not reintroduce them; several context
> files described them for a year after deletion.

## Prices admins control

`app_settings` keys, editable in admin → Settings → External APIs & Agents
Pricing: `ai_token_rate_tokens_per_dollar`, `tavily_call_cost_usd`,
`jina_call_cost_usd`, `brave_call_cost_per_hit_usd`, `openalex_call_cost_usd`,
and `plan_ai_credits_{free,general,pro,max}`. Per-model $/1M pricing lives in
the `ai_models` table.

## Adding a provider

1. Make the billing context a **required** parameter of whatever function calls
   the provider. An optional `ai_service=None` guarding a charge is how two
   leaks shipped.
2. Pre-flight with `ensure_can_spend` / `can_spend_external()` before the call.
3. Charge immediately after the response, before parsing it — the vendor billed
   us whether or not the body was usable.
4. Seed a price row so `compute_cost` cannot resolve to $0, and confirm startup
   logs no `AI PRICING WARNING`.
5. Add the gate to `DEFAULT_ROLE_LIMITS`.
6. Add a case to `backend/tests/regression/test_limits_billing_guards.py`.
7. Run `make guard-billing`. Do not silence it with an `EXEMPT` entry unless a
   *caller* provably does the charging — name that caller in the entry.

## Guards

- `scripts/check-provider-call-billing.py` (`make guard-billing`) — fails when a
  function talks to a provider without charging, or declares `ai_service=None`.
- `scripts/check-context-drift.py` (`make guard-context`) — fails when living
  context names code that does not exist. It is why this file's names are
  trustworthy.

## Related

- [ai-token-economy.md](ai-token-economy.md) — the two-bucket economy, the
  per-path coverage table, and the history behind each rule.
- [ai-integrations.md](ai-integrations.md) — per-provider integration detail.
- [billing-and-payments.md](billing-and-payments.md) — Polar subscriptions and
  plan purchase, which is a different thing from credit consumption.
