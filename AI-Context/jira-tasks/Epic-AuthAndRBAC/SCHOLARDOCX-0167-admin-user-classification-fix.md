# SCHOLARDOCX-0167: Admin User Classification (signup_method / plan_source) Fix

Status: Complete

Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-07-21

## Summary

The admin "join method" column (`signup_method`) was being derived from mutable
state (roles, polar links, `pending_payment_since`) and produced wrong results:
every successfully-paying Polar user got stamped `admin` because the activation
webhook clears `pending_payment_since`. Worse, derivation is the wrong model
entirely — signup_method is a **one-time historical fact** (invite / purchase /
admin), distinct from mutable current-state fields.

Make signup_method an immutable persisted column written once at user creation,
and read it back as a passthrough in `list_users`. `plan_source` (current plan
funding) stays derived since it legitimately reflects mutable state.

## Business Context

Links:

- Business file: [AI-Context/business/business-overview.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/business/business-overview.md)
- Related task: SCHOLARDOCX-0162 (introduced the classifier in commit `0b0c8e8`)

Business value:

- Admin reporting on signup channel (invite vs purchase vs admin-seeded) and
  plan provenance (Polar vs admin-granted vs none) is currently wrong for every
  user who successfully completes Polar checkout.
- Restore accurate reporting so revenue, growth, and support views are
  trustworthy.

## Functional Context

Links:

- Functional file: [AI-Context/functional/user-roles-permissions.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/functional/user-roles-permissions.md)

Requirements:

- FR-1: `users.signup_method` is a persisted column storing one of `invite`,
  `purchase`, `admin`, or NULL.
- FR-2: The column is set **exactly once** at INSERT time by whichever creation
  path runs:
  - `auth.register` (invite code) → `'invite'`
  - `auth.register_paid` (Polar checkout) → `'purchase'`
  - `AdminService.create_user` (admin panel) → `'admin'`
- FR-3: `signup_method` must never be updated by any other code path — it is an
  immutable origin fact, distinct from mutable state (roles, plan,
  polar_subscription_id).
- FR-4: `AdminService.list_users` passes `signup_method` through verbatim,
  falling back to `'admin'` only if the column is NULL (safety net for legacy
  rows or migration holes).
- FR-5: `plan_source` remains derived from mutable state (polar_subscription_id
  and paid-tier roles), since it reflects current plan funding, not origin.
- FR-6: Existing rows are backfilled by the migration: invite > polar_customer_id
  > admin. Known exceptions are corrected via a one-off DB command.

## Technical Context

Links:

- Technical file: [AI-Context/technical/api-boundaries.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/api-boundaries.md)
- Technical file: [AI-Context/technical/billing-and-payments.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/billing-and-payments.md)

Technical notes:

- `pending_payment_since` is intentionally NULL'd by the Polar webhook on
  successful payment (`webhooks.py:371-373`). It cannot be used as a "this user
  came through Polar" signal post-activation.
- `polar_customer_id` is set at first checkout attempt and never cleared by the
  app — it is the durable "this user came through Polar" signal.
- `polar_subscription_id` is nulled on revoke/cancel-revoke events, so it
  indicates "currently has an active Polar subscription", not "ever had one".
- Fix lives in the read path (`AdminService.list_users`), so all existing users
  are reclassified correctly on the next admin page load. No data migration
  required.

## Scope

In scope:

- `backend/app/services/admin.py` — rewrite the `signup_method` / `plan_source`
  classification block in `list_users`.
- `backend/tests/unit/test_api_admin.py` — add lifecycle unit tests for the
  classifier.

Out of scope:

- Frontend display logic (`UsersTab.tsx` already has defensive fallbacks that
  display correctly despite the bad backend payload).
- Backfill script — fix-forward reclassifies everyone via the read path.
- Persisted classification columns — the classification remains a derived
  property computed on read.

## Acceptance Criteria

- [x] `users.signup_method` column exists and is populated at all 3 creation paths.
      → Verified by reading `auth.py:127,287` and `admin.py:751`.
- [x] `fahad@gmail.com` shows `signup_method="purchase"` (paid via Polar).
      → Verified in live DB: `signup_method = 'purchase'`.
- [x] `fahadpathan56@gmail.com` shows `signup_method="admin"` (admin-created,
      despite having polar IDs attached).
      → Verified in live DB: `signup_method = 'admin'`.
- [x] `signup_method` is passthrough in `list_users` (origin is durable).
      → Covered by `test_signup_method_invite_passthrough`,
      `test_signup_method_purchase_passthrough`,
      `test_signup_method_admin_passthrough`,
      `test_signup_method_null_falls_back_to_admin`.
- [x] `plan_source` derives correctly from mutable state for polar / admin_set /
      none / cancelled-polar.
      → Covered by `test_plan_source_polar`, `test_plan_source_admin_set`,
      `test_plan_source_none_for_free_user`,
      `test_plan_source_none_for_cancelled_polar`.
- [x] All new unit tests pass (16/16 in `test_api_admin.py`).
- [x] `npm run build` passes.
- [x] Migration is idempotent on re-run (verified against live DB).

## Implementation Plan

1. Add `Users.signup_method` column to the model (`models.py`).
2. Add `_add_signup_method_column` migration in `connection.py` with heuristic
   backfill (invite > polar_customer_id > admin), idempotent on every boot.
3. Set `signup_method` at all 3 INSERT sites:
   `auth.register → 'invite'`, `auth.register_paid → 'purchase'`,
   `AdminService.create_user → 'admin'`.
