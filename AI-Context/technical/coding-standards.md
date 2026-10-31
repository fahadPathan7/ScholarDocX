# Coding Standards

## General Standards

- Prefer small cohesive files.
- Prefer explicit names.
- Keep business logic out of UI components.
- Keep route handlers thin.
- Keep provider integrations isolated.
- Add tests for shared logic and risky behavior.
- Follow existing project patterns once code exists.

## Frontend Standards

- Use feature-level folders for major workflows.
- Keep page components focused on composition and data flow.
- Extract reusable controls only when reuse is real.
- Keep form validation close to feature schemas or shared validators.
- Do not hardcode API provider details in the frontend.

## Backend Standards

- Separate API routes, schemas, services, repositories, and integrations.
- Centralize workspace path resolution.
- Centralize database connection and migrations.
- Use typed request and response schemas.
- Validate all file operations.
- Mock external providers in tests.
- Adding a column to an ORM model in `app/db/models.py` does NOT alter
  existing databases — `Base.metadata.create_all` only creates missing
  tables. Every new model column MUST ship with an idempotent
  `_add_*_column` migration wired into `initialize_database`
  (`app/db/connection.py`), or every pre-existing database 500s on the first
  ORM select that mentions it. Guarded by
  `tests/regression/test_orm_schema_parity.py` (SCHOLARDOCX-0211, where a
  copy-pasted `polar_product_id` broke `/files/upload` this way).

## Documentation Standards

- Update context before implementing new features.
- Keep requirement and decision IDs stable.
- Link related context from Jira task files.
- Record important tradeoffs in decision logs.

## Review Checklist

Before considering a task complete:

- Context updated.
- Jira task updated.
- File-size policy checked.
- Tests or verification run.
- No secrets committed.
- No remote persistence added accidentally.

