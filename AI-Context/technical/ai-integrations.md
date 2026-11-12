# AI Integrations

How AI and search providers are used. All provider calls happen in the backend, never the browser,
and no provider key reaches the client. **Billing of every provider call is owned by
[billing-contract.md](billing-contract.md)** and the credit economy by [ai-token-economy.md](ai-token-economy.md);
this file records behaviour and invariants, not charging rules. A statement in context that "X is
billed" is a requirement, not evidence: verify at the call site.

## Providers

- **GLM** (default chat, drafting, summarization, agent planning, Advisor Atlas analysis; vision for visual sources), **Google Gemini**, **Groq**, **Mistral**: chat providers behind `AiService` (`backend/app/services/ai.py`).
- **OpenRouter**: Scholarship Hunt query planner, relevance filter, and extraction fallback.
- **Tavily**: `/ai/research` web research and Advisor Atlas source discovery.
- **Brave Search**: Scholarship Hunt deep search.
- **Jina AI**: Research Expert embeddings. **OpenAlex**: Advisor Atlas scholarly record and publications.
- Provider keys come from backend environment variables; real keys are never committed. Users pick a chat model and a background model (routing, summarization); there is no auto-fallback cycling. Gemini is used on its free tier: no image/audio generation, no search grounding, no paid-only endpoints.

Layout (provider HTTP lives in a private method of the owning service; billing lives one level up where the user and session are known):

```text
services/ai.py                         AiService: chat/research/summarize for GLM, Gemini, Groq, Mistral
services/ai_tokens.py                  billing for every provider
services/brave_search_service.py       Brave (Scholarship Hunt)
services/deep_hunt_query_planner.py    OpenRouter planner and relevance filter
services/scholarship_extraction.py     extraction (OpenRouter fallback)
services/advisor_atlas/openalex.py     OpenAlex client
services/research_paper_service.py     Jina embeddings
```

## Key handling and privacy

- Read keys from the environment, validate availability at startup or first use, never expose them to the frontend.
- Do not silently send full application records to providers; send the smallest useful context and make sensitive-context sending visible.
- AI output is never saved as an official record without a user action.
- A provider failure must not become fake work: `AiService.chat` returns `mode: "provider-error"` or `"local-fallback"` with zero-token usage instead of raising, so callers that count AI calls must check the mode first. Advisor Atlas records failures in `research_metrics.failed_ai_calls` / `.analysis_degraded` and the dossier shows a notice.

## Research flow (`/ai/research`)

1. The client sends rolling memory context and the web-search hint; the backend checks `can_use_web_search` and the web-search limits.
2. A small, domain-neutral routing prompt (machine-readable JSON) decides whether to search; on failure, timeout, or invalid JSON it fails open and searches with the original query.
3. Tavily returns results (served from the 15-minute per-user search cache when available); the backend builds compact context (titles, snippets, URLs).
4. A configured chat provider answers with source references; the user chooses whether to save.

Routing and synthesis prompts stay separate. Provider-error and local-fallback responses keep their mode and are never relabeled as successful research.

## Chat memory and drafting

- After a completed session has at least four messages the frontend asks `/ai/summarize` for a rolling summary (under 600 tokens, preserving intent and durable decisions); the next request carries `[Conversation Summary So Far]` and `[Last Turn]`. Failed summaries are ignored so provider errors never become memory. Summarization is user-billed even though users do not trigger it explicitly.
- Drafting receives only the required text and metadata; suggestions are shown separately from the original, and the user accepts, edits, or discards.

## Agentic actions (tool loop, confirm, execute)

