# SCHOLARDOCX-0067 — Role Limits UI Audit and AI Usage-Limit Wiring

Status: In Progress


Owner: AI Agent

Epic: Epic-AuthAndRBAC

Created: 2026-06-04

## Summary
Audit and fix the Role Limits / usage limits UI display and AI usage-limit wiring so that:
- Boolean permissions display as permission controls (Enabled/Disabled), not numeric quotas
- `can_use_agents` is a permission check only (no consumption)
- `can_use_*` model features are permission checks only (already correct)
- Add `can_use_9router` so assistant/provider guards cover local 9Router
  models the same way they cover GLM/Gemini/Groq/Mistral.
- AI chat correctly consumes `ai_messages_per_session`, `daily_ai_chats`, `monthly_ai_chats` (already correct)
- Web research consumes `web_searches_per_month` alongside `web_searches_per_day`
- Frontend refreshes usage after action execution
- AdminView.tsx is split to respect the 1000-line file-size limit

## Business Context
Links:

- Business file: `AI-Context/business/`
- Functional file: `AI-Context/functional/feature-ai-assistant.md`

Business value:

- Accurate permission display prevents admin confusion about what is a quota vs permission.
- Correct usage wiring prevents under/over-charging user quotas.
- File-size split improves maintainability.

## Functional Context
Links:

- Functional file: `AI-Context/functional/feature-ai-assistant.md`
- Functional file: `AI-Context/functional/feature-authentication.md`

Requirements:

- FR-5.x: AI features consume correct quotas.
- FR-6.8: Role limits display and edit correctly.
- FR-7.21: Blocked actions show styled alerts.

## Technical Context
Links:

- Technical file: `AI-Context/technical/ai-integrations.md`
- Technical file: `AI-Context/technical/authentication-and-identity.md`

Technical notes:

- Backend `check_and_increment_limit` with increment=0 means permission check only.
- `can_use_agents` is called with increment=1 in both `/ai/actions/plan` and `/ai/actions/execute` — must be changed to increment=0.
- `web_searches_per_month` is not consumed in `/ai/research` — must be added.
- 9Router assistant support must reuse the same role-limit guard path and
  stale-model recovery UX as the other providers.
- AdminView.tsx at 1291 lines must be split; LimitsTab extracted to separate file.
- FloatingAssistant confirmActionPlan does not call refreshUsage — must be added.

## Scope
In scope:

- Fix `can_use_agents` to permission check only (increment=0) in plan and execute endpoints.
- Add `can_use_9router` defaults for user roles and expose models discovered
  from the local 9Router service for assistant chat/background selections.
- Add `web_searches_per_month` consumption in `/ai/research`.
- Extract LimitsTab from AdminView.tsx into its own component file.
- Ensure FloatingAssistant refreshes usage after action execution.
- Add backend tests for permission-only features and AI usage increments.
- Make assistant model selectors reflect `can_use_gemini/glm/groq/mistral`
  permissions and prevent blocked provider selection in chat settings.
- Ensure `/ai/summarize` enforces the same model permission checks as chat and
  research.

Out of scope:

- Redesigning LimitsTab layout (already looks polished).
- Changing auth model or role structure.
- Adding new features not listed.

## Acceptance Criteria

- `can_use_agents` is never consumed/incremented in plan or execute — only checked.
- `can_use_gemini/glm/groq/mistral` are never consumed — only checked (already correct).
- `can_use_9router` is never consumed — only checked.
- `/ai/research` consumes `web_searches_per_month` when web search is performed.
- FloatingAssistant calls `refreshUsage()` after successful action execution.
- AdminView.tsx is under 1000 lines after extracting LimitsTab.
- LimitsTab displays boolean features as Enabled/Disabled with toggle in edit modal.
- Backend tests pass for permission-only behavior and usage increments.
- Frontend builds without errors.

## Implementation Plan

1. Fix backend `/ai/actions/plan` and `/ai/actions/execute` to use `increment=0` for `can_use_agents`.
2. Add `can_use_9router` to role defaults, migrations, canonical feature lists, and admin role-limit editing UI.
3. Add local 9Router model discovery and backend provider transport/guard support.
4. Add `web_searches_per_month` consumption in `/ai/research`.
5. Extract LimitsTab from AdminView.tsx into `frontend/src/components/RoleLimitsTab.tsx`.
6. Add `refreshUsage()` call after `confirmActionPlan` execution in FloatingAssistant.
7. Add backend tests.
8. Verify with `pytest` and `npm run build`.
9. Update context files.

