# SCHOLARDOCX-0191: Empty publications, "0 credits", dead-end shortlist, thin compare

Status: Completed

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-07-28

## Summary

Four user-reported issues from a live dossier, plus the root cause they shared.

### 1. "0 Credits used" beside "1 AI analyses" — the analysis never happened

The reported metrics panel read `1 Tavily searches · 1 AI analyses · 0 Credits
used · 1 Pages crawled · 21 Sources · 98.6s`. Traced through the billing path,
that combination is close to impossible for a call that reached a provider:
`GLM-5.2` **is** priced in `ai_models` (2.00/4.00 per 1M), `is_unlimited()`
returns `False` for every role today, and `chat()` copies the real `charged`
figure into its usage dict.

The one path that produces exactly this shape is a call that never reached a
provider. `AiService.chat` returns `mode: "provider-error"` (or
`"local-fallback"`) with `usage: {input_tokens: 0, output_tokens: 0}` — cost 0,
credits 0 — and `_record_ai_usage` counted it as an AI analysis anyway, *before*
the caller checked the mode. `analyze_with_glm` then returned `None` and the
dossier fell back to `deterministic_analysis`, which produces no publications.
So the empty publication list and the zero credits were the **same event**: the
AI analysis failed silently and nothing in the UI said so.

Fixed: `_record_ai_usage` takes the response `mode` and counts failures
separately (`failed_ai_calls`, `last_ai_failure`). `research_metrics` carries
`failed_ai_calls` and `analysis_degraded`, and the dossier renders a plain-
language notice — "The AI analysis step could not complete for this professor,
so this dossier was assembled from the evidence alone. Refresh to try again."
The credits figure now shows "—" rather than "0" when no analysis succeeded,
because a bare 0 was covering three different situations.

This is the same failure class as SCHOLARDOCX-0190's defect 1, and the same
lesson: a swallowed exception plus a counter that increments regardless makes a
collapse look like a completed run.

### 2. Publications depended on a source that cannot be crawled

SCHOLARDOCX-0188 established that Google Scholar's `robots.txt` disallows
`/citations` outright, and that Semantic Scholar and ORCID return JavaScript
shells with no text. Publication extraction therefore had almost no source it
could actually read, and the section was empty for nearly everybody.

Fixed by using the scholarly index we already resolve. `OpenAlexClient` gained
`recent_works()` and `to_publication()`: the author record is already resolved
for the h-index, so fetching that author's works is one additional
list+filter call ($0.0001, a tenth of the author search) and returns structured
records with DOIs, venues, years, citation counts and author lists — no
scraping, no model call, no robots.txt problem.

These deliberately bypass the generated-publication validation in
`_validate_analysis` (URL allowlist, `is_scholarly_publication`,
`publication_supported_by_sources`). That validation exists to catch a *model*
inventing a paper; these come from the same API that identified the author and
carry DOIs. `_merge_scholarly_publications` lets indexed works lead, drops
page-derived duplicates by title, and keeps anything the pages found that the
index has not got.

**Billing (corrected in review — the first attempt was wrong three ways):**
the works lookup is a second real provider call, so it is billed. The first
version of this change simply looped `metered_call_count` times charging the
configured price with the author-lookup source, which was wrong:

1. **Overcharge.** `app_settings.openalex_call_cost_usd` is explicitly the
   *search* price (its default, $0.001, is OpenAlex's published per-search
   rate). A works lookup is a list+filter call at $0.0001 — a tenth. Charging
   both at the search price doubled the user's OpenAlex charge per professor
   while the real cost rose 10%. `METERED_CALL_COST_RATIO` now scales the list
   call by the published 10:1 ratio. `LIST_COST_USD` had been defined in the
   same commit and left unused, which is what surfaced this.
2. **Mislabelled ledger rows.** Both charges used
   `source="openalex_author_lookup"`, the exact string the admin dashboard
   counts as `openalex_total` — so every professor would have reported two
   author lookups. `METERED_CALL_SOURCE` gives the list call its own
   `openalex_works_lookup` source; `openalex_total` now counts both sources
   (so it keeps meaning "OpenAlex calls") and the dashboard also reports the
   split.
3. **Ungated second call.** `can_spend_external()` ran once, before the author
   resolution — which is itself billable. The balance that covered one call
   may not cover two, so the pre-flight now runs again before the works
   lookup.

`OpenAlexClient.metered_calls` (an ordered list of `"search"` / `"list"`)
replaced the count, because a caller cannot bill correctly from a number when
the two call classes have different prices. Works are fetched *before* the
charge block so nothing goes out unbilled (AGENTS.md).

### 3. Shortlisting led nowhere

`shortlist` set `shortlist_status`, showed a toast and filled the star. There
was no shortlist view, no filter, and no count anywhere in the UI — the run
type has carried `shortlist_count` since the beginning and nothing rendered it.

Fixed: a fifth **Shortlist** stage in the discovery funnel, separated from the
four pipeline stages by a rule rather than an arrow, because it is the user's
selection *out of* the pipeline rather than a stage the run produces. Its
membership is derived from the candidates themselves, not from the run summary,
so it updates the moment a star is toggled. Each run in the sidebar now shows
its shortlist count.

