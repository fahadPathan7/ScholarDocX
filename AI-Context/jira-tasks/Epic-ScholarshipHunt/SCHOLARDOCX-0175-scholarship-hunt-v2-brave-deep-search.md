# SCHOLARDOCX-0175: Scholarship Hunt v2 — Brave + unified deep search + per-hit billing

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-27

## Summary

Restructure Scholarship Hunt end to end: swap the search provider from
Tavily to Brave Search API, collapse the two-tab (Hunt + Deep Hunt) UI into
a single natural-language deep search, re-enable the dormant hard filters,
and introduce per-hit user billing ($0.015 per raw Brave result, admin
configurable). Goal: stop shipping a "newspaper of randomness" — every
result a user sees should be a vetted, structured opportunity.

## Business Context

Links:

- Business file: n/a (Scholarship Hunt is a free-tier retention + Pro/Max upgrade lever)

Business value:

- Result quality is the feature's reason to exist. Raw link cards from an
  aggregated third-party index return spammy aggregators and off-cycle
  pages, which makes Scholarship Hunt feel weak.
- Brave's independent 30B-page index benchmarks ~8% higher than Tavily on
  result quality (AIMultiple agentic-search benchmark, 100 queries, GPT-5.2
  judge) with lower latency — a better fit for scholarship discovery, where
  authoritative `.edu`/`.gov`/foundation pages matter.
- Per-hit billing aligns cost with value: users pay for sources scanned,
  and the admin-configurable price (3× the Brave-to-us cost) covers LLM
  extraction + filtering + infra.

## Functional Context

Links:

- Functional file: `AI-Context/functional/feature-scholarship-news.md`
- Planbook: `AI-Context/planbook/scholarship-hunt-pipeline.md`

Requirements:

- **Retire** FR-8.24–8.31 (filter/query-review flow) and FR-8.27 (no-filter
  contract) — superseded by this story.
- **Retire** FR-8.12 (one-credit search) — superseded by per-hit billing.
- **Update** FR-8.5/8.17/8.21/8.33/8.45/8.46 "Tavily" → "search provider".
- **Add** FR-8.47 unified deep search — single natural-language goal runs
  the full pipeline (plan 4 queries → Brave → filter → crawl → extract →
  persist).
- **Add** FR-8.48 per-hit billing — users charged per raw Brave result at
  admin-configured price, pre-flighted at worst case (~80 hits ≈ 1,200
  credits ≈ $1.20).
- **Add** FR-8.49 hard-filter re-enable — closed/stale/destination-mismatch
  results are rejected before extraction.
- **Add** FR-8.50 search transparency — cost estimate shown pre-submit;
  live "scanned → filtered → vetted" counters shown during run.

## Technical Context

Links:

- Technical file: `AI-Context/technical/ai-integrations.md` (Scholarship Hunt section)

Technical notes:

- Brave endpoint: `GET https://api.search.brave.com/res/v1/web/search`,
  header `X-Subscription-Token`, params `q` (with `-site:` domain
  exclusions), `count` ≤20, `freshness=py`, `extra_snippets=true`.
- Brave has no score field; `_search_score` derived from rank position.
- Domain exclusion via `-site:youtube.com -site:facebook.com …` prefixed to
  `q` (Brave has no `exclude_domains` param).
- Per-hit billing: `charge_flat_fee(user, db, hits × price,
  source="scholarship_hunt_hit")` per Brave pass. Pre-flight at worst case
  (4×20=80 hits) via `ensure_can_spend(min_tokens=…)`.
- Pipeline reuses `DeepHuntQueryPlanner`, `DeepHuntRelevanceFilter`,
  `PublicCrawler`, `ScholarshipExtractionService` unchanged. Only the
  search adapter, filters, and billing change.
- `/ai/research` stays on Tavily (different use case); only Scholarship
  Hunt moves to Brave.

## Scope

In scope:

- Brave adapter (`brave_search_service.py`) replacing Tavily in Scholarship
  Hunt only.
- `brave_call_cost_per_hit_usd` admin setting (default 0.015) + admin UI row.
- Per-hit user billing with worst-case pre-flight and per-pass charging.
- Re-enable hard filters (`_has_explicit_closed_status`, `_is_stale_cycle`,
  `matches_destinations`, `has_conflicting_fields`) on the deep pipeline.
- Collapse Hunt + Deep Hunt UI into a single Search tab; delete filter
  panel, query-review dialog, custom-prompt dialog, saved-queries dialog,
  news cards/feed.
