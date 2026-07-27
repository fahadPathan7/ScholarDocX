# AI Integrations

## CRITICAL: Billing Enforcement Requirements

**EVERY AI AND SEARCH PROVIDER CALL MUST BE BILLED AND GATED BY USER PLAN LIMITS.**

This is the absolute, non-negotiable requirement for all AI integrations in ScholarDocX. Before reading the provider-specific details below, internalize these rules:

### Mandatory Billing Flow For All Operations

1. **Pre-flight validation** (before calling external provider):
   ```python
   # Check feature gate
   from app.auth.limits import check_and_increment_limit
   check_and_increment_limit(user, "can_use_<provider>", 0, session)  # 0 = permission check only
   
   # Check token balance (for token-metered operations)
   from app.services.ai_tokens import check_available_tokens
   required_tokens = estimate_tokens(request)  # provider-specific estimation
   if not check_available_tokens(user, required_tokens, session):
       raise HTTPException(403, "Insufficient AI credits to complete this request")
   
   # OR check flat-fee balance (for flat-fee operations like Scholarship Hunt)
   from app.services.ai_tokens import check_flat_fee_balance
   if not check_flat_fee_balance(user, flat_fee_amount, session):
       raise HTTPException(403, "Insufficient credits for this operation")
   ```

2. **Provider call** (only if pre-flight passed):
   ```python
   response = await provider.call_api(request)
   ```

3. **Post-call charge recording** (after successful response):
   ```python
   # For token-metered operations
   from app.services.ai_tokens import charge_ai_tokens
   actual_tokens = extract_token_count(response)  # from provider response metadata
   charge_ai_tokens(user, actual_tokens, session)
   session.commit()
   
   # OR for flat-fee operations
   from app.services.ai_tokens import charge_flat_fee
   charge_flat_fee(user, flat_fee_amount, session, category="scholarship_hunt", operation_id=run_id)
   session.commit()
   ```

### Zero-Exception Policy

- **"Free" providers are NOT free to users**: OpenRouter Free, Gemini free tier, and any other provider labeled "free" by the vendor still consume ScholarDocX user credits. Users must have sufficient token balance and the appropriate plan gate.
- **Background tasks are NOT exempt**: Advisor Atlas runs, Deep Hunt runs, scheduled research, and webhook-triggered AI operations MUST load the user context via `load_user_dict(user_id, session)` and charge that user's balance. There is no "system account" bypass.
- **Admin operations are NOT exempt**: AI operations triggered from the admin panel must identify the target user and charge their balance. If an admin is testing a feature, charge the admin's own balance.
- **Development/testing must use mocks**: Local development and test suites MUST mock external provider calls. Do not make real API calls during tests. Use `unittest.mock.patch` or test fixtures to simulate provider responses.

### Enforcement Location

Place billing checks at the **service-layer entry point** where both user context and database session are available:
- `AiService.chat()` — enforces chat provider billing
- `AiService.research()` — enforces web search + synthesis billing
- `NewsService.search()` — enforces Scholarship Hunt Tavily billing
- `AdvisorAtlasService.run_discovery()` — enforces Advisor Atlas flat-fee billing
- `DeepHuntService.start_run()` — enforces Deep Hunt flat-fee + extraction billing

Do NOT place billing logic deep inside provider adapters (e.g., `glm/client.py`, `gemini/client.py`, `tavily/client.py`) because those layers lack user context.

### Audit Requirements For New Integrations

When adding a new AI provider, search provider, or credit-consuming feature:
1. **Document in Jira task**: Explicitly state how billing is enforced (which gate, token-metered or flat-fee, pre-flight check location, charge-recording location).
2. **Update this file**: Add the provider to the "Providers" section below and document its billing contract.
3. **Update admin panel**: Ensure the plan comparison UI exposes the new `can_use_<feature>` gate for admin configuration.
4. **Add test coverage**: Add a test case to `tests/regression/test_limits_billing_guards.py` that verifies the gate and charge recording work correctly.
5. **Update expected behavior table**: Add the provider to the "Provider-Specific Enforcement Requirements" table in `AGENTS.md`.

---

## Providers

- GLM AI API for chat, drafting, summarization, and rewriting.

- Google AI Studio Gemini API for optional chat, drafting, summarization,
  rewriting fallback, and Research Expert embeddings (`text-embedding-004`).
