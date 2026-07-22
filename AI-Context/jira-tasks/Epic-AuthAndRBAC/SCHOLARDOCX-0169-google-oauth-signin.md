# SCHOLARDOCX-0169: Google OAuth Sign-In

Status: Done

Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-07-23

## Summary

Add optional "Sign in with Google" to the existing email/password auth.
Uses the authorization-code flow with PKCE through the FastAPI backend
(server-side token exchange). Google is a *login method only* — it does
not bypass the invite/paid registration gate. A first-time Google user
with no matching ScholarDocX account is rejected. If the verified Google
email matches an existing user, the Google identity is auto-linked to
that account.

## Business Context

Links:

- Business file: `AI-Context/technical/authentication-and-identity.md`
  ("Google OAuth 2.0 Guidance" section)

Business value:

- Lower-friction login for returning users who already have an account.
- Foundation for optional future Google-scoped integrations.
- Keeps existing monetization gate (invite/paid) intact.

## Functional Context

Links:

- Functional file: `AI-Context/technical/authentication-and-identity.md`

Requirements:

- FR-1: Logged-in users can sign in by clicking "Sign in with Google"
  on the login page.
- FR-2: Google sign-in does NOT create new accounts. New Google users
  see an error directing them to register first.
- FR-3: If a verified Google email matches an existing `users.email`,
  the Google identity is linked and the user is logged in.
- FR-4: A returning linked user is logged in directly.
- FR-5: Google sign-in remains optional; email/password is unaffected.

## Technical Context

Links:

- Technical file:
  - `AI-Context/technical/authentication-and-identity.md`
  - `AI-Context/technical/security-privacy.md`

Technical notes:

- Authorization-code + PKCE flow, backend-side exchange via `authlib`.
- Scopes: `openid email profile` only.
- New `external_identities` table (provider, provider_subject_id, user_id).
- On callback success, mint the EXISTING JWT via `create_token()` so the
  frontend stays unchanged downstream.
- `GOOGLE_REDIRECT_URI` points at the backend
  (`/api/auth/google/callback`); after minting the token the backend
  redirects the browser to `FRONTEND_ORIGIN/auth-complete?token=...`.
- The frontend `/auth-complete` route reads the token, calls
  `AuthContext.login()`, and navigates to `/dashboard`.
- Client secret is server-side only; never exposed to the frontend.

## Scope

In scope:

- `external_identities` SQLAlchemy model + table.
- `authlib` dependency.
- Google OAuth config in `config.py` (`google_client_id`,
  `google_client_secret`, `google_redirect_uri`, `frontend_origin`).
- Backend routes `/auth/google/login` and `/auth/google/callback`.
- Auto-link-by-email logic; no auto-create.
- Frontend "Sign in with Google" button on `LoginPage.tsx`.
- Frontend `/auth-complete` public route + `AuthContext` handling.
- `.env.example` update.
- AI-Context doc updates.
- Unit tests for callback success / no-account / auto-link / state
  mismatch / disabled config.

Out of scope:

- "Connect Google" from profile/settings (follow-up).
- Google token storage / refresh-token rotation (not needed for login).
- Migrating email/password users en masse.
- Render free-tier cold-start mitigation (separate concern).

## Acceptance Criteria

- Clicking "Sign in/up with Google" redirects to Google's consent screen.
- After consent, a returning user with a linked account is logged in and
  lands on `/dashboard`.
- After consent, a NEW Google user gets an active free account created
  immediately and lands on `/dashboard` (no invite code needed).
- After consent, a user whose Google email matches an existing password
  account gets auto-linked and logged in.
- Google config missing/disabled → `/auth/google/login` returns 503.
- Email/password login still works unchanged.
- RegisterPage shows invite-code form + Google button (no paid tab).
- Admin panel shows 'Google Sign-Up' badge for `signup_method='google'`.
- No infrastructure names leak to UI copy.

## Implementation Plan

1. `backend/app/db/models.py` — add `ExternalIdentities` model.
2. `backend/app/core/config.py` — add google_* + frontend_origin settings.
3. `backend/requirements.txt` — add `authlib`.
4. `backend/app/api/auth_google.py` — new router with `/login` +
   `/callback`.
5. `backend/app/main.py` — register the google router.
6. `frontend/src/components/LoginPage.tsx` — add Google button.
7. `frontend/src/components/AuthCompletePage.tsx` — new route component.
8. `frontend/src/main.tsx` — register `/auth-complete` route.
9. `.env.example` — document new keys.
10. AI-Context docs — reflect final decisions.
11. `backend/tests/` — callback logic tests.

## Unit Test Plan

Unit tests needed:

- Yes

Planned tests:

- `test_resolve_user_creates_active_free_account_for_new_google_user`
- `test_resolve_user_auto_links_by_email`
- `test_resolve_user_finds_existing_linked_identity`
- `test_state_cookie_roundtrip` / `_rejects_tampering` / `_expires`
- `test_google_login_returns_503_when_disabled`
- `test_google_login_redirects_to_google_when_enabled`
- `test_google_callback_no_state_cookie_redirects_with_error`
- `test_google_callback_state_mismatch_redirects_with_error`
- `test_google_callback_google_error_param_redirects`

