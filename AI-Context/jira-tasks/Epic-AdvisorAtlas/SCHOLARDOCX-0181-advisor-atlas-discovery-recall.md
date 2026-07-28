# SCHOLARDOCX-0181: Advisor Atlas - Discovery Recall for Related Professors

Status: In Progress

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

Advisor Atlas discovery finds far fewer related professors than it should, and
for most academic disciplines it finds none at all beyond the user's own named
department. The cause is not tuning — it is that four separate components in the
discovery path each silently drop valid candidates.

All four were reproduced by executing the shipped code, not by reading it.

### 1. The related-unit taxonomy covers only a slice of academia

`intelligence.ACADEMIC_FAMILIES` is a hardcoded dict of five families
(computing, electrical, human_technology, life_science, quantitative). Any field
outside it produces an empty `concept_family()`, and `related_unit_score()` then
returns `0 / "unrelated"`. `extract_related_units()` drops everything below 50.

Observed, running the real functions against a source snippet that explicitly
lists chemistry-adjacent departments:

```
Chemistry              -> 1 unit: ['Chemistry']
Computer Science       -> 1 unit: ['Computer Science']
Mechanical Engineering -> 1 unit: ['Mechanical Engineering']
Economics              -> 1 unit: ['Economics']
Public Health          -> 1 unit: ['Public Health']
```

The single unit returned is not discovered at all — it is the `setdefault`
fallback of the requested field itself. Pairs a human would call obviously
related score 0:

```
  0 unrelated  'Chemistry'             -> 'Department of Chemical Engineering'
  0 unrelated  'Chemistry'             -> 'Department of Materials Science'
  0 unrelated  'Economics'             -> 'Department of Finance'
  0 unrelated  'Psychology'            -> 'Department of Cognitive Science'
  0 unrelated  'Mechanical Engineering'-> 'Department of Aerospace Engineering'
  0 unrelated  'Public Health'         -> 'Department of Epidemiology'
  0 unrelated  'Computer Science'      -> 'Department of Electrical Engineering'
```

CS→EE scoring 0 shows this is not only a coverage gap in the table; the
five families are mutually exclusive, so even the taxonomy's strongest area
cannot express adjacency.

**Downstream amplification**: `DiscoveryResearcher.collect()` iterates
`mapped_units[:10]`, issuing up to two searches plus up to four directory crawls
per unit. One mapped unit instead of eight or ten collapses the entire discovery
budget — the feature does roughly a tenth of the work the user is paying for, and
"related professors" becomes structurally unreachable.

### 2. `concept_family()` matches substrings, inventing relevance

Family terms are tested with `normalize(term) in normalized`. The term `"ai"`
therefore matches `ch**ai**r`, `cert**ai**n`, `dom**ai**n`, `m**ai**ntenance`,
`tr**ai**ning`. Observed:

```
{'computing'} <- 'Chair of Marine Biology'
{'computing'} <- 'Certain domains of medieval history'
{'computing'} <- 'Professor of Domain Law'
```

This feeds `semantic_fallback()`, so a genuinely unrelated professor is reported
to the user as a research match:

```
semantic_fallback(['artificial intelligence'],
                  'Professor of medieval French poetry, studies certain domains of verse.')
  -> is_research_match: True, semantic_score: 72
  -> '"artificial intelligence" shares the computing research domain.'
```

Precision and recall are therefore *both* wrong, in opposite directions: real
adjacent departments are discarded while spurious matches are promoted.

### 3. `UNIT_PATTERN` only recognises "<unit> of <name>"

The regex requires the literal connector `of`. Observed:

```
FOUND  ['Computer Science']  <- 'Department of Computer Science.'
MISSED []                    <- 'Center for Machine Learning.'
MISSED []                    <- 'Institute for Advanced Study.'
MISSED []                    <- 'Computer Science Department.'
MISSED []                    <- 'Division of Biology.'
MISSED []                    <- 'Robotics Institute.'
MISSED []                    <- 'Laboratory for Information and Decision Systems.'
```

`Center for X` and `Institute for X` are precisely the interdisciplinary units
where cross-field advisors sit, so this misses the highest-value targets. It also
misses trailing forms (`X Department`), `Division`, `Laboratory`, and `Group`.

