# Technical Context

This folder explains how ScholarDocX should be built.

## Files

- [architecture-overview.md](architecture-overview.md): high-level architecture and boundaries.
- [stack-and-runtime.md](stack-and-runtime.md): stack, hosting, connection settings, run commands.
- [project-structure.md](project-structure.md): where code lives.
- [local-storage-and-data.md](local-storage-and-data.md): PostgreSQL and file storage rules.
- [data-model.md](data-model.md): table groups and non-obvious invariants (columns live in `backend/app/db/models.py`).
- [api-boundaries.md](api-boundaries.md): frontend/backend/service boundaries.
- [ai-integrations.md](ai-integrations.md): AI and search provider integration boundaries.
- [authentication-and-identity.md](authentication-and-identity.md): email/password, invite codes, and Google OAuth.
- [billing-and-payments.md](billing-and-payments.md): Polar checkout + webhook reconciliation, idempotency, and secrets (SCHOLARDOCX-0156/0157).
- [security-privacy.md](security-privacy.md): privacy and data-boundary rules.
- [coding-standards.md](coding-standards.md): coding style and maintainability.
- [testing-strategy.md](testing-strategy.md): verification expectations.
- [frontend-visual-system.md](frontend-visual-system.md): UI styling direction and CSS organization rules.
- [state-management.md](state-management.md): guidelines for UI state preservation and data refreshing.

## When To Update

Update this folder when work changes:

- Stack
- Architecture
- Database schema
- API contracts
- File system layout
- Security posture
- AI integration behavior
- Code organization
- Testing strategy
