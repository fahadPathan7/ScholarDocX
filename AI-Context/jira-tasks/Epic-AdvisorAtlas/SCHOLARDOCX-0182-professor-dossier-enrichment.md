# SCHOLARDOCX-0182: Advisor Atlas - Professor Dossier Correctness and Enrichment

Status: In Progress

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

The professor dossier's deterministic fact layer,
`professor_research.extract_verified_professor_facts`, is overfitted to a single
professor's homepage and a single subfield. It produces near-empty output for
most professors, and — more seriously — it asserts facts that are wrong and
overwrites correct AI output with them.

Reproduced by executing the shipped function against three synthetic professor
pages (economist, chemist, computer-vision researcher):

```
--- Elena Vasquez (economist)
    themes   : []
    education: ['Ph.D. in Economics, MIT, 2011']        <- missed her M.A.
    positions: ['Assistant Professor, Example University']   <- FALSE
--- Hiroshi Tanaka (chemist)
    themes   : []
    education: ['Ph.D. in Chemistry, Kyoto University, 2003'] <- missed his B.Sc.
    positions: []                                        <- he is a Professor and Institute Director
--- Sarah Okafor (computer vision)
    themes   : ['computer vision', 'self-supervised learning', 'Deep Learning', …]
    education: ['Ph.D. in Computer Science (2019)']
    positions: ['Assistant Professor, Example University']
```

### 1. It fabricates a rank and attributes it to the wrong institution

```python
if trusted_identity_source and "assistant professor" in lower:
    position = "Assistant Professor"
    institution = _institution_label(candidate, source)
```

Any occurrence of the phrase anywhere on the page produces the claim that *this*
professor holds *that* rank at *the candidate's* institution. Elena Vasquez's page
says she is **Associate** Professor here and was **Assistant** Professor *at Yale*;
the dossier reports "Assistant Professor, Example University". Both the seniority
and the institution are wrong, and seniority is exactly what an applicant uses to
judge whether a professor can independently admit students.

### 2. The wrong fact then overwrites the correct one

`service._reconcile_verified_facts` does:

```python
if background.get("education") or background.get("positions"):
    intelligence["background"] = background
```

That is a replace, not a merge. When GLM has correctly extracted "Associate
Professor of Economics", the deterministic layer discards it. The enrichment layer
is currently a net negative on quality for any professor it half-understands.

### 3. Research themes only exist for computer-vision researchers

`_topic_phrases` is called with a hardcoded eight-phrase list — self-supervised
learning, few-shot learning, transfer learning, deep learning, computer vision,
machine learning, visual understanding, limited supervision. `research["methods"]`
then filters those by `("learning", "supervision", "vision")`. An economist or
chemist gets `themes: []` and `methods: []` regardless of how clearly their page
states their interests.

### 4. Degree and position patterns are narrow and region-specific

Education matches only `Ph.D. in …` and `B.Tech in …`. Missed: M.S., M.Sc., M.A.,
B.S., B.Sc., MPhil, Dr.rer.nat, Habilitation, Diplom, and the extremely common
`PhD, <University>, <year>` form without "in".

Position matches only student-level roles — Machine Learning Intern, Data Science
Intern, Graduate Research Assistant, Research Assistant, Intern — plus the
hardcoded "Assistant Professor". Missed: Associate Professor, Full Professor,
Reader, Senior Lecturer, Lecturer, Chair, Distinguished/Named Professor, Emeritus,
Postdoctoral Fellow, Department Head, Director, Dean.

### 5. Section labels are one site's template

`"Key Research Areas:"`, `"Research Interests"`, `"Recent Updates"`,
`"My Schedule"`, `"Profile picture"`, `"Personnel Profile"`, `"STAFF"` are literal
strings from one university's page layout.

### 6. Name relevance matching is ASCII-only

`candidate_source_relevance` tokenises with `[A-Za-z][A-Za-z'-]+`, so
"Jürgen Müller" yields the fragments `rgen` and `ller`. Sources about professors
with accented names are therefore judged irrelevant and dropped before extraction
— the same class of defect fixed for discovery in SCHOLARDOCX-0181, still present
on this path.

## Business Context

Links:

- [business/decisions.md](../../business/decisions.md)

Business value:

- The dossier is what an applicant reads before investing hours in a tailored
  outreach email. A wrong rank or institution sends them to the wrong person with
  the wrong framing.
- Advisor Atlas is the flagship feature and professor mode is its deepest surface;
  today it is excellent for one discipline and thin-to-wrong for the rest.
