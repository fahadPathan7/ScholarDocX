# Feature: AI Assistant

Requirement group: FR-5

## Goal

The AI assistant helps with research, summarization, drafting, and review while keeping user control and privacy clear.

## Providers

- GLM AI API: chat, completion, summarization, drafting. GLM-5.2 is the latest
  selectable model in the assistant picker; GLM-5.1, GLM-5, GLM-5-Turbo, and
  GLM-4.7 remain available.
- 9Router: optional local routing for chat and agent-planning models exposed
  through the assistant model picker when the local 9Router service and
  `NINE_ROUTER_API_KEY` are configured.
- Tavily API: real-time web search and research context.

## Chat UI

The assistant should appear on the top-right as a collapsible/expandable panel similar to browser Copilot.

Rules:

- Collapsed state should stay visible without blocking the workspace.
- Expanded state should support chat and research actions.
- The assistant should be available across core pages.
- The assistant trigger should live in the top-right header controls beside refresh.
- Model selectors in assistant settings must reflect role/provider permissions.
  Providers blocked by role limits should appear unavailable and must not be
  selected for chat or background tasks.
- 9Router models must follow the same role guard as GLM/Gemini/Groq/Mistral.
  If `can_use_9router` is disabled, saved 9Router selections must recover
  to an allowed provider instead of failing silently.
- Available 9Router models are loaded from the local 9Router `/v1/models`
  endpoint because the list depends on providers connected in its dashboard.

## Research Workflow

Example user request:

"Find recent publications by Prof. X at Y University."

Expected flow:

1. Frontend sends the user's request plus only explicit assistant context.
2. If web search hint is enabled, backend runs an objective routing step.
3. If routing says search is needed, or routing fails, backend runs Tavily.
4. Backend formats compact source context and sends it to GLM with the user request.
5. Backend returns a concise answer and source links where available.
6. User decides whether to save notes to an application, professor, or document.

The web search hint is not a separate assistant mode. It is a user-visible hint
that lets the backend decide whether live results are useful. Routing failures
must fail open to search instead of silently skipping Tavily.

## Chat Memory

The assistant uses rolling local memory:

- Frontend stores the full session in browser local storage only.
- After at least four messages in a session, frontend may request a compact
  rolling summary from `/ai/summarize`.
- Frontend sends the rolling summary plus the last completed turn with the next
  request.
- Failed summaries, local fallback messages, and provider-error messages should
  not replace the stored rolling summary.
- Memory context should be labeled clearly so backend prompts can distinguish
  conversation memory from the new user request.

The memory summary is for continuity, not permanent records. It should preserve
user goals, unresolved tasks, important constraints, and decisions, while
dropping casual filler.

## Context-Aware Drafting

AI may use:

- Current document text
- Email draft text
- Application metadata
- Professor notes
- University/program context

Only send context that is needed for the user's explicit AI request.

When the user asks outside the higher-education domain, the assistant may answer
briefly and directly if the user explicitly invoked chat or web search. It
should not force an academic-admissions disclaimer into every off-domain answer,
but it may offer a ScholarDocX-relevant follow-up when useful.

## Agentic Workspace Actions

The assistant may prepare local workspace actions when the user explicitly asks
it to create, edit, delete, or read ScholarDocX data. Supported actions include:

- **Create**: Projects, sheets (and duplicates), rows, sticky notes.
- **Update/Modify**: Rename projects/sheets, update/bulk update rows, add columns/groups, pin/unpin items, dashboard management.
- **Delete**: Delete projects, sheets, rows, sticky notes, clear sheets.
- **Read & Analyze**: Semantic filtering, data aggregation, overdue/deadline fetching, unique column values, row searching, and project summaries.

Agentic action rules:

- The assistant must not mutate local data immediately from a chat message.
- The backend first returns an action plan for review (for both READ and WRITE operations).
- The UI must show a confirmation control before execution.
- If required information is missing, the assistant asks a focused follow-up
  question instead of guessing.
- Executed actions use normal backend storage services so data stays local.
- Analytical reads use local logic (e.g. `CURRENT_DATE` and column semantic mapping) instead of sending large tables to the LLM.
- Unsupported actions should fall back to ordinary chat or explain what is
  currently supported.
- `can_use_agents` remains a boolean permission guard only. Opening the action
  planner may consume normal AI chat quotas, but confirming execution must not
  consume an agent permission counter because the feature is not quota-based.

## Privacy UX

Before sending sensitive context to external AI providers, the UI should make it clear that the content will be sent externally.

## Model Access UX

- Role-limited providers such as GLM or Mistral must not remain selected when a
  user no longer has access.
- If a saved chat/background model becomes unavailable because of role limits,
  the assistant should recover to an allowed model and explain the change
  clearly.

## Non-Goals

- AI should not auto-submit applications.
- AI should not auto-send emails.
- AI should not overwrite user documents without confirmation.
- AI should not execute workspace mutations without explicit confirmation.
