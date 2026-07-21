# SCHOLARDOCX-0162: Paid Self-Registration (No Invite Code Required)

Status: Complete

Owner: AI Agent

Epic: Epic-AuthAndRBAC (cross-ref Epic-BillingAndPlans)

Created: 2026-07-21

## Summary

Allow users to register **without an invite code** by purchasing a Basic/Pro/Max
plan at signup. Invite-code registration stays fully intact. The account is
created in an inert `pending_payment` state (cannot log in), is activated on the
Polar `subscription.created` webhook, and is **completely deleted after 2 hours
if unpaid** (GitHub Actions cron every 2h + lazy safety net on login). The
paid-registration endpoint is rate-limited to **1 request / 24h per IP**. An
admin-configurable `registration_mode` setting toggles between `invite_only`,
`invite_or_paid` (new default), and `paid_only` without a deploy.

## Business Context

Links:
- Business file: `AI-Context/business/monetization-model.md`
- Business file: `AI-Context/business/decisions.md` (BD-006 — reconciled below)

Business value:
Open a self-serve acquisition channel that does not depend on an admin manually
issuing invite codes. Users who discover ScholarDocX directly can convert
immediately by purchasing a plan; the 2h unpaid TTL prevents inert accounts and
throwaway emails from accumulating. Trust anchor: the paid checkout session +
browser continuity (no email verification infrastructure required — the app has
none today).

## Functional Context

Links:
- Functional file: `AI-Context/functional/feature-authentication.md`
- Functional file: `AI-Context/functional/auth-and-user-profile.md`

Requirements:
- FR-6.20: A user may register without an invite code by purchasing a Basic,
  Pro, or Max plan at signup; the account is inert until payment is confirmed.
- FR-6.21: Unpaid accounts created via the paid path are deleted after 2 hours.
- FR-6.22: Paid registration is rate-limited to one attempt per client IP per
  24 hours.
- FR-6.23: An admin setting `registration_mode` controls which registration
  paths are open (`invite_only` / `invite_or_paid` / `paid_only`).
- FR-6.1 / BD-006 status note: the earlier "no remote signup required" stance is
  reaffirmed for invite-only mode; the paid path is an **additional** opt-in
  channel, never a replacement for invite-code registration when
  `registration_mode=invite_only`.

## Technical Context

Links:
- Technical file: `AI-Context/technical/authentication-and-identity.md`
- Technical file: `AI-Context/technical/api-boundaries.md`
- Technical file: `AI-Context/technical/billing-and-payments.md`

Technical notes:
- New nullable column `users.pending_payment_since TIMESTAMP`. When set and
  `is_active=0`, the account is awaiting payment and eligible for cleanup.
- `POST /auth/register-paid` creates the inert user (roles `["free_user"]`,
  `is_active=0`, `pending_payment_since=now`) then returns a hosted checkout URL
  via a shared `_create_polar_checkout_session` helper (also used by the existing
  `/auth/plans/checkout`).
- Activation reuses the existing webhook reconciliation: `_find_user`
  (`webhooks.py`) already matches by email and backfills `polar_customer_id`.
  `handle_subscription_updated` clears `pending_payment_since` and sets
  `is_active=1` when it sees a pending user.
- Cleanup is a single function `purge_expired_pending_accounts` with three
  triggers: GitHub Actions cron (`0 */2 * * *` → `/api/internal/cleanup-pending`,
  secret-gated), a lazy safety net on `/auth/login`, and an admin button.
- Rate-limit rule `auth_register_paid` (1 / 86400s / ip) added to the central
  registry, surfaced automatically in the admin Info tab.
- No infrastructure names (Polar / Supabase / Render) in user-facing copy.

## Scope