- Stating a fabricated fact is worse than stating nothing. The current failure is
  silent and confident, which is the most damaging combination.

## Functional Context

Links:

- [functional/feature-advisor-atlas.md](../../functional/feature-advisor-atlas.md)

Behaviour changes:

- FR-9.29a: A rank or title may only be attributed to the professor when the
  evidence ties that rank to that person, and to the institution actually named
  alongside it. Ranks held previously or elsewhere must be recorded as history,
  never as the current appointment.
- FR-9.29b: Deterministic extraction and AI extraction are merged, not replaced.
  Neither layer may silently discard the other's supported facts.
- FR-9.29c: Position, degree, and research-theme extraction must be
  discipline-agnostic and must not depend on any hardcoded subject vocabulary.
- FR-9.29d: Source-relevance matching must be Unicode-aware.
- FR-9.29e: The dossier gains a career timeline (rank, institution, period), a
  lab and advisee section (current members, recent graduates and placements,
  frequent collaborators), and a teaching and service section (courses,
  supervision, administrative roles). Every item carries its source and is
  omitted rather than guessed.

## Technical Context

Links:

- [technical/ai-integrations.md](../../technical/ai-integrations.md)

Design:

- Rank extraction becomes a single `ACADEMIC_RANKS` vocabulary matched inside a
  bounded window around the professor's name, with the institution taken from the
  same sentence rather than from the candidate record. Tense and prepositions
  ("previously", "formerly", "prior to joining", "at <other university>") demote a
  match to career history instead of current appointment.
- `_reconcile_verified_facts` merges per field, preferring the value with more
  supporting evidence and never dropping a non-empty AI value for an empty
  deterministic one.
- `_topic_phrases`' hardcoded list is replaced by noun-phrase extraction from the
  labelled interests text, so themes come from what the page says rather than from
  a vocabulary we shipped.
- New sections are extracted deterministically where the page is structured, and
  filled by the existing GLM specialist passes otherwise; a fourth specialist pass
  covers teaching/advising.

## Scope

In scope:

- `backend/app/services/advisor_atlas/professor_research.py`
- `backend/app/services/advisor_atlas/analysis.py` (teaching/advising pass)
- `backend/app/services/advisor_atlas/service.py` (merge precedence)
- `backend/tests/unit/test_advisor_atlas_deep.py`

Out of scope:

- Citation/h-index metrics. Deliberately deferred: doing this properly means
  querying OpenAlex or Semantic Scholar (already noted as follow-up in
  SCHOLARDOCX-0181), and scraping an h-index out of search snippets would
  reintroduce exactly the guess-and-assert failure this task is removing.
- Frontend. New sections follow the existing `intelligence` dict shape the
  dossier already renders generically; any dedicated UI is a separate task.

## Acceptance Criteria

- [x] No rank is emitted unless tied to the professor in the evidence.
- [x] A rank held at another institution is recorded as history, not as the
      current appointment.
- [x] Elena Vasquez fixture yields "Associate Professor" and never
      "Assistant Professor, Example University".
- [x] A rank belonging to a *different* named person on the same page is not
      attributed to the professor.
- [x] A leadership role is recorded alongside, not instead of, the academic rank.
- [x] Non-empty AI background survives when deterministic extraction is empty.
- [x] Chemist, economist, and linguist fixtures yield non-empty research themes.
- [x] M.A., B.Sc. and `Dr. rer. nat` extract alongside Ph.D.
- [x] Professor, Associate Professor, Reader and Director all extract.
- [x] `candidate_source_relevance` matches sources for "Jürgen Müller".
- [x] Career timeline, lab/advisees, and teaching sections populate from a
      structured fixture and are absent (not fabricated) when unsupported.

## Unit Test Plan

Fixtures for three disciplines (economics, chemistry, computer vision) plus one
accented-name professor, asserting extraction breadth and, critically, the
absence of fabricated titles.

## File Size Check

`professor_research.py` was 886 lines before this task, already near the
1000-line target in [CODE_RULES.md](../../CODE_RULES.md).

Outcome: fact extraction moved into a new `professor_facts.py` (431 lines) and
`professor_research.py` fell to **856** lines. Both are under target, as are
`service.py` (964) and `analysis.py` (701). No file in this task approaches the
1150-line split threshold.

## Verification Plan

Re-run the three-discipline probe from the Summary and record after-numbers.

## Completion Notes

### Measured result

Same three fixtures as the Summary, run against the new extractor:

