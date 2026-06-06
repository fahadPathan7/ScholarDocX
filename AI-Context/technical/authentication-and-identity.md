# Authentication And Identity

## Current Technical Position

Authentication is not required for the local-first MVP.

The app should start with either:

- No auth gate, or
- A lightweight local profile stored in SQLite.

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
