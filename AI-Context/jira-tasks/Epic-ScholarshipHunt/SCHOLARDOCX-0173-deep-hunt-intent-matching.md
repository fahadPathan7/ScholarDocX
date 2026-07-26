# SCHOLARDOCX-0173: Deep Hunt intent matching & field-of-study dimension

Status: In Progress

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-26

## Summary

Deep Hunt currently leans entirely on raw Tavily search and returns generic
results that ignore the user's stated intent. Querying "emjm fully fund in cse
background" returns generic Erasmus Mundus pages (literature, policy, etc.)
instead of CS/Engineering-specific programs. This story adds an AI intent
pipeline around the web search (query planning + relevance filtering + ranking)
and surfaces field-of-study end-to-end so results actually match the user's
goal.

## Problem

Verified root causes from a full pipeline audit:

1. **Dumb query generation** — `_build_queries` in `scholarship_deep_hunt.py`
   concatenates hard-coded suffixes to the raw goal. "cse" is never expanded to
   "computer science"; "emjm" is never expanded to "Erasmus Mundus Joint
   Masters." The News tab already has an LLM query rewriter
   (`news_query_generator.py`); Deep Hunt does not use it.
2. **No field-of-study dimension** — extraction schema, the
   `scholarship_opportunities` table, and the fit score all lack a
   field/discipline field. The Hunt Profile's `field_of_study` is collected but
   never sent to the backend and never scored.
3. **Accept gate ignores relevance** — `_is_acceptable` only checks
   well-formedness. A literature scholarship with a deadline passes.
4. **No relevance ranking** — results come back `ORDER BY updated_at DESC`.
   Off-topic and on-topic results are interleaved.
5. **Fit score ignores the goal** — `computeFitScore` uses only degree /
   destination / deadline / funding. The user's goal text has zero effect.

Guiding principle (user): web search is an *ingredient*, not the product. The
AI must ensure results match intent at every stage after the search call.

## Acceptance Criteria

- [ ] A query planner (LLM) rewrites the goal into 3-4 diverse search queries,
      expanding acronyms (CSE/CS→Computer Science, EMJM→Erasmus Mundus Joint
      Masters, EU→European Union) and targeting official program pages.
- [ ] The planner gracefully falls back to the existing deterministic query
      templates on any error.
- [ ] A relevance filter rejects opportunities that do not match the goal's
      field/degree/funding intent, using a batched LLM call with a deterministic
      synonym-keyword fallback.
- [ ] Results are returned ordered by relevance, then deadline urgency — not
      `updated_at`.
- [ ] `fields_of_study` is extracted, persisted (`fields_of_study_json` column),
      unpacked, and surfaced as a fit-score chip (`✓ computer science` /
      `✗ not in your field`).
- [ ] `field_of_study` from the Hunt Profile is sent to the backend run and
      stored, so the planner and filter can use it.
- [ ] Two new LLM calls per run (planner + relevance batch); both use the free
      OpenRouter model with reasoning excluded. Extraction cost unchanged.
- [ ] Unit tests cover acronym expansion, relevance rejection of off-topic
      results, field-of-study persistence, and `_is_acceptable` rejection.
- [ ] `pytest backend/tests` green; `tsc --noEmit` clean.

## Technical Approach

See the approved plan in the implementation session. Phases:

- **Phase A** — LLM intent pipeline: new `deep_hunt_query_planner.py`, wire into
  `scholarship_deep_hunt.py` (`_plan_queries` + `_is_relevant` + relevance
  ranking), bump `SEARCH_PASSES` 3→4.
- **Phase B** — field-of-study dimension: new `fields_of_study_json` column
  (opportunities) + `fields_of_study` column (runs) via `ALTER TABLE ... ADD
  COLUMN IF NOT EXISTS` migration helpers; extraction schema + normalize;
  `upsert_scholarship_opportunity` + `_with_parsed_fields`; `computeFitScore`
  field criterion; API request + frontend wiring.
- **Phase C** — tests + AI-Context updates.

