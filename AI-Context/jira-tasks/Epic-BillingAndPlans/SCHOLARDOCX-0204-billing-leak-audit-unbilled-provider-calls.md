# SCHOLARDOCX-0204: Billing Leak Audit — Unbilled Provider Calls and Role-Limit Wiring Gaps

Status: Done (audit complete, all eight leaks fixed)

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-29

## Summary

Full read-only audit of the role-limit system (`app/auth/limits.py`) and the AI
credit economy (`app/services/ai_tokens.py`) against the non-negotiable rule in
[AGENTS.md](../../../AGENTS.md) §"ABSOLUTE BILLING ENFORCEMENT": every external
provider call made on a user's behalf — foreground or background, "free tier" or
paid — must be charged to that user. The operator must never absorb provider
cost.

Eight leaks were found. Three are unbilled provider calls, one makes *every*
OpenRouter charge evaluate to $0 even where billing is wired, one bills a whole
provider at zero by design, and three are policy/wiring gaps that let usage
escape the intended tier. Two documentation sections assert enforcement that the
code does not implement.

All eight are fixed. This file is both the audit record and the delivery
record; see Completion Notes.

## Business Context

Links:

- Business file: [decisions.md](../../business/decisions.md) (BD-011)
- Business file: [assumptions-and-risks.md](../../business/assumptions-and-risks.md)

Business value:

Every unbilled provider call is direct margin loss carried by the operator, and
it scales with usage — the leaks are largest exactly when the product succeeds.
A Deep Hunt run leaks 2 OpenRouter calls plus up to ~12 extraction fallbacks; an
Advisor Atlas Discovery run leaks every Tavily `advanced` search it makes across
up to 80 candidates.

## Functional Context

Links:

- Functional file: [feature-ai-token-economy.md](../../functional/feature-ai-token-economy.md)
- Functional file: [feature-advisor-atlas.md](../../functional/feature-advisor-atlas.md)
- Functional file: [feature-research-expert.md](../../functional/feature-research-expert.md)

Requirements:

- FR-BILL-01: Any external provider call issued on behalf of a user is charged to
  that user's AI credit balance, whether it runs in a request or a background
  task.
- FR-BILL-02: A charge is never silently zero. If a provider call cannot be
  priced, that is a configuration defect, not a free call.
- FR-BILL-03: Background billing resolves the same effective role the user would
  have in a live request (plan expiry and suspension applied).
- FR-BILL-04: A gated feature with no `role_limits` row is denied, not allowed.

## Technical Context

Links:

- Technical file: [ai-token-economy.md](../../technical/ai-token-economy.md)
- Technical file: [ai-integrations.md](../../technical/ai-integrations.md)
- Technical file: [security-privacy.md](../../technical/security-privacy.md)

### Leak inventory

| # | Path | Where | Effect |
|---|------|-------|--------|
| L1 | Deep Hunt query planner | `scholarship_deep_hunt.py:460` | 1 unbilled OpenRouter call per run |
| L2 | Deep Hunt relevance filter | `scholarship_deep_hunt.py:711` | 1 unbilled OpenRouter call per run |
| L3 | Scholarship extraction fallback | `scholarship_extraction.py:110` | Unbilled OpenRouter call per extraction |
| L4 | OpenRouter price lookup | `ai_tokens.py:382` + `connection.py:602` | Every OpenRouter charge computes $0 |
| L5 | Advisor Atlas web search | `advisor_atlas/service.py:1063` | Every Tavily search billed at $0 by design |
| L6 | Background role resolution | `ai_tokens.py:87` | Expired/suspended users billed at old tier |
| L7 | Missing `role_limits` row | `limits.py:140` | Unseeded feature is unlimited for all tiers |
| L8 | Jina flat fee | `research_paper_service.py:942` | Fee does not scale with document size |

**L1 — Deep Hunt query planner is never charged.**
`DeepHuntQueryPlanner.plan()` charges only `if ai_service is not None`
(`deep_hunt_query_planner.py:165`). The single call site,
`ScholarshipDeepHuntService._plan_queries` (`scholarship_deep_hunt.py:460`), does
not pass `ai_service=`. The parameter defaults to `None`, so the branch never
runs.

