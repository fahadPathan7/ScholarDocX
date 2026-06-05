# SCHOLAR-0025: Alerts Shell And AI Refinement

Status: Done

Owner: AI Agent

Created: 2026-05-27

Completed: 2026-05-27

## Summary

Move alerts out of project dashboard metrics and make the central Alerts tab
actionable. Add read/delete controls, click-through behavior where alerts can
be mapped to source rows, and toast feedback for unlinked alerts. Improve shell
scrolling and header positioning, and move the AI assistant trigger into the
top-right header controls. Validate GLM and Tavily configuration from local
environment without exposing secrets.

## Functional Context

Links:
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md)
- [feature-ai-assistant.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-ai-assistant.md)

## Requirements

- Project dashboards should not show alert counts.
- Alerts tab supports mark all read, delete one, and delete all read.
- Alerts show useful title/body metadata.
- Alerts navigate to linked source when possible.
- Unlinked alerts show a toast on click.
- Sidebar and main workspace have independent scroll areas.
- Main workspace heading area remains fixed while content scrolls.
- AI assistant trigger appears next to the refresh button.
- AI chat/research are tested with local `.env` keys without printing key values.

## Verification Plan

- Run frontend build: `npm run build`.
- Run backend tests: `.venv/bin/pytest`.
- Browser-check shell scroll/header, alerts actions, alert click behavior, AI trigger placement.
- Test `/api/ai/chat` and `/api/ai/research` using local `.env`.

## Completion Notes

Changed files:
- [App.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/App.tsx) - Added full notification loading, toast handling, alert navigation, sticky main header wrapper, and moved the AI trigger into top-right controls.
- [NotificationsView.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/NotificationsView.tsx) - Added read-all, delete-one, delete-read controls, title/body rendering, project-name display, linked row/project navigation, and toast fallback for unlinked alerts.
- [notifications.css](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/notifications.css) - Added Alerts tab styles.
- [FloatingAssistant.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/FloatingAssistant.tsx) - Changed assistant trigger to header button behavior, added provider privacy note, source rendering, loading text, and visible error handling.
- [ProjectDashboard.tsx](/Users/fahadpathan/Documents/ScholarDock/frontend/src/components/ProjectDashboard.tsx) - Removed project-level alert count metric.
- [styles.css](/Users/fahadpathan/Documents/ScholarDock/frontend/src/styles.css) - Added independent shell scrolling, sticky header, toast styling, and assistant active button styling.
- [ai.py](/Users/fahadpathan/Documents/ScholarDock/backend/app/services/ai.py) - Returned clear provider-error responses for GLM/Tavily HTTP failures instead of surfacing raw exceptions.
- [feature-dashboard-hierarchy.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-dashboard-hierarchy.md) and [feature-ai-assistant.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/functional/feature-ai-assistant.md) - Documented alerts, shell, and AI trigger behavior.

Verification completed:
- `npm run build` passes.
- `.venv/bin/pytest` passes.
- Browser checked: Alerts tab shows read/delete controls and proper project names; scheduled-email alert click opens the exact sheet row; AI button appears beside refresh and panel opens from the header.
- `.env` was checked without printing values. `GLM_API_KEY` and `TAVILY_API_KEY` keys exist but currently have zero-length values, so live AI tests returned local fallback with `external_call_made: false`.

File-size note:
- [styles.css](/Users/fahadpathan/Documents/ScholarDock/frontend/src/styles.css) is exactly 1150 lines after extracting alert styles, within the temporary grace limit.