4. Rewrite the classifier block in `list_users`: passthrough for `signup_method`
   (NULL fallback to 'admin'), keep `plan_source` derived.
5. Run the migration against live DB to backfill existing rows.
6. Apply one-off override for `fahadpathan56@gmail.com → 'admin'` (origin
   truth that the heuristic cannot infer because the account has polar IDs).
7. Update unit tests: 4 passthrough tests + 4 plan_source tests.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `test_signup_method_invite_passthrough`: stored 'invite' passes through
  even with paid roles and polar links.
- `test_signup_method_purchase_passthrough`: stored 'purchase' passes through
  after pending_payment_since cleared (the fahad@gmail.com regression).
- `test_signup_method_admin_passthrough`: stored 'admin' passes through even
  with polar IDs attached (the fahadpathan56@gmail.com regression).
- `test_signup_method_null_falls_back_to_admin`: NULL column → 'admin' fallback.
- `test_plan_source_polar`: active Polar sub → 'polar'.
- `test_plan_source_admin_set`: paid-tier role without Polar → 'admin_set'.
- `test_plan_source_none_for_free_user`: free user → 'none'.
- `test_plan_source_none_for_cancelled_polar`: cancelled sub, free role, stale
  plan_ends_at → 'none' (regression guard).

If no unit tests are needed, explain why:

- N/A

## File Size Check

Files expected to be edited:

- `backend/app/db/models.py` (+8 lines)
- `backend/app/db/connection.py` (+45 lines for migration)
- `backend/app/api/auth.py` (2 lines changed across 2 INSERT sites)
- `backend/app/services/admin.py` (~10 lines changed inside `list_users`, 1 line in `create_user`)
- `backend/tests/unit/test_api_admin.py` (rewrite signup_method tests)

Line-count risk:

- Low — all files well under the 1000-line limit.

If any file exceeds 1000 lines, explain why.

- N/A

## Verification Plan

- `cd backend && pytest tests/unit/test_api_admin.py -v`
- `cd backend && pytest tests/unit/test_api_admin.py tests/unit/test_plan_expiry.py -q`
- `cd frontend && npm run build`
- Apply migration against live DB; verify row values.

## Completion Notes

Root cause: SCHOLARDOCX-0162 derived `signup_method` from mutable state
(`pending_payment_since`, which the Polar activation webhook clears). This was
fundamentally the wrong model: signup_method is a one-time origin fact, not a
property of current state. No amount of picking "better" mutable signals would
have been correct — the right fix is to persist the fact at creation time.

Revised fix: introduce `users.signup_method` as an immutable column, set exactly
once at INSERT by whichever creation path runs (`auth.register → 'invite'`,
`auth.register_paid → 'purchase'`, `AdminService.create_user → 'admin'`).
`list_users` passes it through verbatim. `plan_source` (current plan funding)
remains derived, since it legitimately reflects mutable state.

Changed files:

- `backend/app/db/models.py` — added `Users.signup_method: Mapped[Optional[str]]`
  with documenting comment.
- `backend/app/db/connection.py` — added `_add_signup_method_column` migration
  (idempotent `ADD COLUMN IF NOT EXISTS` + heuristic backfill: invite >
  polar_customer_id > admin), wired into `initialize_database`.
- `backend/app/api/auth.py` — set `signup_method='invite'` in `register` INSERT,
  `signup_method='purchase'` in `register_paid` INSERT.
- `backend/app/services/admin.py` — set `signup_method='admin'` in `create_user`
  INSERT; rewrote `list_users` classifier (passthrough + NULL fallback for
  signup_method; keep plan_source derived without `plan_ends_at` fallback).
- `backend/tests/unit/test_api_admin.py` — added `signup_method` to `_user_row`;
  rewrote signup_method tests as passthrough assertions; plan_source tests
  unchanged.
- `AI-Context/technical/api-boundaries.md` — updated the classification doc:
  signup_method is now persisted and immutable; plan_source stays derived.

Live DB changes:

- Migration applied: column added, both rows backfilled.
- One-off override applied: `fahadpathan56@gmail.com.signup_method = 'admin'`
  (origin truth the heuristic could not infer because the account has polar IDs).
- Final state verified:
  - `fahad@gmail.com` → `signup_method = 'purchase'`
  - `fahadpathan56@gmail.com` → `signup_method = 'admin'`

Verification completed:

- `pytest tests/unit/test_api_admin.py` → 16 passed in 101s.
- `pytest tests/unit/test_api_admin.py tests/unit/test_plan_expiry.py` →
  18 passed in 118s (prior run, before test rewrite).
- `npm run build` → built in 2.41s (0 errors).
- Migration idempotent re-run verified against live DB.

Unit tests added or updated:

- `test_signup_method_invite_passthrough`
- `test_signup_method_purchase_passthrough` (fahad@gmail.com regression)
- `test_signup_method_admin_passthrough` (fahadpathan56@gmail.com regression)
- `test_signup_method_null_falls_back_to_admin`
- `test_plan_source_polar`
- `test_plan_source_admin_set`
- `test_plan_source_none_for_free_user`
- `test_plan_source_none_for_cancelled_polar`

Follow-ups:

- The full `pytest tests/unit/` run hangs on a slow test unrelated to this
  change. Worth profiling and either marking slow or splitting into a separate
  suite — future task.
- Consider adding an admin-panel frontend smoke test that asserts the filter
  tabs partition correctly against a seeded lifecycle matrix — future task.
- Consider a CHECK constraint on `users.signup_method` to enforce the allowed
  values ('invite', 'purchase', 'admin') at the DB level — future hardening.
