# SCHOLARDOCX-0137: Enhance rate limiting + admin Info tab

Status: Done

Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-07-12

## Summary

Extract the four existing inline IP rate limiters in `auth.py` into a shared, thread-safe `RateLimit` module; extend coverage to currently-unprotected expensive endpoints (contact-admin, AI chat/research/summarize, scholarship deep hunt, advisor atlas, news search/preview); add a new read-only "Info" admin tab that lists all active rate limits; introduce an `admin_view_info` permission enabled by default for both admin roles.

## Business Context

Links:

- Business file: n/a (security/infra hardening)

Business value:

- The app previously throttled only 4 auth endpoints and left every expensive, AI/Tavily-billing route (deep hunt, advisor atlas, news search, AI chat) unprotected against rapid repeated calls. A misbehaving or malicious client could exhaust API quotas / tokens before any plan-tier guard ran.
- Centralizing the limiter removes 4 copies of the same inline pattern, fixes a latent bug (`/auth/register` never recorded attempts, so its limit never fired), and makes the policy visible/auditable from the admin panel.

## Functional Context

Links:

- Functional file: AI-Context/functional/ (auth/admin)

Requirements:

- Existing 4 auth rate limits keep identical user-facing behavior (messages, windows, 429 vs. silent generic response for forgot-password).
- New limits must sit *before* any token/DB spend so they fast-fail.
- Admins must be able to view all configured rate limits from the panel; the new tab is gated by a permission toggleable in Role Limits.

## Technical Context

Links:

- Technical file: AI-Context/technical/security-privacy.md (rate limiting), AI-Context/technical/api-boundaries.md (admin endpoints)
- Source: backend/app/api/auth.py (existing 4 inline limiters, lines 22-36, 84-89, 174-179, 346-351, 416-424)
- Router mount: backend/app/main.py (create_app)
- Admin router: backend/app/api/admin.py (require_feature, prefix /admin)
- Admin panel: frontend/src/components/AdminView.tsx (tabs.push pattern lines 711-752)
- Role catalog: frontend/src/components/admin/RoleLimitsTab.tsx (adminFeatureGroups lines 238-303)

Technical notes:

- Existing 4 limiters use module-global `defaultdict(list)` keyed by IP with no locking. They run on Starlette's sync threadpool, so a `threading.Lock` is sufficient for atomicity.
- **Latent bug:** `register` prunes + checks but never appends — limit cannot trigger. Fixed by switching it to the new `check_and_record` helper.
- `forgot-password` deliberately returns the same generic 200 in every branch to avoid email enumeration; the refactor preserves this (records silently, never raises 429).
- Authenticated expensive endpoints key on user id, not IP (more accurate for a local multi-user install); unauthenticated `contact-admin` keys on IP.
- New admin permission `admin_view_info` must be added to all 4 seed sources or startup `canonical_features` cleanup deletes it: `db/connection.py` (canonical set + admin_permission_defaults), `db/schema.py` SEED_SQL, `services/admin.py` DEFAULT_ROLE_LIMITS, plus the frontend label catalog.

## Scope

In scope:

- New module `backend/app/auth/rate_limit.py` with `RateLimiter` (check / record / check_and_record / catalog) + rule registry.
- Refactor `backend/app/api/auth.py` to use it.
- Add rate limits to: `POST /auth/contact-admin`, `POST /ai/chat`, `POST /ai/research`, `POST /ai/summarize`, `POST /scholarship-deep-hunt/runs`, `POST /advisor-atlas/runs`, `POST /news/search`, `POST /news/query-preview`.
- Wave 2 coverage expansion: `POST /ai/actions/plan`, `POST /ai/actions/execute`, `POST /scholarship-opportunities/analyze`, `POST /scholarship-catalog/{id}/check-cycle`, `POST /advisor-atlas/candidates/{id}/refresh`, `POST /files/upload`, `POST /auth/me/password` (record-on-failure brute-force lockout).
- New permission `admin_view_info` (default ON for both admin roles).
- New endpoint `GET /admin/info/rate-limits`.
- New frontend tab `InfoTab.tsx` + AdminView wiring + RoleLimitsTab label + accessErrors label.

Out of scope:

- Persisted/tunable rate-limit values (read-only Info tab; values stay backend constants).
- Global per-route middleware limiter.
- Proxy `X-Forwarded-For` handling (separate hardening task).

