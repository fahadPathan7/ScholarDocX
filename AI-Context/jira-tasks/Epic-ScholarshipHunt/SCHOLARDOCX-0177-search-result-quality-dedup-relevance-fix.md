# SCHOLARDOCX-0177: Search result quality — dedup, relevance, sponsor accuracy

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-28

## Summary

User-reported bug: running a Search (Deep Hunt) goal like "emjm scholarships
for cse background" returned many near-identical, generic results (repeated
"Erasmus Mundus" umbrella-program descriptions from different low-signal
source pages) and at least one card with a wrong sponsor/link attribution
(a non-DAAD scholarship displayed with "DAAD" as its sponsor). The user asked
for fewer, more accurate, query-specific results rather than a long list of
similar low-fit cards.

## Business Context

Result quality is Scholarship Hunt's reason to exist (see SCHOLARDOCX-0175).
A run that surfaces 9 near-duplicate generic cards with an occasional wrong
sponsor undermines the "vetted opportunity" value proposition the v2
restructure was built around.

## Functional Context

Links:

- Functional file: `AI-Context/functional/feature-scholarship-news.md`

Root causes identified in the existing SCHOLARDOCX-0173/0175 pipeline
(`backend/app/services/scholarship_deep_hunt.py`,
`backend/app/services/deep_hunt_query_planner.py`,
`backend/app/services/scholarship_extraction.py`):

1. Dedup only happens on exact normalized URL. Multiple different pages
   describing the same generic scholarship program (differing only by title
   punctuation/year) are extracted and persisted as separate opportunities.
2. The AI relevance filter treats a broad "umbrella" program page (fields
   spanning many unrelated disciplines, e.g. health + law + engineering) as
   RELEVANT whenever one listed field loosely overlaps the goal, even though
   it is not a field-specific match — the RELEVANCE_FLOOR (0.3) does not
   distinguish "technically relevant" from "generic and unspecific."
3. The extraction prompt has no rule against attributing "sponsor" to a
   hosting/aggregator site (e.g. a national exchange agency's public
   scholarship database that lists many programs it does not itself fund)
   rather than the organization actually named as funding the specific
   opportunity in the text.

## Scope

In scope:

- `scholarship_deep_hunt.py`: canonical-name-based dedup (in addition to the
  existing URL dedup) so near-duplicate titles (year/punctuation variants of
  the same program) collapse to the single best-evidenced entry (highest
  relevance score, tie-broken by field completeness) before persistence.
- `deep_hunt_query_planner.py`: strengthen `RELEVANCE_SYSTEM_PROMPT` to
  down-score broad/umbrella multi-field program pages that are not
  field-specific; mirror the intent in the deterministic heuristic fallback.
  Raise `RELEVANCE_FLOOR` from 0.3 to 0.4.
- `scholarship_extraction.py`: strengthen `EXTRACTION_SYSTEM_PROMPT` so the
  model does not name a listing/aggregator/database site as the sponsor
  unless the text explicitly states that organization funds the specific
  opportunity, and does not assume `application_url` is the crawled page
  itself when the text does not name an official application page.

Out of scope:

- No hard cap on the number of results a run can return (explicit user
  decision — rely on dedup + tightened relevance instead of a ceiling).
- No changes to the Brave adapter, billing, or run lifecycle.
- No changes to the static Catalog (unaffected — this is the Search/Deep
  Hunt AI pipeline only).

## Acceptance Criteria

- [ ] Two extracted opportunities whose canonical names differ only by year
      or punctuation (e.g. "Erasmus Mundus Scholarship 2026" vs "...2026–2027")
      collapse into one persisted opportunity, keeping the higher-relevance
      (or more complete, on tie) extraction.
- [ ] A broad/umbrella opportunity (5+ unrelated fields_of_study, no
      goal-specific field named) scores lower under the deterministic
      relevance fallback than a field-specific match.
- [ ] `RELEVANCE_FLOOR` is 0.4; existing floor-dependent tests still hold.
- [ ] `EXTRACTION_SYSTEM_PROMPT` explicitly instructs the model not to name a
      hosting/aggregator site as sponsor without explicit textual support.
- [ ] All existing Deep Hunt / intent / extraction unit tests remain green;
      new tests cover the dedup and broad-field behaviors.

## Unit Test Plan

- `backend/tests/unit/test_scholarship_deep_hunt.py` — new test: two distinct
  source URLs whose extractions produce the same dedup key persist as one
  opportunity, preferring the higher-relevance/more-complete extraction.
