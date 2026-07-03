# SCHOLARDOCX-0119: Curated Scholarship Catalog (Phase 0)

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-03

## Summary

Add a zero-cost, code-shipped catalog of curated major scholarships,
browsable/filterable with no provider calls, with a paid "Check current
cycle" action per entry.

## Business Context

Links:

- Business file: [decisions.md](../../business/decisions.md) (BD-010)

Business value:

Gives the Scholarship Hunt tab instant value even before a search or AI
call — the catalog is useful the moment it opens, addressing the planbook's
"every search starts from zero" problem for well-known programs.

## Functional Context

Links:

- Functional file: [feature-scholarship-news.md](../../functional/feature-scholarship-news.md)

Requirements:

- FR-8.32: Catalog sub-view, zero provider calls to browse/filter.
- FR-8.33: "Check current cycle" per entry, one Tavily basic search, existing
  `can_use_scholarship_hunt` gate.

## Technical Context

Links:

- Technical file: [api-boundaries.md](../../technical/api-boundaries.md)

Technical notes:

- `backend/app/services/scholarship_catalog.py` (new): static list seeded
  from `SCHOLARSHIP_ALIASES` (`backend/app/services/news_service.py:73`) plus
  hand-authored metadata (levels, destination regions, funding coverage —
  qualitative, not invented amounts — typical cycle months, official portal
  URL, blurb). Favor a smaller, verifiably-accurate list over a padded count.
- `GET /scholarship-catalog` in the new
  `backend/app/api/scholarship_opportunities.py` router: returns the catalog
  with a per-entry "in your library" flag (join by normalized URL against
  the user's `scholarship_opportunities` rows).
- `POST /scholarship-catalog/{catalog_id}/check-cycle`: reuses
  `_charge_scholarship_hunt` (`backend/app/api/news.py:67-79`) then one
  `news_service.search_scholarships` call scoped to the canonical name +
  official domain.

## Scope

In scope:

- Static catalog data module and its unit-tested filter/lookup helpers.
- `GET /scholarship-catalog` and `POST /scholarship-catalog/{id}/check-cycle`
  endpoints.
- `frontend/src/components/news/ScholarshipCatalog.tsx` browse/filter UI.

Out of scope:

- Structured extraction of catalog results (SCHOLARDOCX-0120).
- Add-to-tracker from a catalog entry (SCHOLARDOCX-0121 covers the generic
  add-to-tracker flow which catalog cards also use once analyzed).

## Acceptance Criteria

- Loading the Catalog sub-view makes zero network calls to any external
  provider.
- Filtering the catalog by level/region/funding type works entirely
  client/server-side against the static list.
- "Check current cycle" makes exactly one Tavily basic request and consumes
  one `can_use_scholarship_hunt`-gated charge, not a new quota key.
- Catalog entries already added to the user's library show an "in library"
  indicator.

## Implementation Plan

- Author `scholarship_catalog.py` with a `CATALOG` list of dataclasses/dicts
  and a `list_catalog(filters)` helper.
- Add the router and wire it into the FastAPI app.
- Build `ScholarshipCatalog.tsx` and add a "Catalog" sub-tab to
  `ScholarshipNewsView.tsx`.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `backend/tests/test_scholarship_catalog.py`: filter mapping (level/region/
  funding), zero-network-call assertion (no `httpx`/Tavily client
  instantiated during a plain list call), check-cycle billing call is exactly
  one Tavily request.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `backend/app/services/scholarship_catalog.py` (new)
- `backend/app/api/scholarship_opportunities.py` (new, shared with SCHOLARDOCX-0120/0121)
- `frontend/src/components/news/ScholarshipCatalog.tsx` (new)
- `frontend/src/components/ScholarshipNewsView.tsx`

Line-count risk:

- Low; new files start small, `ScholarshipNewsView.tsx` is 437 lines before
  this change (well under the 1000-line target).

If any file exceeds 1000 lines, explain why.

- N/A

## Verification Plan

- `cd backend && .venv/bin/pytest tests/test_scholarship_catalog.py -q`
- `cd frontend && npm run build`
- Manual: open Scholarship Hunt → Catalog, filter, confirm no network tab
  entries to Tavily/GLM/OpenRouter; click "Check current cycle" once and
  confirm exactly one Tavily call in logs.

## Completion Notes

Changed files:

- `backend/app/services/scholarship_catalog.py` (new) — 27 curated entries
  seeded from `SCHOLARSHIP_ALIASES`, `list_catalog`/`get_catalog_entry`/
  `normalize_url`/`catalog_entry_normalized_url` helpers.
- `backend/app/api/scholarship_opportunities.py` (new) — `GET
  /scholarship-catalog`, `POST /scholarship-catalog/{id}/check-cycle`
  (shared file with SCHOLARDOCX-0120/0121).
- `backend/app/main.py` — router registration.
- `frontend/src/components/news/ScholarshipCatalog.tsx` (new).
- `frontend/src/components/ScholarshipNewsView.tsx` — added Catalog sub-tab.
- `frontend/src/components/news/news.css` — catalog card styles.
- `frontend/src/lib/scholarshipOpportunitiesApi.ts` (new) — typed client.

Verification completed:

- `cd backend && .venv/bin/pytest tests/test_scholarship_catalog.py -q`: 9
  passed (filters, `normalize_url`, zero-network-call assertion, no
  fabricated funding amounts).
- `cd frontend && npm run build`: passed.
- Live authenticated browser check (Playwright + system Chrome, isolated
  workspace): Catalog tab loaded all 27 entries with zero network calls to
  any AI/search provider (confirmed via request interception). Screenshot
  matches the existing ScholarDocX visual system.

Unit tests added or updated:

- `backend/tests/test_scholarship_catalog.py` (new, 9 tests).

Follow-ups:

- Catalog is ~27 entries (all of `SCHOLARSHIP_ALIASES`) rather than the
  planbook's aspirational 60-100 — deliberately scoped down to avoid
  hand-authoring metadata for programs that couldn't be verified this
  session. Expanding the list with more verified programs is a good
  follow-up.
- Found and fixed during implementation: the initial `normalize_url`
  dropped the URL path (host-only), which would have wrongly deduped
  different scholarship articles hosted on the same domain. Fixed to keep
  host+path; covered by `test_normalize_url_keeps_path_so_different_pages_on_one_host_differ`.