## Acceptance Criteria

- The 4 existing auth rate limits behave exactly as before (same thresholds, windows, messages).
- `/auth/register` now actually records attempts and trips after 5 in 5 minutes (bug fix).
- The 8 newly-protected endpoints reject rapid over-calls with 429 before doing work.
- `GET /admin/info/rate-limits` returns the full catalog and is gated by `admin_view_info`.
- `admin_view_info` defaults to ON for both `general_admin` and `super_admin` on fresh and existing DBs.
- An admin with `admin_view_info` off cannot see the Info tab.
- `pytest backend/tests/test_rate_limit.py` passes; `npm run build` succeeds.

## Implementation Plan

- [x] Create `backend/app/auth/rate_limit.py` (registry + `RateLimiter` + `client_ip_from_request`).
- [x] Refactor `backend/app/api/auth.py` to use the module (fix register bug).
- [x] Wire `check_and_record` into the 8 endpoints.
- [x] Add `admin_view_info` to the 4 seed sources + new `/admin/info/rate-limits` endpoint.
- [x] Frontend `InfoTab.tsx`, AdminView wiring, RoleLimitsTab label, accessErrors label.
- [x] Unit tests `backend/tests/test_rate_limit.py`.

## Unit Test Plan

Unit tests needed:

- Yes.

Cases:

- `check()` raises 429 at threshold, passes below.
- `record()` appends; window pruning expires old timestamps.
- `check_and_record()` is atomic and trips after max+1 calls.
- Different identities have independent buckets.
- `catalog()` returns all rule metadata.

## File Size Check

Files expected to be edited:

- backend/app/auth/rate_limit.py (new, ~130 lines)
- backend/app/api/auth.py (~870 lines → slightly smaller; under 1000)
- backend/app/api/admin.py (~366 → ~380)
- backend/app/api/routes.py, advisor_atlas.py, scholarship_deep_hunt.py, news.py (small additions)
- backend/app/db/connection.py, schema.py, services/admin.py (small additions)
- frontend/src/components/admin/InfoTab.tsx (new, ~110 lines)
- frontend/src/components/AdminView.tsx (~874 → ~885)

Line-count risk: Low. All files remain under the 1000-line target.

## Verification Plan

- `pytest backend/tests/test_rate_limit.py backend/tests/test_api_auth.py backend/tests/test_api_admin.py` passes.
- `cd frontend && npm run build` succeeds.
- Manual: super_admin sees Info tab and the full rate-limit table; toggle `admin_view_info` off for general_admin → tab disappears for that role.

## Completion Notes

Changed files:

Backend (new):
- `backend/app/auth/rate_limit.py` — central `RATE_LIMIT_RULES` registry (12 rules: the 4 original auth limits + 8 new) + thread-safe `RateLimiter` (`check` / `record` / `check_and_record` / `catalog` / `reset`) + `client_ip_from_request` / `user_identity` helpers + module-level `rate_limiter` singleton.
- `backend/tests/test_rate_limit.py` — 16 unit tests covering threshold checks, atomic check+record, independent identities, window pruning, catalog shape, registry completeness, and helper formatting.

Backend (edited):
- `backend/app/api/auth.py` — replaced 4 inline `defaultdict` limiters with calls into the shared module. Preserved exact behavior: login (check → record on failure only), register (switched to `check_and_record`, **fixing the latent bug** where it never recorded), invite-request (check → record on success), forgot-password (check+record swallowed into generic 200, preserving anti-enumeration). Added contact-admin limit (3/30min/IP). Removed unused `time`/`defaultdict` imports and the old constants/globals.
- `backend/app/api/routes.py` — added `rate_limiter`/`user_identity` imports; wired `check_and_record` into `/ai/chat` (20/min), `/ai/research` (10/min), `/ai/summarize` (10/min), all keyed on user id, sitting before the existing token/plan checks.
- `backend/app/api/advisor_atlas.py` — wired `advisor_atlas_run` (5/10min/user) before plan gate.
- `backend/app/api/scholarship_deep_hunt.py` — wired `scholarship_deep_hunt_run` (5/10min/user) before plan gate.
- `backend/app/api/news.py` — wired `news_search` (10/min) and `news_query_preview` (20/min), keyed on user id.
- `backend/app/api/admin.py` — added `GET /admin/info/rate-limits` endpoint, gated by `require_feature("admin_view_info", ...)`.
- `backend/app/db/connection.py` — added `admin_view_info` to `canonical_features` (critical — prevents startup cleanup from deleting it) and to `admin_permission_defaults` (backfills existing DBs; default ON for both admin roles).
- `backend/app/db/schema.py` — added `admin_view_info` rows (default ON) to SEED_SQL for fresh DBs.
- `backend/app/services/admin.py` — added `admin_view_info` (default ON) to `DEFAULT_ROLE_LIMITS` for both admin roles so "Reset to defaults" includes it.
- `backend/tests/conftest.py` — added an autouse `_reset_rate_limiter` fixture so the in-memory singleton doesn't accumulate attempts across tests (necessary now that login/register actually enforce).
- `backend/tests/test_forgot_password.py` — updated import from the removed `_password_reset_attempts` global to `rate_limiter.reset()`.