1. The frontend sends a workspace request to `/ai/actions/plan` (gates: `can_use_agents` and the provider's `can_use_<provider>`). It also routes there any reply to an agent turn (`follow_up: true`, which skips the backend's action-word gate) and sends the last 10 turns as structured `history` (SCHOLARDOCX-0255).
2. **Tool loop** (`ai_agent.run_agent_turn`, first choice when a provider is configured): up to `MAX_AGENT_STEPS` (5) tool-calling model calls via `AiService.chat_with_tools` (OpenAI-compatible; Gemini via its OpenAI-compatible endpoint), each one billed like `chat`. Two tools:
   - `run_read_action`: one catalog READ action, normalized and executed immediately; bounded results (`serialize_results_for_analysis`) go back to the model. A write sent here is refused.
   - `propose_changes`: the only route to a write. Normalized with the planner's normalizers; missing fields go back to the model as a tool error. A valid proposal ends the turn as `needs_confirmation` (Confirm/Cancel). Writes never run inside the loop.
   A text reply ends the turn as `answered`. If the first call fails (e.g. a model that rejects `tools`), the single-shot planner below runs instead.
3. **Single-shot planner** (fallback): returns `no_action`, `needs_info`, or `needs_confirmation`; with no provider at all, the regex heuristic plan.
4. Only Confirm calls `/ai/actions/execute`, which checks `can_use_agents` as a boolean and enforces the same role limits as the manual routes for create actions (`total_projects`, `total_sheets`, `sheets_per_project`, `total_records`, `records_per_sheet`, `total_sticky_notes`).
5. Execution uses `Store` methods; provider output is never executable code. All actions are local database mutations: no emails, submissions, external uploads, or overwriting document versions. Admin actions are structurally impossible (no admin action type; the prompts refuse them). Agent tasks are always user-initiated; there are no background agent runs.
6. Plain chat (`/ai/chat`) has no tools; its system prompt forbids claiming any workspace change.

`add_rows` accepts blank rows (`rows: [{}]` or `count`) and `insert_after_row` (1-based); before SCHOLARDOCX-0255 an empty row was reported as missing `row_values`, so "add an empty row" could never be planned. The action catalog shown to every model is `ai_actions.ACTION_EXAMPLES_TEXT`.

Structure: `ai_actions.py` (orchestration, planner prompt, heuristic fallback), `ai_agent.py` (tool loop), `ai_actions_catalog.py` (action registry), `ai_actions_workspace.py` and `ai_actions_execute.py` (sheet-workspace normalizers and executors), `ai_actions_records.py` (spec-driven create/update/delete/list for record domains; foreign keys are resolved by name, never by provider-supplied ids), `ai_actions_read.py` (read and analysis helpers), `ai_actions_analyze.py` (post-execution analysis).

Behaviours worth keeping: later actions in a plan inherit `project_ref` / `sheet_ref` from earlier ones; column keys, project and sheet names resolve case-insensitively with a substring fallback; pin/dashboard actions use the real schema fields; `filter_rows_by_value` resolves the column semantically via `find_best_column`.

### Sheet Ask AI constraints

The sheet Ask AI menu (`frontend/src/components/sheet/askAiPrompts.ts`, `AskAiMenu.tsx`) feeds one preset message at a time into the pipeline above. Two limits shape what a preset may ask:

1. `AiActionService.plan` caps the planner completion at `max_tokens=1200`, so a request that needs unique generated text per row breaks past about 5-8 rows. Presets must not ask for unique per-row content across every row.
2. `_build_planner_prompt` injects real cell data for only the first 30 rows of the target sheet (`_target_sheet_block`). A message may carry `(row_index: N)` or `(row_indices: [...])` markers (built by `rowTarget()` / `selectedRowsTarget()`); those rows (up to 20 extra) are always included (`_extract_targeted_row_indices`).

So each preset is scoped to one row, one column, a small selected set, or a backend-computed column scan (`get_deadlines`, `analyze_sheet`, `filter_rows`, `get_column_values` run over the full row set and are accurate at any size). Every preset tells the model to say what is missing instead of guessing (planner Parsing Rule 18). For auto-executed read-only plans, `AiActionService.analyze_results` makes a second call (`max_tokens=2048`) over results bounded by `serialize_results_for_analysis` (about 150-200 rows, 12k chars, 120-char cells, with a `truncated` flag) and the analyst prompt must state truncation or insufficient data plainly.

