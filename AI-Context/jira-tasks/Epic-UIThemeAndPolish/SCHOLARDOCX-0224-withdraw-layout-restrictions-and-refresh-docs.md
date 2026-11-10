# SCHOLARDOCX-0224: Withdraw layout restrictions; refresh README/rules (Google OAuth, auth model)

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

Owner decision: remove all vertical/horizontal layout restrictions (fixed-shell
no-page-scroll, single-row/nowrap toolbars, viewport-fit forms, zero-overflow
audit gate) so UI can be designed freely. Also fix stale docs: README said
Google OAuth was not implemented; auth docs still described MVP-era "no signup"
and paid self-registration that SCHOLARDOCX-0169 removed.

## Scope

Docs/rules only — no CSS or code changed. Existing fixed-shell CSS stays until
a redesign touches it.

## Completion Notes

Changed: README.md, CLAUDE.md, AGENTS.md (Layout freedom note),
CODE_RULES.md (UI/UX rules), technical/frontend-visual-system.md,
technical/responsive-design-system.md (Rules 2/3 withdrawn, checklist
advisory), technical/security-privacy.md (Google sign-up behavior corrected to
match auth_google.py), functional/feature-authentication.md (FR-6.20 superseded,
status), functional/feature-dashboard-hierarchy.md, business/authentication-position.md,
business/decisions.md (BD-006 superseded), business/business-requirements.md.

Follow-ups: dead `registration_mode` setting seed and
`registration_cleanup`/`/internal/cleanup-pending` remain in backend though
paid signup is gone — candidate cleanup task. Planbook docs (historical) still
mention "no horizontal overflow" and were left untouched.
