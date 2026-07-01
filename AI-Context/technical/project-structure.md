# Project Structure

This file defines the expected future organization. It is a guide, not current code.

## Current Repository State

The repository contains AI-DLC context plus the MVP product scaffold.

AI-agent workflow skills are stored directly in `.agents/skills`, `.claude/skills`, and `.codex/skills` as repo-carried `SKILL.md` folders.


## Actual MVP Structure

```text

AI-Context/
  agent-skills/
    scholardocx-coding/
    scholardocx-context-update/
    scholardocx-test-cases/
    scholardocx-context-review/

    scholardocx-ai-integrations/
    scholardocx-security-privacy/
    scholardocx-handoff/

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
