# SCHOLAR-0077: Scholarship Hunt Workspace

Status: In Progress

Owner: AI Agent

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
  [feature-scholarship-news.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-scholarship-news.md)

Requirements:

- FR-8.1: Add structured academic and scholarship filters.
- FR-8.2: Convert named-scholarship display labels into canonical provider queries.
- FR-8.3: Require named-scholarship results to mention the selected scholarship or an alias.
- FR-8.4: Keep generic results scholarship or academic-funding focused.
- FR-8.5: Deduplicate provider results.
- FR-8.6: Enforce role-based search limits.
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
- FR-8.16: Exclude closed and explicit past-deadline results.
- FR-8.17: Rank future deadlines, active applications, and official sources first.
- FR-8.18: Use opportunity-focused user-facing copy.
- FR-8.19: Generate date and application-cycle intent from the local date per search.
- FR-8.20: Rebrand visible surfaces to Scholarship Hunt without internal migrations.
- FR-8.21: Enforce all selected filter dimensions after Tavily returns results.
- FR-8.22: Treat Region as study destination, not nationality or source location.
- FR-8.23: Rename visible usage and Admin role-limit labels to Scholarship Hunt.

## Technical Context

Links:

- Technical file:

Technical notes:

- `/news/search` remains the backend-only provider boundary and uses
  `TAVILY_API_KEY`.
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
- Apply backend relevance filtering and deduplication.
- Parse deadline-context dates locally, reject results whose detected deadlines
  are all before today, and reject explicit closed/expired status text.
- Keep undated official program pages, then sort nearest future deadlines,
  active application pages, official sources, and provider relevance in that
  order.
- Preserve existing `news_searches_per_day` and
  `news_searches_per_month` counters and limits.
- Use AND semantics across selected filter dimensions and OR semantics within
  each dimension.

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
- [x] Unrelated education/category results are removed rather than displayed as fallback content.
- [x] Duplicate provider articles are removed.
- [x] Official websites and relevant article pages can both appear as cards.
- [x] One submitted search performs exactly one Tavily basic request.
- [x] Tavily automatic parameters and answer/raw-content/image generation are disabled.
- [x] Scholarship Hunt does not call or consume the AI-chat research flow.
- [x] Existing Scholarship Hunt daily/monthly limits and card/bookmark UI stay unchanged.
- [x] News feed displays the single Tavily result page accurately.
- [x] Query includes today's exact date and current/next application cycle.
- [x] Explicit closed and past-deadline opportunities are removed.
- [x] Future deadlines and official sources rank first.
- [x] UI copy consistently describes opportunities and application details.
- [x] Date and cycle terms update when the backend local date changes.
- [x] Navigation, workspace heading, saved view, and admin labels use Scholarship Hunt.
- [x] Master's plus UAE excludes China, UK, nationality-only, source-country,
  and generic international results.
- [x] Level, destination, field, funding, season, and named-scholarship filters
  are all locally enforced.
- [x] Run a 12-combination live matrix using one Tavily basic request per case.
- [x] Usage cards and Admin role limits use Scholarship Hunt search labels.
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
- [x] Add named-scholarship canonicalization, relevance filtering, and deduplication.
- [ ] Build news card component and result list view.
- [ ] Add bookmarking functionality (frontend and backend).
- [ ] Polish UI/UX (loading skeletons, empty states, mobile responsiveness).
- [x] Polish filter panel typography, option grouping, controls, and action bar
  using `ui-ux-pro-max` and ScholarDock's visual system.
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

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Backend rate limiting logic (daily/monthly limits, role tiers).
- Query construction utility function (testing different combinations of filters).
- Named-scholarship canonicalization and Tavily query construction.
- Relevance filtering and duplicate removal.
- Tavily payload, response normalization, one-call behavior, and provider errors.
- Deadline parsing, closed-status rejection, stale-cycle handling, and ranking.
- Destination semantics and cross-dimension filter enforcement.
- Twelve live combinations covering degree, destination, continent, field,
  funding, season, and named scholarships.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `frontend/src/lib/newsApi.ts`
- `frontend/src/components/news/FilterPanel.tsx`
- `frontend/src/components/news/NewsCard.tsx`
- `frontend/src/components/news/NewsFeed.tsx`
- `frontend/src/components/news/news.css`
- `frontend/src/components/UsageModal.tsx`
- `frontend/src/components/AdminView.tsx`
- `frontend/src/components/ScholarshipNewsView.tsx`
- `backend/app/services/news_service.py`
- `backend/app/services/news_filter_rules.py`
- `backend/app/api/news.py`
- `backend/app/core/config.py`
- `backend/tests/test_news_service.py`
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
- `AI-Context/jira-tasks/SCHOLAR-0077-scholarship-news-workspace.md`

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
- Full backend test collection remains blocked by unrelated existing issues:
  `test_token.py` assumes a seeded user, several API tests hit
  `sqlite3.OperationalError: no such column: user_id` in the current workspace
  database, and one test uses union type syntax unsupported by the active
  Python 3.9 interpreter.

Unit tests added or updated:

- Added query canonicalization and filter-preservation coverage.
- Added fixed one-credit payload and one-request transport coverage.
- Added Tavily result normalization, relevance, deduplication, and no-retry coverage.
- Added route coverage proving Scholarship Hunt uses only its own counters and
  does not consume usage after provider failure.
- Added exact-date query, season-year enrichment, past deadline, month/season
  deadline, closed status, stale cycle, degree matching, snippet ordering, and
  opportunity ranking coverage.
- Added destination-country, nationality-only, source-domain, multiple
  destination OR, cross-dimension AND, and named-scholarship narrowing coverage.

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