- Tavily API for real-time AI-chat web research and the separate filtered
  Scholarship Hunt web-discovery workspace.
- OpenRouter Free for generating a Scholarship Hunt query from structured
  filter choices before the existing user-review step.
- **Research Expert (SCHOLARDOCX-0174)**:
  - Vector embeddings via Gemini REST API `text-embedding-004:batchEmbedContents` (768 dimensions).
  - Cosine distance similarity search using pgvector operator (`<=>`) over `research_paper_chunks`.
  - Analytical queries pass through `AiService.chat(...)` with vector-retrieved chunk context and system prompt instruction.
  - Token consumption is metered via `ai_tokens.charge(...)` for embedding generation and `AiService.charge_tokens` for query analysis.

Gemini support is built around free-tier local use:

- Read `GEMINI_API_KEY` from the backend environment.
- Available Gemini models (free tier):
  - **Gemini 2.5 Flash-Lite**: 15 RPM, 1000 RPD. Best for high-volume chat.
  - **Gemini 2.5 Flash**: 10 RPM, 250 RPD. Good for summarization, translation.
  - **Gemini 2.5 Pro**: 5 RPM, 100 RPD. Best for complex reasoning, internal tasks.
- Users explicitly select both a chat model and a background model (routing,
  summarization). There is no auto-select or auto-fallback model cycling.
- Do not use Gemini image/audio generation, Google Search grounding, or
  paid-only media endpoints in the MVP.
- Tavily remains the web-search source so search behavior and source rendering
  stay provider-neutral.


- Tavily remains the only live web-search provider. OpenRouter remains isolated
  to Scholarship Hunt query generation.

## Integration Boundary

All provider calls should happen in backend integration modules.

Suggested structure:

```text
backend/app/integrations/glm/
backend/app/integrations/gemini/
backend/app/integrations/tavily/
backend/app/services/ai_assistant/
```

## Advisor Atlas

- Advisor Atlas uses Tavily for targeted public source discovery and GLM-5.2
  (default; override via `ADVISOR_ATLAS_GLM_MODEL`) for bounded structured
  extraction, fit analysis, dossier generation, and next-action guidance.
- **BILLING ENFORCEMENT**: Advisor Atlas runs are flat-fee operations. The `/advisor-atlas/run-discovery` and `/advisor-atlas/request-update` endpoints MUST:
  1. Check `can_use_advisor_atlas` gate BEFORE proceeding.
  2. Check `advisor_atlas_searches_per_month` limit (General=3, Pro=10, Max=30) BEFORE proceeding.
  3. Charge a flat fee via `charge_flat_fee(user, fee, session, category="advisor_atlas", operation_id=run_id)` at run start.
  4. All internal Tavily searches and GLM/vision calls during the run consume the user's token balance via `charge_ai_tokens`. The flat fee covers the "search unit" but does NOT pre-pay the provider token costs—those are charged incrementally as the run progresses.
  5. Background Advisor Atlas runs MUST load user context via `load_user_dict(user_id, session)` and charge that user's balance. There is no system bypass.
- Advisor Atlas text and vision analysis omit provider output-token fields,
  matching standard AI chat behavior. Schema prompts, source compaction, and
  response validation bound the work without an arbitrary feature-level token
  ceiling.
- Individual-professor research uses a purpose-specific query plan instead of a
  single Tavily query. Identity, profiles, research/lab, publications,
  scholarly-index metrics, funding/grants, recruitment, and recent
  news/activity are searched independently and tagged before deduplication
  (eight passes as of SCHOLARDOCX-0109).
- High-value accessible results are crawled selectively, prioritizing official
  university pages, lab or personal sites, scholarly profiles, DOI/publisher
  pages, and authoritative grant sources. Search snippets remain secondary
  evidence.
- Professor analysis may use multiple GLM calls: specialist extraction passes
  for identity/research, publications, and funding/recruitment, followed by a
  schema-validated synthesis. Missing keys still use deterministic local
  analysis.
- Deep research applies to both modes with no depth toggle. Discovery screens
  every candidate (one targeted search plus analysis), then re-processes the
  top ~15 candidates by fit through the full professor pipeline. Candidate
  processing uses bounded asyncio concurrency; the crawler serializes requests
  per host so polite per-domain delays hold under concurrency. Research usage
  is tracked per candidate for accurate telemetry.