- `backend/tests/unit/test_deep_hunt_intent.py` — new tests: `_dedup_key`
  normalization (year/punctuation variants collapse, distinctly-named
  programs stay separate); heuristic relevance score is lower for a
  broad/umbrella field list than a specific one.
- `backend/tests/unit/test_scholarship_extraction.py` — new test: the
  extraction system prompt contains the sponsor/aggregator guardrail text
  (regression guard against prompt rewrites silently dropping it).

## Verification Plan

- `pytest backend/tests/unit/test_scholarship_deep_hunt.py`
- `pytest backend/tests/unit/test_deep_hunt_intent.py`
- `pytest backend/tests/unit/test_scholarship_extraction.py`

## File Size Check

Edited files are all well under the 1000-line target; no split needed.

## Completion Notes

Changed files:

Backend — edited:
- `backend/app/services/scholarship_deep_hunt.py` — added `_dedup_key`,
  `_extraction_completeness`, `_is_better_candidate` helpers; raised
  `RELEVANCE_FLOOR` 0.3 → 0.4; the persistence loop now groups accepted
  extractions by `_dedup_key(canonical_name)` and only upserts the
  highest-relevance (then most-complete) entry per group, instead of
  upserting every accepted item independently.
- `backend/app/services/deep_hunt_query_planner.py` — added a
  `BROAD_FIELD_LIST_SIZE=5` constant; strengthened `RELEVANCE_SYSTEM_PROMPT`
  with a rule that marks a 5+-unrelated-field "umbrella" program OFF_TOPIC
  even when the goal's field technically appears in the list; the
  deterministic `_heuristic_scores` fallback mirrors this (0.2 instead of
  0.7 for an overlap inside a broad field list).
- `backend/app/services/scholarship_extraction.py` — added two rules to
  `EXTRACTION_SYSTEM_PROMPT`: sponsor must not be a hosting/listing/
  aggregator site unless the text explicitly states it funds the specific
  opportunity; `application_url` must not be assumed to be the crawled page
  itself without textual support.

Backend — tests:
- `backend/tests/unit/test_deep_hunt_intent.py` — added
  `test_relevance_heuristic_scores_broad_umbrella_program_below_floor`,
  `test_relevance_heuristic_still_rewards_specific_field_match`,
  `test_dedup_key_collapses_year_and_punctuation_variants`,
  `test_dedup_key_collapses_year_range_variants`,
  `test_dedup_key_keeps_distinctly_named_programs_separate`.
- `backend/tests/unit/test_scholarship_deep_hunt.py` — added
  `test_service_run_collapses_near_duplicate_titles_across_urls` (two source
  URLs whose titles differ only by year collapse to one persisted
  opportunity, keeping the higher-relevance extraction).
- `backend/tests/unit/test_scholarship_extraction.py` — added
  `test_extraction_prompt_guards_against_aggregator_sponsor_misattribution`
  (regression guard on the new prompt rule's presence).

Context:
- `AI-Context/functional/feature-scholarship-news.md` — new SCHOLARDOCX-0177
  section (FR-8.51–8.53).
- `AI-Context/functional/requirements-index.md` — added FR-8.51–8.53 entries.
- `AI-Context/technical/ai-integrations.md` — updated the Scholarship Hunt
  Search pipeline section (relevance floor, broad-umbrella down-ranking,
  canonical-name dedup step, sponsor/link accuracy note) and the
  SCHOLARDOCX-0173 heuristic-fallback description.
- `AI-Context/jira-tasks/Epic-ScholarshipHunt/README.md` — added
  SCHOLARDOCX-0173/0175/0176/0177 to the story list.

Verification completed:

- `pytest backend/tests/unit/test_deep_hunt_intent.py
  backend/tests/unit/test_scholarship_deep_hunt.py
  backend/tests/unit/test_scholarship_extraction.py` — 41/41 pass (run in
  isolation; an earlier run showed 5 spurious failures caused by two
  full-suite pytest invocations racing on the same shared test database —
  same pre-existing Postgres lock-contention flake noted in SCHOLARDOCX-0175's
  completion notes, not a regression from this change).

Follow-ups:

- No hard cap on result count per run, by explicit product decision — if
  dedup + the tightened relevance floor still let more results through than
  desired in practice, revisit with a cap (e.g. top 5–8 by relevance).
- The canonical-name dedup key is intentionally conservative (year/
  punctuation/plural normalization only, no fuzzy token-overlap merging) to
  avoid collapsing distinctly-named programs into a generic one. If
  near-duplicate titles that aren't simple year/punctuation variants keep
  surfacing, consider a stricter same-domain-family or embedding-similarity
  merge as a follow-up.
