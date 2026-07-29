# SCHOLARDOCX-0180: Research Expert - Billing, Retrieval, and Quota Correctness Fixes

Status: In Progress

Owner: AI Agent

Epic: Epic-ResearchExpert

Created: 2026-07-28

## Summary

An audit of the Research Expert feature (SCHOLARDOCX-0174) found three classes of
defect that reach the user directly:

1. **Billing** — every analysis query charges the Jina embedding flat fee twice,
   the fee itself is read from a settings key that is seeded nowhere (so the
   admin-configured price is silently ignored in favour of a hardcoded value),
   and the code comments claim indexing is free when it is in fact billed on
   every upload *and* every retry of a failed upload.
2. **Retrieval quality** — keyword-boosted chunks are stamped with a fabricated
   `0.85` similarity score that the UI renders to the user as a real "Relevance"
   percentage, and boosted chunks are selected by document position rather than
   by actual relevance.
3. **Quota** — a paper whose processing fails permanently consumes a slot of the
   user's `research_papers_per_month` quota, and deleting the failed paper does
   not give the slot back.

Additionally the functional spec, the `embedding_model` column default, and the
token-economy doc still describe the retired Gemini `text-embedding-004` / 768-dim
setup rather than the Jina `jina-embeddings-v4` / 1024-dim setup that is actually
running, and one unit test asserts a charge on a code path it has itself mocked
away.

Out of scope for this task (tracked separately): converting upload to a
background job with status polling, OCR for scanned PDFs, and splitting the two
over-length files.

## Business Context

Links:

- [business/decisions.md](../../business/decisions.md)

Business value:

- Users are currently overcharged on every Research Expert question. Double
  billing on a paid feature is a trust and refund problem, not a cosmetic bug.
- Users who upload a paper that fails to process lose a monthly quota slot for a
  failure that was not their fault, and are billed for the failed attempt and for
  each retry.
- Displaying a fabricated relevance percentage next to a cited passage
  misrepresents how well-grounded an answer is, which undermines the core value
  proposition of a citation-backed research tool.

## Functional Context

Links:

- [functional/feature-research-expert.md](../../functional/feature-research-expert.md)

Behaviour changes:

- FR-9.12: A single analysis query charges exactly one Jina embedding flat fee,
  not two.
- FR-9.13: Indexing (upload embedding generation) is billed once per successful
  upload. If processing fails before embeddings are generated, no embedding fee
  is charged.
- FR-9.14: A failed upload does not permanently consume a monthly upload quota
  slot. Deleting a paper resyncs `research_papers_per_month` alongside
  `total_documents_bytes`.
- FR-9.15: Every relevance score shown to the user is a real cosine similarity
  computed against the query vector. No synthetic scores are surfaced.
- FR-9.16: Section-keyword boosting selects the chunks that best match the query
  vector among keyword hits, not the earliest-occurring keyword hits.

## Technical Context

Links:

- [technical/ai-integrations.md](../../technical/ai-integrations.md)
- [technical/ai-token-economy.md](../../technical/ai-token-economy.md)

Root causes:

- `_generate_single_embedding()` calls `_generate_embeddings()`, which already
  ends with `self._charge_jina_embedding(source="jina_embedding")`, and then
  charges a second time with `source="jina_embedding_query"`. Fix: make charging
  an explicit `charge_source` parameter of `_generate_embeddings()`, the single
  charging point, so each operation charges once with the correct label.
- `_charge_jina_embedding()` reads `app_settings.research_paper_jina_cost_usd`.
  That key is not in `schema.py` SEED_SQL and is written by nothing — the real,
  admin-editable key is `jina_call_cost_usd` (seeded `0.002`, surfaced in
  Settings → External APIs & Agents Pricing, with an existing
  `ai_tokens.get_jina_call_cost_usd()` accessor). The lookup therefore always
  missed and fell through to a hardcoded `0.005`. **Combined effect: an analysis
  query cost `2 × 0.005 = 0.01` against a configured price of `0.002` — a 5×
  overcharge.** This also explains why
  `test_charge_jina_embedding_uses_admin_configured_cost` (which sets the key to
  `0.02` and asserts the charge is `0.02`) could not have been passing. Fix: call
  `ai_tokens.get_jina_call_cost_usd()`.