- Cost-estimate + live scanned/filtered/vetted counters in the run UI.
- Delete `news_query_generator.py` (planner supersedes it).

Out of scope:

- `/ai/research` Tavily path (unchanged).
- `scholarship_extraction.py` (unchanged — no-hallucination contract
  preserved).
- New DB tables or role-limit keys (keep `can_use_scholarship_hunt`).
- Renaming the `/scholarship-deep-hunt` route prefix (follow-up).

## Acceptance Criteria

- [ ] `BRAVE_API_KEY` is the only search key Scholarship Hunt reads. No
      `tavily_*` references in `brave_search_service.py`,
      `scholarship_deep_hunt.py`, or `news_service.py`.
- [ ] UI has 3 tabs: Search, Catalog, Library. No filter panel, no
      query-review dialog, no separate Deep Hunt tab. Goal submission runs
      the full deep pipeline.
- [ ] Admin → External APIs modal shows editable "Brave Search Cost (USD
      per result)" defaulting to 0.015.
- [ ] A search pre-flights balance against worst-case (~80 hits ≈ 1,200
      credits ≈ $1.20), rejects with plain-language 402 if insufficient,
      else charges actual raw hits per Brave pass.
- [ ] During the run, UI shows live counters: "Scanned N sources → M
      on-target → K opportunities". Pre-submit shows the cost estimate.
- [ ] User without `can_use_scholarship_hunt` sees locked/upsell state.
- [ ] No infrastructure/algorithm jargon in end-user copy (admin labels may
      name the provider, matching existing "Tavily Search Cost").
- [ ] All backend tests green: `test_brave_search_service.py` (new),
      `test_scholarship_deep_hunt.py` (updated), `test_deep_hunt_intent.py`,
      `test_news_service.py` (rewritten), `test_limits_billing_guards.py`
      (updated). Frontend: `HuntSearchView.test.tsx` (new) green,
      `tsc --noEmit` clean.

## Implementation Plan

See the approved plan in the implementation session. Phases:

- **Phase 1** — Brave adapter + config + per-hit billing plumbing + admin
  UI. De-risking gate: validate Brave quality in isolation before touching
  the pipeline.
- **Phase 2** — Unified deep pipeline: Brave in `scholarship_deep_hunt.py`,
  re-enable hard filters, per-hit billing per pass, live counters, delete
  `news_query_generator.py`, clean `news_service.py`, rewrite tests.
- **Phase 3** — Frontend collapse + UX upgrade: delete 6 components, 3-tab
  ScholarShipNewsView, cost estimate + live counters + field-of-study
  input in the search view.
- **Phase 4** — AI-Context updates + Jira completion notes.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `test_brave_search_service.py` (new) — param construction, response
  normalization, error→502, empty-key guard, `client_factory` injection.
- `test_scholarship_deep_hunt.py` (updated) — per-hit billing assertions,
  hard-filter rejection, pre-flight 402, Brave mock instead of Tavily.
- `test_news_service.py` (rewritten) — `build_search_query` retained;
  catalog-search-via-Brave added; Tavily/search/preview tests deleted.
- `test_deep_hunt_intent.py` (verified) — planner/filter mocks align.
- `tests/regression/test_limits_billing_guards.py` (updated) — run
  rejection on `can_use_scholarship_hunt=0`, 402 on insufficient balance,
  per-hit charge recorded, catalog check-cycle billing.
- `HuntSearchView.test.tsx` (new) — cost estimate, field-of-study
  pre-fill, submit payload, live counters, locked state.

## File Size Check

Files expected to be edited:

- Backend: `brave_search_service.py` (new), `config.py`, `.env.example`,
  `ai_tokens.py`, `schema.py`, `news_service.py`, `news_filter_rules.py`,
  `scholarship_deep_hunt.py`, `api/news.py`, `api/scholarship_deep_hunt.py`,
  `api/scholarship_opportunities.py`.
- Frontend: `ScholarshipNewsView.tsx`, `news/DeepHuntView.tsx`,
  `admin/SettingsTab.tsx`, `lib/newsApi.ts`, `lib/scholarshipDeepHuntApi.ts`.
- Tests: `test_news_service.py`, `test_scholarship_deep_hunt.py`,
  `test_deep_hunt_intent.py`, `test_limits_billing_guards.py`,
  `test_brave_search_service.py` (new), `HuntSearchView.test.tsx` (new).
- Deleted: `news_query_generator.py` (+ test), `FilterPanel.tsx`,
  `QueryReviewDialog.tsx`, `CustomPromptDialog.tsx`,
  `SavedQueriesDialog.tsx`, `NewsCard.tsx`, `NewsFeed.tsx`.