**L2 — Deep Hunt relevance filter is never charged.**
Identical shape: `DeepHuntRelevanceFilter.score()` guards on `ai_service is not
None` (`deep_hunt_query_planner.py:349`); the call site
(`scholarship_deep_hunt.py:711`) omits the argument.

**L3 — Scholarship extraction's OpenRouter fallback has no charge site at all.**
`ScholarshipExtractionService.extract()` receives `ai_service` and bills the
primary path through `AiService.chat()`. When that returns `local-fallback` or
`provider-error`, `_openrouter_fallback()` (`scholarship_extraction.py:110-147`)
issues a second real provider call with no `charge_tokens` anywhere. Worst case:
with no chat provider configured, `_candidate_models()` returns `[]`, `chat()`
short-circuits to `local-fallback` without billing, and OpenRouter becomes the
*only* extraction path — permanently free. Affects both
`POST /scholarship-opportunities/analyze` and every extraction inside a Deep Hunt
run.

**L4 — OpenRouter charges evaluate to $0 even when wired.**
`compute_cost()` prices a call with
`SELECT input_price_per_1m, output_price_per_1m FROM ai_models WHERE model_id = :m`
(`ai_tokens.py:382-389`). The planner and filter pass
`model_id=settings.openrouter_free_model`, whose default is `"openrouter/free"`
(`config.py:50`). `_seed_ai_token_defaults` seeds `provider='openrouter',
model_id='openrouter'` (`connection.py:602`). The two never match → both prices
resolve to `0.0` → `cost_usd = 0` → `tokens = 0` → `charged = 0`. **Fixing L1–L3
alone changes nothing until this is reconciled**: the seed must key on the same
value the settings expose, or `compute_cost` must fall back to the provider row.

**L5 — Advisor Atlas Tavily searches are billed at zero by design.**
`AdvisorAtlasService._tavily_search` (`service.py:1063`) calls
`AiService.record_external_search()`, which is `charge_flat_fee(user, session,
0.0, source=...)` (`ai.py:141-152`) — a ledger counter row with `tokens_delta=0`.
The searches are `search_depth: "advanced"` (the expensive Tavily tier) and a run
issues many: discovery, per-candidate passes, and deep research across up to 80
candidates. All real spend, charged to nobody. The in-code comment states this is
intentional; the rule in AGENTS.md §"Zero exceptions" says otherwise, and the
product decision recorded here is that the rule wins.

Related: when a run's balance hits zero, `AiService.chat()` raises `OutOfTokens`,
but Discovery's per-candidate `except Exception` (`service.py:149-158`) swallows
it and continues to the next candidate. The run keeps issuing unbilled Tavily
searches and crawls after the user can no longer pay.

**L6 — Background billing ignores plan expiry and suspension.**
`ai_tokens.load_user_dict()` (`ai_tokens.py:87-103`) reads `users.roles`
verbatim. The expiry downgrade to `free_user` lives only in `get_current_user`
(`auth/dependencies.py:84-100`) and is applied to an in-memory dict, never
persisted. Background runs (Advisor Atlas, Deep Hunt) therefore resolve the
*stale* tier: `get_role_monthly_allowance` grants the expired plan's monthly
credits, and `refresh_balance` will top the subscription bucket back up at that
tier on a period rollover. `load_user_dict` also does not check `is_active`, so a
suspended user's queued run keeps spending. The daily cron
(`scripts/downgrade_expired_users.py`, SCHOLARDOCX-0166) narrows but does not
close the window.

**L7 — A missing `role_limits` row means unlimited, not denied.**
`check_and_increment_limit` returns `True` when no row exists (`limits.py:140-141`),
and `can_purchase_packs` / `can_use_purchased_tokens_feature` both return `True`
on a missing row (`ai_tokens.py:233-235`, `254-256`). Any feature gated in code
before its `DEFAULT_ROLE_LIMITS` entry ships is silently open to every tier
including `free_user`. `get_user_limit` has the matching `-1` (uncapped) default
(`limits.py:72`).

