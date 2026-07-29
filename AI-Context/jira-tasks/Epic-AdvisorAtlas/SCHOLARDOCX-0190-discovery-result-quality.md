# SCHOLARDOCX-0190: Advisor Atlas Discovery — Result Quality (junk candidates, wrong departments, dead deep research)

Status: Completed

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

User reported a live Discovery run (Texas A&M University-Kingsville · computer
science) as low quality: "some unwanted things comes and not quality". The run
reported **79 verified faculty**. Reviewing the actual output against the server
log found five distinct defects, all reproduced before fixing.

### 1. Every deep-research pass was dying (root cause of the overall shallowness)

The log shows `TypeError: Object of type datetime is not JSON serializable`
raised from `analysis.py:517` for candidate after candidate, each swallowed by
`deep_one`'s `except Exception` as "Deep research failed for X; the screened
result is kept".

Cause: the screening phase passes a freshly-built candidate dict (no
datetimes); the deep phase re-reads candidates **from storage**, where they
carry real `created_at` / `updated_at` values. `json.dumps(candidate)` cannot
encode those, so the first prompt of every deep pass raised before any search
or extraction ran. The run still reported "completed", so the only visible
symptom was that no dossier was ever deeper than a screening pass — which is
most of what the user perceived as "not quality".

Fixed with `json_dump` (a `default=`-guarded dump) plus
`candidate_prompt_payload`, which sends only identity fields. The second half
matters independently: the stored row also carries the *previous* analysis
(`match_score`, `recruitment_state`, `intelligence`), and feeding a model its
own earlier conclusions anchors it on them instead of on the evidence.

### 2. Web-page furniture was being reported as professors

Roughly a dozen of the 79 "verified faculty" were not people:
`Skip to main content`, `CLICK HERE FOR FULL RESUME`, `CHNG Brochure`,
`Faculty Resources`, `Dean's Office Staff`, `Message from the Chair`,
`Council Members`, `Personnel Profile`, `Online Programs`, `Graduate Faculty`,
`Contact Information for Graduate Programs`, `Masters in Computer Science`.

`clean_person_name` only tested *shape* — a run of two-to-five capitalised
words — which "Graduate Faculty" satisfies exactly as well as "Ayush Goyal".
Added `_looks_like_person`: a name may not contain a function word (`of`, `for`,
`and`, `from`, `the`, `to` …) or an institutional noun (`faculty`, `staff`,
`brochure`, `program`, `resources`, `council`, `profile`, `professor` …).
Nobiliary particles (`van`, `de`, `al`, `bin`) and single-letter middle
initials are exempt so real names still pass. Words that are also real
surnames — `page`, `read`, `main`, `dean`, `chair`, `young`, `park` — were
deliberately left out of the blocklist; the labels containing them are caught
by their companion tokens instead.

Each of these junk entries also consumed a full screening pass (a Tavily
search plus a GLM analysis call), so this was burning the user's credits as
well as polluting the list.

### 3. Chemistry professors were filed under Computer Science

Twelve entries under the "Computer Science" unit — Elda Sanchez, Mauro Castro,
Kevin Francis, Christine Hahn and others — are Department of Chemistry faculty.
The analysis pass correctly flagged each one ("CRITICAL: Department mapping
error"), but by then the damage was done: the candidate had been discovered,
screened, billed and surfaced.

Cause: `DiscoveryResearcher.collect()` assigned `department = unit["name"]` to
every name found while working a unit, with **no check that the page it found
them on had anything to do with that unit**. A faculty-directory search issued
for "Computer Science" returned the Chemistry directory, and the whole page was
harvested. The same mechanism explains the mechanical/petroleum/geoscience
entries filed under "Engineering" and "HPCC High Performance Computing".

Added `source_belongs_to_unit()`, applied both to search results
(`candidates_from_search`) and to crawled directory pages. It requires the
unit's *distinctive* tokens (generic words like "department", "science",
"engineering" excluded) to appear on the page. Units with no distinctive tokens
of their own (a bare "Engineering") are unverifiable and are accepted rather
than silently dropped, so recall never regresses. Off-target directories are
recorded with `fetch_status: "off_target"` and surface as a coverage gap
instead of being counted as covered.

