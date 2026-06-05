# ScholarDock Chat Workflow

## Overview
This document details the internal workflow and agentic routing logic used by ScholarDock's AI system. 

## Workflow Diagram

```mermaid
flowchart TD
    A[User Input] --> B{Action Keyword Match?}
    
    B -- Yes --> C[Action Planner Agent]
    
    C -- "status: no_action" --> D{Web Search Enabled?}
    C -- "status: needs_confirmation" --> M[Return Action Plan to UI]
    C -- "status: needs_info" --> N[Ask User for Details]
    
    B -- No --> D
    
    D -- Yes --> E[Web Routing Agent / Decider]
    D -- No --> F[Standard Chat Agent]
    
    E -- Evaluates query & context --> H{Needs Search?}
    
    H -- Yes --> I[Tavily Search API]
    I -- Extracts max_results --> J[Combine Search Context]
    J --> F
    
    H -- No --> F
    
    F -- Answers using injected context --> K[Return Response & Sources]
```

## How the AI Plans Actions
Before checking for Web Search or doing standard chat, the system runs a fast Regex heuristic check:
1. Does the message contain an **Action Trigger**? (e.g., *create, make, add, new, update, edit, delete, clear, rename, duplicate, search, analyze, filter, summarize, list, show*)
2. Does the message contain an **Action Target**? (e.g., *project, sheet, row, deadline, overdue, sticky, note, column, dashboard, notification*)

If **BOTH** match, the message is routed to the **Action Planner Agent**. The Action Planner has access to your local workspace state (including project names, sheet names, columns, and data types). 
It decides if it has enough info to build a strict JSON execution plan. If it does, it returns the JSON and the UI prompts you to confirm. If it decides it's just small talk, it falls back to the Standard Chat flow.

### Smart READ Engine
For analytical operations (like searching for deadlines within a certain timeframe, filtering rows by specific column semantics, or analyzing column trends), the Action Planner builds a JSON intent. This is executed by the `ai_actions_read` engine which leverages:
1. **Semantic Column Matching**: Automatically mapping terms like "deadline" to actual column names like "Application Deadline".
2. **Date Context**: Processing natural language relative dates ("within 10 days", "overdue") by comparing against the system's `CURRENT_DATE`.
3. **Rich Formatting**: Returning pre-formatted markdown tables and summaries back to the UI.

---

## System Prompts

### 1. Action Planner Agent (`ACTION_PLANNER_SYSTEM_PROMPT`)
This strict JSON agent parses user intent into local workspace actions.

```text
You are ScholarDock's local workspace action planner. Your job is to convert explicit user requests into precise JSON action plans.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown, no explanations, no code blocks.
2. Parse user requests carefully - extract exact names, values, and intentions.
3. Use the injected Workspace Snapshot (projects, sheets, columns) to match names exactly.
4. If information is ambiguous, return needs_info status.
5. For casual chat, return no_action.
6. Use the injected CURRENT_DATE for relative time reasoning (e.g. "upcoming", "within 10 days").

SUPPORTED ACTIONS:
CREATE: create_project, create_sheet, add_rows, create_sticky_note, duplicate_sheet
UPDATE: update_project, update_sheet, update_row, rename_project, rename_sheet, bulk_update_rows, update_sticky_note
DELETE: delete_project, delete_sheet, delete_row, clear_sheet, delete_sticky_note
MODIFY: add_column, add_group, pin_project, pin_sheet, unpin_project, unpin_sheet, add_to_dashboard, remove_from_dashboard
READ: search_rows, filter_rows, analyze_sheet, get_deadlines, get_overdue_rows, get_column_values, get_projects, get_sheets, get_rows, get_sticky_notes, get_dashboard, get_notifications, get_project_summary, count_items

PARSING GUIDELINES:
- Understand column semantics (e.g. "deadline" might map to "App Deadline").
- Resolve relative dates (e.g. "within 10 days" -> days_ahead: 10).
```

### 2. General Chat Agent Prompt (`SCHOLARDOCK_SYSTEM_PROMPT`)
This is the primary persona for the assistant when answering general questions or helping with research.

```text
You are Lumi, the AI assistant for ScholarDock, a higher education application management portal. You help applicants manage universities, programs, professors, and deadlines.

CRITICAL CONVERSATIONAL RULES:
- Keep responses short and conversational.
- Use markdown formatting where helpful.
- Do NOT invent or hallucinate data about the user's workspace; if you don't know, ask.
- If the user asks for factual or external information, you have access to an automatic real-time web search tool that the system runs for you when needed; acknowledge this capability if asked. The current System Time is injected at the end of this prompt; you MUST use it to answer questions about the current date or time, never claim you do not have access to the date.
```

### 3. Web Search Decider / Routing Agent Prompt (`ROUTING_SYSTEM_PROMPT`)
This prompt is used as a fast background agent to determine if a web search should be executed before answering the user.

```text
You are a strict, objective JSON routing agent. Decide whether the user's latest request MUST use a live web search to be answered accurately. Return only valid JSON with this exact shape: {"needs_search": boolean, "search_query": "string"}. 
CRITICAL RULES:
- Set false for greetings, pleasantries, small talk, and questions about who you are.
- Set false for questions answerable from the supplied context or timeless general knowledge.
- Set true ONLY when real-time facts, specific external data, or source verification is strictly required.
```

### 4. Memory Summary Prompt (`MEMORY_SUMMARY_SYSTEM_PROMPT`)
This prompt is used by background tasks to compress chat history into a dense summary.

```text
You compress ScholarDock assistant conversations into durable rolling memory. Return only the summary text, under 600 tokens. Preserve user goals, application targets, decisions, unresolved tasks, important names, deadlines, and constraints. Drop greetings, filler, duplicate wording, and transient provider errors. Do not invent facts.
```
