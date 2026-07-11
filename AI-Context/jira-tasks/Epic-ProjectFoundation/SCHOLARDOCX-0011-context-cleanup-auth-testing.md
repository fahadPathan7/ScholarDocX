# SCHOLARDOCX-0011: Context Cleanup, Auth Guidance, And Test Rule

Status: Done

Owner: AI Agent

Epic: Epic-ProjectFoundation

Created: 2026-05-27

## Summary

Delete the original source idea files after their content was absorbed into AI-Context. Add guidance for optional Google OAuth signin and strengthen the project rule that features should include unit tests when needed.

## Business Context

Links:

- [authentication-position.md](../../business/authentication-position.md)
- [decisions.md](../../business/decisions.md)

Business value:

Preserves secure personal workspace product direction while allowing optional future identity integrations.

## Functional Context

Links:

- [feature-authentication.md](../../functional/feature-authentication.md)
- [requirements-index.md](../../functional/requirements-index.md)

Requirements:

- FR-6.1 through FR-6.6 added as proposed future requirements.

## Technical Context

Links:

- [authentication-and-identity.md](../../technical/authentication-and-identity.md)
- [testing-strategy.md](../../technical/testing-strategy.md)
- [security-privacy.md](../../technical/security-privacy.md)

Technical notes:

- Google signin should be optional.
- Use minimal scopes.
- Keep tokens and provider calls server-side if implemented.
- Unit tests are required when feature behavior needs protection.

## Scope

In scope:

- Delete old source idea Markdown files.
- Remove stale references to deleted files.
- Add optional Google OAuth context.
- Add unit-test expectations to root and task docs.

Out of scope:

- Implementing Google OAuth.
- Creating product code.
- Installing dependencies.

## Acceptance Criteria

- `business.md` and `functional.md` are removed.
- AI-Context no longer links to deleted files as active sources.
- Auth guidance exists in business, functional, and technical context.
- Feature unit-test expectations are documented.

## Unit Test Plan

Unit tests needed:

- No

Reason:

This was a documentation-only task with no executable product behavior.

## File Size Check

Line-count risk:

- Low

## Verification Plan

- Confirm deleted files are gone.
- Search for stale references.
- List final Markdown files.

## Completion Notes

Changed files:

- Root docs and AI-Context docs only.

Verification completed:

- Confirmed `business.md` and `functional.md` are deleted.
- Searched for references to deleted files; remaining mentions are historical notes only, not active links.
- Listed final Markdown files.
- Checked line counts.

Unit tests added or updated:

- None, documentation-only task.

Follow-ups:

- Use backlog task `SCHOLARDOCX-0010` only if optional Google signin becomes prioritized.
