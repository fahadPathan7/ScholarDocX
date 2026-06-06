# Feature: Authentication

Requirement group: FR-6

## Status

Proposed future feature. Not part of the initial MVP unless the user explicitly prioritizes it.

## Goal

Allow optional identity through local profile and/or Google signin without compromising local-first data ownership.

## FR-6: Authentication And Identity

- FR-6.1: The app can run without remote signup/signin.
- FR-6.2: A local user profile may store display name and preferences.
- FR-6.3: Google signin may be added as an optional authentication provider.
- FR-6.4: Google signin must not be required for local data access unless a later business decision changes the product.
- FR-6.5: Google OAuth scopes must be minimal and purpose-specific.
- FR-6.6: User must be able to disconnect Google identity without deleting local application data.
- FR-6.7: Authenticated users should be able to explicitly log out from the Profile view.
- FR-6.8: Admin role limit/permission settings should support reset-to-default per role.
- FR-6.9: Users with only admin roles and no user-tier role should see user-tier
  usage limits as zero in usage summaries.
- FR-6.10: Users can request a renewal for their current plan using a monthly
  or yearly billing cycle without replacing the active or expired plan record.
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

## Google Signin User Flow

1. User chooses "Sign in with Google".
2. App starts Google OAuth/OpenID Connect flow.
3. User completes Google consent.
4. Backend validates the returned identity token or authorization code flow result.
5. App creates or links a local profile record.
6. Local app data remains stored locally.

## Recommended MVP Behavior

Do not block the user behind login.

Authentication can wait until it enables a concrete workflow such as:

- Google Calendar reminder export.
- Gmail draft creation.
- Google Drive backup/export.

## Acceptance Criteria For Future Auth Task

- Local app remains usable without Google signin.
- Signin requests only `openid`, `email`, and `profile` unless a Google API feature requires more.
- Tokens are never exposed in frontend logs.
- Disconnecting Google keeps local data.
- Unit tests cover token/profile mapping, missing provider config, and local profile behavior.
