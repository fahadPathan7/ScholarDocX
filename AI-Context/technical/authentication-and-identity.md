# Authentication And Identity

## Current Technical Position

The secure personal workspace MVP ships with a full JWT auth model (the earlier "no auth
gate" stance is superseded):

- Registration is invite-gated **or** paid (admin-configurable via the
  `registration_mode` app setting: `invite_only`, `invite_or_paid`, or
  `paid_only`); login returns a signed JWT.
- Paid self-registration (SCHOLARDOCX-0162): a user without an invite code may
  register by purchasing a Basic/Pro/Max plan at signup. The account is created
  in an inert state (`is_active=0` with `pending_payment_since` set), cannot log
  in, is activated on the `subscription.created` webhook (which sets
  `is_active=1` and clears `pending_payment_since`), and is **completely deleted
  after 2 hours if unpaid** (GitHub Actions cron + lazy safety net on login).
  The paid-registration endpoint is rate-limited to 1 request / 24h / IP. No
  email verification is required — the paid checkout session + browser
  continuity is the trust anchor (the app has no email-sending infra today).
- `get_current_user` validates the token, loads the user from the DB, enforces
  `is_active`, and checks `token_version` (revocation). Authorization roles are
  taken from the DB row, not the token payload.
- `get_current_user` also supports extracting JWT tokens via a `token` query parameter when the `Authorization` header is not present (e.g. for browser file download/preview tabs).
- Role guards: `require_admin`, `require_super_admin`, `require_role`. The
  admin router is protected router-wide (`get_current_user` + `require_admin`)
  plus a second fine-grained layer via `require_feature` /
  `check_and_increment_limit` for destructive admin actions. Note: Admins (including `super_admin`) do NOT short-circuit or bypass regular user role checks. To access user-facing features, an admin must explicitly hold a user role (`general_user`, `pro_user`, `max_user`). Admins only get access to the admin tab.

## JWT Secret Management

- The signing secret is stored in `app_settings.jwt_secret_key`.
- `initialize_database()` provisions a per-install random secret and rotates
  any compromised placeholder. There is no constant fallback; `get_jwt_secret`
  raises HTTP 500 if the secret is missing or still compromised.
- Rotating the secret invalidates all outstanding tokens (forces re-login) and
  is the correct response to any suspected key compromise.
- The algorithm is pinned to HS256 on decode (no `alg:none` confusion).

The earlier "lightweight local profile / no auth gate" notes below are kept as
historical context.

## Google OAuth 2.0 Guidance

Google OAuth 2.0 / OpenID Connect can support signup/signin.

Recommended approach for a web app with a backend:

- Use Google Identity Services or standard OpenID Connect.
- Prefer authorization code flow through the backend for server-side validation and token handling.
- Use minimal authentication scopes: `openid`, `email`, `profile`.
- Store only the Google subject identifier and basic profile fields needed for local UX.
- Keep tokens server-side if tokens are needed.
- Do not expose client secrets or refresh tokens to the frontend.

## Google OAuth Implementation (SCHOLARDOCX-0169)

Google sign-in/sign-up is implemented as an OPTIONAL auth method alongside
email/password. Registration is now simplified to two paths: invite-code
or Google — both give a free plan. Paid self-registration at signup was
removed; users upgrade to paid plans later via the logged-in plan flow.

**Flow:** authorization-code + PKCE, backend-side exchange via `authlib`.

- `GET /api/auth/google/login` → 302 to Google consent. Generates a random
  `state` + `nonce` + PKCE verifier; stashes all three in a signed HttpOnly
  cookie (`sd_google_oauth_state`, signed with the JWT secret, 10 min TTL).
  Scopes: `openid email profile`. `prompt=select_account`.
- Google redirects to `GET /api/auth/google/callback?code=...&state=...`.
  Backend verifies the signed state cookie (CSRF guard), exchanges the code
  (with the PKCE verifier), validates the id_token (signature vs Google
  JWKS, `aud`, `iss`, `nonce`), then resolves the user.
- On success the backend mints the EXISTING JWT (`create_token`) and 302s
  the browser to `FRONTEND_ORIGIN/auth-complete?token=...`.
- On failure the backend 302s to `FRONTEND_ORIGIN/auth-complete?error=...`.
- Frontend `/auth-complete` reads the token, hydrates `AuthContext.login()`,
  and navigates to `/dashboard`. On error it bounces to `/login` with the
  message in router state.

**Account model (simplified):**

- Google sign-up: a NEW Google user gets an ACTIVE FREE account created
  immediately (`signup_method='google'`, `is_active=1`, `roles=['free_user']`).
  No invite code or payment required — the user goes straight to the
  dashboard and can upgrade to a paid plan later.
- Google sign-in: a returning user with a linked account logs in directly.
- Auto-link by verified email: if the Google id_token's `email` (with
  `email_verified=true`) matches an existing `users.email`, an
  `external_identities` row is inserted and the user is logged in.
  Unverified Google emails are refused (a verified-email guarantee is
  what makes auto-link safe).

