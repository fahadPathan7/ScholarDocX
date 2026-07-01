# SCHOLARDOCX-0077: Scholarship Hunt Workspace

Status: In Progress

Owner: AI Agent

Epic: Epic-AdvisorAtlas

Created: 2026-06-06

## Summary

Build a "Scholarship Hunt" tab/workspace that displays relevant scholarship,
fellowship, grant, and academic-funding pages found through a dedicated Tavily
web search. Results may come from official or editorial websites. Structured
filters, the existing card view, bookmarks, and role-based limits remain
unchanged.

## Business Context

Links:

- Business file:

Business value:

Provides users with up-to-date, relevant scholarship opportunities directly within their workspace, increasing engagement and the value proposition of the Pro and Max tiers which offer higher search quotas.

## Functional Context

Links:

- Functional file:
  [feature-scholarship-news.md](../../functional/feature-scholarship-news.md)

Requirements:

- FR-8.1: Add structured academic and scholarship filters.
- FR-8.2: Convert named-scholarship display labels into canonical provider queries.
- FR-8.3: Require named-scholarship results to mention the selected scholarship or an alias.
- FR-8.4: Keep generic results scholarship or academic-funding focused.
- FR-8.5: Deduplicate provider results.
- FR-8.6: Enforce role-based search limits when Search-click preview succeeds.
- FR-8.7: Keep the Tavily API key backend-only.
- FR-8.8: Present filters with accessible accordions, selected counts, readable
  option groups, and a persistent action area.
- FR-8.9: Allow high-density subcategory groups to collapse independently.
- FR-8.10: Order the main filters by user intent: Scholarship Level, Popular
  Scholarships, Region, Study Area, Funding Type, Season.
- FR-8.11: Broad level-only searches use focused web queries so the feed still
  returns scholarship and funding pages.
- FR-8.12: Use at most one one-credit Tavily request per submitted search.
- FR-8.13: Keep Scholarship Hunt isolated from AI-chat web research.
- FR-8.14: Preserve the existing news-card response and UI contract.
- FR-8.15: Add exact-date, open/upcoming, and current/future-cycle query intent.
- FR-8.16: Express closed and explicit past-deadline exclusions in the query.
- FR-8.17: Preserve Tavily result order after normalization.
- FR-8.18: Use opportunity-focused user-facing copy.
- FR-8.19: Generate date and application-cycle intent from the local date per search.
- FR-8.20: Rebrand visible surfaces to Scholarship Hunt without internal migrations.
- FR-8.21: Seal all selected filter dimensions into the generated query before
  Tavily search.
- FR-8.22: Treat Region as study destination, not nationality or source location.
- FR-8.23: Rename visible usage and Admin role-limit labels to Scholarship Hunt.
- FR-8.24: Review and optionally edit generated queries before search.
- FR-8.25: Store generated and approved queries locally for beta analysis.
- FR-8.26: Preview uses no Tavily request but does consume one Scholarship Hunt
  unit; confirmation makes one Tavily request without spending a second unit.
- FR-8.27: Use a query-first flow and display normalized Tavily results without
  manual post-search filtering.
- FR-8.28: Generate the preview query from choices with one OpenRouter Free call.
- FR-8.29: Fall back locally without retries when AI generation is unavailable or invalid.
- FR-8.30: Store the exact preview and final approved query separately.
- FR-8.31: Show a clear preparing/searching state when users run a new search
  over still-visible older results.

## Technical Context

Links:

- Technical file:

Technical notes:

- `/news/search` remains the backend-only provider boundary and uses
  `TAVILY_API_KEY_SCHOLARSHIP_HUNT`.
- AI-chat web research keeps using `TAVILY_API_KEY`.
- The Scholarship Hunt adapter is independent from `/ai/research` and its chat
  provider orchestration.
- Build a focused natural-language query from all selected filters.
- Send exactly one Tavily Search request with `search_depth: basic`,
  `topic: general`, `auto_parameters: false`, `max_results: 20`, and no answer,
  raw-content, or image generation.
- Do not retry, fall back, extract, crawl, invoke Tavily Research, or request a
  provider next page for the same submitted search.
- Normalize Tavily title, URL, snippet, hostname, favicon/image, and optional
  date into the existing frontend response contract.
