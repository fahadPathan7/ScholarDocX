# Authentication And Identity

## Current Technical Position

The local-first MVP ships with a full JWT auth model (the earlier "no auth
gate" stance is superseded):

- Registration is invite-gated; login returns a signed JWT.
- `get_current_user` validates the token, loads the user from the DB, enforces
  `is_active`, and checks `token_version` (revocation). Authorization roles are
  taken from the DB row, not the token payload.
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

## Localhost Redirects

Local development can use localhost redirect URIs. Production or packaged-app redirect strategy must be decided during the auth task.

Potential redirect examples:

- `http://localhost:<backend-port>/auth/google/callback`
- A packaged desktop app custom URI scheme if the app later becomes desktop-packaged.

## Data Model Additions If Auth Is Implemented

Possible tables:

- `local_profiles`
- `external_identities`
- `oauth_tokens` if Google API access is required

Possible fields:

- local profile id
- provider name
- provider subject id
- email
- display name
- avatar URL
- connected at
- disconnected at

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
