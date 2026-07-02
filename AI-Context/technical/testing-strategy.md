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

## Task-Level Rule

Each Jira task must list planned verification and actual verification results.

Each Jira task must also list unit tests added, updated, or intentionally skipped with reason.
