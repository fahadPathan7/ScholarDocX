---
name: scholardocx-security-privacy
description: Use for ScholarDocX local-first security, privacy, path traversal prevention, file upload/storage safety, SQLite data boundaries, secrets handling, authentication, admin/user roles, and any change that could expose or transmit user data.
---

# ScholarDocX Security And Privacy

## Non-Negotiables

- User application data stays on the local machine.
- SQLite and local files are the default persistence layer.
- No telemetry, analytics, remote sync, or cloud persistence without explicit approval and context updates.
- No real secrets in repo files, logs, tests, screenshots, or task notes.

## Check These Areas

- Path traversal and workspace root containment.
- File type and filename validation.
- Secret storage and redaction.
- API endpoints that read/write local data.
- AI/search prompts that may include private documents or profile data.
- Role/admin-only controls and limit checks.

## Testing

- Add tests for path validation and unsafe input rejection.
- Mock external services.
- Include negative cases for unauthorized or invalid operations.

## Documentation

Update `AI-Context/technical/security-privacy.md` and the active Jira task when a security/privacy boundary changes.