### 4. `NAME_PATTERN` drops most non-Anglo faculty names

`[A-Z][A-Za-z'`.-]+` admits ASCII only and requires every word to start
uppercase. Observed:

```
MATCH   'John Smith'
DROPPED 'Ana María Rodríguez'
DROPPED 'Jürgen Müller'
DROPPED 'Maria van der Berg'
DROPPED 'François Lefèvre'
DROPPED 'Björn Andersson'
DROPPED '李明'
MATCH   'Professor John Smith'      <- title captured as part of the name
```

For a product whose users are applying to universities worldwide, silently
discarding accented, particle-bearing, and non-Latin names is a severe and
invisible recall failure. The inverse defect is also present: `Professor John
Smith` is accepted with the title glued into `display_name`.

A related narrowing sits beside it: `faculty_candidates()` requires the profile
URL path to contain one of `faculty|people|staff|professor|profile|directory|lab`.
Elsevier Pure portals (used by many universities) serve `/persons/<name>`, and
`/person/`, `/members/`, `/team/`, `/employees/` are all common — none match.

## Business Context

Links:

- [business/decisions.md](../../business/decisions.md)

Business value:

- Advisor Atlas is the flagship feature. Today it serves computing-adjacent
  applicants acceptably and everyone else poorly, which is invisible to us
  because the failure mode is an empty-ish result set, not an error.
- Users pay AI credits and Tavily search fees per run. A run that maps one unit
  instead of ten spends a fraction of the intended effort while the user believes
  the university was surveyed.
- Reporting a medieval-poetry professor as a 72% AI match damages trust in every
  other match score the product shows.

## Functional Context

Links:

- [functional/feature-advisor-atlas.md](../../functional/feature-advisor-atlas.md)

Behaviour changes:

- FR-AA.1: Related-unit mapping works for any academic discipline, not a
  hardcoded list. Primary path is a GLM call mapping
  `requested field + university` → related departments, institutes, and centres,
  each with a relation label and a stated reason.
- FR-AA.2: The hardcoded family taxonomy is retained strictly as an offline
  fallback for when GLM is unavailable, and is broadened and corrected.
- FR-AA.3: No concept match may be produced by an unanchored substring hit.
- FR-AA.4: Unit extraction recognises `of`/`for` connectors, trailing forms,
  and Division/Laboratory/Group/Programme.
- FR-AA.5: Faculty name extraction accepts accented Latin, CJK, and Cyrillic
  characters and lowercase name particles, and strips honorifics from
  `display_name`.
- FR-AA.6: Match scores shown to the user reflect evidence, never a substring
  coincidence.

## Technical Context

Links:

- [technical/ai-integrations.md](../../technical/ai-integrations.md)
- [technical/ai-token-economy.md](../../technical/ai-token-economy.md)

Design:

- New `map_related_units_with_glm()` in `advisor_atlas/analysis.py`, following the
  existing `analyze_with_glm` convention: `ai_service.chat(...)` with
  `model=settings.advisor_atlas_glm_model`, an `override_system_prompt`, a
  `request_label`, `extract_json_object()` for parsing, `_record_ai_usage()` for
  metering, and `None` on `local-fallback` / `provider-error` so the caller falls
  back deterministically.
- `extract_related_units()` gains an optional pre-mapped unit list. When GLM
  returns units they are merged with regex-extracted ones and de-duplicated by
  normalised name, preferring the higher relevance score. When GLM returns
  nothing the existing regex + taxonomy path runs unchanged, so discovery never
  becomes strictly worse than today.
- One additional AI call per run (mapping is per-run, not per-candidate), metered
  through the existing `usage` dict. Cost impact is one small call against a run
  that already makes many.
- No new external dependency; no change to the Tavily budget beyond the intended
  increase in units actually searched.

## Scope

In scope:

- `backend/app/services/advisor_atlas/intelligence.py` — taxonomy breadth,
  word-boundary matching, unit regex, GLM-unit merge.
- `backend/app/services/advisor_atlas/analysis.py` — `map_related_units_with_glm`.
- `backend/app/services/advisor_atlas/discovery.py` — call the mapper, thread it
  into `collect()`.
- `backend/app/services/advisor_atlas/crawler.py` — Unicode name pattern,
  honorific stripping, wider faculty URL hints.
- `backend/tests/unit/test_advisor_atlas.py` — recall regression tests.

Out of scope (candidates for follow-up):

- OpenAlex / Semantic Scholar structured discovery. This is the larger
  opportunity — querying a scholarly graph for authors by institution and topic
  would beat regex-scraping directory HTML outright — but it is a new external
  dependency and deserves its own task. Noted in Completion Notes.
- Any frontend change. The discovery funnel already renders whatever units and
  candidates the backend returns.

## Acceptance Criteria

- [x] A discipline outside the hardcoded taxonomy (Chemistry, Economics, Public
      Health) maps multiple related units when the source text names them.
- [x] `Computer Science` → `Electrical Engineering` is no longer scored 0.
- [x] `concept_family('Chair of Marine Biology')` does not return `computing`.
- [x] `semantic_fallback(['artificial intelligence'], <medieval poetry text>)`
      does not report a research match.
- [x] `Center for X`, `Institute for X`, `X Department`, `Division of X`,
      `Laboratory for X` all extract.
- [x] Extracted unit names are trimmed to the proper noun, not run to the
      sentence end (`'of Chemistry and the'` → `'Chemistry'`).
- [x] `Ana María Rodríguez`, `Jürgen Müller`, `Maria van der Berg`, `李明`,
      `Владимир Петров` all extract as faculty names.
- [x] `Professor John Smith` yields `display_name == 'John Smith'`.
- [x] Navigation labels (`Read more`, `Room 214`, `Contact Us`) are still rejected.
- [x] GLM unavailable or raising → discovery still returns at least what it
      returns today.
- [x] Widening does not introduce cross-domain noise: Economics no longer maps
      to `Chemical Biology`.

## Unit Test Plan

- `test_related_units_span_disciplines` — parametrised across chemistry,
  economics, psychology, mechanical engineering, public health.
- `test_adjacent_units_not_scored_zero` — CS/EE and similar in-taxonomy pairs.
- `test_concept_family_requires_word_boundary` — the `chair`/`certain`/`domain`
  set returns empty.
- `test_semantic_fallback_rejects_substring_coincidence` — the medieval-poetry
  case is not a match.
- `test_unit_pattern_recognises_for_and_trailing_forms`.
- `test_name_pattern_accepts_international_names`.
- `test_name_pattern_strips_honorifics`.
- `test_glm_unavailable_falls_back_to_regex_units` — mapper returns `None`,
  discovery output is unchanged from the deterministic path.

## File Size Check

Per [CODE_RULES.md](../../CODE_RULES.md), target under 1000 lines.

- `intelligence.py`: 238 lines before. Grows with a broader taxonomy and the
  merge helper; expected to stay well under target.
- `analysis.py`: 587 lines before. Adding one mapper function keeps it under 700.
- `crawler.py` (299) and `discovery.py` (419): small deltas.

No file in this task approaches the split threshold.

## Verification Plan

- Re-run the exact before/after probes recorded in the Summary and paste the
  after-numbers into Completion Notes, so the recall claim is measured rather
  than asserted.
- Confirm the deterministic path alone (GLM mocked unavailable) is never worse
  than the current behaviour.
- Compile check all edited modules.

## Completion Notes

### Measured result

Same source snippet, same fields, old module vs new module executed side by side
(the old one loaded from `git show HEAD:`), counting units returned by
`extract_related_units` — the number that directly multiplies the run:

```
field                    before  after   units (ranked)
Chemistry                     1      5   Chemistry, Catalysis, Chemical Biology,
                                         Chemical Engineering, Materials Science
