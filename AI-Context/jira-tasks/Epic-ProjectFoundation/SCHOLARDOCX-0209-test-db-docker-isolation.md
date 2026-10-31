# SCHOLARDOCX-0209: Run backend tests against an isolated Docker Postgres instead of the production Supabase DB

Status: In Progress

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-08-06

## Summary

The backend pytest suite currently loads the repo-root `.env`, whose
`DATABASE_URL` points at the production Supabase database. Bring up a
throwaway Postgres + pgvector database in Docker and make the test suite use
it automatically, so tests never mutate production data.

## Business Context

Links:

- Business file: N/A (developer-safety / data-integrity task)

Business value:

- Eliminates the risk of a test run corrupting live user data. The conftest
  warning ("Do not point this at a production database") has been load-bearing
  until now — this makes the safe path the default.

## Functional Context

Links:

- Functional file: N/A (no user-visible behaviour change)

Requirements:

- N/A

## Technical Context

Links:

- [testing-strategy.md](../../technical/testing-strategy.md)
- [CODE_RULES.md](../../CODE_RULES.md)

Technical notes:

- Every DB access in the test layer flows through one env var:
  `DATABASE_URL` -> `settings.database_target` (`backend/app/core/config.py`).
  No code reads the DB URL any other way.
- `conftest.py` is the only place that loads `.env`, so preferring a
  `.env.test` (override=True) there propagates the Docker URL to every
  `Settings()` / `make_settings` / `initialize_database()` call with one line.
- The schema self-bootstraps: importing `app.main` triggers
  `initialize_database()` (idempotent `create_all` + seeds + `CREATE EXTENSION
  vector`), so a fresh empty Docker DB needs no manual setup.
- pgvector is required (`models.py` declares `Vector(1024)`), so the Docker
  image is `pgvector/pgvector:pg16`.

## Scope

In scope:

- `docker-compose.test.yml` — test-only Postgres + pgvector container.
- `.env.test` (local, gitignored) + `.env.test.example` (committed).
- `backend/tests/conftest.py` — prefer `.env.test` over `.env`.
- `Makefile` — `test-db-start`, `test-db-stop`, `test-db-reset` targets.
- Update `testing-strategy.md`.

Out of scope:

- No change to `config.py`, `connection.py`, any service, or any test file.
- No CI change (CI was removed in SCHOLARDOCX-0139).
- Frontend tests are unaffected (no DB).

## Acceptance Criteria

- `make test-db-start` brings up a healthy Postgres+pgvector container on port 5433.
- `make test-backend` runs the full suite against the Docker DB.
- The production Supabase database receives zero writes from a test run.

## Implementation Plan

- Add `docker-compose.test.yml` (pgvector/pgvector:pg16, port 5433,
  `max_connections=300` to survive pytest-xdist parallelism, healthcheck,
  named volume `test-db-data`).
- Add `.env.test` and `.env.test.example`.
- In `conftest.py`, after the `.env` load, load `.env.test` with
  `override=True` if it exists (backwards-compatible).
- Add Makefile targets.

## Unit Test Plan

Unit tests needed:

- No

If no unit tests are needed, explain why:

- This is infrastructure/config, not behaviour. The verification is running
  the existing suite against the new DB and confirming it is isolated from
  production.

## File Size Check

Files expected to be edited:

- `docker-compose.test.yml` (new)
- `.env.test`, `.env.test.example` (new)
- `backend/tests/conftest.py` (~8 lines added)
- `Makefile` (~30 lines added)
- `testing-strategy.md` (~section added)

Line-count risk:

- Low

## Verification Plan

- `make test-db-start` -> container healthy on 5433.
- `make test-backend` -> suite passes against the Docker DB.
- Prod Supabase untouched by construction (separate instance).

## Completion Notes

Changed files:

- `docker-compose.test.yml` (new) — test-only Postgres + pgvector container.
- `.env.test` (new, gitignored) + `.env.test.example` (new, committed).
- `backend/tests/conftest.py` — load `.env.test` with `override=True` when present.
- `Makefile` — `test-db-start` / `test-db-stop` / `test-db-reset` targets.
- `AI-Context/technical/testing-strategy.md` — documented the Docker test DB setup.

Verification completed:

- `docker compose -f docker-compose.test.yml config` validates (syntax OK).
- Makefile targets parse (`make -n test-db-start/stop/reset`).
- `.env.test` confirmed gitignored via `git check-ignore`.

Pending (blocked on user action):

- Runtime test (`make test-db-start` + `make test-backend`) could not run:
  the Docker daemon was not up. `open -a Docker` was issued and waited ~3.5
  min total, but the daemon did not register. Likely needs manual interaction
  in the Docker Desktop GUI (first-launch service agreement, login, or a
  macOS Keychain/permissions prompt). Once Docker Desktop shows the engine
  running, run `make test-db-start && make test-backend`.

Unit tests added or updated:

- None (infra change).

Follow-ups:

- Run `make test-db-start && make test-backend` once Docker Desktop is running
  to confirm the suite passes against the isolated DB.
- If a future containerised CI is reintroduced, the same `docker-compose.test.yml`
  can seed it.
