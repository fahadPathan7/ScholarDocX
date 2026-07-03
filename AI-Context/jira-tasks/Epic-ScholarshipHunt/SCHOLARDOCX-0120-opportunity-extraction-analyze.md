# SCHOLARDOCX-0120: Opportunity Extraction Service + Analyze Action (Phase 1)

Status: Done

Owner: AI Agent

Epic: Epic-ScholarshipHunt

Created: 2026-07-03

## Summary

Add a per-card "Analyze" action that runs one structured AI extraction call
over a Scholarship Hunt result (or catalog "Check current cycle" result),
producing a `scholarship_opportunities` row with per-field confidence and no
invented fields.

## Business Context

Links:

- Business file: [decisions.md](../../business/decisions.md) (BD-010)

Business value:

Turns raw links into answers (eligibility, funding, deadline, requirements)
without the user opening every page — the planbook's core value proposition.

## Functional Context

Links:

- Functional file: [feature-scholarship-news.md](../../functional/feature-scholarship-news.md)

Requirements:

- FR-8.34: Analyze produces a structured opportunity with per-field
  confidence; unsupported fields stay empty.
- FR-8.35: Analyze gated by `can_use_scholarship_analyze` role limit + AI
  token economy; no separate count limit.

## Technical Context

Links:

- Technical file: [ai-token-economy.md](../../technical/ai-token-economy.md),
  [security-privacy.md](../../technical/security-privacy.md)

Technical notes:

- `backend/app/db/models.py`: new `ScholarshipOpportunity` model (see
  SCHOLARDOCX-0119/0121 for shared table wiring — created once here since
  this is the first story that needs it).
- `backend/app/services/scholarship_extraction.py` (new): mirrors
  `news_query_generator.py`'s `ScholarshipQueryGenerator` shape — GLM-first
  via `AiService.set_billing()`, OpenRouter Free fallback on failure, one
  `json_object`-contract call per Analyze. Input: card URL/title/snippet
  only (no private data — see security-privacy.md addition). Output schema:
  name, sponsor, degree_levels, destination_countries,
  eligible_nationalities, funding coverage, deadline(s), requirements,
  application_url, per-field confidence.
- `can_use_scholarship_analyze` role limit: new boolean, 5-site registration
  mirroring `can_use_scholarship_hunt` (`schema.py`, `connection.py` ×2,
  `services/admin.py`, `canonical_features` set) — see
  ai-token-economy.md for the billing rationale (no new count-limit key).
- Dedupe key: canonical name (casefolded) + normalized URL — upsert, not
  duplicate insert.

## Scope

In scope:

- `ScholarshipOpportunity` model, table registration (`USER_SCOPED_TABLES`,
  `MODEL_MAP`, `TABLE_COLUMNS`, generic CRUD list entry).
- `scholarship_extraction.py` service.
- `POST /scholarship-opportunities/analyze` endpoint.
- `can_use_scholarship_analyze` role limit, all 5 sites.
- "Analyze" button on `NewsCard.tsx` + `OpportunityCard.tsx` analyzed-state
  rendering.

Out of scope:

- Opportunity Library list view and bookmark migration (SCHOLARDOCX-0121).
- Add-to-tracker (SCHOLARDOCX-0121).

## Acceptance Criteria

- Analyzing a card with a clearly-stated deadline/funding/eligibility
  produces those fields with confidence scores.
- Analyzing a card that omits a field (e.g. no explicit amount) leaves that
  field empty — never a fabricated value.
