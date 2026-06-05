# SCHOLAR-0057: Gemini 2.5 Pro, Remove Auto-Select, Prompt/Memory Audit

Status: Done

Owner: AI Agent

Created: 2026-05-29

Completed: 2026-05-29

## Summary

Add Gemini 2.5 Pro model option, remove "Auto Select Model" from the UI, add
a separate background model selector for routing/summarization tasks, and audit
system prompts and chat memory structure for correctness.

## Business Context

Links:

- [decisions.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/business/decisions.md)

Business value:

- Gives users access to Gemini's most intelligent free-tier model for complex
  reasoning tasks while keeping explicit control over model selection.
- Eliminates hidden auto-fallback behavior that could cause unexpected model
  usage or rate limit consumption.

## Functional Context

Links:

- [feature-ai-assistant.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-ai-assistant.md)

Requirements:

- FR-5.1: Users can access a persistent chatbot interface with explicit model control.
- FR-5.2: Backend can combine web search with AI summarization using user-chosen models.

## Technical Context

Links:

- [ai-integrations.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/technical/ai-integrations.md)

Technical notes:

- Gemini 2.5 Pro free tier: 5 RPM, 100 RPD. Best for complex tasks, not public chatbot.
- Gemini 2.5 Flash free tier: 10 RPM, 250 RPD. Good for summarization, translation.
- Gemini 2.5 Flash-Lite free tier: 15 RPM, 1000 RPD. Best for high-volume chat.
- User explicitly selects both chat model and background model (routing/summarization).
- No auto-select or auto-fallback model cycling.

## Scope

In scope:

- Add `gemini-2.5-pro` to backend model list.
- Remove `AUTO_FAST_MODEL` constant and auto-fallback model cycling.
- Add `background_model` param to research endpoint and `model` param to summarize endpoint.
- Remove "Auto Select Model" option from frontend dropdown.
- Add Gemini 2.5 Pro to frontend model selector.
- Add second "Background Model" selector for routing/summarization.
- Audit system prompts and chat memory structure.
- Update tests.

Out of scope:

- Fixing unrelated ProjectWorkspace/Whiteboard TypeScript errors.
- Fixing unrelated sheet default column test failure.

## Acceptance Criteria

- No "Auto Select Model" option in the UI.
- Gemini 2.5 Pro appears in both Chat Model and Background Model selectors.
- Two separate model selectors: one for chat, one for background tasks.
- Background model is sent to `/ai/research` and `/ai/summarize` endpoints.
- System prompts unchanged (audit confirmed correct).
- Chat memory structure unchanged (audit confirmed correct).
- All 11 AI tests pass.

## Implementation Plan

- Add `gemini-2.5-pro` to `DEFAULT_GEMINI_MODELS` in `ai.py`.
- Remove `AUTO_FAST_MODEL` and auto-fallback cycling from `_candidate_models()`.
- Add `_default_fast_model()` helper for fallback when no model is specified.
- Update `research()` to accept `background_model`, `summarize_memory()` to accept `model`.
- Add `background_model` to `AiPayload`, `model` to `SummarizePayload` in routes.
- Update FloatingAssistant: remove auto-select, add Pro, add background selector.
- Update tests to pass explicit model params.

## Unit Test Plan

Unit tests needed:

- Yes (updated existing tests).

Planned tests:

- All 11 existing tests updated and passing.
- Missing-key summarization with explicit model.
- Provider-error summary dropping with explicit model.
- Research routing with explicit background_model.
- Explicit Gemini missing-key fallback message updated.

If no unit tests are needed, explain why:

- Not applicable.

## File Size Check

Files expected to be edited:

- [ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/services/ai.py)
- [routes.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/api/routes.py)
- [FloatingAssistant.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/FloatingAssistant.tsx)
- [test_ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/tests/test_ai.py)

Line-count risk:

- Low. All edited files remain well under 1000 lines.

## Verification Plan

- Run `.venv/bin/pytest tests/test_ai.py` — all 11 passed.
- Run `npx tsc --noEmit` — no FloatingAssistant errors; 5 pre-existing unrelated errors.

## Completion Notes

Changed files:

- [ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/services/ai.py) — Added gemini-2.5-pro, removed AUTO_FAST_MODEL, added _default_fast_model(), updated research/summarize signatures, updated error message.
- [routes.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/api/routes.py) — Added background_model to AiPayload, model to SummarizePayload, passed through to service.
- [FloatingAssistant.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/FloatingAssistant.tsx) — Removed Auto Select, added Gemini 2.5 Pro, added background model selector, default to Flash-Lite.
- [test_ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/tests/test_ai.py) — Updated tests with explicit model/background_model params.

Verification completed:

- `.venv/bin/pytest tests/test_ai.py` passes: 11 passed.
- `npx tsc --noEmit` reports no FloatingAssistant errors; 5 pre-existing in ProjectWorkspace/WhiteboardView.

System prompt audit:

- SCHOLARDOCK_SYSTEM_PROMPT: Correct — concise, privacy-aware, domain-flexible.
- ROUTING_SYSTEM_PROMPT: Correct — strict JSON-only, domain-neutral.
- MEMORY_SUMMARY_SYSTEM_PROMPT: Correct — preserves goals, drops filler, 600-token limit.

Chat memory audit:

- Rolling summary trigger at 4+ messages: Correct.
- Failed summary protection via FAILED_SUMMARY_MODES: Correct.
- Context labels [Conversation Summary So Far] / [Last Turn]: Correct.
- localStorage session storage: Correct (local-first).
- History limit of 5 sessions: Correct.

Follow-ups:

- Resolve unrelated TypeScript errors in ProjectWorkspace/WhiteboardView.
- Resolve unrelated sheet default column test failure.
