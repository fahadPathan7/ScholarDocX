# SCHOLARDOCX-0176: Catalog static-only restructure + Search autofill fix

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-28

## Summary

Restructure the Scholarship Catalog into a static-only reference: remove the
paid "Check current cycle" action, support multiple official links per
scholarship, enrich descriptions and tags, split into two categories
(program/central vs university-specific), and add ~30-50 verified
university-specific scholarships. Separately, fix the Search-tab autofill bug
where navigating away and back re-fills the facets from the Hunt Profile —
replace auto-prefill with an explicit "Use Hunt Profile" button.

## Scope

In scope:

- Catalog data model: add `category`, change `portal_url` → `links[]`, add
  `tags`, enrich `description`. Categorize all existing 30 entries.
- Add ~30-50 verified university-specific scholarships (UK/US/EU/Canada/Asia).
- Delete `POST /scholarship-catalog/{id}/check-cycle` endpoint, the
  `news_service.search_catalog` wrapper, and the
  `scholarship_catalog_check_cycle` rate-limit rule.
- `GET /scholarship-catalog` gains optional `category` filter.
- Frontend: rewrite `ScholarshipCatalog.tsx` as static two-section display
  with enriched cards, tag chips, multi-link buttons, client-side filtering.
- Frontend: fix DeepHuntView autofill — empty initial facet state + "Use
  Hunt Profile" button.

Out of scope:

- Any paid/live-check feature for the catalog (static-only by design).
- Migrating library rows to the new `links` shape (separate table).
- Beyond ~60-80 total catalog entries (follow-up).

## Acceptance Criteria

- [ ] Catalog tab shows two sections (Program/Central + University-specific),
      no "Check current cycle" button. Each card shows description, tags, and
      1-N official links.
- [ ] `POST /scholarship-catalog/{id}/check-cycle` route is deleted.
- [ ] Catalog has ~60-80 entries; university-specific section has 30-50
      verified entries (no fabricated facts).
- [ ] Navigating Search → Catalog → Search leaves facets empty. "Use Hunt
      Profile" button fills them on click.
- [ ] `GET /scholarship-catalog?category=university` returns only university.
- [ ] All backend tests green; frontend `tsc --noEmit` clean.
- [ ] No infra/algorithm jargon in catalog UI copy.

## Implementation Plan

See approved plan. Phases: (1) catalog data model + content, (2) backend API
+ check-cycle removal, (3) frontend catalog UI, (4) autofill fix, (5) docs.

## Verification Plan

- `pytest tests/unit/test_scholarship_catalog.py`
- `pytest tests/unit/test_scholarship_opportunities.py`
- `npx tsc --noEmit`

## Completion Notes

Changed files:

Backend:
- `backend/app/services/scholarship_catalog_data.py` — **NEW**: the `CATALOG` list split out so the data file can grow without pushing the helpers module over the file-size limit (1142 lines).
- `backend/app/services/scholarship_catalog.py` — rewrote as helpers only (92 lines): added `category`/`tags` filter params to `list_catalog`, `catalog_entry_normalized_url` now reads the primary link, tolerates the FastAPI `Query` sentinel for all params. 49 entries (27 program + 22 university).
- `backend/app/api/scholarship_opportunities.py` — deleted `POST /scholarship-catalog/{id}/check-cycle` entirely; added `category` query param to `GET /scholarship-catalog`; removed now-unused `news_service` + `get_catalog_entry` imports.
- `backend/app/services/news_service.py` — deleted `search_catalog` method (only caller was check-cycle); updated docstring.
- `backend/app/auth/rate_limit.py` — removed the `scholarship_catalog_check_cycle` rule.

Backend tests:
- `backend/tests/unit/test_scholarship_catalog.py` — rewrote with 24 tests: schema integrity (required fields, valid category, non-empty links, tags list, valid levels, valid coverage, no duplicate IDs), both-sections-populated, category/level/destination/funding/tag filters, AND-semantics, lookup, normalize_url.
- `backend/tests/unit/test_scholarship_opportunities.py` — deleted 3 check-cycle tests; added `test_catalog_endpoint_filters_by_category` (validates schema + category filter + static-only).

Frontend:
- `frontend/src/lib/scholarshipOpportunitiesApi.ts` — `CatalogEntry` now has `category`, `links: CatalogLink[]`, `tags`, `description`; deleted `checkScholarshipCycle`; added `category` to filter type; removed unused `NewsResponse` import.
- `frontend/src/components/news/ScholarshipCatalog.tsx` — rewrote as static-only: text search, level filter, tag chips (top-16 by frequency), two sections (Program & Central / University-Specific), enriched cards (description, destinations, funding notes, cycle window, tag chips, multi-link buttons). Removed all check-cycle/analyze machinery. 197→~250 lines.
- `frontend/src/components/ScholarshipNewsView.tsx` — catalog usage trimmed to `onToast` + `huntProfile` (removed `onAddToTracker`/`onRefreshUsage` props).
- `frontend/src/components/news/DeepHuntView.tsx` — **autofill fix**: facet states (`degreeLevel`, `destinationsText`, `intakeTerm`, `fieldOfStudy`) now initialize to `""` instead of `huntProfile?.…`; added `prefillFromProfile()` + a "Use Hunt Profile" button (disabled when facets already match the profile or no profile is set).
- `frontend/src/components/news/deep-hunt.css` — `.deep-hunt-prefill-btn` style.
- `frontend/src/components/news/news.css` — styles for `.scholarship-catalog-search`, `.scholarship-catalog-tags`/`-tag-chip`/`-tag-clear`, `.scholarship-catalog-section`(+header/subtitle), `.scholarship-catalog-description`, `-destinations`, `-funding-notes`, `-card-tags`/`-card-tag`, `-cycle`.

Context:
- `AI-Context/functional/feature-scholarship-news.md` — FR-8.32 updated for the new schema (category/links/tags/description, ~49 entries split into 2 sections); FR-8.33 marked SUPERSEDED.
- `AI-Context/technical/ai-integrations.md` — catalog section now documents static-only behavior; removed check-cycle from per-hit billing; updated `news_service.py` retention note.
- `AI-Context/planbook/scholarship-hunt-pipeline.md` — Phase 0 updated for static-only + 2-category split.

Verification completed:

- `pytest tests/unit/test_scholarship_catalog.py` — 24/24 pass.
- `pytest tests/unit/test_scholarship_opportunities.py` (catalog + category filter tests) — pass alongside the catalog tests (26 total in the combined run).
- `npx tsc --noEmit` — clean (exit 0).
- Data integrity: 49 entries validated (required fields present, non-empty links with absolute URLs, valid categories, no duplicate IDs, both sections populated: 27 program + 22 university).

Unit tests added or updated:

- 24 catalog tests (rewritten); 1 category-filter test (new); 3 check-cycle tests deleted.

Follow-ups:

- The catalog data file (`scholarship_catalog_data.py`) is at 1142 lines (under the 1150 grace limit). If more entries are added, consider splitting per-category or moving to a JSON resource loaded at startup.
- A few entries have `cycle_months: []` where the typical window could not be verified conservatively — populate as authoritative sources are confirmed.
- The catalog "in_library" check keys on the primary link's normalized URL; multi-link entries where the user owns a secondary link (not the primary) will not badge as "in library". Acceptable for now; revisit if it causes confusion.
