# SCHOLARDOCX-0193: Search used the symmetric embedding task for an asymmetric problem

Status: Completed

Owner: AI Agent

Epic: Epic-ResearchExpert

Created: 2026-07-28

## Summary

Both sides of paper search — the indexed passages and the user's question —
were embedded with Jina's `task: "text-matching"`. That is the **symmetric**
adapter, built for "is sentence A similar to sentence B". Searching a paper is
**asymmetric**: a short question against a long passage, where the answer does
not resemble the question at all. Jina v4 publishes `retrieval.query` and
`retrieval.passage` for exactly this case
([model card](https://jina.ai/models/jina-embeddings-v4/)).

Using the symmetric adapter for retrieval compresses the score spread, which is
consistent with what the user reported in SCHOLARDOCX-0192: every passage of a
paper scoring within a few points of every other, and an acknowledgements
paragraph showing "Relevance: 56%" against a question about citations.

## The actual risk: mixing, not switching

Changing the task is one line. The danger is the migration. **A query embedded
with one adapter compared against passages embedded with another does not
fail — it returns numbers that mean nothing.** Every paper already in the
library holds `text-matching` vectors, and re-embedding them all costs real
credits.

So the task is recorded **per paper**, and the question is embedded to match:

- `research_papers.embedding_task`, added with
  `ADD COLUMN IF NOT EXISTS ... DEFAULT 'text-matching'`. The default is
  load-bearing: it labels every pre-existing row as legacy. Defaulting to the
  new task would have marked the whole library as migrated without
  re-embedding a thing, and every subsequent search would have compared across
  adapters.
- `QUERY_TASK_FOR_PASSAGE_TASK` maps a paper's passage task to the task its
  questions must use. A legacy paper is still searched symmetrically and
  behaves exactly as it did before.
- An unrecognised stored value falls back to **legacy**, not to the new task —
  the safe direction, since assuming migration is the failure that produces
  nonsense.
- New uploads index with `retrieval.passage`; their questions use
  `retrieval.query`.

## Upgrading existing papers

`retry_paper_processing` already deletes and rebuilds a paper's passages, so it
is the upgrade path — it now writes the new task. Papers still on the legacy
task report `search_upgrade_available: true`, and a ready paper carrying that
flag shows an "Improve search accuracy" button beside the title.

Deliberately an offer, not an automatic migration: re-reading a paper spends
credits, and the paper works fine as it is. Styled quieter than the retry
button, which signals something is actually broken.

## Technical Context

- `research_paper_service.py`: `EMBEDDING_TASK_PASSAGE` / `_QUERY` / `_LEGACY`
  and `QUERY_TASK_FOR_PASSAGE_TASK`; `_generate_embeddings(..., task=)` and
  `_generate_single_embedding(..., task=)`; the hardcoded `"text-matching"` in
  the request payload is gone and the model name now comes from
  `EMBEDDING_MODEL` rather than being spelled out a second time; indexing and
  retry both stamp `paper.embedding_task`; `search_relevant_chunks` resolves
  the query task from the paper row; `list_papers` / `get_paper` expose
  `search_upgrade_available`.
- `models.py` / `connection.py`: `research_papers.embedding_task` +
  `_add_paper_embedding_task_column`.
- `api.ts`, `ResearchExpertView.tsx`, `research-expert.css`: the upgrade
  affordance.

## Scope

In scope: the files above plus
`backend/tests/unit/test_research_paper_embedding_task.py` (new).

Out of scope:
- Bulk re-indexing the whole library in one pass. Per-paper and user-initiated
  is the safer shape and was the user's stated preference when this was first
  raised.
- Re-tuning `TOP_K_CHUNKS`, chunk size or overlap. Chunking was reviewed in
  SCHOLARDOCX-0192 and is sound (1100 chars, 150 overlap, paragraph-then-
  sentence boundaries, page-stamped); changing it at the same time as the
  embedding task would make any change in answer quality impossible to
  attribute.

## Verification Plan

- Confirmed the task strings against Jina's published model card before
  writing them: a wrong value would 400 every upload rather than degrade.
- Direct execution of all 12 assertions in the new test file: exact task
  names, migrated pairing, legacy pairing, the asymmetry invariant, map
  completeness, resolution of an unknown stored value to legacy rather than to
  the new task, and the column default.
- `npx tsc --noEmit` clean; backend compiles.
- Unit tests added, not run: `test_research_paper_embedding_task.py`.

## Completion Notes

Changed files: as listed under Technical Context.

Expected effect: newly uploaded papers get a wider, more meaningful score
spread between on-topic and off-topic passages, which is what the
"Top / Close / Weak match" banding from SCHOLARDOCX-0192 reads from. Existing
papers are unchanged until the user chooses to re-read one.

Follow-ups:
- No measurement of the improvement exists. A before/after on a known paper
  with a set of known-good questions would tell us whether the switch is worth
  a bulk re-index — right now the case for it is the adapter documentation and
  the observed flat spread, not a measurement on this corpus.
- `research_paper_service.py` remains well over the file-size limit (see the
  note in SCHOLARDOCX-0192).
