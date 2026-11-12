# SCHOLARDOCX-0253: Research Expert review fixes, prompt quality, GLM-5.3 default

Status: Done

Owner: AI Agent

Epic: Epic-ResearchExpert

Created: 2026-11-12

## Summary

A code review of Research Expert found retrieval, resilience, privacy-copy and
processing bugs, several of which degraded the predefined analyses themselves.
This task fixes them, rewrites the 13 predefined prompts for output quality,
and makes GLM-5.3 the primary analysis model.

## Business Context

Links:

- Business file: N/A (quality and reliability of an existing paid feature)

Business value:

- The predefined analyses are the feature's main entry point; three of them
  were silently answered from the wrong passages.

## Functional Context

Links:

- Functional file: [feature-research-expert.md](../../functional/feature-research-expert.md)

Requirements:

- Predefined analyses retrieve the passages their topic needs and never trip
  whole-document counting or bibliography retrieval by accident.
- If the primary model is unavailable or disabled by an admin, the analysis
  falls back instead of failing.
- User-facing errors never name providers, environment files, or HTTP codes.

## Technical Context

Links:

- Technical file: [ai-integrations.md](../../technical/ai-integrations.md)
- Technical file: [billing-contract.md](../../technical/billing-contract.md)

Bugs found (all in scope):

1. **Predefined prompts tripped retrieval heuristics.** Trigger words were
   matched as substrings anywhere in the long prompt text:
   - Background & Related Work ("key references") pulled the whole
     bibliography (up to 8 of 10 passages).
   - Key Findings ("comparison table" + "each result") ran a document-wide
     table count and told the model to state it.
   - Reproducibility ("algorithm" + "every detail") ran an algorithm count;
     Results & Figures ran a figure count.
   Fix: the client sends `prompt_id`; the backend uses the canonical prompt,
   a focused per-prompt retrieval query and section terms, and skips the
   structural (inventory/bibliography) modes. Exact-text match covers older
   clients that send no id.
2. **Substring matching in free-text questions**: "preference" matched
   "reference" (pulling the bibliography for DPO-style questions), "stable"
   matched "table", "account"/"country" matched the "count" cue, "excited"
   matched "cited". Fix: word-boundary matching; drop the over-broad
   " each ", "every ", "overall", "how much" aggregate cues.
3. **Cascade did not fall back when an admin deactivated the primary model**:
   `_candidate_models` raises `UsageLimitExceeded`, which escaped the cascade.
   Fix: skip a blocked model, raise only if every model is blocked.