## Scholarship Hunt (`scholarship_deep_hunt.py`)

One natural-language goal runs the whole pipeline; there is no depth knob and one search surface. Gate: `can_use_scholarship_hunt` (Pro/Max); rate limit `scholarship_deep_hunt_run` (5 runs per 10 minutes).

1. **Plan queries**: `DeepHuntQueryPlanner.plan` (one OpenRouter call) makes 3-4 diverse, acronym-expanded queries plus `field_synonyms`; deterministic fallback on error.
2. **Brave search**: `SEARCH_PASSES=2` x `MAX_RESULTS_PER_PASS=8` = at most 16 raw hits, de-duplicated by canonical URL. `BraveSearchService` is a thin adapter returning the 9-key card contract (`article_id, title, link, source_name, pubDate, image_url, description, country, _search_score`; the score derives from rank).
3. **Hard filters**: deterministic and free; drop pages with an explicit closed status, a stale cycle, or conflicting destinations/fields (`_has_explicit_closed_status`, `_is_stale_cycle`, `matches_destinations`, `has_conflicting_fields`).
4. **Crawl and extract**: top `MAX_CRAWL_PAGES=12` via `PublicCrawler`; top `MAX_EXTRACTIONS=12` via the extraction service. Missing fields stay missing. The extraction prompt forbids naming an aggregator or hosting site as `sponsor`, or assuming `application_url` is the crawled page, unless the text says so.
5. **Relevance filter**: one batched `DeepHuntRelevanceFilter.score` call, floor `RELEVANCE_FLOOR=0.4`; broad umbrella programs (5+ unrelated fields) score low; a deterministic synonym-keyword fallback keeps relevance always enforced. Survivors sort by `relevance_score` descending.
6. **Dedup**: by `_dedup_key(canonical_name)` (strips years, apostrophes, plural filler) keeping the highest-relevance then most complete; distinctly named programs are never merged. No hard cap on survivors.
7. **Store on the run**, not the library: results live in `scholarship_deep_hunt_runs.results_json` and become `scholarship_opportunities` rows only when the user saves one (`POST /scholarship-deep-hunt/runs/{id}/results/save`, via `upsert_scholarship_opportunity`).

Caps (FIFO rules in [CODE_RULES.md](../CODE_RULES.md)): the Opportunity Library is capped at `MAX_LIBRARY_ENTRIES = 100` per user; a brand-new row beyond it raises `LibraryFullError` (HTTP 409), updating an owned `normalized_url` is never blocked, and it is a fixed constant, not a role limit. Run history keeps 10 runs (`create_run` evicts the oldest) and eviction or delete detaches saved opportunities (`deep_hunt_run_id = NULL`) instead of deleting them. The scholarship catalog (`GET /scholarship-catalog`) is static: zero network calls, no billing.

Billing shape (details in the contract and economy docs): every raw Brave hit is charged before filtering at an admin-set per-hit price, with a worst-case pre-flight at run creation (16 hits); the planner, relevance filter, and extraction (including the OpenRouter fallback) are all charged; an "OpenRouter Free" model still costs the user.

Transparency: before submitting, the UI shows the cost ceiling ("Up to N sources · up to M credits"); during the run `progress_json` counters (`sources_scanned`, `sources_filtered`, `opportunities_extracted`) drive a live funnel. User-facing copy never names Brave, Tavily, or pipeline terms. `field_of_study` is a manual form field (`CreateDeepHuntRunRequest.field_of_study`) used by the planner and filter; field matching happens server-side, so do not rebuild a browser-side fit chip.

## Advisor Atlas

Tavily finds targeted public sources; GLM (default GLM-5.3 since SCHOLARDOCX-0252, override `ADVISOR_ATLAS_GLM_MODEL`) does bounded structured extraction, fit analysis, dossiers, and next-action guidance. Gate: `can_use_advisor_atlas`. Metering is per provider call (GLM chat and vision, OpenAlex, Tavily); there is no monthly run count or flat run fee. Background runs load the user with `load_user_dict`; out-of-credits raises `OutOfTokens` and stops the run.

