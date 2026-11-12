# Testing Strategy

Goal: protect user data, workflow correctness, and the AI/billing boundaries.

## Rules

- Add or update tests when a feature introduces business logic, data transformation, validation, persistence, API boundary behaviour, provider or integration boundaries, or file/storage behaviour. If none is needed, the Jira task says why.
- Every Jira task lists planned and actual verification, and the tests added, updated, or intentionally skipped with the reason.
- **Never execute tests on your own initiative.** Writing and updating tests after feature work is mandatory; running them (`pytest`, `npm test`, `make test`, `make check`) only happens when the user explicitly asks in that session ([CODE_RULES.md](../CODE_RULES.md) Testing Rules).
- Backend tests mutate the database. Never permanently mutate shared or global state for a test; prefer `monkeypatch` over real writes to shared rows such as `app_settings` (see CODE_RULES.md).

## Priority areas

Workspace and database initialization; schema and migrations; path validation and file storage; per-user isolation and role limits; project/sheet persistence and dashboard aggregation; billing and credit enforcement; AI provider boundary behaviour; authentication (email/password, invite codes, Google callback and account linking).

## Backend

Tests live in `backend/tests/`: `smoke/` (core-path boot checks), `regression/` (guards against known past bugs: security bypasses, IDOR, billing), and `unit/` (service, API, and persistence logic, the bulk). Shared fixtures and helpers are in `conftest.py` and `helpers.py`.

- **Isolated test database.** The suite reads `DATABASE_URL` from the repo-root `.env`, which would point at the real database, so run it against a throwaway Docker Postgres (SCHOLARDOCX-0209): `make test-db-start` (Postgres + pgvector on `localhost:5433`, copies `.env.test.example` to `.env.test` on first run), `make test-backend`, `make test-db-stop`, `make test-db-reset`. `conftest.py` loads `.env` then `.env.test` with `override=True`, so everything downstream follows the single `settings.database_target` chokepoint; the schema creates itself on first import. `.env.test` is gitignored; without it the suite falls back to `.env`, so never run it that way against real data.
- **Fixtures and ORM hygiene**: `cleanup_user_records` in `tests/helpers.py` commits after deleting dependent FK rows; tests mixing raw SQL writes with ORM queries call `store.db.expire_all()`; fixtures that seed `AppSettings` set every product key explicitly.
- **Parallelism**: `pytest.ini` runs `-n auto --dist loadscope` (one module per worker, modules in parallel), so two files touching the same global row can race; keep global-state tests on `monkeypatch`.
- **Connected apps (SCHOLARDOCX-0258)**: `unit/test_connected_apps_keys.py` (keys, role gate, caps), `unit/test_mcp_endpoint.py` (gateway, tool schemas, allow-list, credential separation, no outbound provider call), `unit/test_connected_app_suggestions.py` (lifecycle). The MCP tests that need no database stub only the DB-touching calls; a mounted MCP server must run inside `with TestClient(app)` so its lifespan starts.
- **Markers** (`--strict-markers`): `smoke` (fast core path; tag a feature's happy-path test), `regression` (tag the test for every fixed bug), `slow` (network-heavy). A test in `smoke/` or `regression/` carries the matching marker, so a category runs by folder or by marker.
- What to cover: startup configuration, workspace and storage behaviour, database operations, service logic, file path safety, missing-key behaviour, mocked provider failures, and the Google callback and linking paths.

## Frontend

Unit tests run with vitest (`npm test` in `frontend/`). There is no DOM test environment, so logic is extracted into plain modules that live next to their feature (for example `components/sheet/__tests__/`, `lib/__tests__/`, `lib/games/`, `lib/stickyNotes.ts`) and are tested there; components only render and handle input. Date-sensitive logic is tested under several timezones (UTC, Asia/Dhaka, US/Hawaii).

## Static guards

`make guards` runs `guard-billing` (every provider call charges the user), `guard-context` (living context references real code), and `guard-css` (three sheet and sticky-note CSS regressions). They are instant and cover failure modes review keeps missing.

## Manual verification (UI work)

Run the dev servers, open the app in a browser, and check the changed screens at desktop and phone widths (about 1280x600, 1440x800, 390x700): no clipped or overlapping content, key workflows usable, modals inside the work surface. Dashboard, forms and validation, empty and error states, and AI confirmation and response display are checked by hand until a DOM test environment exists.

## Gate

There is no CI: GitHub Actions has only scheduled maintenance jobs, and Render auto-deploys every push to `main` regardless of tests. `make check` (backend tests, frontend tests, frontend build) is the local gate; `make test` skips the build; `make smoke`, `make regression`, and `make test-fast` are quick subsets, not a substitute. As with all test execution, run them only when the user asks; otherwise remind the user to run `make check` before pushing.
