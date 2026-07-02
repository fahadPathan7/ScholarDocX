# AI Integrations

## Providers

- GLM AI API for chat, drafting, summarization, and rewriting.

- Google AI Studio Gemini API for optional chat, drafting, summarization, and
  rewriting fallback.
- Tavily API for real-time AI-chat web research and the separate filtered
  Scholarship Hunt web-discovery workspace.
- OpenRouter Free for generating a Scholarship Hunt query from structured
  filter choices before the existing user-review step.

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

## Scholarship Hunt Search

- The frontend sends structured filters to the local `/news/search` endpoint.
- Before search, the frontend sends filters to `/news/query-preview`; the
  backend makes at most one `openrouter/free` chat-completion request to produce
  a concise query without using Tavily or Scholarship Hunt quota.
- The user approves or edits the query. `/news/search` sends only that approved
  query to Tavily and stores the exact preview plus approved text locally for
  beta analysis.
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

## API Key Handling

- Read keys from environment variables.
- Do not store real keys in source control.
- Do not expose keys to frontend.
- Validate provider availability at startup or first use.

## Research Flow

1. User asks a research question.
2. Frontend sends any local rolling memory context and the web search hint.
3. Backend uses a small objective routing prompt to decide whether search is needed.
4. If routing fails, times out, returns invalid JSON, or returns incomplete JSON,
   backend defaults to searching with the original user query.
5. Tavily returns search results when search is needed.
6. Backend prepares compact research context with titles, snippets, and URLs.
7. A configured chat provider summarizes or reasons over that context with the
   user's request.
8. Response returns to UI with source references when possible.
9. User chooses whether to save the result.

Routing and synthesis prompts should be separate:

- The router must be domain-neutral and return only machine-readable JSON.
- The synthesis prompt should answer the user's actual request, cite or name
  sources when web context is used, and avoid unnecessary off-domain lectures.
- Provider-error and local-fallback responses should keep their mode instead of
  being relabeled as successful research.

## Chat Memory Flow

1. Frontend keeps full chat sessions in browser local storage.
2. After a completed session has at least four messages, frontend asks
   `/ai/summarize` for a rolling summary.
3. `/ai/summarize` uses a compact memory-specific prompt and fast configured
   model.
4. The next user request includes labeled memory sections:
   `[Conversation Summary So Far]` and `[Last Turn]`.
5. Failed summaries are ignored by the frontend so provider errors do not become
   chat memory.

Memory summaries should be under 600 tokens, preserve user intent and durable
decisions, and avoid storing full sensitive documents unless the user explicitly
asked to use that text in the chat.

## Drafting Flow

1. User selects current document or email draft context.
2. Backend receives only required text and metadata.
3. A configured chat provider generates suggestions.
4. UI shows suggestions separately from original content.
5. User accepts, edits, or discards.

## Agentic Action Flow

Agentic workspace actions use a plan-confirm-execute pattern:

1. Frontend sends the user request to `/ai/actions/plan` before normal chat
   when the text appears to request a workspace mutation.
2. Backend action planner returns one of:
   - `no_action`: continue normal chat/research.
   - `needs_info`: ask the user for missing project, sheet, row, or note data.
   - `needs_confirmation`: show a proposed action plan.
3. Frontend renders the proposed action plan with Confirm and Cancel controls.
4. Only Confirm calls `/ai/actions/execute`.
5. Execution uses `Store` methods for project, sheet, row, and sticky note
   writes; AI provider output is never trusted as executable code.
6. `/ai/actions/execute` checks `can_use_agents` as a boolean permission only;
   it does not consume a separate usage counter.

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

All actions are local SQLite mutations. They do not send emails, submit
applications, upload files externally, overwrite existing document versions,
or call cloud storage.

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
