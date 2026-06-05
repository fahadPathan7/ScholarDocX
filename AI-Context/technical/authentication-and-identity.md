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

## Testing Requirements

If auth is implemented, add unit tests for:

- Provider config validation.
- OAuth callback success path.
- OAuth callback failure path.
- Local profile creation/linking.
- Signout behavior.
- Disconnect behavior.
- Scope handling.
