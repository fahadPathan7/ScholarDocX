# SCHOLARDOCX-0218: AI cost transparency + pre-flight ceilings (audit batch 2)

Status: Review

Owner: AI Agent

Epic: Epic-AuditRemediation

Created: 2026-11-01

## Summary

Close the audit's partial-failure billing and blind-commit findings: every
expensive AI flow gets a worst-case credit ceiling computed BEFORE it starts
(the Deep Hunt pattern), pre-flight affordability against that ceiling, and
the UI shows the estimate up front. Also: Deep Hunt polling survives closing
its detail panel, its locked state becomes a proper upgrade card, and the
assistant shows when a web search ran.

## Business Context

Links:

- Business file: [../business/decisions.md](../../business/decisions.md) (BD-011)

Business value:

- Users stop committing credits blind on the three most expensive flows (research chat, paper analysis, advisor runs).
- No more "search fee charged, answer never delivered" dead ends.

## Functional Context

Links:

- Functional file: [../functional/feature-ai-assistant.md](../../functional/feature-ai-assistant.md)

Requirements:

- Pre-run worst-case credit estimate shown for Research Expert analysis and Advisor Atlas runs (Deep Hunt already has one).
- Affordability pre-flight rejects (402) BEFORE any provider call when the ceiling isn't covered.
- When a research answer fails for billing reasons after the web-search fee was charged, the 402 copy says the search fee was already deducted.

## Technical Context

Links:

- Technical file: [../technical/billing-contract.md](../../technical/billing-contract.md)
- Technical file: [../technical/ai-token-economy.md](../../technical/ai-token-economy.md)

Technical notes:

- Mirror `scholarship_deep_hunt.py` create-time `cost_estimate` + affordability pre-check (read it first; reuse its helpers/conventions, incl. USD→credits conversion used by DeepHuntView).
- Research chat (`/ai/research`): ceiling = Tavily flat fee + answer-LLM worst case (document the conservative token constants chosen).
- Research Expert: paper payload carries `analysis_cost_estimate`; analyze route pre-flights it.
- Advisor Atlas: create response carries `cost_estimate` = per-candidate worst case × expected candidates.
- `FloatingAssistant` consumes `search_performed`/`search_query` already returned by `/ai/research`.

## Scope

In scope:

- Backend: ceilings + pre-flight + honest 402 for the three flows; tests.
- Frontend: estimates on Research Expert ask affordance and Advisor Atlas search form; Deep Hunt polling in list layer / refetch on open; Deep Hunt locked card aligned with Research Expert's upgrade card; "Searched the web" chip in the assistant.

Out of scope:

- Streaming, cancellation, persisted per-session counters (separate stories).
- Refund flows (pre-flight makes the window negligible).

## Acceptance Criteria

- The three flows 402 before any provider call when the ceiling isn't affordable.
- Research answer billing failure after a charged search says the search fee was deducted.
- Estimates visible pre-run in Research Expert and Advisor Atlas UI.
- Deep Hunt run keeps updating when its detail panel is closed; history modal refetches on open; locked state shows an upgrade CTA.
- Assistant shows a subtle "Searched the web" indicator when a search ran.

## Implementation Plan

- Parallel: backend agent (ceilings/pre-flight/402/tests), frontend agent (surfacing + Deep Hunt fixes + chip).
- Verify with tsc + compileall + guards only (no test execution).

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Research ceiling math + pre-flight rejection (mocked pricing).
- Research Expert estimate in paper payload + analyze pre-flight rejection.
- Advisor Atlas estimate in create response + pre-flight rejection.
- Honest-402 copy path (answer charge fails after search fee).

If no unit tests are needed, explain why:

- n/a

## File Size Check

Files expected to be edited:

- backend: `api/routes.py`, `services/ai.py`, `services/research_paper_service.py`, `api/research_reader.py`, `services/advisor_atlas/service.py`, `api/advisor_atlas.py`, tests.
- frontend: `ResearchExpertView.tsx`, `AdvisorAtlasView.tsx` (+ advisor-atlas css), `news/DeepHuntView.tsx` (+ news.css), `FloatingAssistant.tsx` (+ styles.css if needed).

Line-count risk:

- Medium — `research_paper_service.py` (1700) and `FloatingAssistant.tsx` (1219) are over the grace limit; additions must be localized (splits remain SCHOLARDOCX-0180/0217 follow-ups).

## Verification Plan

- `npx tsc --noEmit`; `python -m compileall -q app`; both guard scripts.

## Completion Notes

Status: Review (implemented on branch `fix/audit-remediation-0217`; tests written but NOT executed per CODE_RULES).

Changed files:

