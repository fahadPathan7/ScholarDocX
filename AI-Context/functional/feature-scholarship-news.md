# Scholarship Hunt

## Purpose

Scholarship Hunt provides a focused feed for scholarship, fellowship, grant,
and academic funding opportunities found across the public web. Results may
come from official scholarship, university, government, foundation, or article
pages; they do not need to be newspaper stories.

## SCHOLARDOCX-0175 v2 restructure (Brave + unified deep search + per-hit billing)

Supersedes the filter-based "Hunt" tab and its query-building flow. The single
"Search" tab runs the full deep pipeline (plan → search → hard-filter → crawl
→ extract → relevance-filter → persist) on one natural-language goal.

**Retired FRs** (superseded 2026-07-28 by SCHOLARDOCX-0175):
- **FR-8.5 / FR-8.7 / FR-8.14 / FR-8.17 / FR-8.21 / FR-8.26 / FR-8.33 / FR-8.45 / FR-8.46**: replace "Tavily" with "search provider" (now Brave for Scholarship Hunt).
- **FR-8.6**: superseded — quota is no longer consumed on query-preview success; per-hit billing charges on confirmed run, post-search.
- **FR-8.12**: superseded — a search is no longer one flat-fee provider call; it is a multi-pass deep pipeline billed per raw hit.
- **FR-8.24 – FR-8.31**: superseded — the filter-based query-preview/review flow is deleted. The single search takes a free-text goal + facets.
- **FR-8.27**: superseded — Scholarship Hunt is no longer "query-first, no manual filtering". Hard filters (closed/stale/destination/field) and the AI relevance filter now reject off-topic results.

**New FRs (SCHOLARDOCX-0175)**:
- **FR-8.47 — Unified deep search**: One natural-language goal (+ optional degree/destinations/intake/field facets) runs the full pipeline. There is no separate "basic Hunt"; the deep pipeline is the only search surface.
- **FR-8.48 — Per-hit billing**: Every raw search result scanned is billed to the user at the admin-configured `brave_call_cost_per_hit_usd` (default $0.015), including sources later filtered out. The run is pre-flighted against the worst-case ceiling (2 passes × 8 = 16 sources ≈ 2,400 credits ≈ $0.24 at default price); insufficient balance → HTTP 402 with a plain-language message.
- **FR-8.49 — Hard-filter re-enable**: Results that are explicitly closed, stale-cycle, or destination/field mismatches are rejected before extraction (retires FR-8.27).
- **FR-8.50 — Search transparency**: Pre-submit, the UI shows the cost ceiling ("Up to 80 sources · up to 1,200 credits"). During the run, a live funnel shows "N scanned → M on-target → K opportunities". User-facing copy contains no provider/algorithm jargon.

## SCHOLARDOCX-0177 result quality fix (dedup, relevance, sponsor accuracy)

User-reported bug: a Search run for a specific field (e.g. "emjm scholarships
for cse background") returned many near-identical generic results (the same
umbrella program described by several low-signal pages) and at least one
card with a wrong sponsor/link (a non-DAAD scholarship shown with "DAAD" as
its sponsor, because DAAD hosts a public database that lists scholarships it
does not itself fund).

- **FR-8.51 — Canonical-name dedup**: in addition to URL dedup during search,
  extracted opportunities are grouped by a normalized canonical-name key
  (year/punctuation/plural-insensitive) before persistence; only the
  highest-relevance (then most-complete) entry per group is kept. Distinctly
  named programs are never merged into a generic one.
- **FR-8.52 — Broad/umbrella program down-ranking**: an opportunity whose
  stated fields of study span five or more unrelated disciplines with no
  field named as a specific track/consortium matching the goal is treated as
  a generic umbrella program, not a field-specific match, and is scored
  below the relevance floor (raised from 0.3 to 0.4) even when the goal's
  field is technically among the many listed.