**Env config (`config.py`):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI` (points at the BACKEND callback), `FRONTEND_ORIGIN`
(where the browser is sent after minting the token). If client id/secret
are unset, `google_enabled` is False and `/auth/google/login` returns 503.

**Frontend:** "Sign in/up with Google" buttons on `LoginPage.tsx` and
`RegisterPage.tsx` link to `${API_BASE}/auth/google/login`. No OAuth
secrets ever reach the frontend.

**Removed (SCHOLARDOCX-0169 simplification):** `/auth/register-paid`,
`/auth/google/complete-invite`, `/auth/google/complete-paid`, the
`registration_mode` setting, `CompleteSignupPage`, `RegistrationCompletePage`.
Paid registration at signup was replaced by the post-login upgrade flow.

## Localhost Redirects

Local development can use localhost redirect URIs. Production or packaged-app redirect strategy must be decided during the auth task.

Potential redirect examples:

- `http://localhost:<backend-port>/auth/google/callback`
- A packaged desktop app custom URI scheme if the app later becomes desktop-packaged.

## Data Model: external_identities

The `external_identities` table links OAuth/OIDC provider identities to a
ScholarDocX user. One user may have multiple linked identities.

| Field | Type | Notes |
|---|---|---|
| `id` | String(36) PK | UUID |
| `provider` | Text | `'google'` (extensible) |
| `provider_subject_id` | Text | Google `sub` claim |
| `user_id` | FK → `users.id` | The linked local user |
| `email` | Text (nullable) | Snapshot of provider email |
| `display_name` | Text (nullable) | Snapshot |
| `avatar_url` | Text (nullable) | Snapshot |
| `connected_at` | DateTime | Auto-set on insert |

Unique on `(provider, provider_subject_id)`. No `oauth_tokens` table is
needed — Google login does not store refresh tokens (no offline Google
API access is required for sign-in).

## Security Rules

- Do not require Google signin for local-only features.
- Do not store unnecessary Google profile data.
- Do not request broad Google API scopes during signin.
- Use incremental authorization for later Google API integrations.
- Encrypt stored refresh tokens if the app stores them.
- Validate ID tokens or authorization-code exchange responses server-side.
- Clear local session state on signout without deleting application data.

## Current Logout UX Contract

- Profile view should expose an explicit logout button for authenticated users.
- Frontend logout should call auth logout endpoint when available, then clear
  local auth token/session state and navigate to `/login`.
- Logout should never delete local project/workspace/user data.

## Plan Access Lifecycle

- User-tier plan access is enforced through `plan_started_at` and
  `plan_ends_at` checks in the backend limit layer.
- The frontend shell should also treat an expired user-tier plan as limited
  navigation access: hide workspace tabs such as Dashboard, Projects,
  Documents, Sticky Notes, and Whiteboard, while preserving Profile, Settings,
  About, and plan-management entry points.
- Profile-level subscription summary UI should derive plan state from the same
  date logic and present three visual states: normal, warning when 7 or fewer
  days remain, and urgent expired messaging with direct renewal/change-plan
  guidance.
- Plan renewal requests are stored separately from upgrades so the admin can
  preserve the existing plan record and extend the deadline instead of
  replacing the current subscription when a user asks for more time on the same
  tier.
- If a renewal is approved after the plan has already expired, the new
  deadline starts from the approval timestamp so the user regains access from
  the moment the admin acts.

## Testing Requirements

If auth is implemented, add unit tests for:

- Provider config validation.
- OAuth callback success path.
- OAuth callback failure path.
- Local profile creation/linking.
- Signout behavior.
- Disconnect behavior.
- Scope handling.

## Forgot Password (admin-mediated reset)

- `POST /auth/forgot-password` is unauthenticated and always returns HTTP 200
  with an identical generic message. It never reveals whether an email is
  registered, whether a request was created, or whether a rate limit applied.
- Two limits are enforced silently (by not creating a row): at most one pending
  `password_reset_requests` row per user, and one request per client IP per
  hour (in-memory `defaultdict` of timestamps, matching the login/register/
  invite-request limiter style).
- `GET /admin/password-reset-requests` and
  `POST /admin/password-reset-requests/{id}/resolve` are gated by the
  `admin_manage_password_resets` permission. `resolve` supports `set_password`
  (hashes a new password and increments the user's `token_version`, revoking all
  prior sessions, then marks the request `Completed`) and `dismiss` (marks the
  request `Dismissed` without changing the password).
