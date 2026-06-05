# SCHOLAR-0056: Google AI Studio Provider

Status: Done

Owner: AI Agent

Created: 2026-05-29

Completed: 2026-05-29

## Summary

Add Google AI Studio Gemini API as an optional chat/summarization provider
alongside GLM. Keep the implementation free-tier-conscious and local-first.

## Business Context

Links:

- [decisions.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/business/decisions.md)

Business value:

- Gives the user a second optional AI provider when GLM is rate-limited or
  unavailable, without adding hosted ScholarDock infrastructure.

## Functional Context

Links:

- [feature-ai-assistant.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-ai-assistant.md)
- [feature-initialization-workspace.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-initialization-workspace.md)

Requirements:

- FR-1.2: Use environment variables for optional AI/search provider keys.
- FR-1.4: Missing AI keys should not block non-AI workflows.
- FR-5.1: Users can access a persistent chatbot interface.
- FR-5.2: Backend can combine web search with AI summarization.

## Technical Context

Links:

- [ai-integrations.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/ai-integrations.md)
- [api-boundaries.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/api-boundaries.md)
- [security-privacy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/security-privacy.md)

Technical notes:

- Use `GEMINI_API_KEY` server-side only.
- Official Gemini REST content generation uses `generateContent` with the
  `x-goog-api-key` header.
- Prefer text-only Gemini Flash-Lite/Flash defaults for free-tier projects.
- Do not add Gemini media generation, Search grounding, Google OAuth, or Google
  Cloud storage.

## Scope

In scope:

- Add backend settings for Gemini API key/base URL.
- Add Gemini REST payload and response handling.
- Add provider/model selection and auto fallback across configured providers.
- Add Gemini model options to the assistant UI.
- Update `.env.example`, README, and AI context.
- Add focused backend tests with mocked HTTP transport.

Out of scope:

- Storing the user's real key.
- Using paid-only Gemini image/audio/computer-use endpoints.
- Replacing Tavily with Gemini Search grounding.
- Fixing unrelated ProjectWorkspace, Whiteboard, or sheet-default test failures.

## Acceptance Criteria

- Chat can use Gemini when `GEMINI_API_KEY` is configured.
- Auto-select tries configured providers without exposing keys to the frontend.
- Gemini provider errors return clear provider-error responses.
- Free-tier Gemini defaults avoid paid-only media models.
- Existing AI routing/search/summarization behavior remains tested.

## Implementation Plan

- Add Gemini settings and documented env vars.
- Refactor AI service candidate models to include provider-aware candidates.
- Implement Gemini `generateContent` REST transport and response parsing.
- Update UI model selector with Gemini options.
- Add tests for Gemini payloads, fallback, and missing-key behavior.

## Unit Test Plan

Unit tests needed:

- Yes.

Planned tests:

- Gemini chat succeeds with mocked REST response.
- Auto fallback reaches Gemini when GLM is unavailable/rate-limited.
- Explicit Gemini model returns missing-key fallback if key is not configured.
- Gemini provider errors are surfaced clearly.

If no unit tests are needed, explain why:

- Not applicable.

## File Size Check

Files expected to be edited:

- [ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/services/ai.py)
- [config.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/core/config.py)
- [FloatingAssistant.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/FloatingAssistant.tsx)
- [test_ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/tests/test_ai.py)

Line-count risk:

- Low. Edited files are below 1000 lines.

If any file exceeds 1000 lines, explain why.

- Not expected.

## Verification Plan

- Run `.venv/bin/pytest tests/test_ai.py`.
- Run full `.venv/bin/pytest` and record unrelated failures.
- Run `npm run build` and record unrelated failures.
- Smoke-test a mocked or live Gemini call only if a key is available, without
  printing secrets.

## Completion Notes

Changed files:

- [decisions.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/business/decisions.md) - Added optional multi-provider AI decision.
- [feature-initialization-workspace.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-initialization-workspace.md) - Added `GEMINI_API_KEY` and clarified chat vs research key requirements.
- [requirements-index.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/requirements-index.md) - Updated provider env vars and generic AI summarization wording.
- [ai-integrations.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/ai-integrations.md) - Documented Gemini free-tier provider constraints and testing guidance.
- [config.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/core/config.py) - Added Gemini key/base URL and chat-provider readiness.
- [workspace.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/core/workspace.py) - Added Gemini/provider readiness fields to workspace status.
- [ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/services/ai.py) - Added provider-aware model selection, Gemini REST `generateContent` transport, Gemini response parsing, and GLM-to-Gemini auto fallback.
- [FloatingAssistant.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/FloatingAssistant.tsx) - Added Google AI Studio Gemini model options.
- [test_ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/tests/test_ai.py) - Added Gemini and fallback tests.
- [.env.example](/Users/fahadpathan/Documents/ScholarDock/.env.example) - Added Gemini env placeholders.
- [README.md](/Users/fahadpathan/Documents/ScholarDock/README.md) - Updated AI provider list.

Verification completed:

- Official Google AI docs checked for `generateContent`, `x-goog-api-key`,
  available Flash/Flash-Lite models, and free-tier/rate-limit constraints.
- `.venv/bin/pytest tests/test_ai.py` passes: 11 passed.
- Full `.venv/bin/pytest` still has one unrelated failure:
  `test_create_sheet_with_single_default_table` expects `BSC cert`.
- `npm run build` still fails on unrelated ProjectWorkspace and Whiteboard
  TypeScript errors; no Gemini/FloatingAssistant errors were reported.
- Browser smoke confirms the assistant model selector shows Gemini 2.5
  Flash-Lite and Gemini 2.5 Flash options.
- Local `.env` currently has no `GEMINI_API_KEY` line, so live Gemini smoke was
  not run with a real secret.

Unit tests added or updated:

- Added tests for Gemini-only chat, GLM rate-limit auto fallback to Gemini,
  explicit Gemini missing-key fallback, and Gemini provider-error wording.

Follow-ups:

- Add the user's real `GEMINI_API_KEY` locally before live Gemini testing.
- Resolve unrelated ProjectWorkspace/Whiteboard TypeScript failures.
- Resolve unrelated sheet default column test failure.