- **FR-8.53 — Sponsor/link accuracy**: opportunity extraction must not name a
  hosting/aggregator/directory site as the sponsor, or assume its own URL is
  the official application page, unless the crawled text explicitly states
  that organization funds/administers the specific opportunity described.
- No hard cap was added on result count per run — dedup plus the tightened
  relevance floor are the only quality gates (explicit product decision:
  rely on precision, not an arbitrary ceiling).

## Requirements (legacy FR-8.1 – FR-8.31 — see SCHOLARDOCX-0175 banner above for supersessions)

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
- FR-8.24: Search can open a beta query-review dialog before any provider
  call. The dialog is controlled by a local, default-off "Review query before
  search" toggle; when off, the generated or fallback query is auto-approved
  and the dialog does not appear. When on (or when a user opts in), users can
  approve the generated query or edit it before confirming.
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

## Scholarship Opportunity Pipeline (FR-8.32+)

Added per `AI-Context/planbook/scholarship-hunt-pipeline.md` Phases 0-2. The
feature evolves from a search page into a pipeline: a zero-cost curated
catalog, per-result structured extraction ("Analyze"), and a library that
feeds the user's existing project sheets/calendar rather than dead-ending on
bookmarks.

- FR-8.32: A "Catalog" sub-view lists a curated, code-shipped set of major
  scholarships (levels, destination regions, funding coverage, typical cycle
  months, official links, blurb, enriched description, tags) with zero
  provider calls to browse or filter. **SCHOLARDOCX-0176**: split into two
  sections — "Program & Central Scholarships" and "University-Specific
  Scholarships" — via a `category` field. Each entry carries 1-N official
  `links` (label + URL), a `tags` list, and a richer `description`. ~49
  entries (27 program + 22 university).
- ~~FR-8.33: Each catalog entry has a "Check current cycle" action...~~
  **SUPERSEDED (SCHOLARDOCX-0176, 2026-07-28)**: the catalog is now
  static-only. The paid "Check current cycle" action, its endpoint, the
  `news_service.search_catalog` wrapper, and the
  `scholarship_catalog_check_cycle` rate-limit rule are all removed.
- FR-8.34: Any Scholarship Hunt result card (and any catalog entry after
  "Check current cycle") can be sent to "Analyze": one AI extraction call
  produces a structured opportunity (name, sponsor, degree levels, destination
  countries, eligible nationalities, funding coverage, deadline(s),
  requirements, application URL) with per-field confidence. Fields the source
  text does not support are left empty, never invented.
- FR-8.35: Analyze is gated by a new boolean role limit
  `can_use_scholarship_analyze` (free/general = off, pro/max = on) plus the
  existing AI token economy for the real extraction cost. There is no
  separate daily/monthly count limit for Analyze, consistent with this
  codebase's token-metering-over-count-limits direction
  (`AI-Context/technical/ai-token-economy.md`).
- FR-8.36: Analyzed and catalog-derived opportunities persist to a
  user-scoped local "Opportunity Library" with a status pipeline (Found →
  Vetting → Applying → Submitted → Result), deduped by canonical name +
  normalized URL.
- FR-8.37: An analyzed opportunity can be added to a project's "Scholarship
  Tracker" sheet ("Add to tracker"): the sheet is created from the existing
  template if the project doesn't have one yet, and a row is appended
  through the existing sheet row-update path, so the project calendar and
  deadline coloring pick up the opportunity's deadline with no new plumbing.
  This link is one-way and informational — after linking, the sheet row is
  the source of truth, not the library entry.
- FR-8.38: The Opportunity Library replaces the bare bookmark list as the
  primary saved-opportunities view. Existing bookmarks (`bookmarked_news`)
  are migrated in additively (not deleted) the first time the Library loads.

## Hunt Profile And Fit Score (FR-8.39/8.40) — REMOVED (SCHOLARDOCX-0178)

