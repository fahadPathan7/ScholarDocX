# Authentication Position

## Current Recommendation

ScholarDocX should not require signup or signin for the local-first MVP.

Reason:

The core product is a personal local application manager. Mandatory authentication would add friction and introduce an external dependency before it creates clear user value.

## Can Google OAuth 2.0 Be Used?

Yes, Google OAuth 2.0 / OpenID Connect can be used for signup or signin, but it should be optional unless the product direction changes.

## Recommended Product Stance

For MVP:

- Use a local profile or no account gate.
- Keep all application data usable offline.
- Do not require Google identity to open the app.

For later versions:

- Add optional "Sign in with Google" if it enables clear value.
- Possible value: Google Drive export, Google Calendar reminders, Gmail draft integration, cross-device sync if a future architecture supports it.

## Privacy Implication

Google sign-in means identity data and consent flow depend on an external provider. This does not automatically violate local-first storage, but it changes the privacy posture.

If added:

- Explain that signin is optional.
- Keep local records local.
- Request minimal scopes.
- Do not use signin as a reason to add remote persistence by default.

## Business Decision

Status: Proposed

Decision:

Google OAuth may be added later as an optional identity layer, but it is not required for the local-first MVP.