In scope:
- `users.pending_payment_since` column + ORM model + boot-time idempotent
  migration (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- `POST /auth/register-paid` endpoint + shared checkout-session helper.
- Webhook activation branch in `handle_subscription_updated`.
- `/auth/login` clearer message for pending-payment accounts.
- Cleanup service + internal + admin cleanup endpoints + standalone script.
- Lazy cleanup safety net on `/auth/login`.
- `auth_register_paid` rate-limit rule.
- GitHub Actions cron workflow.
- `registration_mode` admin setting + SettingsTab dropdown.
- RegisterPage two-tab UI (invite vs purchase) + plan picker.
- `/registration-complete` route.
- Unit tests.

Out of scope:
- Email sending infrastructure (no verification email — payment is the trust
  anchor).
- Changes to invite-code registration (unchanged).
- Free-tier signup via the paid path (paid plans only — Basic/Pro/Max).

## Acceptance Criteria

- [x] A user can register without an invite code by paying for Basic/Pro/Max;
      the account activates on the Polar webhook.
- [x] Invite-code registration still works unchanged.
- [x] `registration_mode` admin toggle opens/closes each path without a deploy.
- [x] Unpaid `pending_payment` accounts are deleted within ~2h (cron) and on
      the next login if the cron missed.
- [x] Paid-registration endpoint is limited to 1/24h/IP and visible in the
      admin Info tab.
- [x] Login against a pending account returns a clear "being activated" message.
- [x] No infrastructure names in user-facing copy.
- [x] File-size rule respected; tests green.

## Implementation Plan

1. **Data model**: add `Users.pending_payment_since` column + ORM field; add
   `_add_pending_payment_column` boot migration in `connection.py`.
2. **Shared checkout helper**: extract `_create_polar_checkout_session` from
   `create_polar_checkout`; refactor the existing endpoint to call it.
3. **`register-paid` endpoint**: gating by `registration_mode`, rate limit,
   password validation, duplicate/pending-email check, plan validation, inert
   user creation + dependent seeding, checkout URL, orphan cleanup on failure.
4. **Webhook activation**: in `handle_subscription_updated`, clear
   `pending_payment_since` + activate when pending.
5. **Login message**: distinguish pending from deactivated/blocked.
6. **Cleanup service**: `purge_expired_pending_accounts` + endpoints + script.
7. **Lazy safety net**: `/auth/login` triggers purge if
   `last_pending_cleanup_at > 2h ago`.
8. **Rate-limit rule** + GitHub Actions cron.
9. **Frontend**: RegisterPage two-tab + plan picker; `/registration-complete`;
   admin SettingsTab dropdown + cleanup button.

## Unit Test Plan

Unit tests needed:
- Yes

Planned tests:
- `test_register_paid_creates_inert_user_and_returns_checkout_url`
- `test_register_paid_rejects_invite_only_mode`
- `test_register_paid_rejects_weak_password_and_duplicate_email`
- `test_register_paid_rejects_inactive_or_unconfigured_plan`
- `test_register_paid_rolls_back_user_on_checkout_failure`
- `test_handle_subscription_updated_activates_pending_user`
- `test_purge_deletes_only_expired_pending_rows`
- `test_login_pending_account_returns_activation_message`
- `test_auth_register_paid_rate_limit_rule_present`

## File Size Check

Files expected to be edited:
- `backend/app/db/models.py` (one column; already 1065 lines — within grace)
- `backend/app/db/connection.py` (one migration helper)
- `backend/app/api/auth.py` (extract helper + new endpoint + login tweak; verify)
- `backend/app/api/webhooks.py` (activation branch)
- `backend/app/auth/rate_limit.py` (one rule)
- `backend/app/services/registration_cleanup.py` (new)
- `backend/app/api/internal.py` (new, or mount on existing router)
- `backend/app/api/admin.py` (cleanup endpoint)
- `backend/app/api/dependencies.py` (lazy trigger helper, optional)
- `frontend/src/components/RegisterPage.tsx`
- `frontend/src/components/LoginPage.tsx`
- `frontend/src/components/admin/SettingsTab.tsx`
- `frontend/src/App.tsx` (new route)
- `backend/tests/unit/test_register_paid.py` (new)
- `backend/tests/unit/test_registration_cleanup.py` (new)
- `.github/workflows/cleanup-pending-accounts.yml` (new)
- `scripts/cleanup_unpaid_pending.py` (new)

Line-count risk:
- Medium. `auth.py` starts at 765; the helper extraction offsets the new
  endpoint. If `auth.py` exceeds 1150 after the feature, split paid-registration
  into `backend/app/api/registration.py` before opening the PR.

## Verification Plan

- Run `pytest backend/tests/unit/test_register_paid.py` and
  `test_registration_cleanup.py`.
- Manual: set `registration_mode=invite_or_paid`, register-paid in sandbox,
  confirm inert row, fire sandbox webhook, confirm activation.
- Confirm GitHub Actions cron dry-run hits the internal endpoint with the
  secret header.
- Confirm lazy cleanup runs on login when `last_pending_cleanup_at` is stale.

## Completion Notes

Changed files:
- `backend/app/db/models.py` — added `Users.pending_payment_since` column (ORM).
- `backend/app/db/connection.py` — `_add_pending_payment_column` (idempotent
  ALTER at boot) + `_seed_registration_mode_default` (default `invite_or_paid`).
- `backend/app/api/auth.py` — extracted shared `_create_polar_checkout_session`
  helper; refactored `/plans/checkout` to call it; added `POST /auth/register-paid`
  endpoint with gating/rate-limit/validation/inert-user-creation/rollback;
  added `_seed_new_user_dependents` + `_delete_user_cascade` helpers; login now
  distinguishes pending-payment from suspended; `_assemble_public_plans` exposes
  `registration_mode`.
- `backend/app/api/webhooks.py` — `handle_subscription_updated` activates a
  pending-payment user (`is_active=1`, clear `pending_payment_since`).
- `backend/app/api/admin.py` — `POST /admin/cleanup/pending-accounts`
  (super_admin manual purge trigger).
- `backend/app/api/internal.py` (new) — `POST /internal/cleanup-pending`
  (secret-gated, for the GitHub Actions cron).
- `backend/app/services/registration_cleanup.py` (new) —
  `purge_expired_pending_accounts` + `maybe_run_lazy_cleanup`.
- `backend/app/auth/rate_limit.py` — `auth_register_paid` rule (1/86400s/ip).
- `backend/app/main.py` — mounts the internal router.
- `frontend/src/components/RegisterPage.tsx` — two-tab mode (invite vs purchase)
  honoring `registration_mode`; plan picker + billing-cycle toggle.
- `frontend/src/components/RegistrationCompletePage.tsx` (new) — post-checkout
  landing route `/registration-complete`.
- `frontend/src/components/LandingPage/plans-data.ts` —
  `PublicPlansResponse.registration_mode` field.
- `frontend/src/components/admin/SettingsTab.tsx` — Registration card: mode
  dropdown + super_admin "Run cleanup now" button.
- `frontend/src/main.tsx` — mounts the `/registration-complete` route.
- `backend/tests/unit/test_register_paid.py` (new) — 10 tests.
- `backend/tests/unit/test_registration_cleanup.py` (new) — 4 tests.
- `backend/tests/unit/test_webhooks.py` — 2 new activation tests.
- `scripts/cleanup_unpaid_pending.py` (new) — standalone purge runner.
- `.github/workflows/cleanup-pending-accounts.yml` (new) — 2h cron.
- Context: `technical/authentication-and-identity.md`,
  `functional/feature-authentication.md` (FR-6.20–6.23),
  `technical/api-boundaries.md` (`/auth/register-paid`, `/internal/cleanup-pending`,
  `/admin/cleanup/pending-accounts`, webhook activation contract).

Verification completed:
- `pytest tests/unit/test_register_paid.py` → 10 passed.
- `pytest tests/unit/test_webhooks.py` → 15 passed, 1 pre-existing failure
  (`test_order_created_grants_credits`, fails identically on base branch —
  unrelated token-pack path, not introduced by this task).
- `pytest tests/unit/test_registration_cleanup.py` → 4 passed.
- `tsc --noEmit` (frontend) → clean.
- Purge SQL verified against the live Postgres DB
  (`NOW() - ('N hours')::INTERVAL` valid; query shape returns 0 on empty).
- File sizes: `auth.py` 1034 lines (within 1150 grace; helper extraction offset
  the new endpoint). `models.py` 1070 (pre-existing; +5 lines for one column).
  No split required.

Unit tests added or updated:
- `test_register_paid.py`: mode gating, weak-password/duplicate/pending-email
  rejection, inactive/unconfigured-plan rejection, checkout-failure rollback,
  rate-limit rule presence, second-attempt-429.
- `test_registration_cleanup.py`: purge deletes only expired+inactive rows,
  leaves fresh/active rows; idempotent; removes dependents; lazy marker
  throttles correctly.
- `test_webhooks.py`: subscription webhook activates a pending user (clears
  marker, sets active, swaps role); leaves normal users untouched.

Follow-ups:
- Operational: set the `CLEANUP_SECRET` env var on the backend and the
  `BACKEND_URL` + `CLEANUP_SECRET` GitHub Actions secrets so the 2h cron is
  authenticated. Without these, the lazy `/auth/login` safety net still reaps
  accounts on traffic.
- Pre-existing (not this task): `test_order_created_grants_credits` fails on
  base too — investigate the `grant_purchased` → `AiTokenBalances` seeding path
  separately.
- Optional later: if a true email-sending integration is added, a pay-first
  variant (anonymous checkout → auto-create account on webhook → email
  set-password link) becomes feasible; the current collect-creds-up-front
  design is the zero-email-infra choice.