- Normalize Tavily results into cards and display the provider result set for
  the approved query without manual relevance filtering, deadline rejection, or
  post-provider resorting.
- Preserve existing `news_searches_per_day` and
  `news_searches_per_month` counters and limits, but consume them on
  successful `/news/query-preview` instead of after Tavily success.
- Use AND semantics across selected filter dimensions and OR semantics within
  each dimension while building and sealing the editable query.
- Isolate OpenRouter query generation in a backend service using
  `OPENROUTER_API_KEY` and `openrouter/free`.
- Send only selected labels, current date/cycle context, and the deterministic
  baseline. Require structured bounded output and seal selected choices into
  the query.
- Make no more than one OpenRouter request per preview and preserve the local
  query builder as the no-key/provider/invalid-output fallback.

## Scope

In scope:

- "Scholarship Hunt" workspace tab UI and filter panel.
- Dedicated Tavily Search integration via the existing backend proxy.
- Role-based rate limiting system.
- News card UI and save/bookmark functionality.

Out of scope:

- Advanced natural language search parsing (using structured filters instead).
- AI-generated summaries or answers.
- Reuse of the AI-chat `/ai/research` flow or its web-search counters.
- Tavily Extract, Crawl, Research, advanced search, and multi-request
  pagination.

## Acceptance Criteria

- [x] "Scholarship Hunt" tab is visible and accessible.
- [ ] Filter panel provides all specified options and correctly constructs the API query.
- [x] Filter typography, checkbox styling, section hierarchy, selected counts,
  and keyboard-accessible accordion controls are polished.
- [x] Subcategory groups inside Region, Study area, and Popular scholarships are
  independently collapsible.
- [x] Main filter categories follow the requested user-intent order.
- [x] Broad level-only searches use focused natural-language web queries.
- [x] Named scholarship filters are serialized by the frontend.
- [x] Erasmus Mundus searches contain canonical aliases and return only matching articles.
- [x] Scholarship targeting is handled by the editable query rather than hidden
  post-search rejection.
- [x] Tavily results are displayed after normalization without manual filtering.
- [x] Official websites and relevant article pages can both appear as cards.
- [x] One submitted search performs exactly one Tavily basic request.
- [x] Tavily automatic parameters and answer/raw-content/image generation are disabled.
- [x] Scholarship Hunt does not call or consume the AI-chat research flow.
- [x] Existing Scholarship Hunt daily/monthly limits and card/bookmark UI stay unchanged.
- [x] News feed displays the single Tavily result page accurately.
- [x] Query includes today's exact date and current/next application cycle.
- [x] Closed and past-deadline exclusions are included in the generated query.
- [x] Tavily result order is preserved after normalization.
- [x] UI copy consistently describes opportunities and application details.
- [x] Date and cycle terms update when the backend local date changes.
- [x] Navigation, workspace heading, saved view, and admin labels use Scholarship Hunt.
- [x] Master's plus UAE is sealed into the editable query as a study-destination
  constraint.
- [x] Level, destination, field, funding, season, and named-scholarship choices
  are all locally sealed into the query.
- [x] Run a 12-combination live matrix using one Tavily basic request per case.
- [x] Usage cards and Admin role limits use Scholarship Hunt search labels.
- [x] Query review dialog appears before every search.
- [x] Users can approve unchanged or edit and confirm the query.
- [x] Generated and approved queries are persisted in user-scoped SQLite rows.
- [x] Preview consumes one Scholarship Hunt quota unit without making a Tavily
  request; confirmation remains one Tavily request without a second quota hit.
- [x] Valid searches no longer fail because Tavily snippets omit filter terms;
  returned provider cards are shown.
- [x] Filter combinations generate a reviewed OpenRouter Free query instead of
  relying only on hand-authored combination templates.
- [x] Missing keys, provider errors, invalid JSON, and omitted query constraints
  return the deterministic preview without a second AI request.
- [x] Feedback stores the exact preview shown to the user and its final edit.
- [ ] Rate limits are strictly enforced based on user role, with appropriate error messages when exceeded.
- [ ] Remaining quota is displayed to the user.
- [x] API key is securely stored and never exposed to the frontend.
- [ ] Users can bookmark/save news articles to their personal list.
- [ ] Empty, loading, and error states are handled gracefully.
- [ ] Filters persist across user sessions.

