# Authentication And Identity

## Model

JWT sessions with three ways in. Rules that protect them are in [security-privacy.md](security-privacy.md);
this file describes how identity works.

- **Email + password**, registered with an **invite code** (admin-generated), giving the free plan. Login returns a signed JWT.
- **Google sign-in/sign-up** (SCHOLARDOCX-0169), optional, also free-plan. Details below.
- Users upgrade to Basic/Pro/Max after login through the plan flow (Polar checkout, [billing-and-payments.md](billing-and-payments.md)). Paid registration at signup (SCHOLARDOCX-0162) was removed in 0169, along with `/auth/register-paid`, `/auth/google/complete-invite`, `/auth/google/complete-paid`, `CompleteSignupPage`, and `RegistrationCompletePage`; the `registration_mode` setting no longer drives behaviour.
- Admin-created users (`signup_method='admin'`) and admin-mediated password reset (below) complete the picture.

## Session handling

- **Access keys for connected apps** (SCHOLARDOCX-0258) are not sessions: separate `sdx_` credential, header-only, accepted only at `/mcp`, invalidated by the same `token_version` bump. Details in [mcp-server.md](mcp-server.md).

- `get_current_user` (`backend/app/auth/dependencies.py`) validates the token, loads the user from the database, enforces `is_active` (suspended accounts are refused), checks `token_version` (revocation), and applies plan expiry. **Roles come from the database row, not the token payload.** It also accepts a `token` query parameter when no `Authorization` header is present, kept for legacy file links; new code opens files through short-lived download tokens instead ([security-privacy.md](security-privacy.md)).
- Role guards: `require_admin`, `require_super_admin`, `require_role`. The admin router is protected router-wide (`get_current_user` + `require_admin`) plus a fine-grained layer (`require_feature` / `check_and_increment_limit`) for destructive admin actions. Admins, including `super_admin`, do not short-circuit regular user role checks; to use user features an admin needs a user-tier role.
- **JWT secret**: `JWT_SECRET` (or `JWT_SECRET_KEY`) from the environment into `settings.jwt_secret_key`. Startup deletes any legacy `app_settings.jwt_secret_key` row. `get_jwt_secret` raises HTTP 500 if the secret is missing or still a known-compromised placeholder; there is no constant fallback. The algorithm is pinned to HS256 on decode (no `alg:none` confusion). Rotating the secret signs everyone out and is the right response to any suspected compromise.
- Frontend: the token payload hydrates `AuthContext` immediately and `GET /auth/me` refreshes the user in the background (see [api-boundaries.md](api-boundaries.md)). Logout is an explicit button in Profile: call the logout endpoint, clear the token and session state, navigate to `/login`, and never delete user data.

## Google OAuth (SCHOLARDOCX-0169)

Authorization code + PKCE with the exchange done server-side via `authlib`.

- `GET /api/auth/google/login` generates `state`, `nonce`, and a PKCE verifier, stores them in a signed HttpOnly cookie (`sd_google_oauth_state`, signed with the JWT secret, 10-minute TTL), and redirects to Google with scopes `openid email profile` and `prompt=select_account`.
- `GET /api/auth/google/callback` verifies the signed state cookie (CSRF guard), exchanges the code with the PKCE verifier, validates the id_token (signature against Google's JWKS, `aud`, `iss`, `nonce`), then resolves the user. On success it mints the existing JWT (`create_token`) and redirects to `FRONTEND_ORIGIN/auth-complete?token=...`; on failure to `auth-complete?error=...`. The frontend `/auth-complete` page hydrates `AuthContext.login()` and goes to `/dashboard`, or bounces to `/login` with the message.
- **Account resolution**: a new Google user gets an active free account immediately (`signup_method='google'`, roles `['free_user']`); a returning linked user logs in directly; a Google email that is verified (`email_verified=true`) and matches an existing `users.email` is auto-linked by inserting an `external_identities` row; unverified Google emails are refused.
- **Config** (`config.py`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (the backend callback), `FRONTEND_ORIGIN`. Without client id and secret, `google_enabled` is false and `/auth/google/login` returns 503. For local development use a localhost redirect URI and origin.
- **Frontend**: "Sign in/up with Google" buttons on the login and register pages (`GoogleAuthButton`) link to `${API_BASE}/auth/google/login`; OAuth secrets never reach the browser.
- **Data**: `external_identities` links a provider identity to a user (provider `'google'`, `provider_subject_id` = Google `sub`, snapshots of email, display name, avatar URL, `connected_at`), unique on `(provider, provider_subject_id)`; one user may have several. No OAuth or refresh tokens are stored, since sign-in needs only the id_token. Later Google API integrations would need incremental authorization and encrypted token storage.

## Forgot password (admin-mediated)

`POST /auth/forgot-password` is unauthenticated and returns the same generic message in every case (no enumeration, see [security-privacy.md](security-privacy.md)); at most one pending `password_reset_requests` row per user and one request per client IP per hour, enforced silently. `GET /admin/password-reset-requests` and `POST /admin/password-reset-requests/{id}/resolve` are gated by `admin_manage_password_resets`; `resolve` either `set_password` (hashes the new password, increments `token_version` to revoke all sessions, marks `Completed`) or `dismiss` (marks `Dismissed`).

## Plan access lifecycle

- User-tier access is enforced from `plan_started_at` / `plan_ends_at` in the backend limit layer; expired plans fall back to `free_user` at auth time.
- The frontend shell treats an expired plan as limited navigation: workspace tabs (Dashboard, Projects, Documents, Sticky Notes, Whiteboard, ...) are hidden while Profile, Settings, About, and plan management stay reachable.
- The Profile subscription card shows three states from the same date logic: normal, a warning at 7 or fewer days left, and an urgent expired state with renewal guidance.
- Renewals are stored separately from upgrades (`request_type`) so the existing plan record is extended rather than replaced; a renewal approved after expiry starts from the approval time, otherwise from the current end date.

## Tests to keep

Provider config validation, OAuth callback success and failure paths, account linking and auto-link rules (verified email only), logout behaviour, scope handling, and the forgot-password invariants.