**L8 — The Jina flat fee does not scale with document size.**
`_generate_embeddings` raises exactly one `jina_call_cost_usd` fee per user
operation regardless of batch count (`research_paper_service.py:942-943`). Jina
bills per token, so a large paper costs the operator more than the flat fee
recovers. The single-charge invariant from SCHOLARDOCX-0180 is correct and must
be preserved — the fee should scale with the returned token count, not become a
second charge site.

### Overcharge (opposite direction)

`POST /ai/research` charges the Tavily flat fee unconditionally when
`web_search_max_results > 0` (`routes.py:583-587`), *before* `AiService.research()`
asks the routing agent whether a search is needed. When the agent returns
`needs_search=false` (`ai.py:433`) no Tavily call is made, but the user has
already paid for it.

### Documentation drift found during the audit

- `ai-integrations.md:611, 621, 636-641` states the Deep Hunt planner, relevance
  filter, and extraction fallback are billed via `charge_ai_tokens`. They are
  not (L1–L3). The context asserted the intended behaviour as though it shipped.
- `ai-token-economy.md:339-343` still describes Deep Hunt's Tavily searches as
  zero-cost counter rows. Superseded by SCHOLARDOCX-0175, which replaced Tavily
  with Brave per-hit billing.
- `research_paper_service.py:1238-1239` comments that the analysis query
  embedding is "infrastructure cost" and not charged. It *is* charged, as
  `jina_embedding_query` (`research_paper_service.py:962`). Stale comment only.

### Role-limit wiring gaps (non-billing)

- `admin_view_dashboard` and `admin_manage_role_limits` are seeded in
  `DEFAULT_ROLE_LIMITS` and honoured by `AdminView.tsx` for tab visibility, but
  the backend routes `GET /admin/dashboard` (`admin.py:107`) and
  `GET /admin/limits` (`admin.py:260`) carry no `require_feature` check. A
  `general_admin` with either toggle off can still call both endpoints directly.
  Every other `admin_*` toggle *is* enforced through `require_feature`.
- `AiActionService.enforce()` silently no-ops when `self.user`/`self.session` are
  unset (`ai_actions.py:385-389`). Both route call sites currently pass them, so
  this is latent, not live.
- `AiActionService.analyze_results()` (`ai_actions.py:343`) has no call site —
  dead code carrying a billing path.

## Scope

In scope:

- Read-only audit of every AI/external-provider call path for billing coverage.
- Read-only audit of role-limit definition, seeding, and enforcement.
- Recording findings in context and in this task.

Out of scope:

- Implementing the fixes (tracked below; a separate delivery).
- Changing pricing values or plan allowances.
- Reworking the two-bucket balance model or the pack purchase flow.
- Frontend credit-display changes.

## Acceptance Criteria

- [x] L1: A Deep Hunt run records a ledger row with `source = "Deep Hunt · Query
      Planning"` and `tokens_delta < 0`.
- [x] L2: A Deep Hunt run records a ledger row with `source = "Deep Hunt ·
      Relevance Filter"` and `tokens_delta < 0`.
- [x] L3: An extraction that falls back to OpenRouter records a ledger row with
      `tokens_delta < 0`; with no chat provider configured, the OpenRouter-only
      path still bills.
- [x] L4: `compute_cost(settings.openrouter_free_model, 1000, 1000, session)`
      returns a non-zero cost against the seeded catalog.
- [x] L5: Every Advisor Atlas Tavily search charges the configured
      `tavily_call_cost_usd`; a run that cannot pay stops instead of continuing
      to search.
- [x] L6: `load_user_dict` returns `free_user` for a user whose `plan_ends_at`
      has passed, and a background run refuses to start for a suspended user.
- [x] L7: `check_and_increment_limit` denies a feature with no `role_limits`
      row; `can_purchase_packs` and `can_use_purchased_tokens_feature` return
      `False` on a missing row.
- [x] L8: The Jina fee scales with the token count Jina returns, still as
      exactly one charge per user operation.
- [x] `/ai/research` charges the Tavily fee only when a search is actually
      issued.
- [x] `ai-integrations.md` and `ai-token-economy.md` describe what the code does.

## Implementation Plan

Ordered by dependency — **L4 first**, because L1–L3 bill nothing until the price
lookup resolves.

