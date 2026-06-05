# SCHOLAR-0055: AI Chat Memory And Search Flow Hardening

Status: Done

Owner: AI Agent

Created: 2026-05-29

Completed: 2026-05-29

## Summary

Smoke-test the current AI chat, rolling memory, and web search hint flow. Fix
the assistant pipeline so routing, summarization, context labels, and provider
errors behave predictably.

## Business Context

Links:

- [decisions.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/business/decisions.md)

Business value:

- AI support should feel useful without compromising ScholarDock's local-first
  privacy posture or misleading users about provider/search failures.

## Functional Context

Links:

- [feature-ai-assistant.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-ai-assistant.md)
- [acceptance-criteria.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/acceptance-criteria.md)

Requirements:

- FR-5.1: Users can access a persistent or sliding chatbot interface.
- FR-5.2: Backend can combine Tavily web search with GLM summarization.
- FR-5.4: AI actions should show enough context for user review before saving changes.

## Technical Context

Links:

- [ai-integrations.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/ai-integrations.md)
- [api-boundaries.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/api-boundaries.md)
- [security-privacy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/security-privacy.md)
- [testing-strategy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/testing-strategy.md)

Technical notes:

- Frontend should keep chat session memory local and send only labeled compact context.
- Backend should own provider calls, prompt roles, routing decisions, and provider error modes.
- Search routing should fail open to Tavily when the router cannot produce valid JSON.

## Scope

In scope:

- Smoke-test current backend AI paths with local environment keys.
- Fix assistant TypeScript errors in the AI component.
- Harden rolling summary behavior so bad provider responses do not become memory.
- Harden research routing JSON parsing and mode reporting.
- Add focused backend unit tests for routing and summarization boundaries.

Out of scope:

- Fix unrelated sheet default column, ProjectWorkspace, or Whiteboard build errors.
- Add durable database-backed chat history.
- Add new remote providers or cloud persistence.

## Acceptance Criteria

- AI chat component compiles by itself without stale attachment references.
- `/ai/summarize` uses memory-specific instructions and returns no saved summary on missing key/provider failure.
- Research routing invalid or failed JSON defaults to search.
- Provider-error responses are not relabeled as successful `glm-direct` or `tavily+glm` answers.
- Context and Jira files describe the revised flow.

## Implementation Plan

- Add prompt constants and helper methods inside the backend AI service.
- Add routing decision parser with fail-open defaults.
- Add summarization service method and route it through `/ai/summarize`.
- Update FloatingAssistant memory context and summary handling.
- Add backend tests with mocked AI/Tavily methods.

## Unit Test Plan

Unit tests needed:

- Yes.

Planned tests:

- Missing-key summarization returns an empty memory answer without external calls.
- Invalid router output defaults to Tavily search.
- Provider-error direct research keeps provider-error mode.
- Successful no-search routing returns `glm-direct`.

If no unit tests are needed, explain why:

- Not applicable.

## File Size Check

Files expected to be edited:

- [FloatingAssistant.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/FloatingAssistant.tsx)
- [ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/services/ai.py)
- [routes.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/api/routes.py)
- [test_ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/tests/test_ai.py)

Line-count risk:

- Low for backend files and FloatingAssistant. High repository risk remains in
  existing CSS files, but this task does not need to edit them.

If any file exceeds 1000 lines, explain why.

- Existing [styles.css](/Users/fahadpathan/Documents/ScholarDock/frontend/src/styles.css) exceeds the limit before this task and is not edited here.

## Verification Plan

- Run focused backend AI tests: `.venv/bin/pytest tests/test_ai.py`.
- Run full backend tests and record unrelated failures if present.
- Run frontend build and record unrelated failures if present.
- Smoke-test small live GLM/research calls without printing secrets.

## Completion Notes

Changed files:

- [feature-ai-assistant.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-ai-assistant.md) - Documented rolling memory, web search hint, fail-open routing, and off-domain response behavior.
- [ai-integrations.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/ai-integrations.md) - Documented separated routing/synthesis/memory prompts, provider-error mode preservation, and routing tests.
- [FloatingAssistant.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/FloatingAssistant.tsx) - Fixed stale attachment references/imports, added memory context builder, gated summarization to four-message sessions, and ignored failed summaries.
- [ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/services/ai.py) - Added prompt constants, fail-open routing parser, search metadata, provider-error mode preservation, and dedicated memory summarization.
- [routes.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/api/routes.py) - Routed `/ai/summarize` through the dedicated summary method.
- [test_ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/tests/test_ai.py) - Added routing and summarization boundary tests.

Verification completed:

- Initial `npm run build` failed on stale AI component references plus unrelated ProjectWorkspace/Whiteboard errors.
- Initial `.venv/bin/pytest` passed AI fallback tests but failed one unrelated sheet default column assertion.
- Live AI smoke calls reached GLM but returned rate-limit provider errors; research incorrectly skipped Tavily when routing returned provider-error text.
- `.venv/bin/pytest tests/test_ai.py` passes: 7 passed.
- Full `.venv/bin/pytest` still has one unrelated failure: `test_create_sheet_with_single_default_table` expects `BSC cert`.
- `npm run build` no longer reports `FloatingAssistant.tsx` errors; it still fails on unrelated ProjectWorkspace and Whiteboard TypeScript errors.
- Parser smoke confirms provider-error text defaults to `needs_search: true`.
- Live research smoke now performs Tavily search, returns `search_performed: true`, includes 5 sources, and synthesizes with GLM.
- Browser smoke: assistant opens, input sends, and UI displayed `ScholarDock UI smoke OK`.

Unit tests added or updated:

- Added backend tests for missing-key summarization, provider-error summary dropping, invalid router fail-open search, no-search direct routing, and provider-error mode preservation.

Follow-ups:

- Resolve unrelated TypeScript errors in ProjectWorkspace/Whiteboard.
- Resolve unrelated sheet default column test failure.
