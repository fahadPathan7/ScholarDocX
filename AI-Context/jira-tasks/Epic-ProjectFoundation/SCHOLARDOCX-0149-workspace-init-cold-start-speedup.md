# SCHOLARDOCX-0149: Workspace Init Cold-Start Speedup

Status: Done

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-07-18

## Summary

Eliminate the double `initialize_database()` run on every cold start of `POST /api/workspace/init` by routing the boot-time init through the shared `ensure_db_initialized()` memo, and batch the per-row seed INSERTs (`role_limits`, AI models, token packs) into single round-trips. Cuts cold-start DB work from ~320 sequential Postgres round-trips to ~6.

## Business Context

Links:

- Business file: AI-Context/business/product-overview.md

Business value:

- Faster first page-load after a server spin-down (Render free tier sleeps idle), directly improving the first-impression UX and reducing drop-off during the critical app-entry moment.

## Functional Context

Links:

- Functional file: AI-Context/technical/api-boundaries.md

Requirements:

- FR-1: `POST /api/workspace/init` returns the workspace status dict unchanged — no contract change.
- FR-2: Dashboard reads (`get_store`) continue to find the schema already initialized; no behavioral regression on repeated refreshes.

## Technical Context

Links:

- Technical file: AI-Context/technical/api-boundaries.md
- Related: SCHOLARDOCX-0139 (Supabase migration), SCHOLARDOCX-0146 (login response speedup — added the memo flag for within-session calls but missed the boot path).

Technical notes — root cause:

- On every cold start, `initialize_database()` runs **twice**:
  1. **Boot** — `main.py:53` → `create_app()` → `main.py:22` calls `initialize_database(settings.database_target)` directly. This runs 50 `CREATE TABLE`s + ~160 seed INSERTs but **never sets the `_db_initialized` flag** (it bypasses `ensure_db_initialized()`).
  2. **First request** — the global auth dep `get_current_user` → `get_store` → `ensure_db_initialized()` sees the flag still `False` and re-runs the **entire** `initialize_database()`.
- Contributing factor: `_seed_role_limits` (`connection.py:130`) and `_seed_ai_token_defaults` (`connection.py:171`) loop `conn.execute(stmt, single_dict)` per row instead of batching, so even one pass is ~160 round-trips.

Fix:

- `main.py`: call `ensure_db_initialized(settings)` at boot so the memo flag is set and the first request's `get_store` is a no-op.
- `connection.py`: batch both seed loops into one `conn.execute(stmt, [dict, ...])` per table (psycopg3 `executemany` semantics, `ON CONFLICT DO NOTHING` preserved).
- `dependencies.py`: guard the flag with a `threading.Lock` so a concurrent cold-start burst cannot both run DDL (pattern already used in `app/auth/rate_limit.py:301`).

## Scope

In scope:

- `backend/app/main.py` — boot init goes through `ensure_db_initialized`.
- `backend/app/api/dependencies.py` — thread-safe `_db_initialized` flag.
- `backend/app/db/connection.py` — batch `_seed_role_limits` and `_seed_ai_token_defaults`.
- Unit test asserting batched seeders match per-row row counts + idempotency of `ensure_db_initialized`.
- `AI-Context/technical/api-boundaries.md` — document the boot-init-via-memo rule.

Out of scope:

- Per-request `get_current_user` user re-SELECT caching (noted as follow-up in SCHOLARDOCX-0146).
- `dashboard_summary` 10-COUNT consolidation (follow-up in SCHOLARDOCX-0146).
- Frontend changes (endpoint contract unchanged).

## Acceptance Criteria

- AC-1: After boot, the `_db_initialized` flag is `True` so `get_store`/`/workspace/init` do not re-run `initialize_database` on the first request.
- AC-2: `_seed_role_limits` issues exactly one batched INSERT (not one per role/feature row) while still seeding all 139+ rows.
- AC-3: `_seed_ai_token_defaults` issues one batched INSERT for AI models and one for token packs.
- AC-4: Admin-customized `role_limits` and edited `ai_models` pricing are preserved (`ON CONFLICT DO NOTHING` intact).
- AC-5: `pytest backend/tests/smoke/test_postgres_foundation.py` and `pytest backend/tests/regression/test_api_auth.py` stay green.
- AC-6: No infrastructure service names (Supabase/Render/Postgres) appear in user-facing UI copy.