- Research telemetry remains local operational metadata and is separate from
  product quota accounting. The role-limit key
  `advisor_atlas_searches_per_month` counts accepted new Advisor Atlas runs and
  professor evidence refreshes as one action each, regardless of their internal
  Tavily, crawl, or AI-call counts. General, Pro, and Max defaults are 3, 10,
  and 30 per calendar month.
- Full internal evidence may be persisted, while the candidate API and dossier
  UI expose only the top eight diverse sources by authority and confidence.
- Advisor Atlas source normalization preserves identity-bearing query
  parameters such as the Google Scholar `user` ID. Generic Scholar search pages
  are not accepted as professor profiles.
- Repeated URLs found by multiple search passes merge their purposes and retain
  the strongest content instead of being overwritten by the final pass.
- Verified professor pages may trigger one bounded linked-page crawl for
  publications, activities/CV, homepage, scholarly profiles, code profiles,
  and lab pages. Linked pages remain subject to the public URL, robots, size,
  and content-type controls.
- Deterministic identity reconciliation runs after AI synthesis. Candidate
  section extraction, name-matched email selection, profile ownership,
  structured HTML table rows, and publication authorship checks override or
  remove conflicting generated values.
- `AiService.chat` accepts a non-user-controlled operation label for diagnostic
  logs. Advisor Atlas supplies explicit labels for each specialist pass and
  final synthesis; normal assistant requests retain standard chat labels.
- Department discovery uses a separate bounded university-map pass before
  professor discovery. It returns related academic units with relationship
  class, rationale, source URL, and confidence.
- Discovery uses more than one bounded map query, then performs a faculty
  directory query per selected unit. High-value official directory results are
  crawled selectively, and a bounded fallback query is used only when a unit
  yields too few verified candidates. Directory fetch outcomes are retained in
  the run summary for transparent coverage reporting.
- Discovery analysis returns explainable semantic bridges and an opportunity
  forecast for the next two or three academic semesters. Current explicit
  openings and future likelihood are separate fields.
- When GLM is unavailable, deterministic matching uses curated academic concept
  families and weighted phrase/token evidence. The UI must label this as a
  limited fallback rather than equivalent semantic inference.
- The configured GLM vision model is optional and reserved for public visual
  documents that cannot be extracted as text.
- Provider calls remain backend-only and receive only public source excerpts
  plus the user-entered matching profile.
- Missing provider keys produce a deterministic local result from directly
  supplied or discoverable public pages where possible.
- AI output must validate against the feature schema and cite source IDs.
- Unsupported claims are removed or marked unknown.
- Forecast confidence cannot exceed evidence confidence. Funding, publication
  velocity, or lab activity may support a future-likelihood signal but never a
  confirmed current opening.
- Google Scholar access restrictions are not bypassed; publication enrichment
  may use official pages, DOI records, Crossref, OpenAlex, ORCID, or Semantic
  Scholar alternatives.

**CRITICAL BILLING REMINDERS FOR ADVISOR ATLAS**:
1. **Flat-fee at start**: Charge one flat-fee unit (`charge_flat_fee`) when the run starts, gated by `can_use_advisor_atlas` and `advisor_atlas_searches_per_month`.
2. **Token-metered during run**: Every Tavily search, GLM extraction call, and vision call during the run MUST charge tokens via `charge_ai_tokens`. The flat fee does not pre-pay provider costs—it only counts as one "Advisor Atlas search" unit.
3. **Background runs are billed**: Advisor Atlas runs may be triggered asynchronously (e.g., after user confirmation or scheduled refresh). These MUST load user context via `load_user_dict` and charge the user's balance. No system account bypass.
4. **Pre-flight checks prevent wasteful runs**: Check the gate and monthly limit BEFORE starting the Tavily/GLM work. If the user lacks quota, reject the run request and return a clear error without consuming credits.

## Scholarship Hunt Search

- The frontend sends structured filters to the local `/news/search` endpoint.
- Before search, the frontend sends filters to `/news/query-preview`; the
  backend makes at most one `openrouter/free` chat-completion request to produce
  a concise query without using Tavily or Scholarship Hunt quota.
  - **BILLING ENFORCEMENT**: `/news/query-preview` checks `can_use_scholarship_hunt`, `news_searches_per_day`, and `news_searches_per_month` limits BEFORE calling OpenRouter. Even though the OpenRouter model is "free" from the provider's perspective, the call is charged via `charge_ai_tokens` against the user's token balance. The user must have sufficient tokens.
