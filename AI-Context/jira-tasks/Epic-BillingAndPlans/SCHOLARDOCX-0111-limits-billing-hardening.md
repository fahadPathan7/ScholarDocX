# SCHOLARDOCX-0111: Role-Limit and AI-Token Billing Hardening

Status: Done

Owner: AI Agent

Epic: Epic-BillingAndPlans

Created: 2026-07-02

## Summary

Audit of role-limit enforcement and the AI-token billing pipeline found seven
defects: quota never freed on delete, a wrong `total_records` startup sync,
a purchased-token gate missing on flat-fee charges, a default-model provider
permission bypass, free usage of deactivated models, usage-counter drift on
failed creates, and an inconsistent missing-row default in `get_user_limit`.
This task fixes all of them and adds regression tests.

## Business Context

Links:

- Business file: [decisions](../../business/decisions.md)

Business value:

- Plan limits and token billing are the monetization boundary; bypasses and
  drift break plan differentiation, and stuck counters block paying users.

## Functional Context

Links:

- Functional file: [feature-ai-token-economy.md](../../functional/feature-ai-token-economy.md)

Requirements:

- Deleting workspace data frees the corresponding plan quota immediately.
- Purchased tokens are spendable only on plans with `can_use_purchased_tokens`.
- Provider permissions apply to the default model, not just explicit picks.

## Technical Context

Links:

- Technical file: [security-privacy.md](../../technical/security-privacy.md)

Technical notes / fixes:

1. `app/auth/limits.py`: new `resync_usage_counts(user_id, session, features)`
   recomputes count-based usage (`total_projects`, `total_sheets`,
   `total_records` via `json_array_length(rows_json)`, `total_documents_bytes`,
   `total_sticky_notes`, `total_whiteboards`) from live data. Called after
   deletes in `routes.py` and after agent plans in `ai_actions.py` (finally
   block). Also drop the dead `plan_ends_at` read (expiry is enforced by
   auth-time role downgrade in `dependencies.py`).
2. `app/db/connection.py`: startup sync counts sheet rows with
   `json_array_length`, not pages.
3. `app/services/ai_tokens.py`: `charge_flat_fee` gates the purchased bucket
   on `can_use_purchased_tokens_feature`, matching `charge()`.
4. `app/api/routes.py`: `verify_model_permission` accepts optional settings;
   when no model is given it resolves the same default provider chain
   `AiService` uses (groq→gemini→mistral→glm) and enforces
   `can_use_<provider>`.
5. `app/services/ai_tokens.py`: `compute_cost` prices deactivated models too.
6. `app/api/routes.py`: create/upload/rows-update paths decrement the counter
   again if the storage write fails (compensating decrement).
7. `app/auth/limits.py`: `get_user_limit` returns -1 (no cap) for a missing
   feature row, aligned with `check_and_increment_limit`'s default-allow;
   users without a user-tier role still get 0.
8. `app/services/ai_tokens.py`: reject a duplicate Pending purchase request
   for the same user+pack (spam guard); route maps ValueError → 400.

## Scope

In scope: the fixes above plus regression tests. Out of scope: charging
refunds for failed provider calls after a flat fee (existing documented
behavior), payment processing (request→approve stays manual), whiteboard
limits beyond existing counters.

## Acceptance Criteria

- Deleting a record immediately frees plan quota (route and agent paths).
- Restart no longer resets `total_records` to the page count.
- A plan without `can_use_purchased_tokens` cannot spend the purchased bucket
  via flat fees.
- Omitting `model` cannot reach a provider the role does not allow.
- Deactivated models still bill their configured price.
- A failed create does not permanently consume quota.
- Existing limits/billing tests keep passing.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests (new `tests/test_limits_billing_guards.py`):

- resync recomputes row-accurate counts; delete → recreate under limit works.
- Agent plan delete frees quota for a follow-up create.
- Flat fee with locked purchased bucket charges only subscription.
- compute_cost prices an inactive model.
- verify_model_permission blocks the default provider without permission.
- Duplicate pending purchase request rejected.
- get_user_limit returns -1 for missing feature, 0 for missing role.

## File Size Check

Files expected to be edited: limits.py (~+60), connection.py, ai_tokens.py,
routes.py, ai_actions.py, new test file. Line-count risk: Low.

## Verification Plan

- Run limits/billing/agent test files plus the new regression suite.

## Completion Notes

Changed files:

- `backend/app/auth/limits.py` — `resync_usage_counts` (live recount of the
  six count-based features, per-feature error isolation), `get_user_limit`
  missing-row default aligned to -1, dead `plan_ends_at` read removed with a
  pointer to the auth-time downgrade.
- `backend/app/db/connection.py` — startup sync counts sheet rows via
  `json_array_length(rows_json)` instead of pages.
- `backend/app/services/ai_tokens.py` — `charge_flat_fee` gates the purchased
  bucket on `can_use_purchased_tokens_feature`; `compute_cost` prices
  deactivated models; `submit_purchase_request` rejects a duplicate Pending
  request for the same user+pack.
- `backend/app/api/ai_tokens.py` — submit route maps the duplicate-request
  ValueError to HTTP 400.
- `backend/app/api/routes.py` — `verify_model_permission` enforces the default
  provider (`_default_provider`, same chain as `AiService`) when no model is
  given; all four AI endpoints pass settings; delete routes resync the
  affected counters (`RESYNC_FEATURES_BY_TABLE`); compensating decrements on
  failed creates (CRUD create, sheet create, rows update, upload); upload
  settles declared-vs-actual bytes and removes the file if the settlement
  exceeds the plan.
- `backend/app/services/ai_actions.py` — agent execute resyncs usage counters
  in a finally block after every plan (deletes free quota, partial failures
  self-heal).
- `backend/app/api/advisor_atlas.py` — `create_run` reads the Advisor Atlas
  model from injected `Settings` instead of reaching through
  `service.ai_service.settings`.
- Tests: new `tests/test_limits_billing_guards.py` (12 tests); fixed broken
  assertions in `tests/test_openrouter_cost.py` (nonexistent
  `purchased_balance` column, subscription bucket not drained); updated
  `tests/test_advisor_atlas_limits.py` fakes for the settings injection;
  `tests/test_ai_actions_records.py` limit test now uses a user-scoped store
  (mirrors `get_user_store`).
- Context: `AI-Context/technical/security-privacy.md` new "Role Limits And
  Billing Guards" section.

Verification completed:

- Limits/billing/agent/atlas suites: 121 passed, plus the new 12-test guard
  suite and all 54 Advisor Atlas tests.
- Full backend suite: 216 passed; the remaining `test_api_auth.py`
  "database is locked" errors and one order-dependent `test_api_auth_usage`
  failure are pre-existing full-suite infrastructure issues (identical on the
  pre-change tree via `git stash`; both suites pass in isolation).

Unit tests added or updated:

- `test_limits_billing_guards.py`: get_user_limit defaults, row-accurate
  resync, delete→resync frees quota, agent delete frees quota end to end,
  flat fee locked/allowed purchased bucket, inactive-model pricing, duplicate
  pending purchase request, default-provider permission (block and pass),
  failed-create compensation.

Follow-ups:

- `test_api_auth.py` shares one SQLite file across the whole suite and hits
  "database is locked" in full runs — test-infrastructure fix, separate task.
- Consider refunding the Tavily flat fee when the search itself fails after
  charging (current behavior charges pre-flight by design).
- `datetime.utcnow()` deprecation warnings in limits/ai_tokens — mechanical
  cleanup when convenient.