Backend:
- `api/routes.py` — `/ai/research` pre-flights the worst case (Tavily flat fee + conservative answer ceiling; web-results tokens computed from the request's own `max_results × max_chars`; model resolved via `AiService._parse_model_choice` — now a staticmethod — or the priciest active chat model from `ai_models` when none is named). 402 plain copy.
- `services/ai.py` — `RESEARCH_MAX_INPUT_TOKENS` (6,000, several × real prompt headroom) / `RESEARCH_MAX_OUTPUT_TOKENS` (4,000); answer-side `chat()` inside `research()`'s search branch re-raises OutOfTokens as `RESEARCH_ANSWER_OUT_OF_CREDITS_MESSAGE` ("web-search fee was already deducted") — routing call and no-search branch keep the truthful generic copy.
- `services/research_paper_service.py` — `estimate_analysis_cost` (Jina embedding flat fee + 250-token query embedding + analysis call over the paper's top-K largest sections by stored token_count, priced across the model cascade and taking the max); analyze pre-flights it; `list_papers`/`get_paper` payloads carry `analysis_cost_estimate: {max_credits}`. File now 1840 lines — split is overdue (follow-up).
- `api/advisor_atlas.py` — create pre-flights the ceiling, 402 plain copy naming the candidate cap; response carries `cost_estimate: {max_candidates, max_credits}`.
- `services/advisor_atlas/cost_estimate.py` (new, 158 lines) — `estimate_run_cost` counting every billable call at the pipeline's caps (each constant documents its call site). Seeded defaults: professor mode ≈ 3,471 credits; department mode ≈ 137,625 (~7% of the Pro monthly allowance — a true worst case, affordable for the gated tiers).

Frontend:
- `ResearchExpertView.tsx` + `research-expert.css` — "Up to N credits per analysis" hint under the Ask AI form (tooltip explains worst case vs actual).
- `AdvisorAtlasView.tsx` + `advisor-atlas.css` — "Up to N credits · up to M professors per search" under the search submit once known (create response / selected run), via a scroll wrapper that avoids touching the non-editable search form.
- `news/DeepHuntView.tsx` + `news.css` — list-layer polling while any run is queued/running (detail-panel close no longer kills updates); runs refetch when the history modal opens; live stage chip on in-flight history rows; locked state is now an upgrade card (feature list + CTA) instead of "ask an admin".
- `FloatingAssistant.tsx` + `styles.css` — "Searched the web (— query)" chip above answer bubbles when `search_performed`; persisted with the session.
- `App.tsx` + `ScholarshipNewsView.tsx` — `onNavigateToPlans` threaded to DeepHuntView's `onUpgrade` (agent's follow-up wiring, done by orchestrator).

Context: `ai-token-economy.md` — worst-case pre-flight ceilings section.

Verification completed:

- `npx tsc --noEmit` (frontend): exit 0. `python -m compileall -q app` + py_compile all touched tests: OK.
- `check-provider-call-billing.py`: ok. `check-context-drift.py`: ok (re-run after context edits).
- Jargon/leak scan on the new diff: internal identifiers only; no user-facing copy violations.
- No pytest/vitest execution (CODE_RULES).

Unit tests added or updated:

- `tests/unit/test_ai_research_cost_preflight.py` (new) — 402 before any provider work; affordable proceeds; `web_search_max_results=0` skips ceiling; honest-402 wrap (exact copy after charged fee); no-search keeps generic copy.
- `tests/unit/test_research_paper_cost_estimate.py` (new) — per-paper estimates in payloads (top-K sizing proven: 635/635/645); analyze pre-flight 402 before retrieval; affordable path with mocked provider boundary.
- `tests/unit/test_advisor_atlas_cost_estimate.py` (new) — estimator shapes for both modes (exact values under documented fake pricing); create response field; 402 with nothing persisted.
- `tests/regression/test_limits_billing_guards.py` — plain-language 402 guard cases for `/ai/research` + Advisor Atlas (mirrors Deep Hunt's, incl. no-jargon assertions).
- `tests/unit/test_advisor_atlas_limits.py` — 3 create_run tests updated for the ceiling; fixed pre-existing breakage (FakeRepository lacked `count_runs` required since SCHOLARDOCX-0186 — those tests were crashing before this change).

Follow-ups:

- `research_paper_service.py` (1840) needs the split demanded by SCHOLARDOCX-0180/0211 before the next feature touches it.
- Dead `.deep-hunt-locked` rules in `news/deep-hunt.css` — delete when that file is next touched (deep-hunt.css is at its size cap).
- Once backend types are folded into `lib/api.ts`, the local optional estimate types in ResearchExpertView/AdvisorAtlasView become redundant casts (cosmetic).
- Department-mode Advisor Atlas ceiling is large by construction (worst case at caps); if real runs never approach it, tighten the pipeline caps rather than the estimator.
