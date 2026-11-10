# Authentication Position

## Current Recommendation

> Updated: the product is cloud-deployed with accounts (SCHOLARDOCX-0139). Email/password plus invite-code registration and optional Google sign-in (SCHOLARDOCX-0169) are live. The notes below are the original MVP-era reasoning; Google remains optional.

Original MVP stance: ScholarDocX should not require signup or signin for the secure personal workspace MVP.

Reason:

The core product is a personal secure application manager. Mandatory authentication would add friction and introduce an external dependency before it creates clear user value.

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

Google sign-in means identity data and consent flow depend on an external provider. This does not automatically violate secure personal workspace storage, but it changes the privacy posture.

If added:

- Explain that signin is optional.
- Keep local records local.
- Request minimal scopes.
- Do not use signin as a reason to add remote persistence by default.

## Business Decision

Status: Accepted and implemented (SCHOLARDOCX-0169)

Decision:

Google OAuth is an optional identity layer alongside email/password and invite-code registration. It is never the only way in.