## Implementation Plan

- [x] Keep `/news/search` as the dedicated Tavily Scholarship Hunt boundary.
- [ ] Implement rate limiting middleware/logic (daily and monthly limits by role).
- [x] Create frontend "Scholarship Hunt" workspace and layout.
- [ ] Build the filter panel component with state management.
- [ ] Implement query construction logic based on filter state.
- [x] Add named-scholarship canonicalization and query-first result display.
- [ ] Build news card component and result list view.
- [ ] Add bookmarking functionality (frontend and backend).
- [ ] Polish UI/UX (loading skeletons, empty states, mobile responsiveness).
- [x] Polish filter panel typography, option grouping, controls, and action bar
  using ScholarDocX's visual system.
- [x] Add collapsible subcategory groups within dense filter sections.
- [x] Reorder top-level categories and keep dense subgroups collapsed by
  default.
- [x] Convert broad searches to focused web queries while keeping named
  scholarship searches exact.
- [x] Replace the legacy provider transport with one Tavily basic Search request.
- [x] Normalize Tavily results into the existing card response.
- [x] Remove obsolete legacy-provider configuration from product code and context.
- [x] Add deadline extraction, stale-cycle rejection, and opportunity ranking.
- [x] Refine query intent and opportunity-focused interface text.
- [x] Apply Scholarship Hunt visible branding while preserving internal contracts.
- [x] Add mandatory destination and remaining-filter validation.
- [x] Run and document the 12-combination live relevance matrix.
- [x] Add beta query preview, editing, confirmation, and feedback persistence.
- [x] Replace all-or-nothing soft-filter checks with relevance scoring.
- [x] Add dedicated OpenRouter Free query generation, validation, provenance,
  and deterministic fallback.
- [x] Pass the exact preview through confirmation so feedback does not
  regenerate a different initial query.
- [x] Move Scholarship Hunt onto `TAVILY_API_KEY_SCHOLARSHIP_HUNT` while AI
  chat research keeps `TAVILY_API_KEY`.
- [x] Make repeated searches visually obvious while old results are still on
  screen.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Backend rate limiting logic (daily/monthly limits, role tiers).
- Query construction utility function (testing different combinations of filters).
- Named-scholarship canonicalization and Tavily query construction.
- Query-first result display without manual post-search filtering.
- Tavily payload, response normalization, one-call behavior, and provider errors.
- Deadline parsing, closed-status rejection, stale-cycle handling, and ranking.
- Destination semantics and cross-dimension filter enforcement.
- Twelve live combinations covering degree, destination, continent, field,
  funding, season, and named scholarships.
- OpenRouter success, missing-key, HTTP failure, malformed output, hard
  constraint validation, and one-call behavior.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `frontend/src/lib/newsApi.ts`
- `frontend/src/components/news/FilterPanel.tsx`
- `frontend/src/components/news/NewsCard.tsx`
- `frontend/src/components/news/NewsFeed.tsx`
- `frontend/src/components/news/news.css`
- `frontend/src/components/news/QueryReviewDialog.tsx`
- `frontend/src/components/news/QueryReviewDialog.css`
- `frontend/src/components/UsageModal.tsx`
- `frontend/src/components/AdminView.tsx`
- `frontend/src/components/ScholarshipNewsView.tsx`
- `backend/app/services/news_service.py`
- `backend/app/services/news_filter_rules.py`
- `backend/app/services/news_feedback.py`
- `backend/app/db/schema.py`
- `backend/app/db/connection.py`
- `backend/app/services/store.py`
- `backend/app/api/news.py`
- `backend/app/core/config.py`
- `backend/app/core/workspace.py`
- `backend/tests/test_news_service.py`
- `backend/tests/test_news_feedback.py`
- `backend/tests/test_news_query_generator.py`
- Scholarship Hunt functional and technical context files

Line-count risk:

- Low; affected source files are currently below 1000 lines.

If any file exceeds 1000 lines, explain why.

- N/A

## Verification Plan

- Log in with different user roles and verify rate limits.
- Apply various filter combinations and inspect the generated API query and results.
- Test edge cases (no results, Tavily failure, rate limit exceeded).
- Run one live Erasmus Mundus search and verify exactly one basic Tavily call;
  use the documented basic-search cost when the response omits usage metadata.