1. **L4** — reconcile the OpenRouter model identity. Either seed the
   `ai_models` row using `Settings.openrouter_free_model` as `model_id`, or make
   `compute_cost` fall back to a provider-level row when the exact `model_id`
   misses. Prefer the fallback: it also protects every future provider whose
   model id is env-driven. Add a startup assertion that any model id reachable
   from settings resolves to a priced row.
2. **L1/L2** — pass `ai_service=self.ai_service` at
   `scholarship_deep_hunt.py:460` and `:711`. Then remove the
   `if ai_service is not None` escape hatch in `deep_hunt_query_planner.py` and
   make the parameter required, so the same omission cannot recur.
3. **L3** — move the charge into `_openrouter_fallback` (or have it return usage
   for `extract()` to charge). Pass `ai_service` into the fallback. Guard the
   no-provider case so it pre-flights `ensure_can_spend` like `chat()` does.
4. **L5** — replace `record_external_search` with `charge_external_call` at
   `advisor_atlas/service.py:1063`, priced from `get_tavily_call_cost_usd`, with
   a `can_spend_external()` pre-flight. Decide and record whether an Advisor
   Atlas run that runs out mid-flight aborts (recommended) or degrades. Keep
   `record_external_search` only for genuinely free calls.
5. **L6** — apply the expiry downgrade inside `load_user_dict` (extract the
   logic from `get_current_user` into one shared helper so the two cannot drift),
   and reject background billing for `is_active = false`.
6. **L7** — flip the defaults to deny-by-default, and add a startup check that
   every feature string reachable from `check_and_increment_limit` exists in
   `DEFAULT_ROLE_LIMITS`. Flipping without that check will break live features
   whose rows were never seeded — run the check first and seed the gaps.
7. **L8** — scale the Jina fee by the token count already returned from
   `_generate_embeddings`, preserving the single-charge invariant.
8. `/ai/research` overcharge — move the Tavily charge from the route into
   `AiService.research()`, next to the `_tavily_search` call it pays for.
9. Fix the stale comment at `research_paper_service.py:1238-1239`.
10. Admin toggles — add `require_feature("admin_view_dashboard", ...)` and
    `require_feature("admin_manage_role_limits", ...)` to the two unguarded
    routes, or delete the toggles. Do not leave a UI switch with no backend.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests (`backend/tests/regression/test_limits_billing_guards.py`):

- `test_deep_hunt_planner_charges_user` — run `_plan_queries` with a stubbed
  OpenRouter response; assert one negative-delta ledger row.
- `test_deep_hunt_relevance_filter_charges_user` — same shape for `score()`.
- `test_extraction_openrouter_fallback_charges_user` — force the primary
  provider to `provider-error`; assert the fallback bills.
- `test_extraction_charges_when_no_chat_provider_configured` — no provider keys
  at all; assert the OpenRouter-only path still bills.
- `test_openrouter_model_id_resolves_to_priced_row` — `compute_cost` with
  `settings.openrouter_free_model` returns non-zero. Guards L4 from regressing.
- `test_advisor_atlas_tavily_search_charges_flat_fee` — assert a negative-delta
  row per search.
- `test_load_user_dict_applies_plan_expiry` — expired `plan_ends_at` in the DB
  resolves to `free_user`.
- `test_load_user_dict_rejects_suspended_user`.
- `test_missing_role_limit_row_denies` — unknown feature raises
  `UsageLimitExceeded`.
- `test_research_route_does_not_charge_tavily_when_no_search_issued`.
- `test_jina_fee_scales_with_token_count` — plus a regression assert that the
  operation still raises exactly one fee (SCHOLARDOCX-0180 invariant).

Per the project convention, tests are written but not executed by the agent.

## File Size Check

Files expected to be edited:

- `backend/app/services/scholarship_deep_hunt.py` (~900 lines — small edits)
- `backend/app/services/deep_hunt_query_planner.py` (~520 lines)
- `backend/app/services/scholarship_extraction.py` (~190 lines)
- `backend/app/services/ai_tokens.py` (1079 lines — **already over 1000**)
- `backend/app/services/advisor_atlas/service.py` (~1150 lines — **already over 1000**)
- `backend/app/services/research_paper_service.py` (~1400 lines — **already over 1000**)
- `backend/app/auth/limits.py` (285 lines)
- `backend/app/db/connection.py`
- `backend/app/api/routes.py`, `backend/app/api/admin.py`

