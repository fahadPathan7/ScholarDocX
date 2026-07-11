# Planbook: Scholarship Hunt → Scholarship Pipeline

Status: PROPOSED (planning only — no implementation approved yet)

Related: functional/feature-scholarship-news.md (FR-8), feature-project-workspace.md
(FR-7 sheets/calendar), feature-advisor-atlas.md (FR-9 run model),
technical/ai-token-economy.md, Epic-AdvisorAtlas/SCHOLARDOCX-0077.

## Diagnosis — why the current feature has low value

Today's flow: filter panel → AI-generated query → review dialog → one Tavily
basic search → raw web cards in provider order → bookmark. Problems:

1. **Output is links, not answers.** A student's real questions — am I
   eligible? how much money? when is the deadline? what do I need to submit? —
   require opening every link. Google does this equally well for free.
2. **No connection to the user.** The app knows the user's degree targets,
   intake terms, and fields (projects + profile) but the hunt ignores them.
3. **No connection to the workflow.** Results die on the search page.
   Bookmarks are a dead end; nothing reaches sheets, calendar, deadlines,
   or reminders — the parts of ScholarDocX that already work.
4. **Every search starts from zero.** No memory of what the user has already
   seen, no notion of "new since last time".
5. **High interaction cost.** The query-review dialog (FR-8.24) makes the
   user do query QA before every search — friction with no payoff for most
   searches.

## Direction — from search page to pipeline

Reframe the feature around the funding **pipeline**, not the search:

```
DISCOVER  →  VET  →  TRACK  →  MONITOR
(catalog +   (structured   (sheet row +   (watchlists +
 hunt)        extraction)   calendar)      deadline radar)
```

The moat is the right side: structured opportunities that flow into the
user's existing tracker, calendar, and notifications. Search becomes an
ingredient, not the product.

## Existing assets to reuse

- `news_filter_rules.py` named-scholarship aliases (~600 lines) → seed data
  for a curated catalog.
- Sheet system: Scholarship Tracker template already exists; date columns
  already feed project calendar + notifications (FR-7).
- Advisor Atlas: crawler with politeness, `extract_json_object`, evidence +
  confidence model, persisted resumable runs — the pattern (and some code)
  for deep extraction.
- AI token economy (`ai_tokens.py`): meter AI extraction per use.
- Existing `news_searches_*` quotas and bookmark/saved-query storage.

## Phase 0 — Curated catalog (zero provider cost, instant value)

A code-shipped, local catalog of ~60–100 major scholarships (Erasmus Mundus,
DAAD, Fulbright, Chevening, MEXT, CSC, Commonwealth, …) built out from the
existing alias data, with per-entry metadata: levels, destination regions,
funding coverage, typical cycle months, official portal URL, brief blurb.

- Browsable/filterable with the existing filter dimensions, **without
  consuming any quota** — the tab is useful the moment it opens, even offline.
- Each entry has "Check current cycle" → one quota-charged Tavily search
  scoped with the canonical name + official domain bias.
- Catalog data lives in a versioned local JSON/py module; no remote service.

## Phase 1 — Vet: structured opportunity extraction

Per result card (from hunt or catalog): **"Analyze"** action.

- Backend fetches page content (Tavily Extract, else raw content already in
  the card) and runs one AI extraction call → structured
  `ScholarshipOpportunity`: name, provider/sponsor, degree levels,
  destination countries, eligible nationalities, funding coverage
  (full/partial/amount), deadline(s) + cycle, key requirements checklist,
  application URL, plus per-field confidence and source quotes (Atlas
  evidence pattern — never invent a deadline; missing is missing).
- Cost surface: AI tokens (existing economy) + 1 extract credit; the button
  shows the cost before the click. Optional "Analyze top 5" batch.
- New user-scoped table `scholarship_opportunities` (local SQLite), deduped
  by canonical name + normalized URL.
- Analyzed cards render structured: deadline chip (colored by proximity,
  same thresholds as sheets), funding badge, eligibility summary,
  requirements list.

## Phase 2 — Track: into the user's pipeline

- **"Add to tracker"** on any analyzed opportunity: pick a project → row is
  appended to that project's Scholarship Tracker sheet (auto-created from
  the existing template if absent), fields mapped (Deadline → date column →
  calendar/notifications light up with zero new plumbing).
- Opportunity Library view (replaces bare bookmarks; migrate existing
  bookmarks in): all saved/analyzed opportunities across hunts with status
  (Found → Vetting → Applying → Submitted → Result), deadline sort, dedupe.
