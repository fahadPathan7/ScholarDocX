# Scholarship Hunt

## Purpose

Scholarship Hunt provides a focused feed for scholarship, fellowship, grant,
and academic funding opportunities found across the public web. Results may
come from official scholarship, university, government, foundation, or article
pages; they do not need to be newspaper stories.

## Requirements

- FR-8.1: Users can run Scholarship Hunt searches using structured academic,
  funding, geography, season, and named-scholarship filters.
- FR-8.2: A named scholarship filter must search canonical scholarship names
  and common aliases rather than the UI display label.
- FR-8.3: Results for a named scholarship must mention that scholarship or one
  of its aliases in provider metadata returned to ScholarDock.
- FR-8.4: Generic searches must remain scholarship or academic-funding focused;
  an education category match alone is not sufficient.
- FR-8.5: Duplicate provider articles must appear only once in a result page.
- FR-8.6: Search usage is consumed only after a successful provider request.
- FR-8.7: The Tavily API key remains backend-only.
- FR-8.8: The filter panel uses accessible accordion controls, clear selected
  counts, readable grouped options, and a persistent action area on desktop
  and mobile.
- FR-8.9: High-density filter groups inside Study Area, Region, and Popular
  Scholarships can collapse independently to reduce visual clutter.
- FR-8.10: The main filter categories follow the priority order Scholarship
  Level, Popular Scholarships, Region, Study Area, Funding Type, Season.
- FR-8.11: Broad level-based searches use compact keyword queries so a single
  level filter still returns relevant scholarship and funding pages.
- FR-8.12: One submitted filter search makes at most one Tavily Search request
  using one-credit basic search settings.
- FR-8.13: Scholarship Hunt search remains separate from AI chat web research;
  it does not route through `/ai/research`, invoke a chat model, or synthesize
  an AI answer.
- FR-8.14: Tavily web results are normalized into the existing news-card
  response so limits, bookmarks, loading states, empty states, and the visual
  layout remain unchanged.
- FR-8.15: Search queries include the exact current date, current and next
  application cycle, open/upcoming intent, and explicit exclusion of closed,
  expired, archived, or past-deadline opportunities.
- FR-8.16: Results with an explicit closed status or only past application
  deadlines are excluded locally.
- FR-8.17: Future-dated, actively accepting, and official-source opportunities
  rank before undated editorial or evergreen pages.
- FR-8.18: User-facing copy describes scholarship opportunities and application
  pages rather than implying every result is newspaper news.
- FR-8.19: Search date and application-cycle terms are generated from the
  backend machine's current local date for every submitted search.
- FR-8.20: The user-facing feature name is `Scholarship Hunt`; existing
  `/news/*` routes, storage names, and `news_searches_*` quota keys remain
  stable internal contracts.
- FR-8.21: Every selected filter dimension is enforced after provider search.
  Dimensions combine with AND; multiple selections within one dimension
  combine with OR.
- FR-8.22: Region filters describe the destination where the user will study,
  not applicant nationality, eligibility country, article source country, or
  scholarship sponsor country.
- FR-8.23: User-facing usage and Admin role-limit labels use Scholarship Hunt
  terminology while internal `news_searches_*` quota keys remain unchanged.

## Relevance Behavior

- Named scholarships use canonical names and aliases in a focused web query.
- UI qualifiers such as country or region text in parentheses are not treated
  as part of the scholarship's official name.
- Filters selected alongside a named scholarship narrow the search without
  weakening the named-scholarship match.
- Degree, study destination, study area, funding type, season, and named
  scholarship selections are locally validated before a result can appear.
- A result selected for `UAE`, for example, must identify study at a UAE
  institution or location; a China scholarship, UK Chevening page, or page
  merely listing UAE-eligible applicants does not qualify.
- A publisher or government site using the selected country's domain does not
  prove study destination. Country-domain evidence is accepted only for an
  academic institution domain; other pages must explicitly identify study in
  the destination.
- Broad searches include scholarship, fellowship, grant, funding, application,
  and official-source intent alongside the selected filters.
- Queries state today's date and ask for open or upcoming opportunities in the
  current and next application cycle.
- Results are relevance-, deadline-, and closed-status checked locally after
  Tavily ranks them.
- Explicit application dates are parsed from titles and snippets. A result is
  removed when all detected deadlines are before today.
- Undated official pages remain eligible because provider publication dates do
  not reliably represent scholarship application deadlines.
- Remaining results are reordered so the nearest future deadline appears
  first, followed by actively open and official sources.
- If Tavily returns no relevant items, the UI shows the existing empty state
  instead of unrelated fallback content.

## Provider Cost Boundary

- Each Search action uses Tavily `search_depth: basic`, `topic: general`, and
  `auto_parameters: false`.
- Answer generation, raw-content extraction, image search, crawl, extract,
  research, fallback requests, and provider pagination are not used.
- Social and video-only domains are excluded so returned cards stay focused on
  readable official pages and articles.
- A successful provider request consumes one existing Scholarship Hunt daily
  and monthly quota unit. AI-chat web-search quotas are not read or changed.

## Acceptance Criteria

- Selecting `Erasmus Mundus (EU)` sends the filter to the backend.
- The provider query includes canonical Erasmus Mundus phrases.
- Returned cards mention Erasmus Mundus or an accepted alias.
- Unrelated education, sports, arts, and generic community-grant stories are
  excluded.
- Repeated articles with the same article ID, link, or normalized title are
  removed.
- Filter section headers are keyboard operable and expose expanded state.
- Selected filter counts remain visible when sections are collapsed.
- Checkbox labels have comfortable touch targets, clear focus states, and
  readable hierarchy without decorative emoji headings.
- Subcategory headers inside dense groups can collapse independently while
  preserving selected-state badges.
- The default order favors broad/high-intent categories first and keeps dense
  subgroups collapsed until opened.
- Compact queries prefer `postgraduate`, `undergraduate`, `phd`, and
  `postdoctoral` level terms for broad searches.
- Official program, university, government, foundation, and relevant article
  pages can all appear in the existing card grid.
- Closed, expired, archived, and clearly past-cycle pages are not shown.
- The screen and action copy consistently refer to opportunities, sources, and
  application details.
- One Search action causes no more than one one-credit Tavily Search call.
- Scholarship Hunt usage remains isolated from AI chat research usage.
- Selecting Master's and UAE returns only Master's opportunities whose study
  destination is in the UAE, or an empty result set.
- Scholarship pages aimed at UAE students or applicants do not satisfy the UAE
  destination filter unless the title independently identifies UAE study.
