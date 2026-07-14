# Testing Strategy

## Testing Goals

Protect local data, workflow correctness, and AI integration boundaries.

## Feature Testing Rule

Every feature should add or update unit tests when it introduces:

- Business logic
- Data transformation
- Validation
- Persistence logic
- API boundary behavior
- Provider or integration boundaries
- File system behavior

If unit tests are not needed, the Jira task must explain why.

## Priority Areas

1. Workspace initialization.
2. SQLite schema and migrations.
3. Path validation and file storage.
4. Application hierarchy and dashboard aggregation.
5. Document versioning.
6. Outreach reminders.
7. AI provider boundary behavior.
8. Optional authentication and identity behavior.

## Backend Testing

Test:

- Startup configuration.
- Workspace folder creation.
- Database operations.
- Service logic.
- File path safety.
- Missing API key behavior.
- Mocked GLM and Tavily failures.
- Optional Google OAuth callback and local profile linking if auth is implemented.

### Test folder organization

Backend tests live in `backend/tests/` organized into three category folders:

```
backend/tests/
├── conftest.py          # autouse fixtures + sys.path setup (stays at root)
├── helpers.py           # shared test helpers (make_settings, make_user, etc.)
├── smoke/               # core-path boot checks (workspace, DB seeding, auth basics)
├── regression/          # guards against known past bugs (security bypasses, IDOR)
└── unit/                # service/API/persistence logic (the bulk of the suite)
```

**Folder = category; marker = runnable subset.** They stay in sync: a test in
`smoke/` should carry `@pytest.mark.smoke`, a test in `regression/` should
carry `@pytest.mark.regression`. This lets you run a category by folder OR by
marker:

```bash
.venv/bin/pytest tests/smoke/       # by folder
.venv/bin/pytest -m smoke           # by marker (same result)
```

When adding a new test file, place it in the folder matching its purpose and
tag its tests with the corresponding marker.

MVP command:

```bash
cd backend
.venv/bin/pytest
```

## Frontend Testing

Unit tests run with vitest (introduced in SCHOLARDOCX-0118, dev-only):

```bash
cd frontend
npm test
```

Pure logic modules (no DOM needed) live next to their feature in
`__tests__/` folders — e.g. `src/components/sheet/__tests__/` covers sort
comparators, filter predicates, TSV/CSV parsing, and undo/redo history.
Extract logic out of components/hooks into plain modules so it stays
testable without a DOM environment.

Also test (manually until a DOM test environment is added):

- Dashboard rendering.
- Forms and validation.
- Empty states.
- Error states.
- Document editor save flow.
- Email draft generation flow.
- AI confirmation and response display.

## Manual Verification

For UI tasks:

- Start local dev server.
- Open the app in browser.
- Verify desktop and mobile layouts when relevant.
- Confirm no text overlaps and key workflows are usable.

## Regression Gate

A regression gate runs both suites and fails the build on any regression, so a
broken change cannot land silently.

### CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **Backend job**: installs requirements, runs `pytest` against an ephemeral
  workspace (`SCHOLARDOCX_WORKSPACE` pointed at `${{ runner.temp }}`), so tests
  never touch the repo's `workspace/`. No secrets needed — provider and
  key-missing paths are mocked.
- **Frontend job**: `npm ci`, `npm run build` (tsc + vite), and `npm test`
  (vitest).

Both jobs must be green for a PR to merge.

### Local gate

`make check` reproduces what CI runs, and `make test` runs both test suites
without the (slower) frontend build:

```bash
make check       # backend tests + frontend tests + frontend build  (matches CI)
make test        # backend tests + frontend tests (no build)
make test-backend  # backend only
make test-frontend # frontend only
```

Before pushing, run `make check` locally — a green `make check` means CI will
be green.

### Fast feedback: smoke and regression subsets

For a quick sanity check during development, run the tagged subsets instead of
the full suite:

```bash
make smoke       # ~7 core-path tests in ~1s (workspace, persistence, path safety, auth basics)
make regression  # the 5 regression-guarded tests (auth register/login, JWT forgery, IDOR scoping)
make test-fast   # full backend suite excluding any @pytest.mark.slow tests
```

These are **subsets, not a substitute for the gate**. Always run `make check`
before pushing; the smoke/regression targets are for local iteration speed.

### Test markers

Backend tests support markers registered in `backend/pytest.ini`
(`--strict-markers` is on, so typos are caught):

- `@pytest.mark.smoke` — fast core-path tests safe to run on every change.
- `@pytest.mark.regression` — guards against a known past regression.
- `@pytest.mark.slow` — long-running or network-heavy tests.

Tag conventions:

- When adding a new feature, tag its core happy-path test `@pytest.mark.smoke`
  so it joins the fast feedback loop.
- When fixing a bug, tag the regression test with `@pytest.mark.regression`
  so it stays in the guarded baseline.
- Tag network-heavy or slow tests `@pytest.mark.slow` so `make test-fast` and
  `pytest -m "not slow"` can skip them.

You can also run subsets directly with `-m`:

```bash
cd backend && .venv/bin/pytest -m smoke      # same as `make smoke`
cd backend && .venv/bin/pytest -m regression # same as `make regression`
cd backend && .venv/bin/pytest -m "not slow" # same as `make test-fast`
```

## Task-Level Rule

Each Jira task must list planned verification and actual verification results.

Each Jira task must also list unit tests added, updated, or intentionally skipped with reason.