### 4. Compare answered the wrong question

The panel compared alignment, confidence, recruitment state, decision lane,
strong-coverage count and risk flags — three of which are internal scores and
one of which ("Strong coverage: 3 areas") means nothing to an applicant.

Rebuilt around the decision it exists to serve, in the order that decision is
made: **can they supervise** → **which of your interests they match** →
alignment → funding → publishing activity (h-index and works-per-year from the
scholarly record) → next likely intake with forecast confidence → contact
readiness (a `mailto:` link when there is a verified address) → evidence behind
it (how many sources name them) → risks. Each row carries a one-line hint
explaining what it means. The grid now sizes to the number of professors
selected instead of always reserving four columns.

## Technical Context

- `analysis.py`: `_record_ai_usage(..., mode)`; all three call sites pass
  `response.get("mode")`.
- `openalex.py`: `_WORK_FIELDS`, `LIST_COST_USD`, `metered_call_count`,
  `recent_works()`, `to_publication()`.
- `service.py`: `_attach_scholarly_record` fetches works before charging and
  charges per metered call; `_merge_scholarly_publications`;
  `research_metrics.failed_ai_calls` / `.analysis_degraded`.
- `models.py` / `connection.py`: `advisor_atlas_publications.citation_count`
  and `.evidence_source`, added via `_add_publication_provenance_columns`
  (`ADD COLUMN IF NOT EXISTS`, safe on every boot).
- `repository.py`: both new columns persisted.
- `advisorAtlasApi.ts`: `scholarly_record`, `failed_ai_calls`,
  `analysis_degraded`, `citation_count`, `evidence_source`.
- `AdvisorDossierDrawer.tsx`: degradation notice, citation counts and
  provenance on each paper, depth-aware empty state.
- `AdvisorDiscoveryFunnel.tsx`: shortlist stage, count, empty state.
- `AdvisorRunWorkspace.tsx`: rebuilt compare panel + `Meter` / `Flag` helpers.
- `AdvisorAtlasView.tsx`: shortlist count in the sidebar.
- CSS: `.atlas-degraded-notice`, `.atlas-discovery-step-divider`, five-column
  step grid, compare-panel rows/tags/meter/flags. Existing palette and radii
  only, no new design tokens.

## Scope

In scope: the files above, plus
`backend/tests/unit/test_advisor_atlas_scholarly_publications.py` (new).

Out of scope:
- Headless-browser rendering for JS-only scholarly sources. OpenAlex removes
  the need for it on the publication list specifically; the wider question from
  SCHOLARDOCX-0188 is still open.
- Bulk "save all shortlisted to my professor records". The shortlist is now a
  real destination; making it a hand-off into outreach tracking is a separate
  piece of work.

**Retracted finding.** An earlier draft of this ticket claimed `chat()` ignores
its own `can_spend()` pre-flight, letting a zero-balance user through for free.
That is wrong and has been removed rather than left as a follow-up: `can_spend()`
calls `ai_tokens.ensure_can_spend()` *without* a try/except, so it raises
`OutOfTokens` (HTTP 402) and the call never reaches a provider. The confusion
came from `can_spend_external()` directly above it, which does catch and return
a bool — that one's result *is* checked by its callers. The hard stop works.

## Verification Plan

- Direct script execution (pytest not run, per project policy):
  - `_record_ai_usage`: `provider-error` and `local-fallback` increment
    `failed_ai_calls` and leave `ai_calls` at 0; a real response increments
    `ai_calls` and accumulates `credits_charged`.
  - `to_publication`: full mapping including citation count and author list;
    DOI preferred over open-access and landing URLs; open-access URL used when
    there is no DOI; a work without a title is dropped.
  - `_merge_scholarly_publications`: an indexed work displaces the page-derived
    copy of the same paper (title-normalised), an unindexed page-derived paper
    survives behind it, the list caps at 8 and orders by year.
  - `recent_works` with a stubbed transport: `metered_calls == ["search",
    "list"]` for one professor; no call and an empty list once the budget guard
    has tripped.
  - Billing: the list call bills at exactly a tenth of the configured search
    price, the two call classes carry distinct ledger sources, and the
    pre-flight re-runs before the second call.
  - Read `AiService.can_spend` / `.can_spend_external` and
    `ai_tokens.ensure_can_spend` directly to settle whether the zero-balance
    hard stop works. It does — see the retracted finding above.
- `npx tsc --noEmit` clean.
- Unit tests added, not run: `test_advisor_atlas_scholarly_publications.py`.

## Completion Notes

Changed files: as listed under Technical Context.

Follow-ups:
- The screening pass still does no OpenAlex enrichment (cost), so a screened
  candidate has no publications by design. The dossier now says so and points
  at Refresh, but a "deep research this one" action on the card itself would be
  more direct than an icon labelled Refresh.
- Still open from SCHOLARDOCX-0190: a run that loses every deep pass reports
  the loss only to the server log.
