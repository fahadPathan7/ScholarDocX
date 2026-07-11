# Feature: AI Assistant

Requirement group: FR-5

## Goal

The AI assistant helps with research, summarization, drafting, and review while keeping user control and privacy clear.

## Providers

- GLM AI API: chat, completion, summarization, drafting. GLM-5.2 is the latest
  selectable model in the assistant picker; GLM-5.1, GLM-5, GLM-5-Turbo, and
  GLM-4.7 remain available.

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

- Frontend stores the full session in browser secure storage only.
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
it to create, edit, delete, or read ScholarDocX data. As of SCHOLARDOCX-0110
the agent covers every user-owned workspace domain, not only the sheet
workspace:

- **Sheet workspace**: Projects, sheets (and duplicates), rows, columns,
  groups, pins, dashboard placement, sticky notes.
- **Documents**: Documents and document versions (create, update metadata,
  add a new version, delete, list). The agent adds versions; it never
  overwrites an existing version's content.
- **Email & outreach**: Email templates, email drafts, outreach logs (with
  optional auto follow-up reminder), outreach response status.
- **Time management**: Reminders and deadlines, including complete/uncomplete
  and due/overdue queries.
- **Academic catalog**: Universities, programs, professors, and applications,
  with name-based linking (e.g. a professor can be attached to a university by
  name).
- **Research notes**: Create, update, delete, list.
- **Notifications**: Read and mark-as-read.
- **Read & Analyze**: Semantic filtering, data aggregation, overdue/deadline
  fetching, unique column values, row searching, and project summaries.

Excluded on purpose:

- **Admin tasks are never available to the agent**, regardless of the user's
  role: user management, suspensions, roles, role limits, invites, token
  grants, app settings, and AI model management. The planner refuses these
  with a clear message instead of planning them.
- Whiteboard canvas mutations, binary file uploads, sending emails, and any
  external side effects.

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
- Confirmed execution enforces the same plan role limits as manual routes
  (`total_projects`, `total_sheets`, `sheets_per_project`, `total_records`,
  `records_per_sheet`, `total_sticky_notes`). The agent cannot create records
  past the user's plan; violations show the standard limit-exceeded error.
- Relative dates in requests ("remind me in 3 days") are resolved by the
  planner using the backend's current date, never hard-coded.

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