Line-count risk:

- Medium. Three target files already exceed the 1000-line policy in
  [CODE_RULES.md](../../CODE_RULES.md). The fixes are small in-place edits and
  should not grow them further; if any does, split before adding. The shared
  plan-expiry helper (step 5) is a good candidate for a new small module
  (`app/auth/plan_state.py`) rather than growing `ai_tokens.py`.

## Verification Plan

- Ledger inspection per acceptance criterion: run each flow against stubbed
  providers and confirm a negative `tokens_delta` row with the expected `source`.
- Cross-check the admin dashboard external-API counters
  (`admin.py:262-269`) still resolve after any `source` label changes.
- Confirm no double-charge regressions: SCHOLARDOCX-0180 (Jina) and
  SCHOLARDOCX-0183 (OpenAlex) single-charge invariants must both still hold.
- Confirm the L7 default flip does not break a live feature: enumerate every
  feature string reachable from `check_and_increment_limit` and assert each has
  a `DEFAULT_ROLE_LIMITS` entry *before* flipping.

## Completion Notes

Changed files:

*Backend*

- `app/services/ai_tokens.py` — new `_lookup_price()` (exact model → provider
  house rate) and `validate_model_pricing()`; `compute_cost()` takes `provider`
  and logs an ERROR on an unpriced call; `charge()` passes `provider` through;
  `load_user_dict()` applies plan expiry and refuses suspended accounts;
  `can_purchase_packs` / `can_use_purchased_tokens_feature` deny on a missing
  row. **(L4, L6, L7)**
- `app/auth/plan_state.py` — **new.** `apply_plan_expiry()` / `plan_has_expired()`,
  the single source of truth for the expiry downgrade. **(L6)**
- `app/auth/dependencies.py` — `get_current_user` delegates to `plan_state`
  instead of carrying its own copy of the logic. **(L6)**
- `app/auth/limits.py` — deny-by-default for unseeded features in both
  `check_and_increment_limit` and `get_user_limit`; `_log_unseeded_feature()`
  names the missing role/feature. **(L7)**
- `app/services/deep_hunt_query_planner.py` — `ai_service` is now a required
  keyword parameter on `plan()` and `score()`. **(L1, L2)**
- `app/services/scholarship_deep_hunt.py` — passes `ai_service=self.ai_service`
  to both. **(L1, L2)**
- `app/services/scholarship_extraction.py` — `_openrouter_fallback` takes
  `ai_service`, pre-flights with `can_spend()`, and charges via `charge_tokens`
  before parsing the body. **(L3)**
- `app/services/advisor_atlas/service.py` — `_tavily_search` pre-flights and
  charges the Tavily rate; `screen_one` re-raises `OutOfTokens` instead of
  swallowing it. **(L5)**
- `app/services/ai.py` — `record_external_search()` **removed**;
  `research()` charges the Tavily fee at the search it pays for.
  **(L5, /ai/research overcharge)**
- `app/api/routes.py` — `/ai/research` keeps the gate and the `ensure_can_spend`
  pre-check, no longer charges up front. **(overcharge)**
- `app/services/research_paper_service.py` — `_charge_jina_embedding` takes
  `input_tokens` and adds a token component to the base fee; stale
  "infrastructure cost" comment corrected; analysis display cost passes
  `provider`. **(L8, doc drift)**
- `app/db/connection.py` — seeds the configured `OPENROUTER_FREE_MODEL` id
  alongside the provider row, defaults uncatalogued OpenRouter ids to the house
  rate, and runs `_warn_on_unpriced_models()` at init. **(L4)**
- `app/api/admin.py` — `GET /admin/dashboard` gated on `admin_view_dashboard`;
  `GET /admin/limits` documented as deliberately ungated (it is the UI's
  permission bootstrap; gating it would blank the admin UI).

*Tests*

- `tests/regression/test_limits_billing_guards.py` — 11 new/updated cases (see
  Unit Test Plan). `test_get_user_limit_missing_feature_is_uncapped` renamed to
  `..._is_denied` and inverted.
- `tests/unit/test_ai_tokens.py` — provider-fallback pricing and the
  configured-OpenRouter-model guard.