- The user approves or edits the query. `/news/search` sends only that approved
  query to Tavily and stores the exact preview plus approved text locally for
  beta analysis.
  - **BILLING ENFORCEMENT**: `/news/search` re-checks `can_use_scholarship_hunt` and remaining daily/monthly search quota. If the quota check passes, it charges a flat fee via `charge_flat_fee(user, fee, session, category="scholarship_hunt", operation_id=search_id)` for the Tavily call.
- OpenRouter receives only selected filter labels, a deterministic baseline,
  and current date/cycle guidance. It never receives private workspace records,
  documents, or the Tavily results.
- OpenRouter output must be a bounded structured query. Invalid JSON, missing
  required destination or named-scholarship constraints, provider errors, and
  missing keys use the deterministic local query as a safe fallback.
- Query preview never retries or cycles models: one preview causes zero or one
  OpenRouter request. The configured model is `openrouter/free`.
- `backend/app/services/news_service.py` owns a dedicated Tavily adapter and
  must not call the AI assistant research service.
- The service reads the backend machine's local date for each search; query
  dates and current/next application cycles are never hard-coded in production.
- The backend converts UI labels into a focused natural-language web query.
- Query text expresses selected values as natural scholarship-search phrases
  and defines geography as the institution/study destination rather than
  applicant nationality.
- Named scholarships use canonical names and common aliases. Broad searches
  include scholarship/fellowship/funding intent plus selected degree, region,
  study-area, funding, and season terms.
- Query construction injects the backend's exact current date, current/next
  application years, and open/upcoming intent while excluding closed, expired,
  archived, and past-deadline cycles.
- Each submitted search makes one `POST https://api.tavily.com/search` request
  with `search_depth: basic`, `topic: general`, `auto_parameters: false`,
  `max_results: 20`, and answer/raw-content/image options disabled.
- Scholarship Hunt reads `TAVILY_API_KEY_SCHOLARSHIP_HUNT` for its dedicated
  Tavily boundary. AI-chat web research continues to use `TAVILY_API_KEY`.
- Social/video domains such as YouTube, Facebook, Instagram, LinkedIn, TikTok,
  Threads, X, and Twitter are excluded in the same request.
- Scholarship Hunt does not use Tavily Extract, Crawl, Research, AI answer
  generation, provider fallback, automatic retries, or provider pagination.
- Tavily results are normalized into the existing `NewsResponse` card contract
  with stable URL-derived IDs, source hostnames, snippets, and optional dates.
- Provider responses are normalized into the card contract and returned in
  provider order. Scholarship Hunt no longer applies manual post-provider
  relevance filtering, deadline rejection, or resorting.
- Selected dimensions use AND semantics during query generation and constraint
  sealing. Multiple selections inside one dimension are represented as OR terms
  in the editable query.
- The editable query is the relevance-control surface. Users can refine the
  generated text before Tavily search when they want stricter destinations,
  scholarships, dates, or exclusions.
- Existing `news_searches_per_day` and `news_searches_per_month` limits are
  checked before preview and incremented when `/news/query-preview` succeeds.
  `/news/search` re-checks remaining availability but does not consume a
  second unit for the same search flow.
- AI-chat `web_searches_*` counters and `/ai/research` behavior are unchanged.
- `OPENROUTER_API_KEY` remains backend-only and is used only by the dedicated
  Scholarship Hunt query-generator service.

**CRITICAL BILLING REMINDERS**:
1. **Query preview is NOT free**: The OpenRouter Free call in `/news/query-preview` MUST be charged via `charge_ai_tokens`. Users must have token balance even though the provider does not bill ScholarDocX.
2. **Search is flat-fee**: The Tavily call in `/news/search` MUST be charged via `charge_flat_fee` with `category="scholarship_hunt"`.
3. **Pre-flight checks are mandatory**: Both endpoints MUST check `can_use_scholarship_hunt` and quota limits BEFORE making external calls. If checks fail, return 403 without calling OpenRouter or Tavily.
4. **Charge recording is mandatory**: After successful provider responses, commit the charge to the database so the user's balance and admin dashboards reflect actual usage.

## API Key Handling

- Read keys from environment variables.
- Do not store real keys in source control.
- Do not expose keys to frontend.
- Validate provider availability at startup or first use.

