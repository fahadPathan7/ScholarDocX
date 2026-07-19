# Technical Context

This folder explains how ScholarDocX should be built.

## Files

- [architecture-overview.md](architecture-overview.md): high-level architecture.
- [stack-and-runtime.md](stack-and-runtime.md): recommended and pending stack decisions.
- [project-structure.md](project-structure.md): expected code organization.
- [local-storage-and-data.md](local-storage-and-data.md): PostgreSQL and file storage rules.
- [data-model-draft.md](data-model-draft.md): initial schema concepts.
- [api-boundaries.md](api-boundaries.md): frontend/backend/service boundaries.
- [ai-integrations.md](ai-integrations.md): GLM and Tavily integration boundaries.
- [authentication-and-identity.md](authentication-and-identity.md): optional auth, local profile, and Google OAuth architecture.
- [billing-and-payments.md](billing-and-payments.md): Polar checkout + webhook reconciliation, idempotency, and secrets (SCHOLARDOCX-0156/0157).
- [security-privacy.md](security-privacy.md): privacy and local safety rules.
- [coding-standards.md](coding-standards.md): coding style and maintainability.
- [file-size-and-modularity.md](file-size-and-modularity.md): 1000-line policy and split guidance.
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