- `tests/unit/test_deep_hunt_intent.py` — passes the now-required `ai_service`.

*Guard*

- `scripts/check-provider-call-billing.py` — **new.** AST scan of `backend/app`
  that fails when a function talks to a provider but never charges, or when an
  `ai_service` parameter defaults to `None`. Reviewed exceptions live in an
  `EXEMPT` dict that must name the caller that bills instead; an entry that
  stops matching is reported as stale, so a rename cannot silently hand a pass
  to whatever occupies that name next.
- `Makefile` — new `guard-billing` target, wired as the first step of `check`.

*Context*

- `AI-Context/technical/ai-token-economy.md`, `.../ai-integrations.md`,
  `AI-Context/functional/feature-ai-token-economy.md`,
  `AI-Context/business/decisions.md` (BD-011).

Verification completed:

- Static review of every `AiService` construction site, every `charge` /
  `charge_flat_fee` / `charge_tokens` call site, every
  `check_and_increment_limit` call site, and every direct provider HTTP call in
  `backend/app/`.
- Before flipping L7 to deny-by-default, enumerated every feature string
  reachable from an enforcement helper (literal, f-string, and variable-driven)
  and confirmed all are present in `DEFAULT_ROLE_LIMITS` — the flip is safe.
  `test_every_enforced_feature_has_a_seed_row` locks that in.
- All edited modules compile and import cleanly; `apply_plan_expiry` verified
  against expired / active / null / unparseable `plan_ends_at`;
  `ai_service`-required and `record_external_search`-removed both confirmed by
  introspection.
- `make guard-billing` passes on the fixed tree (16 reviewed exemptions).
- **The guard was verified against the real leaks, not just run once.** L1/L2
  were re-introduced by restoring `ai_service: Any = None` and L5 by reverting
  `_tavily_search` to a no-charge body; the guard failed on each with the
  expected message, and passed again once the files were restored. A guard that
  has never been shown to fail is not evidence of anything.
- **Tests were written but not executed**, per project convention. Run
  `pytest backend/tests/regression/test_limits_billing_guards.py backend/tests/unit/test_ai_tokens.py backend/tests/unit/test_deep_hunt_intent.py`.

Decisions taken during implementation:

- **L5 mid-run exhaustion → abort, not degrade.** An Advisor Atlas run that
  cannot pay for its next search raises `OutOfTokens` and fails. Degrading to
  deterministic-only would still crawl and still cost, and would hand the user a
  visibly worse dossier with no explanation. Recorded under BD-011.
- **L8 pricing shape: base fee + token component**, rather than reverting to
  pure token metering. Keeps the admin's `jina_call_cost_usd` knob meaningful,
  reuses the already-seeded `ai_models` row that previously drove nothing, and
  preserves the SCHOLARDOCX-0180 single-charge invariant.
- **`GET /admin/limits` stays ungated.** It is how `AdminView.tsx` discovers its
  own permissions; gating it on `admin_manage_role_limits` would 403 the
  bootstrap and blank the admin UI for an admin who merely lacks that one tab.
  The toggle remains a UI-only affordance, now documented as such at the route.

Follow-ups:

- Run the test suite and record results here.
- Existing deployments: `_seed_ai_token_defaults` uses `ON CONFLICT DO NOTHING`,
  so the new OpenRouter row is added on next init without touching admin-edited
  prices. Confirm the startup log is clean (no `AI PRICING WARNING`) after
  deploy — that line is the L4 canary.
- Watch `credits_used` on Advisor Atlas runs and the per-analysis Jina charge
  after deploy: both legitimately increase, and support should know why before
  users ask.
- ~~Consider a CI guard that fails when a new `httpx` provider call is added
  without a charge site nearby~~ **Done** — `scripts/check-provider-call-billing.py`,
  wired into `make check`.
- The `check` target's comment claims CI runs the same command via
  `.github/workflows/ci.yml`, but that workflow does not exist (only
  `cleanup-pending-accounts.yml` and `downgrade-expired-users.yml` do). Pre-dates
  this task and left alone, but it means `make check` — and therefore the new
  billing guard — is currently a local gate only. Worth closing separately.