**BILLING ENFORCEMENT**: Every provider integration MUST check the user's plan gate (`can_use_glm`, `can_use_gemini`, `can_use_groq`, `can_use_mistral`, `can_use_web_search`, `can_use_scholarship_hunt`, `can_use_advisor_atlas`) BEFORE making API calls, even if the provider key is present in the environment. A configured key does NOT mean all users can use it—only users whose plan includes the feature gate can make calls.

## Research Flow

1. User asks a research question.
2. Frontend sends any local rolling memory context and the web search hint.
3. **BILLING ENFORCEMENT**: Backend checks `can_use_web_search` gate and `web_searches_per_session` / `web_searches_per_month` limits BEFORE proceeding.
4. Backend uses a small objective routing prompt to decide whether search is needed.
   - **BILLING ENFORCEMENT**: The routing call (to GLM/Gemini/Groq/Mistral) is charged via `charge_ai_tokens`.
5. If routing fails, times out, returns invalid JSON, or returns incomplete JSON,
   backend defaults to searching with the original user query.
6. Tavily returns search results when search is needed.
   - **BILLING ENFORCEMENT**: The Tavily search is charged via `charge_flat_fee` with `category="web_research"`.
7. Backend prepares compact research context with titles, snippets, and URLs.
8. A configured chat provider summarizes or reasons over that context with the
   user's request.
   - **BILLING ENFORCEMENT**: The synthesis call is charged via `charge_ai_tokens`.
9. Response returns to UI with source references when possible.
10. User chooses whether to save the result.

Routing and synthesis prompts should be separate:

- The router must be domain-neutral and return only machine-readable JSON.
- The synthesis prompt should answer the user's actual request, cite or name
  sources when web context is used, and avoid unnecessary off-domain lectures.
- Provider-error and local-fallback responses should keep their mode instead of
  being relabeled as successful research.

**CRITICAL**: Every AI call in the research flow (routing, synthesis) MUST record token usage. The Tavily search MUST record a flat-fee charge. If any pre-flight check fails (insufficient tokens, missing gate, exceeded quota), reject the request and return a clear error to the user WITHOUT making external calls.

## Chat Memory Flow

1. Frontend keeps full chat sessions in browser secure storage.
2. After a completed session has at least four messages, frontend asks
   `/ai/summarize` for a rolling summary.
3. **BILLING ENFORCEMENT**: `/ai/summarize` checks `can_use_<provider>` for the configured background model (Gemini by default) and token balance BEFORE calling the provider.
4. `/ai/summarize` uses a compact memory-specific prompt and fast configured
   model.
5. **BILLING ENFORCEMENT**: The summarization call is charged via `charge_ai_tokens` after a successful response.
6. The next user request includes labeled memory sections:
   `[Conversation Summary So Far]` and `[Last Turn]`.
7. Failed summaries are ignored by the frontend so provider errors do not become
   chat memory.

Memory summaries should be under 600 tokens, preserve user intent and durable
decisions, and avoid storing full sensitive documents unless the user explicitly
asked to use that text in the chat.

**BILLING NOTE**: Summarization is a background-model operation but it is NOT exempt from billing. Even though users do not explicitly trigger it, it consumes their token balance because it improves their chat experience. Pre-flight check and charge recording are mandatory.

## Drafting Flow

1. User selects current document or email draft context.
2. Backend receives only required text and metadata.
3. **BILLING ENFORCEMENT**: Backend checks `can_use_<provider>` for the configured chat model and token balance BEFORE calling the provider.
4. A configured chat provider generates suggestions.
5. **BILLING ENFORCEMENT**: The drafting call is charged via `charge_ai_tokens` after a successful response.
6. UI shows suggestions separately from original content.
7. User accepts, edits, or discards.

**BILLING NOTE**: Drafting is a user-initiated operation. Pre-flight validation and charge recording apply the same as for chat.

## Agentic Action Flow

Agentic workspace actions use a plan-confirm-execute pattern:

1. Frontend sends the user request to `/ai/actions/plan` before normal chat
   when the text appears to request a workspace mutation.
2. **BILLING ENFORCEMENT**: `/ai/actions/plan` checks `can_use_agents` gate and `can_use_<provider>` for the configured planner model. It checks token balance BEFORE calling the provider.
3. Backend action planner returns one of:
   - `no_action`: continue normal chat/research.
   - `needs_info`: ask the user for missing project, sheet, row, or note data.
   - `needs_confirmation`: show a proposed action plan.