## Implementation Plan

1. `dependencies.py`: add `threading.Lock` around the `_db_initialized` check-and-set.
2. `main.py`: replace the direct `initialize_database(...)` call with `ensure_db_initialized(settings)`.
3. `connection.py`: flatten `DEFAULT_ROLE_LIMITS` to a param-dict list; collect AI-model rows and token-pack rows; single batched `conn.execute` per table.
4. Add unit test `tests/unit/test_seed_batching.py`.
5. Update `api-boundaries.md`; mark this task Done.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `test_seed_role_limits_inserts_all_rows`: after `_seed_role_limits`, row count of `role_limits` equals the total number of (role, feature) tuples in `DEFAULT_ROLE_LIMITS` (on a fresh table).
- `test_seed_ai_token_defaults_inserts_all_rows`: `ai_models` count == sum of provider model list lengths; `ai_token_packs` count == 4.
- `test_seed_is_idempotent`: running a seeder twice does not change row counts (`ON CONFLICT DO NOTHING`).
- `test_ensure_db_initialized_is_idempotent`: second call does not re-invoke `initialize_database` (mock-asserted).

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `backend/app/main.py` (~53 lines)
- `backend/app/api/dependencies.py` (~28 lines)
- `backend/app/db/connection.py` (~259 lines)
- `backend/tests/unit/test_seed_batching.py` (new)

Line-count risk:

- Low — all well under the 1000-line limit.

## Verification Plan

- `pytest backend/tests/smoke/test_postgres_foundation.py -v` (requires DATABASE_URL).
- `pytest backend/tests/regression/test_api_auth.py -v`.
- `pytest backend/tests/unit/test_seed_batching.py -v`.
- Manual: confirm `/api/workspace/init` no longer re-runs DDL on the first post-boot request.

## Completion Notes

Changed files:

- `backend/app/main.py` — `create_app()` now calls `ensure_db_initialized(settings)` instead of `initialize_database(...)` directly, so the `_db_initialized` memo flag is set at boot and the first request no longer re-runs DDL + seeding.
- `backend/app/api/dependencies.py` — `_db_initialized` flag now guarded by a module-level `threading.Lock` with double-checked locking; fast-path returns when already initialized.
- `backend/app/db/connection.py` — `_seed_role_limits` and `_seed_ai_token_defaults` converted from per-row `conn.execute` loops to single batched `conn.execute(stmt, rows)` calls (psycopg3 executemany semantics; `ON CONFLICT DO NOTHING` preserved per-row). ~160 round-trips → ~3 per init pass.
- `backend/tests/unit/test_seed_batching.py` (new) — 7 tests: memo idempotency, thread-safety under contention, and DB-backed row-count + idempotency checks for both seeders.
- `AI-Context/technical/api-boundaries.md` — documented the boot-init-via-`ensure_db_initialized` rule and the batched-seed requirement.

Verification completed:

- `pytest tests/unit/test_seed_batching.py -v` → 7 passed (includes DB-backed idempotency + row-count assertions against the live Supabase Postgres).
- `pytest tests/regression/test_api_auth.py tests/smoke/test_postgres_foundation.py -v` → 15 passed, 1 pre-existing failure.
  - The one failure (`test_seed_inserts_defaults`) asserts `users` count == 0 but finds the real `fahadpathan56@gmail.com` Super Admin account created via `scripts/create_superadmin.py`. This is pre-existing DB pollution, identical to the failure documented in SCHOLARDOCX-0146's completion notes, and unrelated to this change — the seeders touch only `role_limits`, `ai_models`, `ai_token_packs`, `app_settings`, `degree_workspaces` (never `users`; see `schema.py:12-17`).
- `python -c "import app.main"` → boots cleanly, no circular-import regression from the new `main.py` → `app.api.dependencies` import.

Unit tests added or updated:

- `backend/tests/unit/test_seed_batching.py` (new file, 7 tests).

Follow-ups:

- Per-request user re-SELECT caching in `get_current_user` (from SCHOLARDOCX-0146) — the next dominant cost on warm requests.
- `dashboard_summary` 10-COUNT consolidation (from SCHOLARDOCX-0146).
- The pre-existing `test_seed_inserts_defaults` failure (real user in shared test DB) should be addressed by isolating that test or cleaning the account — tracked separately, not in scope here.
