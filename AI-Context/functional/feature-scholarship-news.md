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
- FR-8.3: Named-scholarship intent is enforced in the generated query shown to
  the user before search, not by removing provider cards afterward.
- FR-8.4: Generic searches must remain scholarship or academic-funding focused
  through query generation and user review.
- FR-8.5: Tavily result cards are normalized and displayed for the approved query.
- FR-8.6: Search usage is consumed when the user clicks Search and the query
  review request succeeds, even if the user cancels instead of confirming the
  later Tavily call.
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
- FR-8.16: Closed, expired, archived, and past-deadline intent is handled in
  the generated query and user refinement.
- FR-8.17: Tavily's returned ordering is preserved after normalization so users
  can inspect the full result set for their approved query.
- FR-8.18: User-facing copy describes scholarship opportunities and application
  pages rather than implying every result is newspaper news.
- FR-8.19: Search date and application-cycle terms are generated from the
  backend machine's current local date for every submitted search.
- FR-8.20: The user-facing feature name is `Scholarship Hunt`; existing
  `/news/*` routes, storage names, and `news_searches_*` quota keys remain
  stable internal contracts.
- FR-8.21: Every selected filter dimension is sealed into the generated query
  before search. Returned cards are not manually filtered by the original UI
  filters after Tavily responds.
- FR-8.22: Region filters describe the destination where the user will study,
  not applicant nationality, eligibility country, article source country, or
  scholarship sponsor country.
- FR-8.23: User-facing usage and Admin role-limit labels use Scholarship Hunt
  terminology while internal `news_searches_*` quota keys remain unchanged.
- FR-8.24: Search opens a beta query-review dialog before any provider call.
  Users can approve the generated query or edit it before confirming.
- FR-8.25: Confirmed searches store the generated query, approved query,
  selected filters, edit status, result count, and provider outcome locally for
  later product-quality analysis.
- FR-8.26: Query preview does not consume quota or contact Tavily. Only the
  confirmed approved query is sent to Tavily.
- FR-8.27: Scholarship Hunt is query-first. The editable query is the quality
  control surface; Tavily results are normalized and displayed without manual
  relevance filtering.
- FR-8.28: Query preview uses one OpenRouter Free generation request to turn
  the selected filter labels and current date into a concise scholarship web
  search query before the user reviews it.
- FR-8.29: If OpenRouter is unavailable, unconfigured, or returns an invalid
  query, preview falls back to the local deterministic query without making a
  second AI request.
- FR-8.30: Confirmed searches store the exact AI-generated or fallback preview
  shown to the user and the final user-approved query as separate local fields.
- FR-8.31: When a user starts another Scholarship Hunt search while previous
  results are still visible, the UI must show a clear preparing/searching state
  so the new search feels active before fresh results replace the old list.

## Relevance Behavior

- Named scholarships use canonical names and aliases in a focused web query.
- UI qualifiers such as country or region text in parentheses are not treated
  as part of the scholarship's official name.
- Filters selected alongside a named scholarship narrow the search without
  weakening the named-scholarship match.
- Degree, study destination, study area, funding type, season, and named
  scholarship selections are locally sealed into the query before Tavily is
  called.
- Broad searches include scholarship, fellowship, grant, funding, application,
  and official-source intent alongside the selected filters.
- Queries state today's date and ask for open or upcoming opportunities in the
  current and next application cycle.
- Tavily results are normalized into cards and displayed in provider order. The
  user can refine the query before searching when they want stricter targeting.
- If Tavily returns no items, the UI shows the existing empty state.
- Search first presents the exact generated provider query in an editable
  dialog. The user must check that the query is acceptable before confirming.
- Starting Search consumes one Scholarship Hunt quota unit as soon as the query
  review request succeeds, even if the user later closes the dialog.
- Editing the query marks it as user-refined; approving it unchanged stores the
  same text as both initial and approved query.
- The preview identifies whether OpenRouter Free or the safe local template
  generated the query. Only selected filter labels and current-date search
  context are sent to OpenRouter; no application records or private documents
  are included.

## Provider Cost Boundary

- Each Search action uses Tavily `search_depth: basic`, `topic: general`, and
  `auto_parameters: false`.
- Answer generation, raw-content extraction, image search, crawl, extract,
  research, fallback requests, and provider pagination are not used.
- Social and video-only domains are excluded so returned cards stay focused on
  readable official pages and articles.
- A successful Search-click preview consumes one existing Scholarship Hunt
  daily and monthly quota unit. Confirming the reviewed query makes the Tavily
  request without consuming a second Scholarship Hunt unit. AI-chat
  web-search quotas are not read or changed.

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
- Query text asks Tavily to avoid closed, expired, archived, and clearly
  past-cycle pages.
- The screen and action copy consistently refer to opportunities, sources, and
  application details.
- One Search action causes no more than one one-credit Tavily Search call.
- Scholarship Hunt usage remains isolated from AI chat research usage.
- Selecting Master's and UAE produces a query that explicitly targets Master's
  study destinations in the UAE; returned provider cards are shown without
  additional manual filtering.
- Previewing a query makes no Tavily request, but it does consume one
  Scholarship Hunt quota unit when the review request succeeds.
- Previewing makes at most one OpenRouter Free request and remains usable with
  a local fallback when that request cannot produce a valid query.
- Confirming a query creates a user-scoped local feedback row and makes exactly
  one Tavily basic-search request.