4. **BILLING ENFORCEMENT**: The planner call is charged via `charge_ai_tokens` after a successful response (regardless of whether it returns `no_action`, `needs_info`, or `needs_confirmation`—the provider was called and tokens were consumed).
5. Frontend renders the proposed action plan with Confirm and Cancel controls.
6. Only Confirm calls `/ai/actions/execute`.
7. Execution uses `Store` methods for project, sheet, row, and sticky note
   writes; AI provider output is never trusted as executable code.
8. `/ai/actions/execute` checks `can_use_agents` as a boolean permission only;
   it does not consume a separate usage counter.
9. **BILLING ENFORCEMENT**: Create-type actions in the execution phase enforce role limits (`total_projects`, `total_sheets`, `sheets_per_project`, `total_records`, `records_per_sheet`, `total_sticky_notes`) via `check_and_increment_limit` BEFORE mutating the database. Execution does NOT make additional AI calls (the plan was already generated and charged), but it must respect workspace quota limits.

Supported action types (SCHOLARDOCX-0110 expanded the agent to all non-admin
user domains):

- **Sheet workspace CREATE**: `create_project`, `create_sheet`, `add_rows`, `create_sticky_note`, `duplicate_sheet`
- **Sheet workspace UPDATE**: `update_project`, `update_sheet`, `update_row`, `rename_project`, `rename_sheet`, `bulk_update_rows`, `update_sticky_note`
- **Sheet workspace DELETE**: `delete_project`, `delete_sheet`, `delete_row`, `clear_sheet`, `delete_sticky_note`
- **Sheet workspace MODIFY**: `add_column`, `add_group`, `pin_project`, `pin_sheet`, `unpin_project`, `unpin_sheet`, `add_to_dashboard`, `remove_from_dashboard`
- **Sheet workspace READ (Smart)**: `search_rows`, `filter_rows`, `analyze_sheet`, `get_deadlines`, `get_overdue_rows`, `get_column_values`, `get_projects`, `get_sheets`, `get_rows`, `get_project_summary`, `get_sticky_notes`, `get_dashboard`, `get_notifications`, `count_items`
- **Record domains** (spec-driven `create_/update_/delete_/list_` quadruples in
  `ai_actions_records.py`): documents, email templates, email drafts,
  reminders, deadlines, universities, programs, professors, applications,
  research notes.
- **Record specials**: `add_document_version`, `complete_reminder`,
  `complete_deadline`, `log_outreach` (optional `follow_up_days` creates a
  reminder via `Store.log_outreach`), `update_outreach_log`,
  `list_outreach_logs`, `get_due_reminders`, `mark_notifications_read`.

Agent action architecture:

- `ai_actions.py` — `AiActionService` orchestration, planner prompt assembly,
  heuristic fallback, plan normalization core.
- `ai_actions_catalog.py` — action registry (supported/read-only sets,
  create-limit feature map, plan descriptions, execution messages).
- `ai_actions_workspace.py` — normalizers for the sheet-workspace actions
  (moved out of `ai_actions.py` for the file-size rule).
- `ai_actions_execute.py` — executors for the sheet-workspace actions plus the
  project/page resolution helpers; create executors call the service's
  role-limit hooks before mutating.
- `ai_actions_records.py` — domain spec table plus a generic
  normalize/execute engine for the record domains and specials. Foreign keys
  are resolved by name (university/program/professor/template/application),
  never by trusting provider-supplied ids.
- `ai_actions_read.py` — smart read/analysis helpers (unchanged).

Execution permissions:

- `/ai/actions/execute` passes the authenticated user into the service.
  Create-type actions enforce the same role limits as the manual routes:
  `total_projects`, `total_sheets`, `sheets_per_project`, `total_records`,
  `records_per_sheet`, `total_sticky_notes` via `check_and_increment_limit`
  and `get_user_limit`. `can_use_agents` stays a boolean gate with no counter.
- Admin actions are structurally impossible: no admin action type exists in
  the registry and the planner prompt instructs an explicit refusal for user
  management, roles, limits, invites, tokens, settings, and model management.

All actions are local database mutations. They do not send emails, submit
applications, upload files externally, overwrite existing document versions,
or call cloud storage.

