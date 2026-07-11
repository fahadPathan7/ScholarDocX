# SCHOLARDOCX-0109: Advisor Atlas deep-research upgrade

Status: Done

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-02

## Summary

Make Advisor Atlas research substantially deeper and more detailed in both modes,
always on, with no depth toggle. Professor mode gets more search passes, more
crawls, larger evidence excerpts, a third specialist AI pass, and more
publications/evidence. Discovery mode gets a new deep phase: after screening all
discovered faculty, the top ~15 candidates by research fit receive the full
Professor-grade deep pipeline instead of a single shallow search. Candidate
processing is parallelized with bounded concurrency so deeper runs stay
reasonably fast, and research telemetry becomes per-candidate accurate.

User decisions (2026-07-02): upgrade both modes; deep-dive top ~15 discovery
candidates by fit; always deep with no per-run depth selector. Token/search
volume is explicitly not a constraint; Atlas remains Pro/Max plan-gated and
token-metered.

## Business Context

Links:

- Business requirement: [BR-006 AI-Powered Strategic Assistance](../../business/business-requirements.md)

Business value:

- Advisor Atlas is the flagship marketing feature; dossier depth and evidence
  quality are its differentiators.
- Discovery-mode candidates currently get one shallow search each, so their
  dossiers are far weaker than Professor-mode ones; this closes that gap for the
  best-fit matches.

## Functional Context

Links:

- Functional file: [feature-advisor-atlas.md](../../functional/feature-advisor-atlas.md)

Requirements:

- FR-9.5/FR-9.18 (enrichment and multi-pass search) deepened: eight Professor
  search passes, higher per-pass result counts, larger crawl budgets.
- FR-9.6 amended: show up to eight verifiable publications (was four or five).
- New FR-9.59: Discovery runs deep-research the top ~15 candidates by research
  fit with the full Professor pipeline; deep-researched candidates are labeled.
- Evidence ledger disclosure raised from five to eight diverse sources.

## Technical Context

Links:

- Technical file: [ai-integrations.md](../../technical/ai-integrations.md)
- Technical file: [api-boundaries.md](../../technical/api-boundaries.md)

Technical notes:

- No API contract change; all changes are inside the advisor_atlas service
  package plus repository read limits and small frontend labeling.
- Specialist analysis becomes three passes: identity/research,
  publications, funding/recruitment.
- Per-candidate research usage dict replaces the shared run-level dict so
  telemetry is accurate per candidate and safe under concurrency.
- Bounded concurrency (semaphore) for candidate processing; the crawler gains a
  per-host lock so polite per-domain delays hold under concurrency.
- Secure personal workspace, backend-only providers, robots/SSRF safeguards all unchanged.

## Scope

In scope:

- Professor query plan: raise per-pass max_results; add scholar-metrics and
  news/activity passes (eight passes total).
- Crawl budgets: ranked crawl 10 to 16 pages; linked crawl 8 to 12; visual 2 to 3.
- Analysis inputs: final synthesis 18 to 26 sources at 1800 to 2600 chars;
  specialist passes 14 to 20 sources at 2200 to 3000 chars; third specialist pass.
- Publications cap 5 to 8 (validation, reconciliation, repository, tests).
- Evidence: stored ledger 12 to 16; visible ledger 5 to 8.
- Discovery: mapped units 8 to 10; directory crawls per unit 3 to 4; screening
  search 10 to 12 results; new deep phase for top ~15 by fit with progress
  stage, per-candidate failure isolation, and a research_depth label.
- Bounded concurrency for screening and deep phases; per-host crawler lock.
- Per-candidate research telemetry.
- Frontend: deep-research badge on candidates, funnel/telemetry copy, API type.
- Focused backend tests; context updates.

Out of scope:

- Any depth toggle or new API parameter.
- Quota/billing changes (token metering and plan gate unchanged).
- Robots/CAPTCHA/paywall behavior changes.
- Remote infrastructure of any kind.

## Acceptance Criteria

- [x] Professor runs execute eight purpose-tagged Tavily passes with the raised
  result counts.
- [x] Professor runs crawl up to 16 ranked sources plus up to 12 linked pages.
- [x] Final synthesis receives up to 26 sources with 2600-char excerpts; three
  specialist passes run when GLM is configured.
- [x] Up to eight verified publications persist and render.
- [x] Candidate detail returns up to eight evidence entries.
- [x] Discovery runs screen all candidates, then deep-research the top 15 by
  (match_score, evidence_confidence) with the full Professor pipeline.
- [x] Deep-researched candidates carry intelligence.research_depth = "deep";
  screened-only candidates carry "screened"; the UI labels deep candidates.
- [x] A single candidate's deep-research failure does not fail the run.
- [x] Cancellation still stops the run between candidates in both phases.
- [x] Research telemetry reflects only that candidate's searches, crawls, AI
  calls, and tokens.
- [x] Concurrent processing preserves per-domain politeness delays.
- [x] Focused backend tests pass; frontend production build passes.

## Implementation Plan

- backend/app/services/advisor_atlas/professor_research.py: expand
  professor_query_plan (eight passes, higher max_results).
- backend/app/services/advisor_atlas/analysis.py: three specialist passes,
  larger excerpts/source windows, publications cap 8.
- backend/app/services/advisor_atlas/service.py: per-candidate usage dicts,
  deep-discovery phase, raised budgets, bounded concurrency; extract the
  professor search/crawl helpers into research_pipeline.py to stay under the
  file-size target.
- backend/app/services/advisor_atlas/research_pipeline.py (new): professor
  research passes, ranked crawls, linked crawls.
- backend/app/services/advisor_atlas/crawler.py: per-host asyncio lock.
- backend/app/services/advisor_atlas/discovery.py: unit/directory/search budget
  raises.