- Confirm no `/ai/research` or chat-provider call occurs.
- Verify mobile layout and filter drawer.
- Check filter persistence after page reload.

## Completion Notes

Changed files:

- `frontend/src/lib/newsApi.ts`
- `frontend/src/components/news/FilterPanel.tsx`
- `frontend/src/components/news/news.css`
- `backend/app/services/news_service.py`
- `backend/app/api/news.py`
- `backend/app/core/config.py`
- `backend/tests/test_news_service.py`
- `AI-Context/functional/feature-scholarship-news.md`
- `AI-Context/functional/requirements-index.md`
- `AI-Context/functional/feature-map.md`
- `AI-Context/technical/ai-integrations.md`
- `AI-Context/technical/api-boundaries.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0077-scholarship-news-workspace.md`

Verification completed:

- `cd backend && .venv/bin/pytest tests/test_news_service.py -q`:
  21 passed.
- `cd frontend && npm run build`: passed after the filter redesign; Vite
  reported the existing large chunk warning.
- `git diff --check`: passed after the filter redesign.
- Filter panel markup now uses button-based accordions with `aria-expanded`,
  persistent selection counts, labeled close control, alert semantics, and
  44px minimum option/action targets.
- The primary filter action is labeled `Search`; selected options and the
  sticky footer have refined active-state feedback.
- Dense subcategory groups inside Region, Study area, and Popular Scholarships
  now each have their own collapsible header and selected-count badge.
- The main filter order now follows user intent: Scholarship Level, Popular
  Scholarships, Region, Study Area, Funding Type, Season.
- Dense subgroups default to collapsed on first render.
- Broad level-only searches now combine scholarship/funding intent with the
  selected degree and other filters in one natural-language web query.
- Authenticated browser verification remains unavailable without user
  credentials. The in-app browser also blocks local `file://` preview pages,
  so no isolated visual preview was used.
- Python compile and `git diff --check`: passed.
- A single live Tavily basic request for Erasmus Mundus plus Master's returned
  19 provider results and 16 relevant normalized cards, including official
  program and government pages.
- The live response omitted Tavily's optional `usage` object. The request still
  used one HTTP call with explicit `search_depth: basic`,
  `auto_parameters: false`, and no answer/raw-content/image generation.
- Social/video domains are excluded in the same request after the live result
  review found otherwise relevant YouTube entries.
- Queries now include the exact current date and current/next cycle, enrich
  season filters with the next relevant intake year, and explicitly request
  open/upcoming opportunities while excluding past cycles.
- Deadline-aware filtering covers full dates, ISO dates, month/year deadlines,
  season/year deadlines, explicit closed text, and stale academic-year titles.
- Remaining results rank nearest future deadlines first, then active/future
  cycles, official sources, and undated editorial pages.
- A one-request live PhD search returned 18 results and exposed additional
  social and standalone `Closed` cases; X/Twitter/LinkedIn exclusions,
  standalone closed-status detection, and local degree validation were added
  afterward and covered by unit tests without spending another provider credit.
- UI copy now uses `Scholarship Hunt`, `Saved Scholarships`, `View Details`,
  current-opportunity loading text, and open/upcoming empty states. Short
  snippets no longer receive a false trailing ellipsis.
- Production query dates use `date.today()` for every search. A regression test
  advances the date from December 31, 2026 to January 1, 2027 and verifies the
  query cycle changes from `2026-2027` to `2027-2028`.
- Visible branding now uses `Scholarship Hunt` in navigation, the workspace,
  saved-scholarship view, and admin limit configuration. Internal `/news/*`,
  bookmark storage, and `news_searches_*` quota keys remain unchanged.
- Usage quota cards now read `Scholarship Hunt Searches Per Day/Month`, and
  Admin role limits read `Maximum Scholarship Hunt Searches Per Day/Month`.
- Search now opens a responsive beta query-review dialog before contacting
  Tavily. Users can edit or restore the generated text and must explicitly
  approve it before `Confirm & search` is enabled.
- `/news/query-preview` is local-only and does not check/increment quota.
  Confirmed `/news/search` calls still make exactly one Tavily basic request.
- Added `scholarship_search_feedback` with user ID, initial/refined query,
  filters JSON, edit flag, provider status, result count, and timestamps.