**CRITICAL BILLING REMINDERS FOR AGENT ACTIONS**:
1. **Plan generation is billed**: The `/ai/actions/plan` call MUST check `can_use_agents`, `can_use_<provider>`, and token balance BEFORE calling the provider. The call MUST be charged via `charge_ai_tokens` after the provider responds, even if the plan result is `no_action`.
2. **Execution is quota-gated but not double-billed**: `/ai/actions/execute` enforces workspace limits (`total_projects`, etc.) via `check_and_increment_limit` but does NOT make additional AI calls or charge additional tokens (the plan was already billed). However, role limits must be enforced before mutating.
3. **Background agent tasks do not exist**: Agent actions are always user-initiated. There are no background or admin-triggered agent executions that bypass the user context or billing flow.

## Agent Execution & Normalization Enhancements (SCHOLARDOCX-0172)

To ensure high performance and zero multi-step failures in agent execution:

- **Multi-Action Context Inheritance**: `project_ref` and `sheet_ref` (`ai_actions_workspace.py`) inspect previous actions in reverse order to inherit `project_id`, `project_name`, `sheet_id`, or `sheet_name` when a subsequent action in a plan omits explicit target names.
- **Case-Insensitive Column Key Mapping**: `row_for_columns`, `execute_update_row`, and `execute_bulk_update_rows` (`ai_actions_execute.py`) map AI-supplied row keys to page column names case-insensitively and via best column match, preventing column values from being dropped or duplicated due to casing differences.
- **Pinning & Dashboard Schema Alignment**: `execute_pin_project`, `execute_unpin_project`, `execute_pin_sheet`, `execute_unpin_sheet`, `execute_add_to_dashboard`, and `execute_remove_from_dashboard` use the canonical database fields `is_pinned` (integer 1/0 for sidebar) and `pinned_to_dashboard` (integer 1/0 for dashboard) as defined in `store.py`.
- **Fuzzy Substring Fallback**: `resolve_project`, `resolve_page`, and `_find_by_name` attempt a case-insensitive substring fallback match when an exact match yields zero results. If exactly one candidate matches, it resolves cleanly.
- **Semantic Column Filtering**: `filter_rows_by_value` (`ai_actions_read.py`) resolves `column_name` against sheet columns via `find_best_column` when `columns` is provided.

## Deep Hunt Intent Matching (SCHOLARDOCX-0173)

Deep Hunt previously leaned entirely on raw Tavily search — a free-text goal
was string-concatenated into queries with hard-coded suffixes, so acronyms
like `cse` were never expanded to `computer science` and results ignored the
user's field/degree/funding intent. Two small AI calls now wrap the
web-search ingredient so results actually match the goal:

- **Query Planner** (`app/services/deep_hunt_query_planner.py`,
  `DeepHuntQueryPlanner`): one OpenRouter Free call per run turns the goal +
  Hunt-Profile facets into 3–4 diverse, acronym-expanded queries and a
  `field_synonyms` list. Falls back to the deterministic `_fallback_queries`
  templates on any error. `SEARCH_PASSES` bumped 3→4 so the field-specific
  query is not truncated.
  - **BILLING ENFORCEMENT**: The query planner call is charged via `charge_ai_tokens` against the user's token balance. Even though the model is "OpenRouter Free", the user must have sufficient tokens before the call is made.
- **Relevance Filter** (`DeepHuntRelevanceFilter`): one batched OpenRouter
  Free call judges every extracted opportunity RELEVANT/OFF_TOPIC against the
  goal's field/degree/funding intent, returning a 0–1 `relevance_score`. The
  accept gate (`_is_acceptable`) enforces a `RELEVANCE_FLOOR` so off-topic
  pages are rejected even when well-formed. Falls back to a deterministic
  synonym-keyword match (field-first: 0.1 unrelated, 0.7 overlap, 0.5
  unstated) when AI is unavailable — relevance is always enforced.
  - **BILLING ENFORCEMENT**: The relevance filter call is charged via `charge_ai_tokens` against the user's token balance. This is a single batched call per run (all extracted opportunities in one request).
- **Field-of-study dimension**: extracted end-to-end. `fields_of_study` is
  part of the extraction schema (`scholarship_extraction.py`), persisted as
  `scholarship_opportunities.fields_of_study_json`, unpacked by
  `_with_parsed_fields`, and surfaced as a fit-score chip
  (`✓ computer science` / `✗ not in your field`) in `computeFitScore`
  (`frontend/src/lib/huntProfile.ts`). Matching is synonym-aware and uses
  word-boundary token matching so short abbreviations (`cs`, `ai`, `me`) do
  not leak into unrelated words (`cs` is no longer matched inside `classics`).
