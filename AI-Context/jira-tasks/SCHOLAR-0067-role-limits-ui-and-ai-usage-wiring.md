# SCHOLAR-0067 — Role Limits UI Audit and AI Usage-Limit Wiring

## Status
In Progress

Owner: AI Agent

Created: 2026-06-04

## Summary
Audit and fix the Role Limits / usage limits UI display and AI usage-limit wiring so that:
- Boolean permissions display as permission controls (Enabled/Disabled), not numeric quotas
- `can_use_agents` is a permission check only (no consumption)
- `can_use_*` model features are permission checks only (already correct)
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
- AdminView.tsx at 1291 lines must be split; LimitsTab extracted to separate file.
- FloatingAssistant confirmActionPlan does not call refreshUsage — must be added.

## Scope
In scope:

- Fix `can_use_agents` to permission check only (increment=0) in plan and execute endpoints.
- Add `web_searches_per_month` consumption in `/ai/research`.
- Extract LimitsTab from AdminView.tsx into its own component file.
- Ensure FloatingAssistant refreshes usage after action execution.
- Add backend tests for permission-only features and AI usage increments.

Out of scope:

- Redesigning LimitsTab layout (already looks polished).
- Changing auth model or role structure.
- Adding new features not listed.

## Acceptance Criteria

- `can_use_agents` is never consumed/incremented in plan or execute — only checked.
- `can_use_gemini/glm/groq/mistral` are never consumed — only checked (already correct).
- `/ai/research` consumes `web_searches_per_month` when web search is performed.
- FloatingAssistant calls `refreshUsage()` after successful action execution.
- AdminView.tsx is under 1000 lines after extracting LimitsTab.
- LimitsTab displays boolean features as Enabled/Disabled with toggle in edit modal.
- Backend tests pass for permission-only behavior and usage increments.
- Frontend builds without errors.

## Implementation Plan

1. Fix backend `/ai/actions/plan` and `/ai/actions/execute` to use `increment=0` for `can_use_agents`.
2. Add `web_searches_per_month` consumption in `/ai/research`.
3. Extract LimitsTab from AdminView.tsx into `frontend/src/components/RoleLimitsTab.tsx`.
4. Add `refreshUsage()` call after `confirmActionPlan` execution in FloatingAssistant.
5. Add backend tests.
6. Verify with `pytest` and `npm run build`.
7. Update context files.

## Unit Test Plan
Unit tests needed:

- Yes

Planned tests:

- Test that `can_use_agents` with limit_count=1 does NOT increment usage counter.
- Test that `can_use_agents` with limit_count=0 blocks with 403.
- Test that AI chat increments `daily_ai_chats` usage counter.
- Test that web research increments `web_searches_per_day` AND `web_searches_per_month`.
- Test that `can_use_gemini` does NOT increment usage counter.

## File Size Check
Files expected to be edited:

- `backend/app/api/routes.py`
- `frontend/src/components/AdminView.tsx` (reduce from 1291 to ~300)
- `frontend/src/components/RoleLimitsTab.tsx` (new, ~530 lines)
- `frontend/src/components/FloatingAssistant.tsx`
- `backend/tests/test_usage_limits.py` (new)
- Context/Jira markdown files

Line-count risk:

- Low (splitting reduces AdminView, new files are under limit)

## Verification Plan

- `pytest -q backend/tests`
- `npm --prefix frontend run build`
- Browser-check Admin Role Limits modal and AI assistant usage behavior