### 4. Job titles and degree programmes were being mapped as academic units

The run's unit list contained `Associate Professor of Computer Science and
Director AI-Cyb`, `Master of Science in Computer Science`, `The Computer
Science` and `InformationTechnology`. `collect()` spends up to two searches and
four directory crawls **per unit**, so each of these was a direct, billable
waste as well as a source of mis-attributed faculty.

Two causes: `extract_related_units` appends any page title containing a unit
word ("… Director AI-Cybersecurity **Center**") wholesale, and
`clean_unit_name`'s backwards walk treats a capitalised "The" as a name word,
so a trailing capture bled across a sentence boundary. Added
`is_academic_unit_name()` (rejects role titles and degree/programme words),
`strip_unit_article()`, an article boundary in `clean_unit_name`, and an
explicit instruction in the GLM unit-mapper's system prompt.

### 5. One professor's grant paragraph was shown as evidence for a dozen others

The same DHS grant boilerplate ("A. Mishra (PI), D. Hicks (PI), A. Goyal
(PI) … $999,676 …") appears verbatim as the supporting evidence excerpt for
Afzel Noore, Avdesh Mishra, Haitham Adarbah, George Toscano, Hani Girgis, Nuri
Yilmazer, Maleq Khan, Amit Verma, Reza Nekovei and Rajab Challoo — because
`_evidence_from_sources` stored `content[:700]`, the head of whatever shared
department page the source happened to be. Now uses `candidate_excerpt`, which
centres the quote on the professor. Also gave `candidate_excerpt` a surname
fallback: when the full name isn't present verbatim (initials, "Dr. Noore",
reordered directory listings) it anchors on the surname rather than falling
back to the top of the page.

### Round 2 — user asked for the four remaining quality issues (same session)

The five defects above removed the *junk*. The user then asked for the four
issues that remained in the same output, all of which are judgement rather than
parsing:

**6. People who cannot supervise a doctorate were ranked as advisors.** Leandro
Ortegon (Lab Manager), Grady Isensee (Lecturer I), Norma Castañeda (adjunct),
Thomas McGehee (emeritus), Rajab Challoo (`@retiree.tamuk.edu`), George Toscano
(Professor of Practice). New `candidate_quality.advising_eligibility` classifies
`eligible` / `limited` / `ineligible` from the title, the email domain, and —
only when the title is missing — the professor's own profile text. Nobody is
deleted: the person is shown with a pill and a reason, and excluded from
research matches. UK ranks (`Senior Lecturer`, `Reader`) and
`Research Assistant Professor` are explicitly protected, since those *do*
supervise and a naive keyword list would bury them.

**7. Confidence was not earned.** "Source confidence 95% · 3 strong evidence
areas" appeared on entries that were web pages. The figure came out of the
analysis prompt rather than out of the evidence, so nothing tied it to whether
a single source had ever named the person.
`calibrate_evidence_confidence` now caps it by the number of distinct sources
whose text contains the surname (0 → 25, 1 → 55, 2 → 70, 3+ → 85, +10 for an
official `.edu`/`.ac.uk` source, hard max 95) and records the basis. It only
ever lowers a figure. The card now reads "2 sources name this professor"
instead of the uninformative coverage count. It runs *before*
`opportunity_forecast`, which caps its own confidence at the candidate's — the
other order would launder an unsupported number into the recruitment outlook.

**8. The same professor appeared several times.** Adarbah appeared three times
in the reported run. Exact-name de-duplication cannot see that "A. Goyal" and
"Ayush Goyal" are one person. `merge_duplicate_candidates` matches on a shared
profile URL, a shared email, or surname + compatible first name + same
institution, and keeps the fuller spelling with the others as
`discovered_aliases`. Compatibility is deliberately narrow — initial-vs-full
only, never prefix — because `Hua Li` and `Hui Li` are two real professors in
the same college and a prefix rule would silently merge them.

**9. The list buried the useful results.** 60+ of 79 entries carried an explicit
"zero research overlap" note, and department grouping put a 0% match above a
91% match on alphabetical order alone. The faculty stage now splits each
department into people worth reading (a research match, or ≥45 alignment, and
able to supervise) and a collapsed "N more with no alignment to your interests"
tail, with departments ordered by how many relevant people they hold. Nothing
is removed — discovery still reports everything it found, and the coverage
panel now states how many people lack supervision rights.

## Technical Context

- `analysis.py`: `_json_default`, `json_dump`, `CANDIDATE_PROMPT_FIELDS`,
  `candidate_prompt_payload`; all five `json.dumps` calls in `analyze_with_glm`
  and `analyze_professor_specialists` routed through them; unit-mapper system
  prompt now forbids degrees/titles/page headings.
- `crawler.py`: `NAME_PARTICLES`, `NAME_STOPWORDS`, `NON_PERSON_TOKENS`,
  `_looks_like_person`, called at the end of `clean_person_name` (so both the
  directory-link path and `discovery.candidates_from_search` inherit it).
- `discovery.py`: `GENERIC_UNIT_TOKENS`, `unit_identity_tokens`,
  `source_belongs_to_unit`; applied in `candidates_from_search` and in
  `collect()`'s directory crawl; `off_target` fetch status plumbed through
  `build_discovery_action_center` (`directories_off_target` + coverage gap).
- `intelligence.py`: `NON_UNIT_TOKENS`, `_LEADING_ARTICLES`,
  `is_academic_unit_name`, `strip_unit_article`, article boundary in
  `clean_unit_name`, both applied in `extract_related_units.consider()`.
- `professor_research.py`: surname fallback in `candidate_excerpt`.
- `service.py`: `_evidence_from_sources` uses `candidate_excerpt` for
  `evidence_excerpt`.

Round 2:
- `candidate_quality.py` (**new**, 330 lines): `advising_eligibility`,
  `ROLE_SIGNALS`, `calibrate_evidence_confidence`, `naming_source_count`,
  `merge_duplicate_candidates`, `same_person`, `person_tokens`/`surname_of`
  (deliberately *not* `professor_facts.name_tokens`, which drops 2-character
  tokens and would erase the surnames of Hua **Li** and Joon-Yeoul **Oh**).
  Kept as its own module rather than added to `service.py`, which is already
  over the 1000-line target.
- `service.py`: eligibility + calibration applied in `_process_candidate`
  before `opportunity_forecast`; `merge_duplicate_candidates` at the end of
  `_discover_candidates`.
- `discovery.py`: `research_matches` requires `can_supervise`; new
  `supervision_limited` coverage count and coverage gap.
- `advisorAtlasApi.ts`: `AdvisorAdvisingEligibility`, `AdvisorEvidenceBasis`,
  `supervision_limited`, `directories_off_target`.
- `AdvisorCandidateCard.tsx`: eligibility pill, evidence-basis line.
- `AdvisorDiscoveryFunnel.tsx`: `isWorthReading`, split/ranked faculty groups,
  two new coverage metrics.
- `advisor-atlas-intelligence.css`: `.atlas-eligibility-pill`,
  `.atlas-faculty-remainder` (existing palette and radii, no new tokens).

## Scope

In scope:
- `backend/app/services/advisor_atlas/analysis.py`
- `backend/app/services/advisor_atlas/crawler.py`
- `backend/app/services/advisor_atlas/discovery.py`
- `backend/app/services/advisor_atlas/intelligence.py`
- `backend/app/services/advisor_atlas/professor_research.py`
- `backend/app/services/advisor_atlas/service.py`
- `backend/app/services/advisor_atlas/candidate_quality.py` (new)
- `backend/tests/unit/test_advisor_atlas_discovery_quality.py` (new)
- `backend/tests/unit/test_advisor_atlas_candidate_quality.py` (new)
- `frontend/src/lib/advisorAtlasApi.ts`
- `frontend/src/components/advisor-atlas/AdvisorCandidateCard.tsx`
- `frontend/src/components/advisor-atlas/AdvisorDiscoveryFunnel.tsx`
- `frontend/src/components/advisor-atlas/advisor-atlas-intelligence.css`

Out of scope:
- Retro-cleaning candidates already stored from previous runs. The fixes apply
  to new runs; an existing run still shows what it discovered.
- Headless-browser rendering for JS-only sources (still open from
  SCHOLARDOCX-0188).

## Verification Plan

- Direct script execution of each fixed path (pytest not run, per project
  policy):
  - `json_dump` + `candidate_prompt_payload` on a storage-shaped row carrying
    real `datetime`s — encodes, and drops ids/timestamps/prior analysis.
  - `clean_person_name` over the 19 junk labels taken verbatim from the live
    run (all now rejected) and 24 real names including middle initials,
    nobiliary particles, CJK, `Last, First`, and accented Latin (all still
    accepted).
  - `source_belongs_to_unit` on a real Chemistry directory string vs the
    "Computer Science" unit (rejected) and vs "Chemistry" (accepted); bare
    "Engineering" still accepted.
  - `extract_related_units` on the live run's own junk titles — role titles,
    degree programmes and the `The Computer Science` bleed all gone, real units
    retained.
  - `candidate_excerpt` on the shared DHS-grant page — now opens on the
    professor's own sentence instead of the boilerplate head.
- Re-ran the existing `test_advisor_atlas.py` assertions for every touched
  function as direct script calls (international names, honorifics,
  `Last, First`, navigation rejection, `clean_unit_name` boundaries,
  `extract_related_units` expansion) — no regressions.
- Round 2, same method — every title, name and page below is verbatim from the
  reported run:
  - All 15 role titles from the run classified correctly, including the six
    protected ranks (`Senior Lecturer`, `Research Assistant Professor`,
    `Regents Professor`, …) that a naive keyword list would have buried.
  - `calibrate_evidence_confidence`: a page-derived entity drops 95 → 25; a
    real professor with two naming sources including an official one settles
    at 80; a low figure is never inflated.
  - `merge_duplicate_candidates`: "A. Goyal"/"Ayush Goyal" merge keeping the
    full name and the email; two profile URLs differing only by trailing slash
    merge; `Hua Li`/`Hui Li` and `John Smith`@MIT/@Stanford stay separate.
  - `build_discovery_action_center`: a topically-aligned emeritus is excluded
    from `research_match_ids`, counted in `supervision_limited`, still counted
    in `verified_faculty`, and explained in the coverage gaps.
  - `npx tsc --noEmit` clean for the frontend changes.
- Unit tests added, not run: `test_advisor_atlas_discovery_quality.py`,
  `test_advisor_atlas_candidate_quality.py`.

## File Size Note (CODE_RULES)

`service.py` is 1117 lines after this task (was 1077) — over the 1000-line
target, inside the 1150 grace. Round 2's new logic went into its own module
(`candidate_quality.py`) precisely to avoid growing this file further; what
remains here is the wiring (imports, two call sites) plus round 1's comment and
call swap in `_evidence_from_sources`. Splitting the file was not bundled into
a bug fix. The natural split, when a feature next touches it, is the
`_validate_analysis` / `_reconcile_verified_facts` / `_merge_fact_section`
group into an `advisor_atlas/reconciliation.py`.

## Completion Notes

Changed files: as listed under Scope.

Expected effect on the reported run: the ~12 non-person entries and the ~12
mis-filed Chemistry entries disappear from "verified faculty" (so the headline
count drops well below 79 and means something), deep research actually executes
instead of failing on every candidate, evidence excerpts stop repeating across
professors, and the per-unit search/crawl budget stops being spent on job
titles and degree programmes.

Follow-ups (not implemented):
- `deep_one` / `screen_one` swallow exceptions into the log only. A run that
  loses every deep pass should surface that in the run's own coverage
  reporting, not just in server logs — that is how defect 1 went unnoticed.
  This is the highest-value remaining item: it is the difference between a
  silent quality collapse and a visible one.
- De-duplication runs at discovery time only. Two candidates already persisted
  under different `normalized_name` values in an *existing* run are not merged
  retroactively, because that means deleting a stored row the user may have
  shortlisted.
- Eligibility and calibration are deterministic by design. If titles at some
  institution are worded unusually, the fix is a pattern in `ROLE_SIGNALS`, not
  a model call — keep it that way; a model call here would cost credits on
  every candidate and fail open.
