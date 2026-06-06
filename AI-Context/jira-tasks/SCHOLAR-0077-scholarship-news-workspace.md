# SCHOLAR-0077: Scholarship News Workspace

Status: Draft

Owner: AI Agent

Created: 2026-06-06

## Summary

Build a "Scholarship News" tab/workspace that fetches and displays scholarship-related news articles using the NewsData.io API. Users can filter news using structured UI controls, and the system dynamically constructs API query strings based on selected filters. Access is rate-limited per user role.

## Business Context

Links:

- Business file:

Business value:

Provides users with up-to-date, relevant scholarship opportunities directly within their workspace, increasing engagement and the value proposition of the Pro and Max tiers which offer higher search quotas.

## Functional Context

Links:

- Functional file:

Requirements:

- FR-X.X: Add a new top-level workspace tab labeled "Scholarship News".
- FR-X.X: Implement a filter panel (Scholarship Level, Continent, Country, Academic Intake/Season, Year, Funding Type, Field of Study, Language of Instruction, Sort By).
- FR-X.X: Dynamically construct NewsData.io API queries based on selected filters.
- FR-X.X: Enforce role-based rate limiting (General: 3/day, 30/month; Pro: 10/day, 100/month; Max: 30/day, 300/month).
- FR-X.X: Display news results in a card format with headline, source, date, snippet, tag, thumbnail, and save/bookmark button.
- FR-X.X: Implement empty state, loading state, error state, filter persistence, and mobile responsiveness.

## Technical Context

Links:

- Technical file:

Technical notes:

- Backend proxy endpoint needed for NewsData.io API calls to protect `NEWSDATA_API_KEY`.
- Rate limiting logic implemented server-side tracking `userId` + `date` and `userId` + `month`. Use Redis if available, or existing DB/cache.
- Query construction logic required for the `q` parameter based on combined filters.
- Store usage counts and limits configuration.

## Scope

In scope:

- "Scholarship News" workspace tab UI and filter panel.
- Integration with NewsData.io API via backend proxy.
- Role-based rate limiting system.
- News card UI and save/bookmark functionality.

Out of scope:

- Advanced natural language search parsing (using structured filters instead).
- Local scraping of news sites (relying solely on NewsData.io).

## Acceptance Criteria

- [ ] "Scholarship News" tab is visible and accessible.
- [ ] Filter panel provides all specified options and correctly constructs the API query.
- [ ] News feed displays results accurately with pagination/infinite scroll.
- [ ] Rate limits are strictly enforced based on user role, with appropriate error messages when exceeded.
- [ ] Remaining quota is displayed to the user.
- [ ] API key is securely stored and never exposed to the frontend.
- [ ] Users can bookmark/save news articles to their personal list.
- [ ] Empty, loading, and error states are handled gracefully.
- [ ] Filters persist across user sessions.

## Implementation Plan

- [ ] Create backend proxy endpoint `/api/news` to handle NewsData.io requests.
- [ ] Implement rate limiting middleware/logic (daily and monthly limits by role).
- [ ] Create frontend "Scholarship News" workspace and layout.
- [ ] Build the filter panel component with state management.
- [ ] Implement query construction logic based on filter state.
- [ ] Build news card component and result list view.
- [ ] Add bookmarking functionality (frontend and backend).
- [ ] Polish UI/UX (loading skeletons, empty states, mobile responsiveness).

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- Backend rate limiting logic (daily/monthly limits, role tiers).
- Query construction utility function (testing different combinations of filters).
- Proxy API endpoint (mocking NewsData.io responses and errors).

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `frontend/src/pages/ScholarshipNews.tsx` (new)
- `frontend/src/components/news/FilterPanel.tsx` (new)
- `frontend/src/components/news/NewsCard.tsx` (new)
- `backend/routes/newsRoutes.ts` (new)
- `backend/controllers/newsController.ts` (new)
- `backend/services/rateLimitService.ts` (or similar)

Line-count risk:

- Low

If any file exceeds 1000 lines, explain why.

- N/A

## Verification Plan

- Log in with different user roles and verify rate limits.
- Apply various filter combinations and inspect the generated API query and results.
- Test edge cases (no results, API failure, rate limit exceeded).
- Verify mobile layout and filter drawer.
- Check filter persistence after page reload.

## Completion Notes

Changed files:

- 

Verification completed:

- 

Unit tests added or updated:

- 

Follow-ups:

- 