- `upload_and_process_paper()` increments `research_papers_per_month` at line
  ~254, before extraction and embedding. Any downstream failure leaves the
  increment in place. Fix: move the increment to after the paper reaches
  `ready`, wrapped so a quota-counter failure cannot destroy an already-indexed,
  already-paid-for paper (`UsageLimitExceeded` subclasses `HTTPException` and
  would otherwise be caught by the error handler).
- **Rejected fix**: adding `research_papers_per_month` to the
  `resync_usage_counts()` call in `delete_paper()`. This was the obvious reading
  of "deleting a failed paper doesn't return the slot", but it is wrong — that
  counter tracks uploads performed during the billing period, not papers
  currently held, and `_USAGE_COUNT_QUERIES` resyncs from a live `COUNT(*)`.
  Wiring it up would let any user cycle upload → delete → upload indefinitely and
  bypass the monthly quota entirely. Not incrementing on failure in the first
  place is the correct and sufficient fix. A regression test now pins this.
- `search_relevant_chunks()` assigns `"similarity_score": 0.85` to keyword-boosted
  rows and orders the boost query by `chunk_index ASC LIMIT 4`. Fix: compute real
  cosine similarity for boosted rows in SQL against the same query vector, and
  order by that distance.
- Exception handlers set `paper.status = "error"` and commit without first
  rolling back. If the failure originated in the DB session the status write also
  fails, leaving the row stuck in `processing`. Fix: `rollback()` before the
  status write, re-fetching the row.
- `models.py` `ResearchPapers.embedding_model` still has
  `server_default=text("'text-embedding-004'")`.

## Scope

In scope:

- `backend/app/services/research_paper_service.py` — billing, quota, retrieval,
  rollback fixes and comment corrections.
- `backend/app/db/models.py` — `embedding_model` server default.
- `backend/tests/unit/test_research_paper.py` — repair the broken test, add
  regression coverage for single-charge and quota behaviour.
- `AI-Context/functional/feature-research-expert.md` — correct embedding provider,
  dimensions, top-k, and billing description.
- `AI-Context/technical/ai-token-economy.md` — correct Research Expert billing
  description.

Out of scope:

- Background/async upload processing and status polling.
- OCR fallback for scanned PDFs.
- File splits for `research_paper_service.py` and `ResearchReaderView.tsx`.
- Frontend changes (no UI change is required by these fixes).

## Acceptance Criteria

- [x] One analysis query produces exactly one `jina_embedding_query` ledger row
      and zero `jina_embedding` rows.
- [x] The Jina fee honours the admin-configured `jina_call_cost_usd`.
- [x] A multi-batch upload produces exactly one `jina_embedding` ledger row
      regardless of paper length.
- [x] An embedding run that fails produces zero embedding ledger rows.
- [x] An upload that fails during processing does not leave
      `research_papers_per_month` incremented.
- [x] `research_papers_per_month` is NOT resynced on delete (quota-bypass guard).
- [x] A quota-counter failure after successful indexing does not mark the paper
      as `error`.
- [x] No code path assigns a hardcoded/flattering similarity score to a chunk
      returned to the user.
- [x] Keyword-boosted chunks are ordered by cosine distance to the query vector.
- [x] `search_relevant_chunks` trims to `top_k` by relevance before re-sorting
      into reading order.
- [x] Failure paths roll back the session before writing `status = "error"`.
- [x] `embedding_model` server default is `jina-embeddings-v4`.
- [x] The query-embedding billing test exercises the real
      `search_relevant_chunks` path instead of mocking it away.
- [x] Functional spec, integrations doc, and token-economy doc describe
      Jina v4 / 1024 dims.

## Unit Test Plan

- `test_analyze_paper_charges_jina_query_embedding` — rewritten to mock only the
  Jina HTTP call and the AI chat call, letting `search_relevant_chunks` and
  `_generate_single_embedding` run, then assert exactly one
  `jina_embedding_query` row and zero `jina_embedding` rows.