4. **Provider/infra names and raw HTTP bodies in user-facing errors** ("Jina AI
   Embedding API Error (429): …", "JINA_API_KEY … (.env)"). Fix: log details,
   return plain copy (AGENTS.md hard rule).
5. **Retry / search upgrade destroyed a working index on failure**: chunks were
   deleted before re-embedding. Fix: embed first, then swap chunks in one
   transaction; a failed upgrade of a ready paper leaves it ready.
6. **PDF parsing blocked the event loop** (pdfplumber is synchronous CPU work
   in async handlers). Fix: `asyncio.to_thread`.
7. **NUL bytes from pdfplumber** made Postgres reject the paper text. Fix: strip
   `\x00` during cleaning.
8. **PDF view crashed on non-ASCII filenames**: `Content-Disposition` was
   latin-1 encoded with the raw name (and broke on quotes). Fix: ASCII fallback
   plus RFC 5987 `filename*`.
9. **Unbounded `sources` on save-analysis**. Fix: cap at 32 entries.

Prompt quality:

- The 13 predefined prompts are rewritten with a fixed output structure,
  evidence discipline (paper-stated vs assessment), explicit "not reported"
  handling, and no padding. The analysis system prompt gains evidence rules
  (no invented numbers, partial-coverage honesty, no preamble).
  `ANALYSIS_SYSTEM_TOKENS` is raised to keep the credit ceiling honest.

Model:

- `ANALYSIS_MODEL_CASCADE` primary becomes `glm:GLM-5.3`, Groq Compound stays
  the fallback. The cost ceiling prices the max over the cascade, so GLM-5.3's
  placeholder price (SCHOLARDOCX-0252) is covered.

## Scope

In scope:

- research_paper_constants.py, research_paper_service.py,
  research_paper_retrieval.py, research_paper_processing.py,
  research_paper_text.py, api/research_reader.py, frontend
  researchPrompts.ts, ResearchExpertView.tsx, api.ts, tests, context.

Out of scope:

- Metadata extraction model (stays the fast default model).
- Retrieval ranking weights and chunk sizes.

## Acceptance Criteria

- Each predefined prompt runs with structural modes off and its own
  retrieval query; none triggers inventory or bibliography mode.
- "how does the preference model work" does not pull the bibliography;
  "is training stable in total" does not count tables.
- Deactivating GLM-5.3 in admin makes analyses fall back to Groq Compound.
- No user-facing error contains "Jina", "JINA_API_KEY", ".env", or a status code.
- A failed search upgrade of a ready paper leaves it ready with its chunks.
- A PDF named `Müller "draft".pdf` opens in the viewer.

## Implementation Plan

- As listed under bugs; prompt specs live in backend constants (single source
  of truth for text, retrieval query, and section terms); the frontend keeps
  titles/descriptions/categories and sends `prompt_id`.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- test_research_paper_retrieval.py: word-boundary false positives; every
  predefined prompt's text is inert under the heuristics it bypasses.
- test_research_expert_review_fixes.py: prompt resolution by id and by exact
  text; cascade fallback on a blocked model; sanitized Jina errors; NUL
  stripping; Content-Disposition with non-ASCII names; prompt length cap.

## File Size Check

Files expected to be edited:

- research_paper_service.py (842 → ~900), ResearchExpertView.tsx (1705, two
  lines; already over the limit before this task, not grown materially).

Line-count risk:

- Low

## Verification Plan

- Frontend type-check; isolated checks of the pure retrieval functions;
  suites when the user asks (backend venv currently broken).

## Completion Notes

Changed files:

- backend/app/services/research_paper_constants.py (prompts + retrieval specs,
  `resolve_predefined_prompt`, `public_prompt_catalog`, GLM-5.3 cascade,
  `ANALYSIS_SYSTEM_TOKENS` 600 → 900)
- backend/app/services/research_paper_service.py (prompt routing, retrieval
  kwargs, cascade skips blocked models, evidence/style rules)
- backend/app/services/research_paper_retrieval.py (word-boundary matching,
  narrower aggregate cues)
- backend/app/services/research_paper_processing.py (plain error copy, safe
  re-index swap, `asyncio.to_thread` for PDF parsing and storage reads)
- backend/app/services/research_paper_text.py (NUL stripping, per-page safety)
- backend/app/api/research_reader.py (`prompt_id`, `_inline_disposition`,
  sources cap, public catalog)
- frontend/src/lib/researchPrompts.ts (texts synced from backend, new
  descriptions), frontend/src/lib/api.ts, ResearchExpertView.tsx (send id)
- AI-Context/functional/feature-research-expert.md,
  AI-Context/technical/ai-integrations.md

Verification completed:

- Frontend type-check passes; context-drift and provider-billing guards pass.
- Retrieval heuristics exercised in isolation: all existing test cases still
  hold and the new false positives are gone.
- `_inline_disposition` checked for non-ASCII, quotes, and CR/LF.
- pytest not run: the backend venv points at a missing interpreter and
  AGENTS.md says not to run suites unprompted.

Unit tests added or updated:

- New: backend/tests/unit/test_research_expert_review_fixes.py.

Follow-ups:

- ResearchExpertView.tsx is over 1150 lines; split before the next feature.
- Run the Research Expert suites once the venv is rebuilt.
- Confirm `GLM-5.3` is accepted by the provider (see SCHOLARDOCX-0252).