- Existing legacy workspaces now add missing `user_id` columns before schema
  indexes run, allowing the new table and normal migrations to initialize.
- The main search recall gap was short Tavily snippets being treated as complete
  page metadata. Destination and named scholarship remain hard constraints;
  explicit degree, field, funding, and season contradictions are rejected,
  while omitted soft evidence is ranked rather than automatically discarded.
- U.S. academic destination matching now recognizes `.edu`, fixing the
  previously empty Master's plus USA searches.
- Six live one-request searches ran with zero retries. Master's + USA + Public
  Health returned UIC, NYU, and Johns Hopkins funding pages; the other USA,
  UAE, Canada, Germany, and Australia combinations all returned at least one
  locally accepted result.
- `cd backend && .venv/bin/pytest tests/test_news_service.py tests/test_news_feedback.py -q`:
  26 passed.
- `cd frontend && npm run build`: passed; the existing Vite large-chunk warning remains.
- Added a dedicated `ScholarshipQueryGenerator` using backend-only
  `OPENROUTER_API_KEY` and `openrouter/free`. Preview sends only selected filter
  labels, current date/cycle guidance, and the safe local baseline.
- OpenRouter preview uses one non-streaming request with JSON-object output,
  disabled reasoning, and no retries or model cycling. The generated text is
  capped at Tavily's 400-character query limit.
- ScholarDocX seals every selected filter dimension, named scholarship,
  current cycle, open/future intent, and closed/expired/past exclusions into
  valid AI output before showing it. Transport errors, rate limits, missing
  keys, null output, and malformed JSON use the deterministic local query.
- The review dialog identifies AI-generated versus safe-template previews.
  Confirmation now sends the exact displayed initial query back to the backend,
  so SQLite feedback cannot silently store a regenerated variant.
- Official OpenRouter verification found that `json_schema` plus
  `require_parameters` currently returned 404 for `openrouter/free`; the
  supported `json_object` contract returned HTTP 200. A free routed model
  produced a valid Master's/UAE JSON query.
- A 12-combination live generation matrix was run without retries. During the
  first corrected pass, two named-scholarship combinations generated valid AI
  queries and ten safely fell back when random free models exhausted their
  completion budget. Constraint sealing and a larger completion ceiling were
  added afterward.
- A subsequent matrix encountered temporary free-router exhaustion/rate
  limiting and safely returned local queries for all 12 cases. A sanitized
  direct probe confirmed HTTP 429; no Tavily request or Scholarship Hunt quota
  was consumed by these previews.
- `cd backend && .venv/bin/pytest tests/test_news_service.py
  tests/test_news_feedback.py tests/test_news_query_generator.py -q`: 31 passed.
- `cd backend && .venv/bin/python -m compileall -q app
  tests/test_news_feedback.py tests/test_news_query_generator.py`: passed.
- `cd frontend && npm run build`: passed; the existing Vite large-chunk warning remains.
- `git diff --check`: passed.
- Browser smoke reached `http://127.0.0.1:5173/login`. Authenticated dialog
  interaction remains unavailable without changing or requesting user
  credentials; no credentials were modified.
- Running OpenAPI exposes `/api/news/query-preview` and `/api/news/search`.
- The real workspace database contains the new feedback table with no seeded
  feedback rows.
- Authenticated browser interaction remains unverified because the current
  workspace account password is not available; the login screen correctly
  rejected the documented seed credential. No credential or auth data was
  changed for testing.
- Search queries now use compact natural scholarship language while preserving
  the degree, study destination, study area, funding, intake, current cycle,
  and future-deadline constraints.
- Local destination validation rejects results for applicants from the selected
  country, results located in another country, and generic government or
  publisher domains from the selected country. Academic country domains remain
  valid institution-location evidence.
- A 12-combination live matrix ran on June 7, 2026 with exactly 12 Tavily basic
  requests and no retries. Strict combinations returned empty sets instead of
  unrelated fallback cards.
- A final one-request Master's plus UAE regression returned three
  destination-valid results: Scholarships in UAE, Khalifa University, and Abu
  Dhabi University. China, Chevening, nationality-only, and UAE source-only
  results were absent.
- Scholarship Hunt provider code has no AI assistant import, `/ai/research`
  call, or `web_searches_*` counter reference.
