# Feature: Initialization And Workspace

Requirement group: FR-1

## Goal

On first launch, ScholarDock creates the local folders and database needed for private application management.

## Required Workspace Shape

Initial recommended structure:

```text
workspace/
  db/
    app.db
  media/
    cvs/
    transcripts/
    certificates/
    test-scores/
    proposals/
    sop/
    other/
```

This structure may change during implementation, but any change must be recorded in technical context.

## Environment Variables

Expected variables:

- `GLM_API_KEY`
- `GEMINI_API_KEY`
- `TAVILY_API_KEY`

Rules:

- Missing AI keys should block AI features.
- Missing AI keys should not block core non-AI application tracking unless a later decision changes this.
- Chat and summarization should work when either `GLM_API_KEY` or
  `GEMINI_API_KEY` is configured.
- Web-assisted research requires Tavily plus at least one chat provider key.
- Real keys must not be committed.

## User Workflow

1. User launches app.
2. Backend checks whether local workspace exists.
3. Backend creates missing folders.
4. Backend creates or migrates SQLite database.
5. Backend validates optional AI configuration.
6. UI reports readiness and any missing optional integrations.

## Edge Cases

- Workspace directory exists but some child folders are missing.
- Database file exists but schema is outdated.
- `.env` is missing.
- API keys are missing or invalid.
- File permissions prevent workspace creation.