- **Individual-professor research** uses eight tagged search passes (identity, profiles, research/lab, publications, scholarly metrics, funding, recruitment, recent news), merged by URL keeping the strongest content. High-value official, lab, scholarly, and grant pages are crawled selectively; a verified professor page may trigger one bounded linked-page crawl. Everything respects public-URL, robots, size, and content-type controls. Source normalization (`canonicalize_url`) keeps content-selecting query parameters (`profile.php?id=42`) and drops only tracking ones (`utm_*`, `fbclid`, ...); Google Scholar keeps only its identity `user` parameter (SCHOLARDOCX-0251). Generic Scholar search pages are not professor profiles; Google Scholar restrictions are never bypassed. Directory harvesting (`faculty_candidates`) accepts only same-site links whose path has a faculty hint token; a generic "View profile" link takes its name from the preceding card heading.
- **Analysis** may use several GLM calls (specialist passes, then a schema-validated synthesis; explicit operation labels for logs). Deterministic identity reconciliation runs afterwards (section extraction, name-matched email, profile ownership, publication authorship) and overrides conflicting generated values. AI output must validate against the schema and cite source IDs; unsupported claims are removed or marked unknown.
- **Discovery** maps related academic units first (relationship class, rationale, source URL, confidence), then runs a faculty-directory query per selected unit with a bounded fallback; directory fetch outcomes feed the coverage report. Deep research applies to both modes: Discovery screens every candidate, then re-processes the top ~15 by fit through the full professor pipeline with bounded concurrency (the crawler serializes per host). The full evidence is stored; the API and dossier show the top eight diverse sources.
- **Forecast**: semantic bridges plus an opportunity outlook for the next 2-3 semesters. Current explicit openings and future likelihood are separate fields; forecast confidence never exceeds evidence confidence and a future-likelihood signal never becomes a confirmed opening.
- **Fallbacks**: with GLM or keys missing, deterministic matching uses curated concept families and weighted phrases; the UI must label it a limited fallback. The GLM vision model is optional and only for public visual documents that cannot be read as text. Providers receive only public source excerpts plus the user-entered matching profile.

### OpenAlex scholarly graph

- Client: `services/advisor_atlas/openalex.py`; env `OPENALEX_API_KEY` (optional), `OPENALEX_BASE_URL`. Freemium: about $0.10/day without a key, $1/day with a free key; single-entity lookups are free.
- A dossier costs one metered search (author resolution) plus free lookups. Enrichment runs on deep runs only (a Discovery run screening 80 candidates would exhaust the budget on names it may never surface).
- The client reads `X-RateLimit-*` and `meta.cost_usd` and stops metered calls below `BUDGET_RESERVE_FRACTION` (5%) of the daily limit; OpenAlex does not hard-stop, so overrun could cost real money.
- Degradation is mandatory: a missing key, 429, 401/403, outage, or timeout returns `None` and leaves the run as capable as without OpenAlex.
- **Identity safety**: attach an author record only above a confidence floor (full name, given name, institution). A surname-only match or two near-tied candidates attach nothing.
- Only the professor's name and institution are sent; the applicant's interests, documents, and profile never leave the app.
- **Publications come from the index, not a crawl** (`OpenAlexClient.recent_works`): Google Scholar disallows `/citations`, and ORCID and Semantic Scholar serve script shells. Indexed works deliberately bypass `_validate_analysis`'s publication checks, which exist to stop a model inventing papers; do not route them through the allowlist. The works lookup is a second, cheaper metered class (`METERED_CALL_COST_RATIO`): bill from `client.metered_calls` (ordered `"search"`/`"list"`) with the per-class ledger source (`METERED_CALL_SOURCE`), fetch works before the charge block, and re-run `can_spend_external()` before the second call. A screened candidate legitimately has no publications; the UI says "not researched deeply yet", not "none found".
- Research Metrics show real credits (`research_metrics.credits_used`, accumulated from the `credits_charged` returned by `charge_tokens` / `charge_external_call`), never token estimates, and never the word "tokens".

