## Fix: project (and sibling) deletion throws NotNullViolation

### Root cause
`Store.delete_record` uses ORM `db.delete(obj)`. The parent→child relationships on `Projects`, `Universities`, and `Documents` have **no `cascade=` setting**, so SQLAlchemy's default tries to `UPDATE child SET fk=NULL` instead of deleting children. Three child FKs are `NOT NULL`, so the UPDATE fails:

| Parent | Child | Child FK | Reported? |
|---|---|---|---|
| `projects` | `project_sheets` | `project_id` NOT NULL | ✅ (this bug) |
| `projects` | `project_pages` | `project_id` NOT NULL | ✅ (this bug) |
| `universities` | `programs` | `university_id` NOT NULL | ❌ latent |
| `documents` | `document_versions` | `document_id` NOT NULL | ❌ latent |

`Projects.notifications` is intentionally nullable — leave alone (notifications outlive their project as historical records).

### Approach: ORM-level `cascade="all"`
Add `cascade="all"` to 4 relationships in `backend/app/db/models.py`. This is the most conservative option:
- Purely application-side — works immediately on existing Supabase DB, no migration needed (unlike `ondelete="CASCADE"` which `create_all` won't apply to existing FK constraints).
- `cascade="all"` adds delete cascading WITHOUT `delete-orphan`, so disassociating a child (`project.sheets.remove(s)`) still just nullifies — only parent deletion cascades. Safer than `delete-orphan`.
- Idiomatic — the project already uses `ondelete="CASCADE"` on `advisor_atlas_*` tables for the same concept.

### Files to change

1. **`backend/app/db/models.py`** — 4 one-line edits:
   - `Projects.project_sheets` → add `cascade="all"`
   - `Projects.project_pages` → add `cascade="all"`
   - `Universities.programs` → add `cascade="all"`
   - `Documents.document_versions` → add `cascade="all"`

2. **`backend/tests/smoke/test_store.py`** — add regression test `test_deleting_project_cascades_to_sheets_and_pages`: create project → sheet → page, delete project, assert all three rows gone. Follows existing `test_store.py` `make_store` + `create_record` pattern. Also add a `test_deleting_university_cascades_to_programs` and `test_deleting_document_cascades_to_versions` to lock in the latent fixes.

3. **`AI-Context/jira-tasks/Epic-ProjectFoundation/SCHOLARDOCX-XXXX-project-delete-cascade-fix.md`** — new Jira task file (bug fix under Project Foundation epic, since the reported trigger is project deletion). Records root cause, fix, changed files, verification.

4. **`AI-Context/technical/api-boundaries.md`** — add a short "Delete cascade semantics" subsection documenting: parent deletes cascade to NOT NULL children via ORM `cascade="all"`; nullable FK children (notifications) are nullified and survive; quota resync recomputes from live data.

### Not changing
- `store.py` `delete_record` — no change needed; ORM cascade handles it.
- `routes.py` / `RESYNC_FEATURES_BY_TABLE` — already correct.
- `limits.py` `resync_usage_counts` — already recomputes from live data.
- No DB migration script — ORM cascade works on existing constraints.

### Scope decision (recommend fixing all three parents)
You reported only `projects`, but `universities` and `documents` have the **identical one-line defect** and will throw the same 500 the moment a user deletes a university with programs, or a document with versions. Recommend fixing all three in one pass since it's the same fix and prevents two near-certain future bug reports. If you'd prefer to scope strictly to `projects`, say so and I'll drop the other two (they'd stay as known-broken follow-ups).

### Verification
- `pytest backend/tests/smoke/test_store.py -k cascade` — new tests pass.
- `pytest backend/tests/regression/test_limits_billing_guards.py` — existing quota-freeing-on-delete test still passes (confirms cascade doesn't break quota flow).
- Manual: delete a project that has sheets/pages in the running app → 200 OK, sheets/pages gone, dashboard counts drop.
- `python -c "from app.db.models import Base"` — import sanity check (no relationship config errors).