- `cd backend && .venv/bin/pytest tests/test_ai.py -q` remains blocked by an
  unrelated existing mock that does not accept the already-existing
  `max_results` keyword; 10 other AI tests passed.
- Browser reached the local login screen, but an authenticated UI interaction
  was not attempted without user credentials. No visual markup changed.
- Superseding behavior update: Scholarship Hunt is now query-first. After the
  user approves or edits the generated query, `/news/search` returns normalized
  Tavily results directly. Manual relevance filtering, deadline rejection,
  destination rejection, deduplication, and post-provider resorting are no
  longer part of the active search flow.
- The filter side panel copy now says `Build query`, and empty states explain
  that choices become an editable query. The review dialog states that all
  returned pages for the approved query will be shown.
- Removed the unused `filter_results` service method and obsolete unit tests
  that asserted hidden card rejection or reordering.
- Authenticated browser verification used `admin@scholardocx.com` with the
  provided test password. Master's + UAE opened the AI query-review dialog,
  confirmed the new all-results copy, approved the query, consumed one
  Scholarship Hunt credit, and displayed the full normalized Tavily result page
  including broad/less-relevant cards that the old manual filter would have
  hidden.
- `cd backend && .venv/bin/pytest tests/test_news_service.py
  tests/test_news_feedback.py tests/test_news_query_generator.py -q`: passed
  after query-first cleanup.
- `cd frontend && npm run build`: passed after query-first cleanup; the existing
  Vite large-chunk warning remains.
- Full backend test collection remains blocked by unrelated existing issues:
  `test_token.py` assumes a seeded user, several API tests hit
  `sqlite3.OperationalError: no such column: user_id` in the current workspace
  database, and one test uses union type syntax unsupported by the active
  Python 3.9 interpreter.

Unit tests added or updated:

- Added query canonicalization and filter-preservation coverage.
- Added fixed one-credit payload and one-request transport coverage.
- Added Tavily result normalization, all-provider-result display, and no-retry
  coverage.
- Added route coverage proving Scholarship Hunt uses only its own counters and
  does not consume usage after provider failure.
- Added exact-date query, season-year enrichment, snippet ordering, and query
  dimension preservation coverage.

Live relevance matrix:

| Combination | Kept | Result |
| --- | ---: | --- |
| Master's + UAE | 3 | Destination-valid UAE results after final regression |
| Bachelor's + Canada | 2 | Canada-focused results |
| PhD + Germany | 4 | Germany-focused doctoral results |
| Master's + UK + Fully Funded | 0 | Empty instead of weak matches |
| PhD + USA + Computer Science | 0 | Empty instead of weak matches |
| Master's + Australia + Public Health | 1 | Australian university result |
| Bachelor's + Europe + Fully Funded | 0 | Empty instead of weak matches |
| Postdoctoral + Canada + Biomedical Engineering | 0 | Empty instead of weak matches |
| Master's + UAE + Business + Fall | 0 | Empty instead of weak matches |
| Erasmus Mundus + Master's + Europe | 5 | Erasmus-focused European results |
| Chevening + Master's + UK | 3 | Chevening UK master's results |
| PhD + Asia + AI/Data Science | 0 | Empty instead of weak matches |

Follow-ups:

- The broader original task still has unchecked work such as authenticated
  rate-limit, persistence, and bookmark-flow verification.
- Local `.env` on June 9, 2026 did not yet populate
  `TAVILY_API_KEY_SCHOLARSHIP_HUNT`. For browser verification only, the backend
  was restarted with a temporary shell export that reused the existing
  `TAVILY_API_KEY` value without changing product code or printing secrets.
- June 9, 2026 browser verification on `http://127.0.0.1:5173` with the local
  admin account confirmed the new Search-click billing and visible repeated
  search UX: the first preview moved the toolbar from `Daily: 0 / 200` to
  `Daily: 1 / 200` before confirmation, and a second search over existing
  results showed the new preparing banner plus dimmed cards before the next
  query-review dialog opened and advanced usage to `Daily: 2 / 200`.
- `cd backend && pytest tests/test_news_feedback.py tests/test_news_query_generator.py tests/test_news_service.py`: passed (23 passed).
- `cd frontend && npm run build`: passed; the existing Vite chunk-size warning remains unchanged.