~~FR-8.39: local Hunt Profile (degree, destinations, field, intake, opt-in
nationality).~~ ~~FR-8.40: client-side fit score + why/why-not chips against
the profile.~~ **REMOVED 2026-07-28 (SCHOLARDOCX-0178)**: the user judged
Hunt Profile had no real use — it only gated the Search form behind a setup
modal and powered a fit score nobody used. The modal, the `hunt_profile_json`
field, the required-profile gate before running a Search, the "Use Hunt
Profile" prefill button, and all fit-score UI (badges, match/mismatch chips)
are deleted. The Search form's degree/destinations/intake/field inputs
remain — they were always independent manual facets, not derived from Hunt
Profile.

## Watchlists And Deadline Radar (FR-8.41+, Phase 4)

- FR-8.41: A saved Scholarship Hunt query is also a watchlist. Running it
  again diffs the returned article IDs against the set seen on its previous
  run and marks new results, without consuming any additional quota beyond
  the normal search cost.
- FR-8.42: Tracked opportunities (linked to a sheet via "Add to tracker")
  with a deadline inside the same proximity threshold used for sheet
  row-coloring (FR-7 Date Color Rules) surface in a "Deadline Radar"
  summary in the Opportunity Library and fire one local notification per
  opportunity per day, deduped so reloading the tab does not re-notify.

## Deep Hunt Runs (FR-8.43+, Phase 5)

- FR-8.43: A "Deep Hunt" sub-tab lets a user start a run from one free-text
  funding goal (e.g. "fully funded CS PhD funding, EU, Fall 2027") plus
  optional degree level, destinations, and intake term (manual, independent
  fields — SCHOLARDOCX-0178 removed the former Hunt Profile prefill).
  Available only on plans with `can_use_scholarship_deep_hunt` (Pro/Max by
  default); ineligible plans see a locked upsell in the sub-tab instead of
  the launcher form.
- FR-8.44: A run persists across page reloads (queued/running/completed/
  failed/cancelled), reports stage progress
  (planning/searching/crawling/extracting), can be cancelled mid-run, and a
  failed or cancelled run can be resumed from where it left off.
- FR-8.45: A run does a bounded multi-pass search (up to 3 passes derived
  from the goal and any set facets), crawls the top unique result pages, and
  runs the same structured extraction used by "Analyze" (FR-8.31-8.36) on
  each — missing fields stay missing, nothing is invented. Accepted,
  deduped results are shown in the Search tab (see FR-8.54 — no longer
  auto-saved).
- FR-8.46: Deep Hunt is metered like Advisor Atlas, not the plain Hunt tab:
  the plan gate above plus AI-token cost per extraction call. Search calls
  inside a run are not charged a separate Tavily fee.

## Explicit Save + Library Cap (FR-8.54/8.55, SCHOLARDOCX-0178)

- FR-8.54: A completed Search run's accepted results are shown in the
  Search tab without being persisted. Each result has a "Save to Library"
  action; only a saved result becomes an Opportunity Library entry (tagged
  `source: "deep_hunt"`, linked to the run). "Add to tracker" (FR-8.37) is
  only available from the Library tab, not from unsaved Search results.
  Re-opening a past run still shows its results (stored on the run itself),
  with already-saved ones marked as saved.
- FR-8.55: The Opportunity Library is capped at 100 saved opportunities per
  user. Saving a 101st entry is rejected with a plain-language message;
  existing entries are never silently removed to make room. The Admin
  panel's Info tab ("Save & Storage Caps" section, alongside the Research
  Expert library and per-paper saved-analysis caps) documents this fixed
  cap (informational — not an editable role limit).
- FR-8.56: "Previous Searches" (Deep Hunt runs) is capped at 10 per user.
  Starting an 11th search deletes the oldest run first (FIFO), before the
  new run is created. If the deleted run had any results the user had
  saved to the Library, those saved opportunities are kept — only their
  link back to the (now-deleted) run is cleared, never the saved record
  itself.

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
