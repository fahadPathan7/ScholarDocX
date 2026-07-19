# SCHOLARDOCX-0153: Fix NotNullViolation on project / university / document delete

Status: Done

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-07-19

## Summary

Deleting a project that has any sheets or pages throws `500 NotNullViolation: null value in column "project_id" of relation "project_pages"`. The same defect silently affects deleting a `universities` row that has programs, and a `documents` row that has versions. Add ORM `cascade="all"` to the four affected parent→child relationships so SQLAlchemy emits `DELETE` for children instead of attempting an illegal `UPDATE ... SET fk=NULL`.

## Business Context

Links:

- Business file: AI-Context/business/product-overview.md

Business value:

- Users cannot delete a project once it has any sheet/page in it — a core workspace-management action returns a 500. Same blocker applies to deleting a university with programs and deleting a document with versions. Restores a broken primary workflow.

## Functional Context

Links:

- Functional file: AI-Context/technical/api-boundaries.md

Requirements:

- FR-1: `DELETE /api/projects/{id}` returns 200 and removes the project plus its owned sheets and pages. Dashboard `total_projects` / `total_sheets` / `total_records` counts drop accordingly.
- FR-2: `DELETE /api/universities/{id}` removes the university and its programs.
- FR-3: `DELETE /api/documents/{id}` removes the document and its versions.
- FR-4: `Notifications.project_id` (nullable) is **not** cascade-deleted — notifications outlive their project as historical records and are nullified instead.
- FR-5: No contract change — the endpoint signatures, response shapes, and `RESYNC_FEATURES_BY_TABLE` quota flow are unchanged.

## Technical Context

Links:

- Technical file: AI-Context/technical/api-boundaries.md
- Related: SCHOLARDOCX-0139 (Supabase migration — introduced the FK constraints), SCHOLARDOCX-0140 (UUID PKs), SCHOLARDOCX-0011 (delete UX), SCHOLARDOCX-0110 (AI agentic actions, which already solve this via per-domain `cascade` specs in `ai_actions_records.py`).

Technical notes — root cause:

- `Store.delete_record` (`backend/app/services/store.py:322`) calls `self.db.delete(obj)`. With no `cascade=` on the parent relationship, SQLAlchemy's default (`save-update, merge`) tries to **nullify** the child FK on flush.
- Three child FKs are `NOT NULL`, so the nullify UPDATE fails:
  - `project_sheets.project_id` (`models.py:499`)
  - `project_pages.project_id` (`models.py:541`)
  - `programs.university_id` (`models.py:478`)
  - `document_versions.document_id` (`models.py:609`)
- The AI agentic path already sidesteps this with explicit per-domain `cascade` specs (`ai_actions_records.py:437-444`) that delete children first. The generic CRUD `DELETE /{table}/{id}` route has no such logic.

Fix:

- Add `cascade="all"` to the four parent→child relationships in `backend/app/db/models.py`.
- Chosen over `ondelete="CASCADE"` at the column level because `Base.metadata.create_all` only creates missing tables and will not alter FK constraints on existing Supabase DBs — a DB-level change would require a migration script. ORM cascade is purely application-side and works immediately on existing databases.
- Chosen `cascade="all"` (not `cascade="all, delete-orphan"`) so only parent **deletion** cascades; explicitly disassociating a child (`relationship.remove(child)`) still nullifies rather than silently deleting. Safer and matches intent.
- `Projects.notifications` is intentionally left without cascade — `notifications.project_id` is nullable, so the default nullify behavior is correct there.

## Scope

In scope:

- `backend/app/db/models.py` — `cascade="all"` on four relationships.
- `backend/tests/smoke/test_store.py` — three regression tests (project, university, document).
- `AI-Context/technical/api-boundaries.md` — document the cascade rule.
- This task file.

Out of scope:

- DB-level `ondelete="CASCADE"` migrations (could be a future hardening; ORM cascade is sufficient and works on existing DBs).
- The broader `users` parent delete, which has the same latent issue across ~10 NOT NULL child tables. That is admin-only surface area (no user-facing delete-user flow ships) and tracked as a follow-up.
- Frontend — endpoint contract is unchanged; existing cascade-confirm UI in `ProjectWorkspace.tsx` continues to work.

## Acceptance Criteria

- AC-1: `DELETE /api/projects/{id}` on a project with sheets and pages returns 200 and the sheets/pages rows are gone.
- AC-2: `DELETE /api/universities/{id}` on a university with programs returns 200 and the programs rows are gone.
- AC-3: `DELETE /api/documents/{id}` on a document with versions returns 200 and the versions rows are gone.
- AC-4: `DELETE /api/projects/{id}` leaves any pre-existing `notifications` rows intact with `project_id = NULL` (no historical notification data loss).
- AC-5: `resync_usage_counts` for `total_projects` / `total_sheets` / `total_records` reflects the post-cascade reality (no change needed in `limits.py` — recomputes from live data).
- AC-6: Existing quota regression test `tests/regression/test_limits_billing_guards.py::test_agent_delete_frees_quota_for_next_create` still passes.
- AC-7: No infrastructure service names (Supabase/Render/Postgres) appear in user-facing UI copy.

## Implementation Plan

