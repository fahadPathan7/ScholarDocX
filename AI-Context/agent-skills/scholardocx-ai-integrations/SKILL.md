---
name: scholardocx-ai-integrations
description: Use for ScholarDocX AI assistant, GLM, Gemini/Google AI Studio, Tavily/search, provider configuration, AI read/write operations, key handling, fallback behavior, role limits, and agentic AI actions.
---

# ScholarDocX AI Integrations

## Guardrails

- AI providers are optional external calls controlled by local user-provided API keys.
- UI code must not call external AI/search providers directly.
- Keep provider logic behind backend services or explicit local boundaries.
- Never log or commit API keys.
- Missing keys must produce clear local fallback behavior.

## Required Context

- `AI-Context/technical/ai-integrations.md`
- `AI-Context/technical/api-boundaries.md`
- `AI-Context/technical/security-privacy.md`
- Relevant AI Jira task.

## Implementation Rules

- Keep provider-specific code isolated.
- Add mocks for provider tests.
- Separate read operations from write/action operations.
- Require explicit user intent for actions that mutate local data.
- Preserve privacy by sending only necessary prompt context to external APIs.

## Verification

- Test missing-key behavior.
- Test provider success/failure paths with mocks.
- Confirm secrets are not printed in logs or persisted in plain task notes.
- Update context when provider capabilities, limits, or boundaries change.