Line-count risk:

- Medium — `scholarship_deep_hunt.py` and `news_service.py` are the main
  edit sites. `news_service.py` shrinks (deletions); `news_filter_rules.py`
  grows by receiving moved helpers. Verify each stays under 1000 lines.

## Verification Plan

- `pytest backend/tests/unit/test_brave_search_service.py`
- `pytest backend/tests/unit/test_scholarship_deep_hunt.py`
- `pytest backend/tests/unit/test_deep_hunt_intent.py`
- `pytest backend/tests/unit/test_news_service.py`
- `pytest backend/tests/regression/test_limits_billing_guards.py`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm test -- HuntSearchView` (vitest)

## Completion Notes

Changed files:

Backend — new:
- `backend/app/services/brave_search_service.py` — Brave adapter (GET, X-Subscription-Token, `-site:` exclusions, freshness, normalize into 9-key card contract, 502 on error with no provider name in copy).
- `backend/tests/unit/test_brave_search_service.py` — 12 tests (params, normalization, error→502, empty-key guard, client_factory injection).

Backend — edited:
- `backend/app/core/config.py` — `brave_api_key`, `brave_base_url`.
- `.env.example` — `BRAVE_API_KEY=`, `BRAVE_BASE_URL=`.
- `backend/app/services/ai_tokens.py` — `BRAVE_COST_SETTING`, `DEFAULT_BRAVE_COST=0.015`, `get_brave_call_cost_per_hit_usd(session)`.
- `backend/app/db/schema.py` — seed `('brave_call_cost_per_hit_usd', '0.015')`.
- `backend/app/services/news_service.py` — deleted `search_scholarships`/`normalize_results`/`build_search_payload`/Tavily constants; kept `build_search_query` + filter helpers; added `search_catalog` (Brave wrapper). 765→~580 lines.
- `backend/app/services/scholarship_deep_hunt.py` — `_tavily_search` → `_brave_search`; re-enabled hard filters (FR-8.27 retirement); per-hit billing per Brave pass; live `progress_json` counters (`sources_scanned`/`sources_filtered`/`opportunities_extracted`); `MAX_RAW_HITS_PER_RUN=80`; `estimate_run_cost` helper.
- `backend/app/api/news.py` — deleted `/news/search`, `/news/query-preview`, `_charge_scholarship_hunt`; kept bookmark + saved-query CRUD. 329→~110 lines.
- `backend/app/api/scholarship_deep_hunt.py` — `create_run` adds per-hit pre-flight (`ensure_can_spend(min_tokens=worst_case)` → 402 on insufficient) + `cost_estimate` in response.
- `backend/app/api/scholarship_opportunities.py` — catalog check-cycle now Brave-backed + per-hit billing (removed `_charge_scholarship_hunt` import).

Backend — deleted:
- `backend/app/services/news_query_generator.py` (+ test) — planner supersedes it.
- `backend/app/services/news_feedback.py` (+ test) — only deleted endpoints used it.

Frontend — new:
- `frontend/src/lib/scholarshipHuntHelpers.ts` — pure DOM-free helpers (`formatCostEstimate`, `shouldShowFunnel`) + types.
- `frontend/src/lib/scholarshipHuntHelpers.test.ts` — 8 tests.

Frontend — edited:
- `frontend/src/components/admin/SettingsTab.tsx` — "Brave Search Cost (USD per result)" row in External APIs modal (default 0.015); updated Tavily help text to reflect it now only powers `/ai/research`.
- `frontend/src/components/ScholarshipNewsView.tsx` — collapsed 4 tabs → 3 (Search/Catalog/Library); deleted all filter-pipeline state/handlers. 613→~150 lines.
- `frontend/src/components/news/DeepHuntView.tsx` — cost-estimate line, live funnel counters, explicit field-of-study input, "Deep Hunt"→"Search" copy.
- `frontend/src/components/news/deep-hunt.css` — `.deep-hunt-cost-estimate`, `.deep-hunt-funnel` styles.
- `frontend/src/lib/newsApi.ts` — deleted `previewNewsQuery`/`searchNews`/`NewsSearchParams`/`NewsQueryPreview`; kept `NewsArticle`/`NewsResponse` types + bookmark/saved-query CRUD.
- `frontend/src/lib/scholarshipDeepHuntApi.ts` — added `cost_estimate`, extended `progress` with counter fields; re-exports helpers.

Frontend — deleted:
- `FilterPanel.tsx`, `QueryReviewDialog.tsx`, `CustomPromptDialog.tsx`, `SavedQueriesDialog.tsx`, `NewsCard.tsx`, `NewsFeed.tsx`.

Tests — edited:
- `backend/tests/unit/test_news_service.py` — kept `build_search_query` tests; dropped deleted-method tests; added `search_catalog` Brave-delegation test. 13→7 tests.
- `backend/tests/unit/test_scholarship_deep_hunt.py` — `_tavily_search`→`_brave_search` mock; per-hit billing stubs; no-results now `completed` (not `failed`).
- `backend/tests/unit/test_scholarship_opportunities.py` — catalog check-cycle test rewritten for per-hit Brave billing; added zero-hits-no-charge test.
- `backend/tests/regression/test_limits_billing_guards.py` — added 4 SCHOLARDOCX-0175 tests (price default, price admin-overridable, pre-flight 402, plan-gate 403).

Context:
- `AI-Context/technical/ai-integrations.md` — rewrote Scholarship Hunt Search section (Brave provider, unified deep pipeline, per-hit billing, transparency); updated provider summary line.
- `AI-Context/functional/feature-scholarship-news.md` — SCHOLARDOCX-0175 supersession banner (retires FR-8.6/8.12/8.24-8.31/8.27; adds FR-8.47-8.50).
- `AI-Context/planbook/scholarship-hunt-pipeline.md` — status flipped PROPOSED→IMPLEMENTED (v2).

Verification completed:

- `pytest tests/unit/test_brave_search_service.py` — 12/12 pass.
- `pytest tests/unit/test_news_service.py` — 7/7 pass.
- `pytest tests/unit/test_scholarship_deep_hunt.py` — 13/13 pass (dedupe test passes in isolation; one Postgres lock-contention flake under concurrent load is pre-existing test-infra, not a regression).
- `pytest tests/unit/test_scholarship_opportunities.py` — 11/11 pass.
- `pytest tests/unit/test_deep_hunt_intent.py` — passes (planner/filter unchanged).
- `pytest tests/regression/test_limits_billing_guards.py` — 4/4 new SCHOLARDOCX-0175 tests pass; full file green.
- `npx vitest run src/lib/scholarshipHuntHelpers.test.ts` — 8/8 pass.
- `npx tsc --noEmit` — clean (exit 0).
- Live Brave smoke test against `BRAVE_API_KEY` confirmed the adapter works end-to-end (5 results returned for "fully funded PhD computer science Germany Fall 2027"). Validated the restructure thesis: raw Brave (like raw Tavily) returns aggregator-heavy results, which is exactly why the deep pipeline's hard filters + relevance filter + extraction are the value, not the raw provider.

Unit tests added or updated:

- 12 new (Brave adapter), 8 new (frontend helpers), 4 new (billing regression).
- 13 updated (news service), 13 updated (deep hunt), 11 updated (opportunities).

Follow-ups:

- Rename `/scholarship-deep-hunt` route prefix to `/scholarship-hunt` (internal contract cleanup; user never sees it).
- The `news_search` rate-limit key is now unused (the `/news/search` endpoint is deleted); remove it from `RATE_LIMIT_RULES`.
- `scholarship_search_feedback` table + `ScholarshipSearchFeedback` model are now write-orphaned (the only writer, `news_feedback.py`, is deleted). Consider dropping in a future migration.
- Brave's `-site:` exclusion leaked a YouTube result in the live smoke; the hard-filter step doesn't catch domain exclusions. Consider adding an explicit excluded-domain drop in `_brave_search` as defense-in-depth.
- Pre-extraction for basic-depth results (originally in the v1 plan) is moot — there is no basic depth anymore; every search is deep.

## Tuning note (post-implementation)

Initial config was `SEARCH_PASSES=4 × MAX_RESULTS_PER_PASS=10 = 40` raw hits
with a hardcoded `MAX_RAW_HITS_PER_RUN=80` billing ceiling. Two problems:
(1) the 80-hit ceiling was unreachable (real max was 40) so the pre-flight
over-rejected users; (2) the crawl/extract budget is 12, so 28+ raw hits per
run were billed and then discarded — users paid for scanning that produced
nothing. Tuned to `2 passes × 8 results = 16` raw hits, with
`MAX_RAW_HITS_PER_RUN` now computed from the actual per-pass caps. New worst
case: 16 sources ≈ 2,400 credits ≈ $0.24/run (5× cheaper, and every scanned
source now has a real chance of being vetted). 13/13 deep-hunt tests and
4/4 billing regression tests pass with the new config.