## Out of Scope

- Changing crawl/extract budget beyond `SEARCH_PASSES` 3→4.
- Server-side full fit scoring (stays client-side per planbook Phase 3 /
  SCHOLARDOCX-0123).
- Sending nationality/GPA to providers (privacy — opt-in, unsent by default).
- Vestigial `news_searches_per_day`/`per_month` quota cleanup (separate).

## Verification

- **Scholarship test files**: `pytest tests/unit/test_scholarship_deep_hunt.py
  tests/unit/test_deep_hunt_intent.py tests/unit/test_scholarship_extraction.py
  tests/unit/test_scholarship_opportunities.py` — 44/44 pass together.
- **New intent tests** (`test_deep_hunt_intent.py`, 16 tests): acronym synonym
  expansion (CSE→computer science), relevance heuristic accept/reject/neutral,
  `_is_acceptable` relevance floor + well-formedness, planner fallback when
  OpenRouter is unconfigured, `_fallback_queries` regression, and
  `fields_of_study_json` persistence.
- **Frontend**: `tsc --noEmit` clean.
- **Existing pipeline tests**: updated `_install_pipeline_mocks` to stub
  `_plan_queries` + `relevance_filter.score` so the search→crawl→extract→persist
  tests stay deterministic regardless of `OPENROUTER_API_KEY`.

## Changed Files

- `backend/app/services/deep_hunt_query_planner.py` — **NEW**: query planner +
  relevance filter (OpenRouter Free, deterministic fallbacks).
- `backend/app/services/scholarship_deep_hunt.py` — wire planner + filter,
  relevance-ranked `get_run`, `SEARCH_PASSES` 3→4, `_build_queries`→
  `_fallback_queries`, tightened `_is_acceptable`, persist `relevance_score`.
- `backend/app/services/scholarship_extraction.py` — `fields_of_study` in
  schema hint + `_EMPTY_RESULT` + `_normalize`.
- `backend/app/api/scholarship_opportunities.py` — persist +
  unpack `fields_of_study_json`.
- `backend/app/api/scholarship_deep_hunt.py` — accept `field_of_study`.
- `backend/app/db/models.py` — `fields_of_study_json` + `relevance_score`
  (opportunities), `fields_of_study` (runs).
- `backend/app/db/connection.py` — `_add_scholarship_fields_of_study_columns`
  migration helper (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` x3).
- `backend/app/services/store.py` — allowlist `fields_of_study_json` +
  `relevance_score` on `scholarship_opportunities`.
- `backend/tests/helpers.py` — fix `cleanup_user_records` child→parent ordering
  for the deep-hunt chain (was orphansing runs on the shared test DB).
- `backend/tests/unit/test_scholarship_deep_hunt.py` — stub planner + filter in
  `_install_pipeline_mocks`.
- `backend/tests/unit/test_deep_hunt_intent.py` — **NEW** (16 tests).
- `frontend/src/lib/huntProfile.ts` — field-of-study criterion +
  word-boundary synonym matching in `computeFitScore`.
- `frontend/src/lib/scholarshipOpportunitiesApi.ts` — `fields_of_study` field.
- `frontend/src/lib/scholarshipDeepHuntApi.ts` — `field_of_study` in request.
- `frontend/src/components/news/DeepHuntView.tsx` — send `field_of_study`.
- `AI-Context/planbook/scholarship-hunt-pipeline.md`,
  `AI-Context/technical/ai-integrations.md` — context updates.

## Known Limitations / Follow-ups

- The heuristic synonym map (`FIELD_SYNONYM_GROUPS` / `_heuristic_field_synonyms`)
  covers common STEM + business fields; niche fields fall through to the raw
  text. The planner's own `field_synonyms` (per-run) is the primary source and
  covers anything the AI recognises.
- `relevance_score` defaults to 0 for opportunities created before this change
  (Analyze/Library rows), so they sort last within a Deep Hunt run. Acceptable
  since pre-0173 runs did not compute relevance.
