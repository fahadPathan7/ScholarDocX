# Project Structure

This file defines the expected future organization. It is a guide, not current code.

## Current Repository State

The repository contains AI-DLC context plus the MVP product scaffold.

AI-agent workflow skills are stored in `AI-Context/agent-skills/` as repo-carried `SKILL.md` folders.

The upstream `ui-ux-pro-max` skill is also installed into project-local agent folders (`.claude/`, `.codex/`, `.gemini/`, and other supported AI assistant folders) for direct agent discovery.

## Actual MVP Structure

```text
.claude/
  skills/
    ui-ux-pro-max/
.codex/
  skills/
    ui-ux-pro-max/
.gemini/
  skills/
    ui-ux-pro-max/

AI-Context/
  agent-skills/
    scholardock-coding/
    scholardock-context-update/
    scholardock-test-cases/
    scholardock-context-review/
    scholardock-ui-ux/
    scholardock-ai-integrations/
    scholardock-security-privacy/
    scholardock-handoff/

frontend/
  index.html
  package.json
  tailwind.config.js
  src/
    App.tsx
    main.tsx
    components/
      AboutView.tsx
      CalendarMonthView.tsx
      FloatingAssistant.tsx
      ProjectDashboard.tsx
      NotificationsView.tsx
      ProfileView.tsx
      ProjectWorkspace.tsx
      SheetRecordFields.tsx
      StickyNotesView.tsx
    data/
    lib/
      api.ts
      email.ts
    styles.css

backend/
  requirements.txt
  pytest.ini
  app/
    api/
    core/
    db/
    services/
  tests/

workspace/
  db/
  media/
```

## Feature Module Guidance

Prefer feature-oriented folders when practical:

- dashboard
- hierarchy
- documents
- files
- outreach
- reminders
- ai-assistant
- settings

## Naming Guidance

- Use clear names over abbreviations.
- Keep provider-specific code under integrations.
- Keep database access in repositories or equivalent data access modules.
- Keep business workflows in services.
- Keep API routes thin.
- Keep UI components focused and reusable only when reuse is real.

## Context Rule

When actual code structure is created, update this file to match reality.
