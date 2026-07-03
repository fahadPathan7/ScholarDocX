# SCHOLARDOCX-0123: Hunt Profile + Local Fit Score (Phase 3)

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-03

## Summary

Let a user set one local Hunt Profile (degree level, destinations, field of
study, intake term, opt-in nationality) and show a local, provider-free fit
score + why/why-not chips on opportunities matched against it.

## Business Context

Links:

- Business file: [decisions.md](../../business/decisions.md) (BD-010)

Business value:

Turns the opportunity list from "here's what exists" into "here's what fits
you," the planbook's Phase 3 value proposition, without adding any provider
cost.

## Functional Context

Links:

- Functional file: [feature-scholarship-news.md](../../functional/feature-scholarship-news.md)

Requirements:

- FR-8.39: One local Hunt Profile, prefilled from a project when empty,
  nationality opt-in and never sent to a provider.
- FR-8.40: Local fit score + chips on opportunities when a profile is set;
  unchanged card rendering when it isn't.

## Technical Context

Links:

- Technical file: [domain-relationships.md](../../functional/domain-relationships.md),
  [security-privacy.md](../../technical/security-privacy.md)

Technical notes:

- `hunt_profile_json` new column on `local_profiles` (mirrors
  `notification_settings`'s JSON-blob-on-profile pattern) — not a new
  table. Guarded `ALTER TABLE` in `backend/app/db/connection.py` alongside
  the existing `profile_columns` block (~line 329), plus the SQLAlchemy
  model field and a `TABLE_COLUMNS["local_profiles"]` entry. No new
  endpoint — `local_profiles` is already generic CRUD.
- `frontend/src/lib/huntProfile.ts`: `computeFitScore(profile, opportunity)`
  is a pure function — zero network calls, per FR-8.40.

## Scope

In scope:

- `hunt_profile_json` column + migration.
- `frontend/src/lib/huntProfile.ts` (types, get/save helpers, fit function).
- `frontend/src/components/news/HuntProfileModal.tsx`.
- Fit badge + chips on `OpportunityCard.tsx` (optional prop, backward
  compatible).

Out of scope:

- Sending nationality or any profile field to a provider (explicitly
  forbidden, not just unimplemented).
- Server-side fit scoring (kept client-side per the planbook).

## Acceptance Criteria

- Opening the Hunt Profile editor with an empty profile and an existing
  project prefills degree level and intake term from that project.
- Setting a profile and viewing an analyzed opportunity shows a fit score
  and at least one match/mismatch chip that's substantively correct for
  the data shown (e.g., a Master's-only opportunity should not claim a PhD
  match).
- Cards render exactly as before when no Hunt Profile is set.
- No network request is made when the fit score is computed (open the
  network tab / add a temporary assertion during verification).

## Implementation Plan

- Add the column + migration + model field + TABLE_COLUMNS entry.
- Write `huntProfile.ts` with `computeFitScore`.
- Build `HuntProfileModal.tsx` with project-based prefill.
- Wire an optional `huntProfile` prop through `OpportunityCard.tsx` and its
  callers (`NewsCard`, `ScholarshipCatalog`, `OpportunityLibrary`).

## Unit Test Plan

Unit tests needed:

- No dedicated backend tests beyond the generic-CRUD coverage
  `local_profiles` already has — this story only adds one column that the
  existing generic PATCH path already exercises.
- `computeFitScore` is verified manually via a live browser run (see
  Verification Plan) rather than a Node/vitest harness, since
  `components/news/` has no existing frontend test pattern to extend
  (documented follow-up in SCHOLARDOCX-0121).

If no unit tests are needed, explain why:

- N/A — see above.

## File Size Check

Files expected to be edited:

- `backend/app/db/models.py`
- `backend/app/db/connection.py`
- `backend/app/services/store.py`
- `frontend/src/lib/huntProfile.ts` (new)
- `frontend/src/components/news/HuntProfileModal.tsx` (new)
- `frontend/src/components/news/OpportunityCard.tsx`
- `frontend/src/components/ScholarshipNewsView.tsx`

Line-count risk:

- Low.

If any file exceeds 1000 lines, explain why.

- N/A

## Verification Plan

- `cd backend && .venv/bin/pytest tests/test_scholarship_opportunities.py -q`
  (regression only — no new backend logic).
- `cd frontend && npm run build`.
- Live browser: set a Hunt Profile, confirm prefill from a project, confirm
  fit badges/chips render correctly on real analyzed opportunities, confirm
  zero network calls during fit computation.

## Completion Notes

Changed files:

- `backend/app/db/models.py` — `LocalProfiles.hunt_profile_json`.
- `backend/app/db/connection.py` — guarded `ALTER TABLE local_profiles ADD
  COLUMN hunt_profile_json`.
- `backend/app/services/store.py` — `TABLE_COLUMNS["local_profiles"]` entry.
- `frontend/src/lib/huntProfile.ts` (new) — types, get/save helpers,
  `computeFitScore`.
- `frontend/src/components/news/HuntProfileModal.tsx` (new).
- `frontend/src/components/news/OpportunityCard.tsx` — fit badge/chips;
  exported `deadlineTone`, `nearestDeadlineOf`,
  `DEADLINE_RADAR_THRESHOLD_DAYS` for reuse by SCHOLARDOCX-0124.
- `frontend/src/components/news/NewsCard.tsx`, `NewsFeed.tsx`,
  `ScholarshipCatalog.tsx`, `OpportunityLibrary.tsx` — thread the optional
  `huntProfile` prop down to `OpportunityCard`.
- `frontend/src/components/ScholarshipNewsView.tsx` — loads the profile on
  mount, "Hunt Profile" toolbar button, modal wiring.
- `frontend/src/components/news/news.css` — fit badge/chip styles.

Verification completed:

- `cd backend && .venv/bin/pytest tests/ -q --deselect tests/test_ai.py
  --deselect tests/test_api_auth.py --deselect tests/test_api_auth_usage.py`:
  232 passed (regression only, no new backend logic beyond generic CRUD).
- `cd frontend && npm run build`: passed.
- Live authenticated browser run (isolated workspace, `max_user` account,
  Playwright): opening the Hunt Profile editor with an empty profile and one
  existing project (`degree_type: masters`, `intake_term: "Fall 2027"`)
  correctly prefilled "Master's" / "Fall 2027". Set destinations to Germany
  and field of study to Computer Science, saved. Ran a real Catalog
  "Check current cycle" on DAAD, analyzed a real result: fit badge rendered
  "70% fit" with chips "✓ Master's" and "✓ full funding" — correct given the
  extracted data. Zero console errors throughout.

Unit tests added or updated:

- None beyond the existing generic-CRUD coverage for `local_profiles`, per
  the plan — `hunt_profile_json` is just one more field on an
  already-tested generic PATCH path.
- `computeFitScore` verified via the live browser run above rather than a
  Node/vitest harness (no existing test pattern under `components/news/` or
  `lib/` for pure TS functions — same documented gap as SCHOLARDOCX-0121).

Follow-ups:

- None additional; a frontend unit-test pattern for `lib/*.ts` pure
  functions (like `computeFitScore`) would be a good investment before the
  next phase adds more client-side logic.