## Unit Test Plan
Unit tests needed:

- Yes

Planned tests:

- Test that `can_use_agents` with limit_count=1 does NOT increment usage counter.
- Test that `can_use_agents` with limit_count=0 blocks with 403.
- Test that AI chat increments `daily_ai_chats` usage counter.
- Test that web research increments `web_searches_per_day` AND `web_searches_per_month`.
- Test that `can_use_gemini` does NOT increment usage counter.
- Test that 9Router models map to `can_use_9router`.
- Test that explicit 9Router selection falls back locally when
  `NINE_ROUTER_API_KEY` is missing.

## File Size Check
Files expected to be edited:

- `backend/app/api/routes.py`
- `frontend/src/components/FloatingAssistant.tsx`
- `frontend/src/lib/assistantModels.ts`
- `frontend/src/styles.css`
- `backend/tests/test_ai_model_permissions.py` (new)
- Context/Jira markdown files

Line-count risk:

- Low (splitting reduces AdminView, new files are under limit)

## Verification Plan

- `pytest -q backend/tests`
- `npm --prefix frontend run build`
- Browser-check Admin Role Limits modal and AI assistant usage behavior

## Follow-up Notes

- Added a follow-up to close the gap between displayed role permissions and the
  assistant model picker. Restricted providers should no longer be selectable
  from settings, and stale saved values must recover to an allowed model.
- Extracted assistant model metadata/helpers out of `FloatingAssistant.tsx` so
  the file stays below the repo line-count target after the picker change.

## Follow-up Verification Results

- `pytest backend/tests/test_ai_model_permissions.py -q` passed.
- `npm --prefix frontend run build` passed.
- Browser verification was not run in this follow-up turn.

## 9Router Follow-up Notes

- Added `can_use_9router` across role defaults, schema seeds, migration
  backfills, canonical role-limit cleanup, admin role-limit editing, assistant
  provider metadata, and access-error labels.
- Added local 9Router assistant support for chat, summarize, research
  synthesis, and AI action planning through the existing backend provider
  service boundary. Models are discovered dynamically from `/v1/models`.
- Fixed `/ai/actions/execute` to check `can_use_agents` with `increment=0` so
  execution confirmation does not consume a fake quota counter.

Changed files:

- `backend/app/api/routes.py`
- `backend/app/core/config.py`
- `backend/app/db/connection.py`
- `backend/app/db/schema.py`
- `backend/app/services/admin.py`
- `backend/app/services/ai.py`
- `backend/tests/test_ai.py`
- `backend/tests/test_ai_model_permissions.py`
- `frontend/src/components/AdminView.tsx`
- `frontend/src/lib/accessErrors.ts`
- `frontend/src/lib/assistantModels.ts`
- `.env.example`
- `AI-Context/functional/feature-ai-assistant.md`
- `AI-Context/technical/ai-integrations.md`

Verification:

- `pytest -q backend/tests/test_ai.py backend/tests/test_ai_model_permissions.py backend/tests/test_news_query_generator.py` passed.
- `npm --prefix frontend run build` passed.
- Browser verification opened the assistant settings as the local Max-role
  account. With 9Router stopped and no `NINE_ROUTER_API_KEY`, the UI showed the
  expected configuration message without affecting the existing model options.
- Direct `http://localhost:20128/v1/models` verification was unavailable
  because the local 9Router process was not running during this task.

## Local 9Router Setup Verification

- Installed official `9router@0.4.71` globally and enabled its macOS
  LaunchAgent.
- Restricted the local service to `127.0.0.1:20128`.
- Connected the no-auth OpenCode provider and selected
  `oc/deepseek-v4-flash-free` as ScholarDocX's default routed model.
- Stored the generated endpoint key only in the ignored root `.env`.
- Added the configured default model to model discovery because 9Router's
  catalog does not advertise this custom OpenCode model.
- Set `stream: false` on 9Router chat requests so responses are parsed as one
  OpenAI-compatible JSON document.
- `pytest -q backend/tests/test_ai.py backend/tests/test_ai_model_permissions.py`
  passed with 20 tests.
- Authenticated `/api/ai/models/9router` returned configured and reachable with
  the default free model present.
- Authenticated `/api/ai/chat` returned `ScholarDocX 9Router ready` through
  `9router:oc/deepseek-v4-flash-free`.