- Status stays synced one-way (library → sheet row create; afterwards the
  sheet row is the source of truth, linked by row reference).

## Phase 3 — Match: profile-aware hunting

- **Hunt Profile** (local, user-confirmed): degree level, target
  destinations, field, intake term — prefilled from projects/profile;
  nationality is optional and **opt-in** (privacy: profile fields are only
  ever sent to providers as generic query terms; nationality never leaves
  the machine unless the user enables it).
- **Local fit score** on analyzed opportunities: level match, destination
  match, deadline feasibility vs intake term, funding coverage. Computed
  entirely locally from extracted fields — no extra provider calls.
- Cards get fit badges + "why / why not" chips (e.g. "✓ Master's ✓ Germany
  ✗ deadline before your Fall 2027 intake").

## Phase 4 — Monitor: watchlists and deadline radar

- Saved hunts become **watchlists**: "Run again" re-executes (normal quota)
  and diffs against seen article IDs → "New since last run" badges.
  Secure personal workspace: manual or on-tab-open trigger; no server cron.
- **Deadline radar**: dashboard widget + notification events for tracked
  opportunities approaching deadline — mostly surfacing what the sheet
  pipeline already produces once Phase 2 lands.

## Phase 5 (stretch) — Deep Hunt runs

Atlas-style multi-pass research run for one goal ("fully funded CS PhD
funding, EU, Fall 2027"): search + crawl official pages → aggregated
structured report with evidence, persisted/resumable, plan-gated like
Advisor Atlas. Only worth building after Phases 1–3 prove out extraction
quality.

## What changes vs FR-8 (to update on approval)

- Query-review dialog (FR-8.24–8.30) becomes **optional** ("Review query
  before search" toggle, default off) — the quality lever moves from query
  QA to structured extraction. Quota semantics simplify: charge on confirmed
  search, not on preview.
- Bookmarks (FR-8.14) are superseded by the Opportunity Library (with
  migration).
- FR-8.12's one-credit search boundary stays for plain hunts; Analyze and
  Deep Hunt get their own explicit cost surfaces and role-limit keys
  (e.g. `scholarship_analyze_daily`), RBAC-gated per CODE_RULES.

## Cost & privacy posture

- Zero-cost baseline (catalog) → cheap hunt (1 Tavily credit, unchanged) →
  metered vet (tokens + extract, user-visible price) → plan-gated deep runs.
- All opportunity data, statuses, and hunt profiles stay in local SQLite.
  No new remote persistence. Provider calls carry only query terms.

## Open decisions (need user/owner input)

- OD-1: First delivery scope. **Recommendation: Phases 0+1+2 together** —
  catalog + analyze + add-to-tracker is the smallest slice that changes the
  feature's nature. Phases 3–4 next; 5 only if quality holds.
- OD-2: Demote the query-review dialog to an opt-in toggle (recommended) or
  keep it mandatory (keeps FR-8.24 untouched but keeps the friction).
- OD-3: Which AI provider for extraction — existing OpenRouter Free path
  (cheap, weaker JSON reliability) vs the configured GLM/paid path via the
  token economy (recommended: token-metered configured provider, with
  OpenRouter Free as fallback, mirroring the query-preview pattern).
- OD-4: Nationality field in Hunt Profile: include as opt-in (recommended)
  or omit entirely.

## Suggested story breakdown (create on approval, new Epic-ScholarshipHunt)

1. Story: curated catalog data + browse UI (Phase 0).
2. Story: opportunity extraction service + Analyze UI + library table (Phase 1).
3. Story: add-to-tracker + bookmark migration + library view (Phase 2).
4. Story: hunt profile + local fit scoring (Phase 3).
5. Story: watchlists + deadline radar (Phase 4).
6. Story: FR-8 functional context rewrite reflecting the pipeline model.

## Test plan highlights

- Extraction: mocked provider responses → schema validation, missing-field
  handling (no invented deadlines), dedupe keys.
- Fit score: pure-function unit tests per dimension.
- Add-to-tracker: respects records_per_sheet limits (styled alert, FR-7.21),
  creates template sheet when absent.
- Catalog: filter mapping unit tests; zero network calls on browse.
- Quota: analyze/deep-run charge exactly once; RBAC checks per endpoint.

## Non-goals

- No automated application submission, no scraping behind logins/CAPTCHAs
  (FR-9.20 ethics carry over), no server-side scheduled crawling, no shared/
  community catalog sync (would violate secure personal workspace posture).
