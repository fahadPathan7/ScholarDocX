# SCHOLARDOCX-0125: Deep Hunt runs (Phase 5)

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-03

## Summary

Add a plan-gated, Atlas-style multi-pass research run for one funding goal
(e.g. "fully funded CS PhD funding, EU, Fall 2027"): search + crawl official
pages, extract structured opportunities with the existing Phase 1 extraction
service, and persist an aggregated, evidence-backed report into the
Opportunity Library. Persisted and resumable, mirroring Advisor Atlas's run
model, per the planbook's Phase 5 stretch section.

## Business Context

Links:

- Planbook: [scholarship-hunt-pipeline.md](../../planbook/scholarship-hunt-pipeline.md) (Phase 5)
- Business file: [decisions.md](../../business/decisions.md)

Business value:

Turns one-off Hunt searches and manual per-card "Analyze" clicks into a
single bounded research run that does the search → crawl → extract loop
automatically for a whole funding goal, producing several evidence-backed
opportunities at once instead of one at a time.

## Functional Context

Links:

- Functional file: [feature-scholarship-news.md](../../functional/feature-scholarship-news.md)

Requirements (new):

- FR-8.43: A user on a plan with Deep Hunt access can start a run from a
  free-text funding goal plus optional degree level / destinations / intake
  term (prefilled from their Hunt Profile, editable).
- FR-8.44: A run persists (queued/running/completed/failed/cancelled),
  reports stage progress, can be cancelled mid-run, and a failed/cancelled
  run can be resumed.
- FR-8.45: Accepted results are structured opportunities (same shape as
  Phase 1 "Analyze") saved into the Opportunity Library, tagged with the run
  that found them; no invented fields — missing stays missing.
- FR-8.46: Deep Hunt is gated by a new boolean role limit
  `can_use_scholarship_deep_hunt` (Pro/Max by default); ineligible plans see
  a locked upsell state, existing runs from a downgraded user stay readable.

## Technical Context

Links:

- Technical file: [ai-token-economy.md](../../technical/ai-token-economy.md),
  [api-boundaries.md](../../technical/api-boundaries.md),
  [security-privacy.md](../../technical/security-privacy.md)

Technical notes:

- Reuses `scholarship_opportunities` as the output table (`source="deep_hunt"`
  + new `deep_hunt_run_id` FK) instead of a parallel candidates schema —
  Phase 1 already built the exact shape Phase 5 needs to produce.
- Reuses `app.services.advisor_atlas.crawler.PublicCrawler` and
  `app.services.scholarship_extraction.scholarship_extraction_service`
  directly; no new crawling or extraction logic.
- Cost model matches Advisor Atlas, not the plain Hunt tab: boolean plan gate
  + AI-token metering per extraction call, zero-cost Tavily ledger rows via
  `AiService.record_external_search`. No new count-based daily limit — see
  `ai-token-economy.md`'s note that count limits on AI-metered actions were
  removed project-wide in favor of gate+tokens.
- New `ScholarshipDeepHuntRepository` / `ScholarshipDeepHuntService` in
  `backend/app/services/scholarship_deep_hunt.py`, mirroring
  `AdvisorAtlasRepository` / `AdvisorAtlasService`'s run lifecycle
  (progress_json, is_cancelled, prepare_resume).

## Scope

In scope:

- `scholarship_deep_hunt_runs` table + `deep_hunt_run_id` column on
  `scholarship_opportunities`.
- `can_use_scholarship_deep_hunt` role limit, seeded in all four sources.
- Backend service (search 3 passes → crawl ~12 pages → extract → persist),
  API router (`/scholarship-deep-hunt/*`), background execution.
- Frontend: Deep Hunt launcher + run detail view (new subnav tab in
  Scholarship Hunt), locked upsell state, plan comparison + admin role-limits
  entries.
- Backend tests.

Out of scope:

- Changing Phase 0-4 behavior.
- A manual "budget dial" UI (search/crawl/extract limits are fixed
  constants, matching Advisor Atlas's fixed per-candidate budgets).

## Implementation Plan

See the approved plan for full file-level detail
(`AI-Context/planbook/scholarship-hunt-pipeline.md` Phase 5 section is the
spec; this story is the execution record). Summary:

- `backend/app/db/models.py` — `ScholarshipDeepHuntRuns` model,
  `deep_hunt_run_id` on `ScholarshipOpportunities`.
- `backend/app/db/connection.py` — `USER_SCOPED_TABLES` entry, guarded
  `ALTER TABLE`, role-limit seed rows, `canonical_features`.
- `backend/app/db/schema.py` — `SEED_SQL` role-limit rows.
- `backend/app/services/admin.py` — `DEFAULT_ROLE_LIMITS` role-limit rows.
- `backend/app/services/store.py` — `TABLE_COLUMNS` entry.
- `backend/app/services/scholarship_deep_hunt.py` (new) — repository +
  service.
- `backend/app/api/scholarship_opportunities.py` — shared upsert helper
  factored out for reuse by the deep-hunt service.
- `backend/app/api/scholarship_deep_hunt.py` (new) — router.
- `backend/app/main.py` — router registration.
- `frontend/src/lib/scholarshipDeepHuntApi.ts` (new).
- `frontend/src/components/news/DeepHuntView.tsx` (new).
- `frontend/src/components/ScholarshipNewsView.tsx` — 4th subnav tab.
- `frontend/src/lib/accessErrors.ts`, `PlanComparisonView.tsx`,
  `AdminView.tsx` — plan-gate surfaces.

## Unit Test Plan

Unit tests needed: Yes.

- `backend/tests/test_scholarship_deep_hunt.py` (new): repository CRUD,
  plan-gate 403s for free/general vs pro/max on create+resume, service
  happy-path with mocked Tavily/crawler/extraction, cancellation mid-run,
  dedupe against an existing opportunity (update not duplicate), no-invented
  -fields contract when extraction returns nulls.
- No frontend unit tests for `DeepHuntView.tsx` — matches the documented gap
  for `components/news/*` (SCHOLARDOCX-0121/0123 follow-up); verified via
  live browser run instead.

If no unit tests are needed, explain why: N/A — see above.

## File Size Check

Files expected to be edited/created:

- `backend/app/services/scholarship_deep_hunt.py` (new) — expect ~350-450
  lines (repository + service in one module, under the 1000-line target).
- `backend/app/api/scholarship_deep_hunt.py` (new) — expect ~150-200 lines.
- `frontend/src/components/news/DeepHuntView.tsx` (new) — expect ~350-450
  lines.
- Existing files touched (models.py, connection.py, schema.py, admin.py,
  store.py, scholarship_opportunities.py, main.py, ScholarshipNewsView.tsx,
  accessErrors.ts, PlanComparisonView.tsx, AdminView.tsx) get small, additive
  edits well under their current size.

Line-count risk: Low — no touched file was near 900 lines beforehand.

If any file exceeds 1000 lines, explain why: N/A.

## Verification Plan

- `cd backend && .venv/bin/pytest tests/test_scholarship_deep_hunt.py tests/test_scholarship_opportunities.py tests/test_scholarship_extraction.py -q`.
- `cd backend && .venv/bin/pytest tests/ -q` (full regression).
- `cd frontend && npm run build`.
- Live authenticated browser run: start a Deep Hunt run with a real goal,
  watch stage progress, confirm resulting opportunities have evidence-backed
  fields (no invented deadlines), confirm "Add to tracker" works, confirm
  Free/General sees the locked upsell and Pro/Max does not.

## Completion Notes

Changed files:

- `backend/app/db/models.py` — `ScholarshipDeepHuntRuns` model, `deep_hunt_run_id`
  FK on `ScholarshipOpportunities`.
- `backend/app/db/connection.py` — `USER_SCOPED_TABLES` entry, guarded
  `ALTER TABLE` for `deep_hunt_run_id`, `can_use_scholarship_deep_hunt` seed
  rows (migration block + `free_user_defaults` + `canonical_features`).
- `backend/app/db/schema.py` — `can_use_scholarship_deep_hunt` `SEED_SQL` rows
  (all 4 tiers).
- `backend/app/services/admin.py` — `DEFAULT_ROLE_LIMITS` rows (all tiers,
  including both `free_user` blocks — a pre-existing duplicate key in that
  dict, second one is effective, per SCHOLARDOCX-0084's precedent).
- `backend/app/services/store.py` — `TABLE_COLUMNS["scholarship_opportunities"]`
  `deep_hunt_run_id` entry.
- `backend/app/services/scholarship_deep_hunt.py` (new) —
  `ScholarshipDeepHuntRepository` + `ScholarshipDeepHuntService` (search 3
  passes → crawl ≤12 pages → extract ≤12 sources → persist), reusing
  `PublicCrawler` and `scholarship_extraction_service` directly.
- `backend/app/api/scholarship_opportunities.py` — factored
  `upsert_scholarship_opportunity` out of `analyze_scholarship_opportunity`
  for shared use by the Deep Hunt service.
- `backend/app/api/scholarship_deep_hunt.py` (new) — router
  (create/list/get/cancel/resume/delete), plan-gated.
- `backend/app/main.py` — router registration.
- `backend/app/auth/limits.py` — **bug fix** (found via live verification,
  see below): `check_and_increment_limit` now always commits, not only when
  `increment != 0`.
- `frontend/src/lib/scholarshipDeepHuntApi.ts` (new), `scholarshipOpportunitiesApi.ts`
  (`deep_hunt_run_id` field, `"deep_hunt"` source variant).
- `frontend/src/components/news/DeepHuntView.tsx` (new),
  `frontend/src/components/news/deep-hunt.css` (new, kept separate from
  `news.css` which is already past the file-size grace limit).
- `frontend/src/components/ScholarshipNewsView.tsx` — 4th subnav tab,
  `canUseDeepHunt` derived from `usageData.limits`.
- `frontend/src/lib/accessErrors.ts`, `components/PlanComparisonView.tsx`,
  `components/admin/RoleLimitsTab.tsx` — plan-gate surfaces for
  `can_use_scholarship_deep_hunt`.
- `AI-Context/functional/feature-scholarship-news.md` (FR-8.43-8.46),
  `AI-Context/technical/api-boundaries.md`, `ai-token-economy.md`,
  `security-privacy.md`, Epic README.

Bug found and fixed during verification (SCHOLARDOCX-0125, not pre-existing
to this story's scope but blocking it):

- `check_and_increment_limit(user, feature, increment=0, session)` — used by
  every boolean plan gate (`can_use_advisor_atlas`,
  `can_use_scholarship_analyze`, and now `can_use_scholarship_deep_hunt`) —
  bootstraps a `user_usage_stats` row via INSERT the first time a given
  user+feature pair is checked, but only called `session.commit()` inside
  `if increment != 0`. For a permission-only check (`increment=0`), that
  INSERT stayed uncommitted on the caller's SQLAlchemy session for the rest
  of the request. Live verification hit this immediately: the very first
  Deep Hunt run for a real user deadlocked with `sqlite3.OperationalError:
  database is locked`, because `ScholarshipDeepHuntRepository.create_run`'s
  separate raw sqlite3 connection couldn't write while the plan-gate check's
  uncommitted transaction held the file. Fixed by always committing.
  Regression test: `test_permission_only_check_commits_bootstrap_row` in
  `backend/tests/test_limits_billing_guards.py`, verified to fail without
  the fix (reproduced via `git stash`) and pass with it. This bug was
  latent for `can_use_advisor_atlas`/`can_use_scholarship_analyze` too, but
  never surfaced because those role-limit rows had already been seeded/
  touched for every test/demo account before their live verifications ran.

Verification completed:

- `cd backend && .venv/bin/pytest tests/test_scholarship_deep_hunt.py tests/test_scholarship_opportunities.py tests/test_scholarship_extraction.py tests/test_limits_billing_guards.py -q`: all pass.
- `cd backend && .venv/bin/pytest tests/ -q --deselect tests/test_ai.py --deselect tests/test_api_auth.py --deselect tests/test_api_auth_usage.py`: 246 passed (245 pre-existing + 1 new regression test), no regressions.
- `cd frontend && npx tsc --noEmit && npm run build`: clean.
- Live end-to-end run (isolated workspace, invite-registered `pro_user`
  test account, Playwright + system Chrome, real Tavily + real GLM):
  started a Deep Hunt run for "fully funded Computer Science PhD
  scholarships in Germany for Fall 2027" (PhD / Germany / Fall 2027). Run
  progressed through queued → searching → crawling → extracting →
  completed with live progress updates; found 7 real, evidence-backed
  opportunities (DAAD Scholarship 2027, DAAD Helmut Schmidt Scholarship
  2027, DAAD Doctoral Scholarships 2027, NHR Graduate School PhD program,
  etc.) with real funding amounts, real source URLs, and correctly *empty*
  deadline fields where the source page didn't state one — no invented
  data. Fit badges and "Add to Tracker" worked identically to Catalog/
  Library results (reused `OpportunityCard`/`AddToTrackerModal` unchanged).
  Confirmed the locked/upsell state renders (launcher hidden, past runs
  still readable) when `can_use_scholarship_deep_hunt` is off for a role
  that otherwise has `can_use_scholarship_hunt` — the one combination where
  Deep Hunt's own gate (distinct from the whole-tab Hunt gate) is
  observable. Zero console errors throughout (aside from the expected
  pre-login 403 on the unauthenticated bootstrap probe).

Unit tests added or updated:

- `backend/tests/test_scholarship_deep_hunt.py` (new): repository CRUD/
  lifecycle (create/list/get/cancel/resume/delete, user-scope enforcement),
  API plan-gate 403/allow for create+resume, service pipeline happy path
  (mocked search/crawl/extract) persisting opportunities tagged with the
  run, rejection of thin results (no name or no deadline/funding signal),
  dedupe of the same URL across search passes (extraction called exactly
  once), cancellation mid-run, and a no-search-results failure path.
- `backend/tests/test_limits_billing_guards.py` — new regression test for
  the commit bug above.
- No frontend unit tests for `DeepHuntView.tsx`, matching the documented gap
  for `components/news/*` (SCHOLARDOCX-0121/0123 follow-up); verified via
  the live browser run instead.

Follow-ups:

- The `components/news/*` / `lib/*.ts` frontend unit-test gap noted in prior
  stories still stands; not addressed here (out of scope).
- `RoleLimitsTab.tsx`/`PlanComparisonView.tsx` are missing a
  `can_use_scholarship_analyze` entry (pre-existing gap from Phase 1, not
  introduced or fixed by this story — noted for a future cleanup pass).