Computer Science              2      6   Computer Science, Data Science, Robotics,
                                         Chemical Biology, Electrical Engineering, Statistics
Economics                     1      4   Economics, Finance, Public Policy, Statistics
Public Health                 1      6   Public Health, Epidemiology, Pharmacy, …
Mechanical Engineering        1      8   Mechanical Engineering, Chemical Engineering,
                                         Electrical Engineering, Materials Science, …
Psychology                    1      5   Psychology, Epidemiology, Pharmacy, …
Physics                       1      8   Physics, Chemistry, Chemical Engineering,
                                         Electrical Engineering, Materials Science, …
```

Precision fixes verified in the same run: `concept_family('Chair of Marine
Biology')` no longer returns `computing`, and the medieval-poetry text no longer
reports as an artificial-intelligence research match. All new assertions and both
pre-existing assertions in the touched area pass.

### A regression I introduced and then removed

Widening the taxonomy exposed a latent rule: "any unit in
human_technology / life_science / quantitative is interdisciplinary for any field
that has a family". That was near-harmless when five families existed and most
fields resolved to none, but once most disciplines resolve it fired constantly —
an Economics applicant was being offered *Chemical Biology* as a related unit.
Because `collect()` spends searches and directory crawls per mapped unit, that is
not cosmetic noise; it consumes the user's run budget. The rule is removed and the
explicit `FAMILY_ADJACENCY` bridge covers the real cases. Family-level adjacency
was also demoted from 68/"adjacent" to 58/"interdisciplinary" so coarse bridges
rank below same-family and shared-term matches rather than crowding them out.

### Verified under pytest (updated during SCHOLARDOCX-0183)

Initially shipped unverified — see the note below. During SCHOLARDOCX-0183 the
blocker was solved: `tests/conftest.py` demands a live Postgres for *every* test,
including pure-function ones, so running with `--noconftest` makes this file's
tests executable.

```
python3 -m pytest tests/unit/test_advisor_atlas.py --noconftest -o addopts="" \
  -k "related_unit or related_department or concept_family or semantic_fallback \
      or unit_pattern or unit_name or clean_person_name or discovery_uses_ai \
      or falls_back_when_unit"
→ 47 passed
```

Every recall, precision, unit-extraction, Unicode-name, and AI-mapping test in
this task passes. The only failures in the wider file are repository and
run-persistence tests failing on `DATABASE_URL is required` — environmental, not
logic.

*Original note:* the pytest suite could not be run here because `backend/.venv` is
a macOS virtualenv that will not execute in this Linux sandbox and the suite's
conftest requires Postgres. Assertions were instead verified by executing
`intelligence.py` and the `crawler.py` helpers directly, which is why the numbers
above are quoted rather than described.

The GLM mapper itself (`map_related_units_with_glm`) has no live-model coverage —
only the fallback and error paths are exercised. Its prompt and JSON handling
should be sanity-checked against a real GLM response once.

### Follow-up: OpenAlex is the larger opportunity

Discovery is still fundamentally "web-search plus regex over faculty HTML". The
structurally better source is a scholarly graph. OpenAlex is free, needs no API
key, and exposes authors filtered by institution and research topic with
affiliation history — which would find *related professors* directly rather than
inferring them from department names, and would supply publication-backed topic
matching instead of concept-family guesswork. Semantic Scholar and ORCID are
comparable options.

Worth noting the code already recognises `openalex`, `semanticscholar.org` and
`orcid.org` as URL patterns in search results (`professor_research.py`) but never
queries any of them as an API.

I could not verify OpenAlex's live response shape from this environment — direct
network access is blocked here and the fetch tool returned nothing usable for a
JSON endpoint — so the schema must be probed from a dev machine before building
against it. This deserves its own task, including a privacy review: sending a
professor name and institution to a third-party API is a different posture from
crawling public pages the user could visit themselves, and
[CLAUDE.md](../../../CLAUDE.md) guardrails on local-first data should be checked
against it.

### Also observed, not addressed

- `faculty_candidates()` only reads `<a>` labels. Directories that render names in
  table cells or headings without a profile link are invisible to it, even though
  `PageParser` already collects `table_rows`.
- `DiscoveryResearcher.collect()` awaits every search and crawl sequentially. With
  more units now mapped, wall-clock time per run rises roughly linearly;
  `asyncio.gather` with a per-host semaphore would bound it without breaking the
  crawler's existing politeness delay.
