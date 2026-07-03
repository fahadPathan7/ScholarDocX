# SCHOLARDOCX-0124: Watchlists + Deadline Radar (Phase 4)

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-03

## Summary

Turn saved Scholarship Hunt queries into watchlists (diff + "New" badges on
re-run) and surface a deadline radar for tracked opportunities, backed by a
new local notification event.

## Business Context

Links:

- Business file: [decisions.md](../../business/decisions.md) (BD-010)

Business value:

Closes the planbook's Phase 4 loop: the user no longer has to remember to
re-check a search or a deadline — the app resurfaces what changed.

## Functional Context

Links:

- Functional file: [feature-scholarship-news.md](../../functional/feature-scholarship-news.md)

Requirements:

- FR-8.41: Saved query re-run diffs against previously seen article IDs.
- FR-8.42: Deadline Radar summary + one deduped notification per tracked
  opportunity per day when its deadline is inside the sheet-coloring
  proximity threshold.

## Technical Context

Links:

- Technical file: [api-boundaries.md](../../technical/api-boundaries.md)

Technical notes:

- No cron/background job exists anywhere in this codebase and none is
  being added (BD-004, no mandatory infra) — both features are client-side,
  on-load scans with an explicit local dedupe field, exactly like every
  other `notify()` call site already does for user-action events.
- `seen_article_ids_json` new column on `saved_scholarship_queries`;
  `last_deadline_notified_at` new column on `scholarship_opportunities`.
  Both follow the guarded `PRAGMA table_info` + `ALTER TABLE ADD COLUMN`
  pattern in `connection.py` (precedent: `local_profiles.avatar`,
  ~line 329) plus the SQLAlchemy model field and `TABLE_COLUMNS` entry.
- New `PATCH /news/saved-queries/{id}` endpoint in `backend/app/api/news.py`
  (this table has always used bespoke endpoints there, not generic CRUD).
  `scholarship_opportunities.last_deadline_notified_at` needs no new
  endpoint — the existing generic PATCH already accepts any allowed field.
- New notification event `scholarship_deadline_approaching` registered in
  `backend/app/core/notifications.py` (`WORKSPACE_NOTIFICATION_DEFAULTS`)
  and `frontend/src/config/notificationCatalog.ts`.

## Scope

In scope:

- `seen_article_ids_json` column, `PATCH /news/saved-queries/{id}`, "New"
  badge diff logic in `ScholarshipNewsView.handleRunSavedQuery`.
- `last_deadline_notified_at` column, notification event registration,
  on-load deadline scan + "Deadline Radar" summary strip in
  `OpportunityLibrary.tsx`.

Out of scope:

- Any server-side scheduled job (explicitly ruled out by BD-004).
- A global cross-project dashboard (none exists; radar lives in the
  Scholarship Hunt Library tab instead — see plan for rationale).

## Acceptance Criteria

- Saving a query, running it, then running it again after new results
  appear shows a "New" badge only on genuinely new `article_id`s.
- A tracked opportunity (has `linked_sheet_id`) with a deadline inside the
  proximity threshold appears in the Deadline Radar strip and produces
  exactly one notification; reloading the Library tab again the same day
  does not produce a second notification.
- An opportunity with no deadline or outside the threshold does not appear
  in the radar and does not notify.
- Disabling the `scholarship_deadline_approaching` notification setting
  suppresses the notification (existing `notify()` preference-check path).

## Implementation Plan

- Add both columns + migrations + model fields + `TABLE_COLUMNS` entries.
- Add `PATCH /news/saved-queries/{id}` and `updateSavedQuery` client helper.
- Diff logic in `ScholarshipNewsView.tsx`; "New" badge threaded through
  `NewsFeed`/`NewsCard`.
- Register the notification event at both sites; add the scan + radar strip
  to `OpportunityLibrary.tsx`, reusing `OpportunityCard.tsx`'s exported
  `deadlineTone` threshold helper rather than duplicating it.

## Unit Test Plan

Unit tests needed:

- Yes (backend only)

Planned tests:

- `backend/tests/test_news_feedback.py` (or a new `test_saved_queries.py`):
  `PATCH /news/saved-queries/{id}` updates `seen_article_ids_json` and
  `last_used_at`, 404s on an unknown/other-user's query.
- `backend/tests/test_scholarship_opportunities.py`: `PATCH` accepts
  `last_deadline_notified_at`.
