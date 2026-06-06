# AI Integrations

## Providers

- GLM AI API for chat, drafting, summarization, and rewriting.
- Google AI Studio Gemini API for optional chat, drafting, summarization, and
  rewriting fallback.
- Tavily API for real-time AI-chat web research and the separate filtered
  Scholarship Hunt web-discovery workspace.

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

## Integration Boundary

All provider calls should happen in backend integration modules.

Suggested structure:

```text
backend/app/integrations/glm/
backend/app/integrations/gemini/
backend/app/integrations/tavily/
backend/app/services/ai_assistant/
```

## Scholarship Hunt Search

- The frontend sends structured filters to the local `/news/search` endpoint.
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
- Social/video domains such as YouTube, Facebook, Instagram, LinkedIn, TikTok,
  Threads, X, and Twitter are excluded in the same request.
- Scholarship Hunt does not use Tavily Extract, Crawl, Research, AI answer
  generation, provider fallback, automatic retries, or provider pagination.
- Tavily results are normalized into the existing `NewsResponse` card contract
  with stable URL-derived IDs, source hostnames, snippets, and optional dates.
- Provider responses are relevance-checked and deduplicated before returning
  them to the frontend. ScholarDock must prefer an empty result set over
  unrelated content.
- Local post-processing parses deadline-context dates from titles/snippets,
  removes explicitly closed or wholly expired results, and sorts future
  deadlines and official sources first. Provider publication-date filters are
  not used as a substitute for application-deadline checks.
- Local post-processing also validates every selected dimension: level,
  destination, study area, funding type, season, and named scholarship.
  Dimensions use AND semantics; selections within a dimension use OR.
- Destination matching rejects nationality/audience titles and generic
  country-domain evidence. Academic country domains may establish institution
  location; government and publisher pages still need explicit study-location
  text.
- Existing `news_searches_per_day` and `news_searches_per_month` limits are
  checked before the call and incremented only after provider success.
- AI-chat `web_searches_*` counters and `/ai/research` behavior are unchanged.

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

Supported MVP action types:

- **CREATE**: `create_project`, `create_sheet`, `add_rows`, `create_sticky_note`, `duplicate_sheet`
- **UPDATE**: `update_project`, `update_sheet`, `update_row`, `rename_project`, `rename_sheet`, `bulk_update_rows`, `update_sticky_note`
- **DELETE**: `delete_project`, `delete_sheet`, `delete_row`, `clear_sheet`, `delete_sticky_note`
- **MODIFY**: `add_column`, `add_group`, `pin_project`, `pin_sheet`, `unpin_project`, `unpin_sheet`, `add_to_dashboard`, `remove_from_dashboard`
- **READ (Smart)**: `search_rows`, `filter_rows`, `analyze_sheet`, `get_deadlines`, `get_overdue_rows`, `get_column_values`, `get_projects`, `get_sheets`, `get_rows`, `get_project_summary`, `get_sticky_notes`, `get_dashboard`, `get_notifications`, `count_items`

All actions are local SQLite mutations. They do not send emails, submit
applications, upload files externally, overwrite documents, or call cloud
storage.

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
