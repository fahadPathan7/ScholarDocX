# SCHOLARDOCX-0192: Reference questions answered from the wrong passages; single-line custom question box

Status: Completed

Owner: AI Agent

Epic: Epic-ResearchExpert

Created: 2026-07-28

## Summary

User asked a paper "how many papers were cited here". The answer cost 79
credits and said the highest visible reference number was [48], "which suggests
the paper cites at least 48 references", and that "the complete reference list
is not fully included in the supplied sections, so an exact total cannot be
confirmed". They also could not press Shift+Enter for a new line in the question
box.

### 1. The reference-retrieval path could never execute

`search_relevant_chunks` already had logic for exactly this question — it
computes `wants_references` from the query and classifies bibliography passages
with `is_reference_chunk`. That logic was unreachable:

```python
for c in content_chunks:            # fills to top_k
    final_chunks.append(c)
    if len(final_chunks) >= top_k: break

if len(final_chunks) < top_k and ref_chunks:   # 10 < 10 -> never true
```

The content-fill loop above always reaches `top_k`, because the candidate pool
is `max(top_k * 3, 24)` — always larger. So `wants_references` was dead code
whenever the paper had ten or more body passages among the candidates, which is
always. Reproduced with a stub of the exact control flow: **0 of 10 passages
sent to the model were bibliography, and the reference block did not run.**

A second defect sat behind it. Even when reference passages were appended, the
closing `sort(similarity) → trim(top_k)` dropped them again: a reference entry
is semantically bland, so it scores far below prose against any natural-language
question. The step immediately after the retrieval undid the retrieval.

So the model was handed three scattered body paragraphs that happened to
contain `[34]`, `[31]` and `[48]`, and reported honestly on what it had. **The
answer was not a model failure — the model was never given the bibliography.**

Fixed:
- When the question is about references, the bibliography is fetched
  **structurally** — by pattern over all of the paper's passages, ordered by
  position — not by vector similarity. A reference list does not need the
  vector index to be found.
- Those passages are reserved first, budgeted by `reference_budget(top_k)`
  (`top_k - 2`, minimum 4) so body context still reaches the model.
- They are exempt from the relevance trim, via an explicit
  `retrieval: "reference_section"` flag.
- Their `similarity_score` stays the **real measured value**, which is low.
  Writing a flattering number to protect them from the trim would have
  reproduced the fabricated "Relevance: 85%" badge this same function was
  already fixed for once — the flag does the protecting instead.
- The context now states when the bibliography was retrieved whole, so the
  model stops hedging while holding every reference entry in the paper.

### 2. Shift+Enter did nothing in the custom question box

It was an `<input type="text">`. A single-line input cannot hold a newline, so
there was nothing for Shift+Enter to insert. Replaced with an auto-growing
`<textarea>` (one row to six, then scrolls): Enter submits, Shift+Enter breaks
the line, with a hint line under the box saying so. Auto-grow is done in JS as
well as with `field-sizing: content`, because that property is Chromium-only
and Safari/Firefox would otherwise be stuck at one row.

### 3. The same failure on every aggregate question (reported mid-task)

"How many figures are in this paper?" cost 98 credits and returned the same
shape of answer: four figures confirmed, "clear gaps in the numbering", "the
true total is likely higher, but a definitive count cannot be determined". The
reference fix would not have helped — this is the general case.

**An aggregate question is about the document, so no sample of it can answer
one.** Whatever top-k returns, the model sees part of the numbering and the
only honest answer available to it is "at least N". The retrieval was not
malfunctioning; it was being asked to do something a retrieval cannot do.

These do not need a model to answer. Numbering is a pattern, so
`detect_inventory_target` routes a question carrying both a target word
(figure / table / equation / algorithm / reference) **and** an aggregate cue
("how many", "list all", "total") to `scan_inventory`, which counts distinct
numbers across *every* passage. The count and the numbering go into the
context as fact, along with the passages carrying the most of that numbering as
corroboration. `inventory_note` instructs the model to state the number and not
to claim its sections are partial.

Requiring both the target word and the aggregate cue keeps "what does Figure 3
show?" on ordinary semantic retrieval — that one really is about a passage.

Two bugs the tests caught while writing this: `\d{1,3}` matched the first three
digits of "Figure 2024" and reported a figure 202 (fixed with `(?!\d)`), and
the gap list reported "numbers 10–29 never appear" on any series with an
outlier (now only reported when the series is otherwise dense).

### 4. "Relevance: 56%" on passages that were plainly irrelevant

The user noticed the badge said 56–57% for a garbled pseudo-code listing and an
acknowledgements paragraph. That badge was raw cosine × 100.

Cosine barely discriminates *inside a single paper*: every passage shares the
paper's vocabulary, topic and register, so scores bunch into a narrow band a
little above the floor. 56% did not mean "moderately relevant", it meant
"indistinguishable from everything else". Two changes:

- **Ranking** now adds a bounded literal term-overlap bonus (`rank_score`,
  weight 0.30) on top of cosine, which reorders passages cosine cannot
  separate without overruling a genuinely strong semantic match.