- Frontend diff/scan logic verified via a live browser run rather than a
  unit harness (no existing `components/news/` test pattern — see
  SCHOLARDOCX-0121's recorded follow-up).

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `backend/app/db/models.py`
- `backend/app/db/connection.py`
- `backend/app/services/store.py`
- `backend/app/api/news.py`
- `backend/app/core/notifications.py`
- `backend/tests/test_news_feedback.py` or new `test_saved_queries.py`
- `backend/tests/test_scholarship_opportunities.py`
- `frontend/src/lib/newsApi.ts`
- `frontend/src/config/notificationCatalog.ts`
- `frontend/src/components/ScholarshipNewsView.tsx`
- `frontend/src/components/news/NewsCard.tsx`
- `frontend/src/components/news/NewsFeed.tsx`
- `frontend/src/components/news/OpportunityCard.tsx`
- `frontend/src/components/news/OpportunityLibrary.tsx`
- `frontend/src/components/news/news.css`

Line-count risk:

- Low.

If any file exceeds 1000 lines, explain why.

- N/A

## Verification Plan

- `cd backend && .venv/bin/pytest tests/test_news_feedback.py
  tests/test_scholarship_opportunities.py -q` (or the new saved-queries
  test file).
- `cd frontend && npm run build`.
- Live browser: save a query and run it twice with a real new result in
  between, confirm the "New" badge; track an opportunity with a near-term
  deadline, confirm the radar strip + exactly one notification, then reload
  and confirm no duplicate notification.

## Completion Notes

Changed files:

- `backend/app/db/models.py` — `SavedScholarshipQueries.seen_article_ids_json`,
  `ScholarshipOpportunities.last_deadline_notified_at`.
- `backend/app/db/connection.py` — two guarded `ALTER TABLE` blocks.
- `backend/app/services/store.py` — two `TABLE_COLUMNS` entries.
- `backend/app/api/news.py` — `SavedQueryUpdate` model, `PATCH
  /news/saved-queries/{id}`, `_now_iso()` helper (server sets `last_used_at`,
  not the client).
- `backend/app/core/notifications.py` — `scholarship_deadline_approaching`
  added to `WORKSPACE_NOTIFICATION_DEFAULTS` (default on).
- `backend/tests/test_saved_queries.py` (new, 3 tests).
- `backend/tests/test_scholarship_opportunities.py` — 1 new test for
  `last_deadline_notified_at`.
- `frontend/src/lib/newsApi.ts` — `updateSavedQuery`,
  `SavedNewsQuery.seen_article_ids_json`.
- `frontend/src/lib/scholarshipOpportunitiesApi.ts` —
  `last_deadline_notified_at` field + updatable.
- `frontend/src/lib/api.ts` — `notify()` vars gained `scholarshipName`.
- `frontend/src/config/notificationCatalog.ts` — event key, template, vars.
- `frontend/src/config/notificationLabels.ts` — settings-UI category +
  default so users can toggle it in notification preferences.
- `frontend/src/components/news/SavedQueriesDialog.tsx`, `FilterPanel.tsx` —
  thread the saved query's `id`/`seen_article_ids_json` through
  `onRunSavedQuery`.
- `frontend/src/components/ScholarshipNewsView.tsx` — `fetchNews` now
  returns its results (fixes a stale-closure hazard that would have broken
  the diff), `handleRunSavedQuery` diff logic, `newArticleIds` state.
- `frontend/src/components/news/NewsCard.tsx`, `NewsFeed.tsx` — "New" badge.
- `frontend/src/components/news/OpportunityLibrary.tsx` — radar scan,
  summary strip, session-level dedupe guard (see bug note below).
- `frontend/src/components/news/news.css` — "New" badge + radar strip
  styles.

Verification completed:

- `cd backend && .venv/bin/pytest tests/test_saved_queries.py
  tests/test_scholarship_opportunities.py -q`: 13 passed. Full suite:
  `pytest tests/ -q --deselect tests/test_ai.py --deselect
  tests/test_api_auth.py --deselect tests/test_api_auth_usage.py`: 232
  passed (the two deselected files have pre-existing, unrelated
  "database is locked" flakiness confirmed last session).
- `cd frontend && npm run build`: passed (twice — once before, once after
  the dedupe fix below).
- Live authenticated browser run: saved a real watchlist query, ran it —
  first run showed 20/20 results marked "New" (seen-set started empty,
  `seen_article_ids_json` persisted 19 unique IDs after de-duplication);
  ran it again — 19 cards returned, only 2 marked "New" (a genuinely fresh
  live Tavily diff, not a canned fixture). Deadline radar: created a
  tracked opportunity (`linked_sheet_id` set) with a deadline 3 days out;
  the "1 tracked opportunity due within 7 days" strip rendered correctly on
  load and again on reload.

**Bug found and fixed during verification**: the first radar-scan test
produced 2 duplicate notifications with identical timestamps instead of 1.
Root cause: React StrictMode double-invokes effects in dev, so two
near-simultaneous `scanDeadlineRadar` calls both read
`last_deadline_notified_at` as unset before either write landed. Fixed with
a module-level `notifiedThisSession` `Set<number>`, claimed synchronously
before the first `await` in the loop. Re-verified after the fix: exactly 1
notification row across both the double-invoke and an explicit page reload.

Unit tests added or updated:

- `backend/tests/test_saved_queries.py` (new): update sets seen-IDs and
  bumps `last_used_at`, 404 on unknown ID, 404 on another user's query
  (ownership scoping).
- `backend/tests/test_scholarship_opportunities.py`: `PATCH` accepts
  `last_deadline_notified_at`.
- No new frontend unit tests (same documented gap as SCHOLARDOCX-0121/0123)
  — the diff logic and radar dedupe were verified live instead, which is
  actually how the StrictMode race above was caught; a unit test with mocked
  timers would not have surfaced it.

Follow-ups:

- The session-level dedupe guard handles same-tab races (StrictMode, fast
  remounts) but not true concurrent multi-tab duplicate notifications —
  would need a server-side atomic check-and-set. Low-risk for a local
  single-user desktop-style app; not worth the added complexity now.
- A frontend unit-test pattern for `components/news/` and `lib/*.ts` (pure
  functions and diff logic) is recorded as a recurring follow-up across
  SCHOLARDOCX-0121/0123/0124 — worth setting up before the next phase.
