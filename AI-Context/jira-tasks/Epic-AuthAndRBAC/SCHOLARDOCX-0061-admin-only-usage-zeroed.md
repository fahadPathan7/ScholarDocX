# SCHOLARDOCX-0061 — Admin-Only Usage Limits Zeroed

## Status
Completed

Owner: AI Agent

Created: 2026-05-31

## Summary
Ensure users who have only admin roles (and no user tier role) see user-level usage limits as zero in Settings usage API response.

## Functional Context
Links:

- Functional file: `AI-Context/functional/feature-authentication.md`

Requirements:

- FR-6.9: Users with only admin roles and no user-tier role must receive user-level usage limits as `0`.

## Technical Context
Links:

- Technical file: `AI-Context/technical/authentication-and-identity.md`

Technical notes:

- Adjust `/api/auth/usage` role resolution to avoid defaulting admin-only users to `general_user`.
- Return normalized zeroed feature maps for user-tier usage metrics when no user-tier role exists.

## Scope
In scope:

- Backend `/auth/usage` response behavior.
- API test coverage for admin-only role set.

Out of scope:

- UI-only workarounds.

## Verification Plan

- `pytest backend/tests/test_api_auth_usage.py`

## Completion Notes
Changed files:

- `backend/app/api/auth.py`
- `backend/tests/test_api_auth_usage.py`
- `AI-Context/functional/feature-authentication.md`
- `AI-Context/jira-tasks/SCHOLARDOCX-0061-admin-only-usage-zeroed.md`

Verification completed:

- `pytest -q backend/tests/test_api_auth_usage.py`