- `test_upload_embedding_charged_once` — one `jina_embedding` row per successful
  embedding generation batch set.
- `test_failed_processing_does_not_consume_upload_quota` — usage count for
  `research_papers_per_month` is unchanged after a processing failure.
- `test_boosted_chunks_have_real_similarity_scores` — no returned chunk carries
  the former sentinel `0.85`.
- Existing `test_charge_jina_embedding_records_flat_fee` and
  `test_charge_jina_embedding_uses_admin_configured_cost` must still pass.

## File Size Check

- `backend/app/services/research_paper_service.py`: **1384 → 1466 lines**, i.e.
  this task made an already-over-threshold file ~82 lines longer, against the
  1150-line hard-split rule in [CODE_RULES.md](../../CODE_RULES.md). Documented
  here rather than glossed: the growth is one new small method
  (`_mark_paper_error`) plus explanatory comments on each corrected billing and
  scoring path, which are load-bearing — several of these bugs were introduced by
  a later edit not knowing why the earlier code was shaped as it was.
  The split is deliberately deferred to its own task so a billing-correctness fix
  is not entangled with a large mechanical refactor and made harder to review.
  **Follow-up required**: split this service (suggested seams — PDF extraction /
  chunking, embedding + billing, retrieval, CRUD + saved analyses).
- `frontend/src/components/ResearchExpertView.tsx` is 1446 lines and also needs a
  split, tracked with the same follow-up. Untouched by this task.
- `backend/app/db/models.py` and the test file: no material size concern.

## Verification Plan

- Static review of every `_charge_jina_embedding` call site to confirm exactly
  one charge per user-visible operation.
- Confirm no remaining literal similarity constants in
  `search_relevant_chunks()`.
- Python syntax/compile check on all edited backend files.
- Confirm the functional spec no longer references `text-embedding-004` or 768
  dimensions anywhere.

## Completion Notes

Code, tests, and context docs are updated. Compile checks pass on all edited
Python files.

**Not verified by execution.** The test suite could not be run in this
environment: `backend/.venv` is a macOS virtualenv and its interpreter will not
execute here, and these tests require a live Postgres with pgvector
(`tests/conftest.py` loads a real `DATABASE_URL`). The new and repaired tests are
statically consistent with the implementation but have not been observed passing.
**Run `pytest tests/unit/test_research_paper.py` before merging.**

Two expectations worth checking against that run:

- `test_charge_jina_embedding_uses_admin_configured_cost` should flip from
  failing to passing — it asserts an admin cost of `0.02` is honoured, which the
  old hardcoded `0.005` fallback could not satisfy. If it was previously green,
  the settings-key analysis above is wrong and should be re-examined.
- `test_boosted_chunks_report_real_similarity` exercises real pgvector SQL and so
  needs the pgvector extension present on the test database.

**Billing remediation is a product decision, not a code one.** Affected users
were overcharged roughly 5× per analysis query for as long as the two defects
coexisted. `ai_token_ledger` retains `source` and `cost_usd` per row, so the
over-charged amount is reconstructable: sum `cost_usd` for rows with
`source = 'jina_embedding_query'`, plus the spurious `source = 'jina_embedding'`
rows raised by analyze operations, and compare against the configured
`jina_call_cost_usd`. Whether to credit affected accounts is for the user to
decide.

Deliberately left for follow-up tasks:

- Background/async upload processing with status polling, plus retry/backoff on
  Jina 429/5xx. This is the highest-value remaining gap — the presence of
  `fix_stuck_papers.py`, `fix_stuck_papers_simple.py`, and
  `fix_paper_status_once.py` at the repository root is evidence that papers
  stranded in `processing` are a recurring operational problem.
- OCR fallback so scanned PDFs fail gracefully instead of consuming storage and
  becoming permanently unretryable.
- The two file splits noted above.
- UX gaps observed during the audit: no answer streaming, no follow-up/threaded
  questions (each query is independent, and a new analysis silently discards the
  previous one unless saved), no export of saved analyses, no way to correct an
  AI-misextracted title or author, no library search under the 20-paper cap.