Frontend (new):
- `frontend/src/components/admin/InfoTab.tsx` — read-only tab that fetches `GET /admin/info/rate-limits` and renders a table (Endpoint, Method, Path, Limit, Window, Scope) matching the InvitesTab styling.

Frontend (edited):
- `frontend/src/components/AdminView.tsx` — added `InfoTab` import, `admin_view_info: true` optimistic default, tab push (gated by `admin_view_info`), and conditional render.
- `frontend/src/components/admin/RoleLimitsTab.tsx` — added an "Info" group to `adminFeatureGroups` with the `admin_view_info` label/description.
- `frontend/src/lib/accessErrors.ts` — added a friendly label for `admin_view_info`.

Context (edited):
- `AI-Context/technical/security-privacy.md` — added a "Rate Limiting (SCHOLARDOCX-0137)" subsection documenting the registry, the three enforcement patterns, identity scoping, ordering relative to plan checks, the Info endpoint, in-memory limitations, and the register bug fix.
- `AI-Context/technical/api-boundaries.md` — documented `GET /admin/info/rate-limits` (shape, gating, data source) and linked to the security-privacy rate-limiting section.

Verification completed:
- `pytest` (affected suites: test_rate_limit, test_api_auth, test_api_admin, test_forgot_password, test_api_auth_usage, test_advisor_atlas_limits, test_news_feedback, test_scholarship_deep_hunt, test_advisor_atlas, test_ai, test_ai_actions, test_ai_tokens, test_news_service) → 157 passed.
- `npm run build` → built successfully (only pre-existing chunk-size/dynamic-import warnings, unrelated to this change).

Unit tests added or updated:
- `backend/tests/test_rate_limit.py` (16 new tests).
- `backend/tests/test_forgot_password.py` updated for the new module API.
- `backend/tests/conftest.py` autouse fixture for limiter isolation.

Wave 2 (additional rate-limit coverage):
- Added 7 rules to `RATE_LIMIT_RULES` and wired `check_and_record` (or check + record-on-failure for password change) into: `POST /ai/actions/plan` (20/min), `POST /ai/actions/execute` (10/min), `POST /scholarship-opportunities/analyze` (10/min), `POST /scholarship-catalog/{id}/check-cycle` (10/min), `POST /advisor-atlas/candidates/{id}/refresh` (5/10min), `POST /files/upload` (30/min), `POST /auth/me/password` (5/5min, record-on-failure brute-force lockout mirroring login).
- `test_rate_limit.py` updated with a wave-2 assertion for the 7 new keys.
- Wave-2 verification: 153 passed across the affected suites (test_rate_limit + all touched modules).

Follow-ups:
- Persisted/tunable rate limits (settings table) if admins need to change values live.
- `X-Forwarded-For` handling if the app is ever served behind a reverse proxy.
- Global per-route middleware cap for defense-in-depth.
- `services/admin.py` `DEFAULT_ROLE_LIMITS` is still missing a few pre-existing keys (`admin_manage_invite_requests`, `admin_manage_role_limits`, `admin_manage_notification_texts`, `admin_manage_settings`) — out of scope here, but "Reset to defaults" would drop those; worth a separate cleanup task.

## Follow-ups

- Consider persisted/tunable rate limits (settings table) if admins need to change values live.
- Consider `X-Forwarded-For` handling if the app is ever served behind a reverse proxy.
- Consider a global per-route middleware cap for defense-in-depth.