## File Size Check

Files expected to be edited:

- `backend/app/api/auth_google.py` (NEW, ~200 lines)
- `backend/app/db/models.py` (add ~25 lines)
- `backend/app/core/config.py` (add ~8 lines)
- `backend/app/main.py` (add 2 lines)
- `frontend/src/components/LoginPage.tsx` (add ~15 lines)
- `frontend/src/components/AuthCompletePage.tsx` (NEW, ~60 lines)
- `frontend/src/main.tsx` (add 2 lines)
- `.env.example` (add 4 lines)

Line-count risk:

- Low. All new files are small; edits to existing files are minimal.
  `models.py` is ~900 lines; +25 keeps it under the 1000 target.

## Verification Plan

- Local: set the 4 env vars, run backend, click "Sign in with Google",
  complete consent, verify dashboard load for an existing user.
- Local: sign in with a Google account whose email is NOT registered →
  verify "no account" redirect.
- Unit tests pass: `pytest backend/tests/test_google_oauth.py`.

## Completion Notes

Changed files:

- `backend/app/db/models.py` — added `ExternalIdentities` model + `Users` back_populates; documented `'google'` signup_method value.
- `backend/app/core/config.py` — added `google_client_id`, `google_client_secret`, `google_redirect_uri`, `frontend_origin`, `google_enabled` property.
- `backend/requirements.txt` — added `Authlib>=1.3.0`.
- `backend/app/api/auth_google.py` (NEW) — `/auth/google/login` + `/auth/google/callback` with PKCE, state cookie, auto-link-by-email, active-free-account creation for new Google users.
- `backend/app/api/auth.py` — removed `/auth/register-paid`, `_PAID_PLAN_BY_SLUG`, `_get_registration_mode`, `_default_success_url`, `registration_mode` from `/plans/public`; added `external_identities` to `_delete_user_cascade`.
- `backend/app/services/admin.py` — added `has_google` to admin user response.
- `backend/app/services/registration_cleanup.py` — added `external_identities` to cleanup delete.
- `backend/app/auth/rate_limit.py` — removed `auth_register_paid` rule.
- `backend/app/main.py` — registered the google auth router.
- `frontend/src/components/LoginPage.tsx` — added "Sign in with Google" button + oauthError surfacing.
- `frontend/src/components/LoginPage.css` — added `.auth-google-btn` + `.auth-divider` styles; widened `.auth-card-wide` to 560px; removed orphaned paid CSS (tabs, cycle, plan-readout, hint).
- `frontend/src/components/RegisterPage.tsx` — simplified to invite-code-only + Google button (removed paid tab, billing cycle, plan select).
- `frontend/src/components/AuthCompletePage.tsx` (NEW) — receives token/error from backend redirect.
- `frontend/src/components/AuthCompletePage.css` (NEW) — styles.
- `frontend/src/main.tsx` — registered `/auth-complete` route; removed `/complete-signup` and `/registration-complete` routes.
- `frontend/src/components/admin/UsersTab.tsx` — added 'Google' filter tab + 'Google Sign-Up' badge.
- `frontend/src/components/admin/SettingsTab.tsx` — removed registration_mode dropdown.
- `frontend/src/responsive.css` — removed orphaned paid class references.
- `.env.example` — documented the 4 new keys (commented out).
- `AI-Context/technical/authentication-and-identity.md` — updated "Google OAuth Implementation" to reflect simplified free-account flow.
- `AI-Context/technical/security-privacy.md` — updated Google OAuth rules.
- `backend/tests/unit/test_google_oauth.py` — 11 tests (updated for active-free creation).

Deleted files:

- `frontend/src/components/CompleteSignupPage.tsx` + `.css` (no longer needed — Google users get instant free accounts).
- `frontend/src/components/RegistrationCompletePage.tsx` + `.css` (only reached via paid checkout, which was removed).
- `backend/tests/unit/test_register_paid.py` (the endpoint it tested was removed).

Verification completed:

- `npx tsc --noEmit` passes (frontend type-check clean).
- Backend imports cleanly; router exposes `/auth/google/login` + `/auth/google/callback` only.
- `pytest backend/tests/unit/test_google_oauth.py` → 11 passed.
- Covered: _resolve_user (active-free creation, auto-link, existing-linked), state cookie (roundtrip, tamper, expiry), /login (disabled 503, enabled 302 + cookie), /callback (no state cookie, state mismatch, Google error param).

Unit tests added or updated:

- `backend/tests/unit/test_google_oauth.py` — 11 tests covering all non-network logic.

Follow-ups:

- "Connect Google" button in Profile/Settings (link an existing password
  account to Google from inside the app).
- Render free-tier cold-start mitigation (uptime ping on `/health`).
- Manual end-to-end test once Google Console client + Render env vars are live.
- The orphaned `app_settings.registration_mode` row remains in the DB
  (harmless — no code reads it). Can be dropped in a future migration.