```
--- Elena Vasquez (economist)
  current  : Associate Professor @ Example University
  history  : Assistant Professor @ Yale University (2011–2017)
  education: Ph.D — Economics, MIT (2011) · M.A — Statistics, LSE (2006)
  topics   : labour economics · applied microeconometrics · inequality · wage dynamics
--- Hiroshi Tanaka (chemist)
  current  : Professor @ Catalysis Institute … · Director @ Catalysis Institute …
  education: Ph.D — Chemistry, Kyoto University (2003) · B.Sc — Chemistry, Tokyo (1998)
  topics   : heterogeneous catalysis · surface chemistry · sustainable hydrogen production
  courses  : CHEM 401 Advanced Catalysis · CHEM 210 Physical Chemistry
  lab      : Yuki Sato · Amara Diallo · Peter Novak
--- Jürgen Müller (linguist)
  current  : Reader @ Example University
  education: Dr. rer. nat — Linguistics, Heidelberg (2009)
  topics   : syntax · language typology · historical morphology
```

The headline correctness fix holds: the economist's rank is Associate (not
Assistant), and the Assistant Professorship is filed as history at Yale with its
period, rather than asserted as her current post at the searched university.

### A hole my own test caught

The first implementation admitted a rank when the sentence *opened* with it,
intended to capture the standard "Professor of Chemistry at X" self-description.
That also matched "Professor Alan Whitfield has retired after 30 years" —
attributing a retiring colleague's rank to the professor being researched, which
is the same class of bug this task exists to remove. `_opens_as_self_description`
now requires the rank to be followed by a preposition or punctuation; a
capitalised word means the rank is titling a different person, and the sentence
is rejected. The regression test for it is
`test_no_rank_is_emitted_for_an_unrelated_person_on_the_page`.

### Structure

`professor_facts.py` (431 lines) was split out of `professor_research.py`, which
drops from 886 to 856 lines — both now under the 1000-line target. Three helpers
made dead by the rewrite (`_split_topics`, `_topic_phrases`, `_institution_label`)
were removed rather than left behind.

`research["methods"]` is now always empty from the deterministic layer. It was
previously themes filtered by `("learning", "supervision", "vision")`, which could
only fire for machine-learning researchers; method-vs-topic separation is a
judgement call and is left to the GLM specialist passes, which now include a
fourth "Career & Teaching" pass.

### Verified under pytest (updated during SCHOLARDOCX-0183)

Initially shipped unverified. SCHOLARDOCX-0183 found that `tests/conftest.py`
requires a live Postgres for every test including pure-function ones, and that
`--noconftest` bypasses it:

```
python3 -m pytest tests/unit/test_advisor_atlas_deep.py --noconftest -o addopts="" \
  -k "rank or education_covers or research_themes or unicode or lab_members \
      or enrichment_sections or verified_facts_expose or merge_keeps \
      or merge_prefers or leadership"
→ 19 passed
```

All correctness guards pass, including the two that matter most:
`test_current_rank_is_not_taken_from_a_former_post_elsewhere` and
`test_no_rank_is_emitted_for_an_unrelated_person_on_the_page`. Remaining failures
in the file are deep-run persistence tests failing on `DATABASE_URL is required` —
environmental, not logic.

*Original note:* assertions were verified by executing `professor_facts.py`,
`professor_research.py`, and the lifted `_merge_fact_section` directly, because
the bundled venv is macOS and the conftest requires Postgres.

The new "Career & Teaching" GLM pass has no live-model coverage — its prompt and
JSON shape need one sanity check against a real response.

### Deliberately not done

Citation and productivity metrics (h-index, citation counts, venue tier) were
scoped out. Doing them properly means querying OpenAlex or Semantic Scholar; doing
them from search snippets would mean scraping a number out of a Google Scholar
preview and asserting it, which is precisely the guess-and-assert pattern this
task removed. This is the third task to land on the same conclusion, so the
scholarly-graph integration is now the clear next piece of work for Advisor Atlas.

### Also observed, not addressed

- `candidate_excerpt` still hardcodes the section markers `"Personnel Profile"`
  and `"Profile picture"` from one university's template.
- `PUBLICATION_BLOCKLIST` filters titles containing "assistant professor",
  "associate professor", "professor of" — reasonable for rejecting faculty pages,
  but it will also reject a genuine paper whose title contains those words.
- The dossier renders `intelligence` generically, so `lab_and_advisees` and
  `teaching_and_service` will surface without frontend work, but a dedicated
  layout for the career timeline would present it far better.