- backend/app/services/advisor_atlas/repository.py: publications[:8], evidence
  LIMIT 8.
- frontend/src/lib/advisorAtlasApi.ts + advisor-atlas components: research_depth
  type and badge.
- backend/tests/test_advisor_atlas.py: update caps, add deep-selection,
  telemetry, and query-plan tests.

## Unit Test Plan

Unit tests needed:

- Yes.

Planned tests:

- professor_query_plan returns eight passes with expected kinds and raised
  max_results;
- deep-candidate selection picks top 15 by fit and labels research_depth;
- deep-phase failure isolation keeps the run completing;
- per-candidate telemetry counts only that candidate's usage;
- publications cap 8 through validation, reconciliation, and repository;
- evidence detail returns up to 8 entries;
- crawler per-host delay holds for two concurrent fetches to one host.

If no unit tests are needed, explain why:

- N/A.

## File Size Check

Files expected to be edited:

- service.py (909 lines, High risk: extract research_pipeline.py in the same task)
- analysis.py (577), professor_research.py (869), discovery.py (419),
  repository.py (502), crawler.py (292): Low/Medium.
- test_advisor_atlas.py: check before editing.

## Verification Plan

- pytest backend/tests/test_advisor_atlas.py and test_advisor_atlas_limits.py.
- Backend module compilation.
- Frontend tsc + production build.
- git diff --check (scoped).
- Verify funding-only evidence still never yields confirmed_open (existing
  validation untouched).

## Completion Notes

Completed: 2026-07-02

Key decisions:

- Deep research is always on with no per-run toggle (user decision).
- Discovery deep phase: top 15 screened candidates by (match_score,
  evidence_confidence) with a match-score floor of 30; constants live in
  `research_pipeline.py` (`DEEP_DISCOVERY_LIMIT`, `DEEP_MATCH_FLOOR`).
- Deep re-processing keeps the screening-phase discovery sources in play so an
  empty deep search can never produce a weaker dossier than screening did.
- Candidate refreshes always use the deep pipeline (they are explicit,
  token-metered user actions).
- Screening failures are isolated per candidate in Discovery mode; a Professor
  run still fails visibly because it has exactly one candidate.
- Bounded concurrency: 4 concurrent screenings, 2 concurrent deep dives; the
  crawler serializes per host so the 0.45s politeness delay holds.
- Per-candidate usage dicts replaced the shared `_research_usage`, making
  FR-9.38 telemetry candidate-accurate and concurrency-safe.
- The professor search/crawl helpers moved from `service.py` into a new
  `research_pipeline.py` to stay under the file-size target (service.py: 869
  lines after the change).

Changed files:

- `backend/app/services/advisor_atlas/research_pipeline.py` (new)
- `backend/app/services/advisor_atlas/service.py`
- `backend/app/services/advisor_atlas/analysis.py`
- `backend/app/services/advisor_atlas/professor_research.py`
- `backend/app/services/advisor_atlas/crawler.py`
- `backend/app/services/advisor_atlas/discovery.py`
- `backend/app/services/advisor_atlas/repository.py`
- `backend/tests/test_advisor_atlas.py`
- `backend/tests/test_advisor_atlas_deep.py` (new)
- `frontend/src/lib/advisorAtlasApi.ts`
- `frontend/src/components/advisor-atlas/AdvisorCandidateCard.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-intelligence.css`
- `AI-Context/functional/feature-advisor-atlas.md` (FR-9.6/9.32/9.37/9.38
  amended; FR-9.59 added)
- `AI-Context/technical/ai-integrations.md`

Verification completed:

- `pytest tests/test_advisor_atlas.py tests/test_advisor_atlas_deep.py`:
  `44 passed`.
- Full backend suite: `191 passed`; remaining failures verified pre-existing
  on a clean stash (`test_advisor_atlas_limits` FakeService lacks
  `ai_service` after the earlier `verify_model_permission` change;
  `test_openrouter_cost`; `test_api_auth` stale-workspace-database errors) and
  one order-dependent `test_api_auth_usage` failure that passes in isolation
  and alongside the Advisor Atlas suites.
- Backend module compilation: passed.
- Frontend `npm run build` (tsc -b + vite): passed.
- `git diff --check`: passed.

Unit tests added or updated:

- Added `test_advisor_atlas_deep.py`: deep selection ranking and floor,
  tie-breaking by confidence, full Discovery run with deep phase and
  per-candidate telemetry (8 deep passes vs 1 screening search), deep-failure
  isolation keeping the run completed, refresh-always-deep, and crawler
  per-host delay under concurrent fetches.
- Updated `test_advisor_atlas.py`: eight-pass query plan, evidence cap of
  eight, and monkeypatched signatures for `_discover_candidates` /
  `_tavily_search` usage plumbing.

Known limitations:

- No live Tavily/GLM keys in this environment, so provider paths were covered
  by mocked tests and deterministic fallback; a live Discovery run should be
  smoke-tested when keys are available.
- Browser verification of the new `Deep research` card badge was not performed
  (presentation-only chip verified through TypeScript and production build);
  check desktop and 390px rendering during the next in-app session.
- Deep Discovery runs consume substantially more tokens/searches per run by
  design; the monthly quota (FR-9.53) and token metering are unchanged.

Follow-ups:

- Fix the two pre-existing `test_advisor_atlas_limits.py` failures by giving
  the token-gating FakeServices an `ai_service` attribute (fallout from the
  SCHOLARDOCX-0084/model-permission change, out of scope here).
- `advisor-atlas.css` remains at 1162 lines (over the 1150 grace limit,
  untouched by this task); split it before the next form-heavy feature.
- Consider surfacing the deep/screened split in the Discovery funnel coverage
  panel (counts only) if users ask which candidates were deep-researched.