- Analyze charges AI tokens exactly once per click, gated first by
  `can_use_scholarship_analyze` (403 with the standard styled alert when the
  plan doesn't have it) then by token balance (402 → out-of-tokens modal).
- Re-analyzing the same URL updates the existing row instead of creating a
  duplicate.
- GLM failure/unavailability falls back to OpenRouter Free without a second
  charge attempt from the failed call.

## Implementation Plan

- Add the model + table wiring.
- Build `scholarship_extraction.py` with a strict JSON schema prompt and
  "leave null if unsupported" instruction.
- Add the role limit at all 5 sites.
- Add the `/analyze` endpoint with upsert logic.
- Frontend: `OpportunityCard.tsx` (split from `NewsCard.tsx`), Analyze button
  + loading/error states, `accessErrors.ts` FEATURE_LABELS entry for
  `can_use_scholarship_analyze`.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `backend/tests/test_scholarship_extraction.py`: mocked-provider schema
  validation, missing-field-stays-null assertion, dedupe/upsert behavior,
  GLM-failure → OpenRouter-fallback path.
- `backend/tests/test_scholarship_opportunities.py`: `can_use_scholarship_analyze`
  gate (403 when off), token charge-exactly-once, 402 on empty balance.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `backend/app/db/models.py` (976 lines currently — adding one model class
  stays well under 1000)
- `backend/app/db/connection.py`
- `backend/app/db/schema.py`
- `backend/app/services/store.py`
- `backend/app/services/admin.py`
- `backend/app/services/scholarship_extraction.py` (new)
- `backend/app/api/scholarship_opportunities.py` (new)
- `frontend/src/components/news/NewsCard.tsx`
- `frontend/src/components/news/OpportunityCard.tsx` (new)
- `frontend/src/lib/accessErrors.ts`

Line-count risk:

- Low. Re-check `models.py` and `store.py` line counts after this change; if
  either crosses 1000, note it in Completion Notes per CODE_RULES.md rather
  than splitting mid-feature.

If any file exceeds 1000 lines, explain why.

- (filled in after implementation if applicable)

## Verification Plan

- `cd backend && .venv/bin/pytest tests/test_scholarship_extraction.py
  tests/test_scholarship_opportunities.py -q`
- `cd frontend && npm run build`
- Manual: Analyze a real Hunt card, confirm structured fields render, confirm
  token balance decrements by exactly one call's worth.

## Completion Notes

Changed files:

- `backend/app/db/models.py` — new `ScholarshipOpportunities` model +
  `Users.scholarship_opportunities` relationship.
- `backend/app/db/connection.py` — `USER_SCOPED_TABLES` entry,
  `can_use_scholarship_analyze` 4-tier seed block, `free_user_defaults`
  entry, `canonical_features` entry.
- `backend/app/db/schema.py` — `can_use_scholarship_analyze` seeded for all
  4 user tiers (free/general=0, pro/max=1).
- `backend/app/services/admin.py` — `can_use_scholarship_analyze` added to
  `DEFAULT_ROLE_LIMITS` at all 5 existing `can_use_scholarship_hunt` sites
  (including the pre-existing duplicate `free_user` dict key).
- `backend/app/services/store.py` — `MODEL_MAP`/`TABLE_COLUMNS`/
  `DEFAULT_SORT` entries for `scholarship_opportunities`.
- `backend/app/services/scholarship_extraction.py` (new) — GLM-first via
  `AiService` billing, OpenRouter Free fallback, never invents missing
  fields.
- `backend/app/api/scholarship_opportunities.py` (new) — `POST
  /scholarship-opportunities/analyze` with upsert-by-normalized-URL.
- `frontend/src/components/news/OpportunityCard.tsx` (new).
- `frontend/src/components/news/NewsCard.tsx` — Analyze button + inline
  analyzed rendering.
- `frontend/src/components/news/NewsFeed.tsx` — threaded `onAnalyze`/
  `analyzingUrl`/`opportunitiesByUrl` props.
- `frontend/src/lib/accessErrors.ts` — `can_use_scholarship_analyze` /
  `can_use_scholarship_hunt` FEATURE_LABELS entries.

Verification completed:

- `cd backend && .venv/bin/pytest tests/test_scholarship_extraction.py
  tests/test_scholarship_opportunities.py -q`: 15 passed.
- `cd backend && .venv/bin/pytest tests/ -q --deselect tests/test_ai.py`:
  229 passed / 1 failed / 10 errors — all pre-existing `test_api_auth.py`/
  `test_api_auth_usage.py` "database is locked" failures against the shared
  dev DB, confirmed pre-existing by reproducing the identical hang on
  unmodified `main` (via a temporary `git stash`, immediately restored with
  `git stash pop`). Unrelated to this change.
- `cd frontend && npm run build`: passed.
- Live authenticated browser check with real provider keys (Playwright,
  isolated workspace, `max_user` test account): ran a real Master's-level
  Scholarship Hunt search (12 live Tavily results), clicked Analyze on a
  real result. Extraction correctly populated name ("Research Grants
  Program 2026"), sponsor ("Society for Theatre Research"), and deadline
  (2026-03-18, labeled "Application deadline") from the page text, and left
  funding coverage `null` — the source page didn't state an amount, so
  nothing was fabricated. Confirmed via direct `curl` call that the
  no-provider-configured path also returns an empty (never-fabricated)
  result. Zero console errors.

Unit tests added or updated:

- `backend/tests/test_scholarship_extraction.py` (new, 6 tests).
- `backend/tests/test_scholarship_opportunities.py` (new, 9 tests, shared
  with SCHOLARDOCX-0121 scope).

Follow-ups:

- None outstanding for this story; see Epic README for Phase 3-5 backlog.