### Discovery quality gates (each was violated in a live run and cost real credits)

1. Never `json.dumps` a stored record into a prompt (datetimes raise `TypeError` and silently degrade every dossier); use `analysis.json_dump` and send `candidate_prompt_payload(candidate)`, never the whole row (a model shown its own earlier conclusions re-derives them).
2. A candidate must look like a person: `crawler.clean_person_name` checks shape and vocabulary (`_looks_like_person`); page furniture such as "Graduate Faculty" has a name's shape.
3. A unit owns only faculty found on its own pages: `discovery.source_belongs_to_unit` gates search and directory candidates; failures become `fetch_status: "off_target"` and a coverage gap.
4. A unit is an organisation that employs faculty: `intelligence.is_academic_unit_name` rejects job titles and degrees before the per-unit search and crawl budget is spent.
5. Rank an advisor, not a person: `advising_eligibility` (title, email domain, profile text only when the title is missing) yields `eligible` / `limited` / `ineligible`; ineligible candidates are excluded from research matches and shown with a reason, never deleted. Protect `Senior Lecturer`, `Reader`, and `Research Assistant Professor`.
6. Confidence is earned: `calibrate_evidence_confidence` caps by distinct sources naming the person (0 -> 25 ... 3+ -> 85, +10 official, max 95), only ever lowers, and runs before `opportunity_forecast`.
7. Merge conservatively: `same_person` matches on a shared profile URL, shared email, or surname + compatible first name + same institution (initial-vs-full only; a prefix rule would merge `Hua Li` and `Hui Li`).

Rules 5-7 and the identity checks live in `advisor_atlas/candidate_quality.py` and are deliberately deterministic: they run on every candidate, and a model call would cost credits per candidate and fail open. Drop what the pipeline cannot attribute at discovery; do not flag it downstream after it has been paid for.

## Research Expert embeddings (Jina)

- `https://api.jina.ai/v1/embeddings`, key `JINA_API_KEY`, model `jina-embeddings-v4`, 1024 dimensions (`EMBEDDING_DIMENSIONS`, under pgvector's 2000-dim index ceiling), batches of 16. Exclusive provider: a missing or invalid key returns an explicit 500/503, no fallback.
- **Asymmetric pair** (SCHOLARDOCX-0193): `retrieval.passage` when indexing a paper, `retrieval.query` when embedding a question. Never mix adapters: a mismatched query returns meaningless numbers without erroring. `research_papers.embedding_task` records how each paper was indexed and `QUERY_TASK_FOR_PASSAGE_TASK` picks the matching query task; papers indexed before this change stay on `text-matching` for both sides until re-indexed, and an unknown stored value resolves to legacy. Re-indexing (`retry_paper_processing`) is the upgrade path and is user-initiated because it spends credits.
- Search is cosine distance via pgvector (`<=>`) over `research_paper_chunks`, including the keyword section-boost pass. Analytical queries go through `AiService.chat` with retrieved context and a GLM-5.3 then Groq compound model cascade (`ANALYSIS_MODEL_CASCADE`, SCHOLARDOCX-0253); a model an admin has deactivated is skipped rather than failing the request. Trigger words for the bibliography and whole-document count modes match whole words only ("preference" is not "reference", "stable" is not "table"), and predefined analyses bypass those modes entirely. Embedding-provider failures reach the user as plain "paper search" copy; specifics go to the log.
- Billing is one flat charge per user operation (see [ai-token-economy.md](ai-token-economy.md)); `_generate_embeddings()` is the single charging point.

## Testing guidance

- Mock providers in tests; test prompt construction separately from transport.
- Test missing-key and provider-failure behaviour, routing JSON parsing with fail-open search, and summarization fallback so failed providers do not poison memory.
- Test Gemini payload/response parsing, action-plan validation, missing-info handling, and confirmed local execution.