- **Ranking**: `scholarship_opportunities` for a run are returned
  `ORDER BY relevance_score DESC` (then `updated_at DESC`), so on-topic
  results surface first instead of by update time.
- **Cost**: +2 OpenRouter Free calls per run (planner + relevance batch),
  both with `reasoning: {exclude: true}` and billing-free from OpenRouter's perspective. However, **ScholarDocX users are still charged tokens via `charge_ai_tokens` for both calls**. Extraction cost unchanged (already billed per opportunity). The Hunt Profile's `field_of_study` is now sent to the backend (`CreateDeepHuntRunRequest.field_of_study`, stored on `scholarship_deep_hunt_runs.fields_of_study`) so the planner and filter can use it; nationality/GPA remain opt-in/unsent.

**CRITICAL BILLING REMINDERS FOR DEEP HUNT**:
1. **Flat-fee at start**: Charge one flat-fee unit (`charge_flat_fee(user, fee, session, category="deep_hunt", operation_id=run_id)`) when the run starts, gated by `can_use_scholarship_hunt` (Deep Hunt is a Scholarship Hunt feature).
2. **Query planner is billed**: The OpenRouter Free call to generate diverse queries MUST charge tokens via `charge_ai_tokens`. Pre-flight check token balance before making the call.
3. **Relevance filter is billed**: The OpenRouter Free batched relevance-filtering call MUST charge tokens via `charge_ai_tokens` after extracting all opportunities.
4. **Extraction is billed**: Each scholarship extraction call (configured provider or OpenRouter Free fallback) MUST charge tokens via `charge_ai_tokens`.
5. **Background runs are billed**: Deep Hunt runs are asynchronous. They MUST load user context via `load_user_dict(user_id, session)` at run start and charge the user's balance for all provider calls. No system account bypass.
### Research Expert Vector Embeddings (Jina AI)

- **Provider**: Jina AI Embeddings (`https://api.jina.ai/v1/embeddings`)
- **Environment Key**: `JINA_API_KEY`
- **Model**: `jina-embeddings-v4`
- **Task**: `text-matching`
- **Dimensions**: `2048`
- **Policy**: Exclusive provider (no fallback). If Jina API fails or `JINA_API_KEY` is missing/invalid, an explicit HTTP 500/503 exception is raised to the user.
- **BILLING ENFORCEMENT (flat fee per operation — SCHOLARDOCX-0174)**: Jina embedding calls are billed as a **flat fee per user operation** (paper upload / retry / analyze), NOT token-metered. The fee is admin-configurable in **Settings → External APIs & Agents Pricing** (`app_settings.jina_call_cost_usd`, default `$0.002`). Enforcement lives in `ResearchPaperService._charge_jina_embedding()`, called once after each successful Jina HTTP call:
  - Upload → `charge_flat_fee(..., source="jina_embedding")`
  - Retry → `charge_flat_fee(..., source="jina_embedding_retry")`
  - Analyze query embedding → `charge_flat_fee(..., source="jina_embedding_query")` (this path was previously unbilled; the gap is now closed).
  - Pre-flight `ensure_can_spend()` runs before the call and raises `OutOfTokens` (HTTP 402) if the user's combined subscription + purchased balance cannot cover it. Access itself is gated by the existing `can_use_research_reader` role limit (Pro/Max) — no separate Jina gate.
  - The prior token-metered path (`ai_tokens.charge` with `provider="jina"`) was **removed**; the `ai_models` row for `jina-embeddings-v4` is retained only as a pricing reference and no longer drives billing.

## Privacy Rules

- Do not silently send full application records to AI providers.
- Send the smallest useful context.
- Make sensitive-context sending visible to the user.
- Do not save AI outputs as official records without user action.

## Testing Guidance

- Mock GLM and Tavily in tests.
- Test prompt construction separately from provider transport.
- Test missing key behavior.
- Test provider failure behavior.
- Test routing JSON parsing and fail-open search behavior.
- Test summarization fallback behavior so failed providers do not poison memory.
- Test Gemini payload/response parsing and provider fallback ordering.

- Test action planning validation, missing-info behavior, and confirmed local
  execution.