1. `backend/app/db/models.py`: add `cascade="all"` to `Projects.project_sheets`, `Projects.project_pages`, `Universities.programs`, `Documents.document_versions`.
2. `backend/tests/smoke/test_store.py`: add `test_deleting_project_cascades_to_sheets_and_pages`, `test_deleting_university_cascades_to_programs`, `test_deleting_document_cascades_to_versions`, following the existing `make_store` + `create_record` chain pattern.
3. `AI-Context/technical/api-boundaries.md`: add "Delete cascade semantics" subsection.
4. Run `pytest backend/tests/smoke/test_store.py -k cascade` + `pytest backend/tests/regression/test_limits_billing_guards.py`.
5. `python -c "from app.db.models import Base"` import sanity check.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `test_deleting_project_cascades_to_sheets_and_pages`: create project → sheet → page, delete project, assert all three rows absent.
- `test_deleting_university_cascades_to_programs`: create university → program, delete university, assert both absent.
- `test_deleting_document_cascades_to_versions`: create document → version, delete document, assert both absent.
- `test_deleting_project_keeps_notifications_as_null_fk` (optional): create project + notification referencing it, delete project, assert notification row still present with `project_id = NULL`.

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `backend/app/db/models.py` (1036 lines — within 1150 grace limit; +4 chars per edit, no net line growth)
- `backend/tests/smoke/test_store.py` (new tests appended)
- `AI-Context/technical/api-boundaries.md` (subsection appended)

Line-count risk:

- Low.

## Verification Plan

- `pytest backend/tests/smoke/test_store.py -k cascade -v` (requires DATABASE_URL).
- `pytest backend/tests/regression/test_limits_billing_guards.py -v`.
- `python -c "from app.db.models import Base"` — no relationship-config errors at import.
- Manual: delete a project with sheets/pages in the running app → 200 OK, dashboard counts drop.

## Completion Notes

Changed files:

- `backend/app/db/models.py` — added `cascade="all"` to four parent→child relationships: `Projects.project_sheets`, `Projects.project_pages`, `Universities.programs`, `Documents.document_versions`. Verified via `configure_mappers()` that the resulting `CascadeOptions` include `delete` on exactly these four and **not** on `Projects.notifications` (which stays at the default `save-update, merge` so notification rows survive project deletion with a nullified `project_id`).
- `backend/tests/smoke/test_store.py` — added four regression tests (see below).
- `AI-Context/technical/api-boundaries.md` — added "Delete Cascade Semantics" subsection documenting the NOT NULL → cascade / nullable → nullify rule, the quota resync flow-through, and the rationale for ORM cascade over `ondelete="CASCADE"` (no migration needed).

Verification completed:

- `pytest tests/smoke/test_store.py -k cascade -v` → 3 passed (`test_deleting_project_cascades_to_sheets_and_pages`, `test_deleting_university_cascades_to_programs`, `test_deleting_document_cascades_to_versions`). The fourth test (`test_deleting_project_keeps_notifications_with_null_project_id`) doesn't match `-k cascade` by name but also passed in the full run.
- `pytest tests/smoke/test_store.py tests/regression/test_limits_billing_guards.py` → **30 passed, 6 failed**. The 6 failures are **pre-existing on `HEAD`** (confirmed by stash + re-run: pristine HEAD shows the same 6 failures, 26 passed). They are caused by shared-test-DB state pollution (`local_profiles.id=1` from prior runs, `document_categories` already at the 16-row cap) — unrelated to this change. My change took the suite from 26 → 30 passing with zero new failures.
- `python -c "import app.main; from app.db.models import Base"` → app boots cleanly, mappers configure with no relationship-config errors.
- Existing quota regression `test_agent_delete_frees_quota_for_next_create` still passes (cascade does not break the quota-freeing flow).

Unit tests added or updated:

- `backend/tests/smoke/test_store.py`:
  - `test_deleting_project_cascades_to_sheets_and_pages` — create project → sheet → page, delete project, assert all three rows raise `LookupError` on read.
  - `test_deleting_project_keeps_notifications_with_null_project_id` — notifications outlive the project with `project_id = NULL` (locks in FR-4).
  - `test_deleting_university_cascades_to_programs` — same pattern for the latent university defect.
  - `test_deleting_document_cascades_to_versions` — same pattern for the latent document defect.

Follow-ups:

- **User-delete cascade (broader scope).** The same NotNullViolation latent defect exists on the `users` parent across ~10 NOT NULL child tables (`invite_codes.created_by`, `plan_upgrade_requests.user_id`, `scholarship_search_feedback.user_id`, `user_sessions.user_id`, `user_usage_stats.user_id`, `advisor_atlas_runs.user_id`, `scholarship_deep_hunt_runs.user_id`, `ai_token_balances.user_id`, `ai_token_ledger.user_id`, `ai_token_purchase_requests.user_id`, `advisor_atlas_candidates.user_id`). Not fixed here because (a) no user-facing delete-user flow ships today and (b) test cleanup already sidesteps it via `tests/helpers.py:cleanup_user_records`. Worth a dedicated task if/when user-deletion becomes a product surface.
- **DB-level `ondelete="CASCADE"` hardening.** Optional future hardening: add `ondelete="CASCADE"` at the column level + a migration script so the cascade is enforced even by raw SQL bypassing the ORM. Not required for correctness today since all writes go through `Store`.
- **Pre-existing test failures.** The 6 failing tests in `test_store.py` are shared-DB-state pollution and should be addressed by test isolation (per-test schema or per-test transaction rollback) — tracked separately, not in scope here.
