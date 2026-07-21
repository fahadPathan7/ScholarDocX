# Feature: Authentication

Requirement group: FR-6

## Status

Proposed future feature. Not part of the initial MVP unless the user explicitly prioritizes it.

## Goal

Allow optional identity through local profile and/or Google signin without compromising secure personal workspace data ownership.

## FR-6: Authentication And Identity

- FR-6.1: The app can run without remote signup/signin.
- FR-6.2: A local user profile may store display name and preferences.
- FR-6.3: Google signin may be added as an optional authentication provider.
- FR-6.4: Google signin must not be required for local data access unless a later business decision changes the product.
- FR-6.5: Google OAuth scopes must be minimal and purpose-specific.
- FR-6.6: User must be able to disconnect Google identity without deleting secure application data.
- FR-6.7: Authenticated users should be able to explicitly log out from the Profile view.
- FR-6.8: Admin role limit/permission settings should support reset-to-default per role.
- FR-6.9: Users with only admin roles and no user-tier role should see user-tier
  usage limits as zero in usage summaries.
- FR-6.10: Users can request a renewal for their current plan using a monthly
  or quarterly billing cycle without replacing the active or expired plan record.
- FR-6.11: Admin approval of a renewal must extend the current plan deadline
  from the approval timestamp when the existing plan has expired, or from the
  existing plan end date when it is still active.
- FR-6.12: Users whose user-tier plan has expired should lose the main
  workspace navigation tabs and fall back to the limited sidebar set used for
  non-user access, while still keeping Profile, Settings, About, and plan
  management reachable.
- FR-6.13: The profile subscription card should visually warn users when a
  plan has 7 days or fewer remaining, and switch to an urgent expired state
  with renewal guidance once the plan has ended.
- FR-6.14: Plan upgrade review and plan extension review should have separate
  admin permissions so either review surface can be granted or disabled
  independently in role limits.
- FR-6.15: The login page offers a "Forgot password?" entry that collects only
  the user's email and submits an admin-mediated password-reset request.
- FR-6.16: The reset-request endpoint returns the same generic success message
  regardless of whether the email is registered or whether a request was
  created (no user enumeration).
- FR-6.17: At most one pending reset request exists per user; further
  submissions are silently ignored (still return the generic message).
- FR-6.18: Reset requests are rate-limited to one per client IP per hour.
- FR-6.19: A "Forget Pass Requests" admin tab lists requests by status; an admin
  may set a new password for the user (resolving the request and invalidating
  prior sessions) or dismiss the request without changing the password.
- FR-6.20: A user may register without an invite code by purchasing a Basic,
  Pro, or Max plan at signup; the account is inert (cannot log in) until payment
  is confirmed by the subscription webhook. (SCHOLARDOCX-0162)
- FR-6.21: Accounts created via the paid path that remain unpaid are completely
  deleted after 2 hours. (SCHOLARDOCX-0162)
- FR-6.22: Paid registration is rate-limited to one attempt per client IP per
  24 hours. (SCHOLARDOCX-0162)
- FR-6.23: An admin setting `registration_mode` controls which registration
  paths are open: `invite_only`, `invite_or_paid` (default), or `paid_only`.
  (SCHOLARDOCX-0162)

Note on FR-6.1 / BD-006: the "app can run without remote signup" stance remains
true for invite-only mode. The paid path is an additional opt-in acquisition
channel, never a replacement for invite-code registration when
`registration_mode=invite_only`.

## Google Signin User Flow

1. User chooses "Sign in with Google".
2. App starts Google OAuth/OpenID Connect flow.
3. User completes Google consent.
4. Backend validates the returned identity token or authorization code flow result.
5. App creates or links a local profile record.
6. Secure app data remains stored locally.

## Recommended MVP Behavior

Do not block the user behind login.

Authentication can wait until it enables a concrete workflow such as:

- Google Calendar reminder export.
- Gmail draft creation.
- Google Drive backup/export.

## Acceptance Criteria For Future Auth Task

- Secure app remains usable without Google signin.
- Signin requests only `openid`, `email`, and `profile` unless a Google API feature requires more.
- Tokens are never exposed in frontend logs.
- Disconnecting Google keeps local data.
- Unit tests cover token/profile mapping, missing provider config, and local profile behavior.