- **Display** shows standing within the returned set — Top match / Close match
  / Weak match, or "Reference list" for structurally-retrieved bibliography —
  with the measured similarity moved to the tooltip. The badge was also green
  for every passage regardless of score; the weaker bands are now neutral.

### On "may need to fix how we vectorize"

Partly right, and worth separating from the above.

Chunking is **not** the problem: 1100 characters with 150 overlap, preferring
paragraph then sentence boundaries, page-stamped. That is a competent
implementation.

There is one real misconfiguration. Both passages and queries are embedded with
Jina's `task: "text-matching"`, which is the **symmetric** task — built for
comparing two texts of similar kind. Search is asymmetric: a short question
against a long passage. Jina v4 publishes `retrieval.query` and
`retrieval.passage` for exactly this, and using the symmetric task for
retrieval measurably flattens the score spread — which is consistent with the
narrow band observed here.

Fixing it means re-embedding every stored paper, because a query embedded with
`retrieval.query` cannot be compared against passages embedded with
`text-matching` — mixing them would be worse than the current state. That is a
billable re-index of the user's whole library, so it is **not** done here and
is raised as a decision rather than a change.

Note it would not have fixed either reported question. Both were aggregate
questions, and no embedding quality makes a subset able to count a whole.

## Technical Context

- `research_paper_retrieval.py` (**new**): `is_reference_chunk`,
  `wants_reference_section`, `section_terms_for`, `reference_budget`,
  `apply_retrieval_budget`, plus `detect_inventory_target` / `scan_inventory` /
  `inventory_note` for aggregate questions and `query_terms` /
  `lexical_overlap` / `rank_score` / `relevance_label` for ranking and display.
  Pure decision logic, no database, so the retrieval policy is testable on its
  own — the original defect was a control-flow bug that no amount of prompt
  work would have found, and the two regex bugs above were caught the same way.
- `research_paper_service.py`: `search_relevant_chunks` takes an
  `inventory_out` parameter, reserves and protects reference passages, and
  reserves the passages carrying the most of a scanned numbering; the inline
  classifier, section-term ladder and trim were replaced by calls into the new
  module. `analyze_paper` appends the scan result or the coverage note, and
  returns `relevance_label` / `lexical_overlap` per source.
- `ResearchExpertView.tsx` / `research-expert.css`: textarea, key handling,
  auto-grow, hint line; relevance badge shows standing with the measurement in
  the tooltip, and is no longer green for every passage.
- `api.ts`: `relevance_label`, `lexical_overlap` on each source.

## Scope

In scope: the files above plus
`backend/tests/unit/test_research_paper_retrieval.py` (new).

Out of scope:
- **Switching the embedding task to `retrieval.query` / `retrieval.passage`.**
  Real misconfiguration (see above), but the fix requires re-embedding every
  stored paper — a billable re-index of the user's whole library — and mixing
  the two tasks would be worse than either. Needs the user's decision.
- Answering aggregate questions with zero credits. The scan is deterministic
  and could short-circuit the model entirely for "how many X"; today it still
  pays for one analysis call so the answer stays conversational.
- The heavy formatting rules in the analysis system prompt, which turn a
  one-number answer into three markdown headers. Worth revisiting; not a
  correctness bug.

## File Size Note (CODE_RULES)

`research_paper_service.py` was **1546 lines before this task** — already past
the 1150 hard limit, not something this change introduced. Extracting the
retrieval policy brought it to 1520. That is a real reduction in the area
touched, and the extraction was cohesive rather than arbitrary, but the file is
still well over the limit and this task did not resolve that. Flagging it
explicitly rather than letting the number pass unremarked: the remaining split
candidates are the upload/extraction pipeline and the embedding pipeline, each
of which is a substantial change with its own blast radius and deserves its own
task.

## Verification Plan

- Reproduced the original defect with a stub of the real control flow before
  fixing: 0 bibliography passages reached the model and the reference block did
  not run.
- Direct execution of all assertions in the new test file (33): bibliography
  classification (headings, marker density, negative cases on body prose that
  cites), question detection, budget floors, survival of the trim, reading
  order, unchanged behaviour for ordinary questions, section-term mapping;
  aggregate-question routing including the negative cases that must stay on
  semantic retrieval, whole-document counting, the year-vs-figure-number bug,
  subfigures counting once, evidence ordering, the sparse-series gap guard;
  stopword handling, lexical separation of a bibliography from an
  acknowledgement, and relevance banding including the single-result case.
- `npx tsc --noEmit` clean.
- Unit tests added, not run: `test_research_paper_retrieval.py`.

## Completion Notes

Changed files: as listed under Technical Context.

Follow-ups:
- The analysis system prompt mandates `##` headers and bullet lists for every
  answer, so "how many papers were cited" returns three headed sections where
  one sentence would do. The formatting rules should scale with the question.
- `[Section #91]` citations show the passage index, not a section of the paper.
  The wording follows the approved plain-language mapping in AGENTS.md, but a
  reader of a 12-page paper still sees "Section #91" and reasonably wonders
  what it refers to. Page numbers are already extracted per passage and would
  be more meaningful.
