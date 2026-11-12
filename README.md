# ScholarDocX

**A private workspace for students applying to Master's and PhD programmes.** Track universities, professors and deadlines in spreadsheet-style sheets, keep documents in one vault, and use AI tools that find advisors, hunt scholarships and read research papers, with every change to your data confirmed by you first. **Bring your own AI:** connect Claude Code, Cursor or VS Code to your workspace over [MCP](#connect-your-own-ai-app) and let the AI you already use read your deadlines and suggest changes.

Live at **[scholardocx.onrender.com](https://scholardocx.onrender.com)** · React + FastAPI + PostgreSQL (pgvector) · deployed on free tiers.

---

## Screenshots

| | |
|---|---|
| ![Landing page](docs/screenshots/landing.png) **Landing** | ![Dashboard](docs/screenshots/dashboard.png) **Dashboard**: counts, pinned items, calendar, notes |
| ![Projects](docs/screenshots/projects.png) **Projects**: one per application goal | ![Project sheets](docs/screenshots/sheet.png) **Project view**: sheets, rows, dates |
| ![AI assistant](docs/screenshots/assistant.png) **Lumi, the AI assistant**: chat + workspace agent | ![Advisor Atlas](docs/screenshots/advisor-atlas.png) **Advisor Atlas**: find and rank professors |
| ![Scholarship Hunt](docs/screenshots/scholarship-hunt.png) **Scholarship Hunt**: goal-driven funding search | ![Research Expert](docs/screenshots/research-expert.png) **Research Expert**: ask questions of a paper |
| ![Sticky notes](docs/screenshots/sticky-notes.png) **Sticky notes** with checklists and due dates | |

---

## What's inside

- **Workspace**: projects → sheets → rows with typed columns, cell formatting, CSV import, undo, a calendar fed by date columns, sticky notes, a whiteboard and a document vault.
- **Lumi (AI assistant)**: chat with optional web search, plus a **workspace agent** that reads your data and prepares changes for you to confirm.
- **Advisor Atlas**: maps a university's departments, finds faculty, and builds evidence-backed dossiers on research fit and openings.
- **Scholarship Hunt**: turns a funding goal into searches, reads the pages, and returns structured opportunities.
- **Research Expert**: upload a PDF and ask questions; answers cite the passages they came from.
- **Connected apps**: connect an AI app you already use (Claude Code, Cursor, VS Code) to your workspace over MCP. It can read and *suggest* changes; you confirm each one in the app.
- **Accounts**: email + password with invite codes, or Google sign-in. Plans and AI credits (every AI call is metered).

---

## Architecture

```mermaid
flowchart LR
    U["Browser<br/>React + Vite SPA"] -->|"JWT (Bearer)"| API["FastAPI backend"]
    X["Your AI app<br/>Claude Code · Cursor"] -->|"access key · /mcp"| API
    API --> DB[("PostgreSQL + pgvector<br/>Supabase")]
    API --> ST[("Object storage<br/>uploaded files")]
    API --> LLM["Chat models<br/>GLM · Groq · Gemini · Mistral"]
    API --> SRCH["Search<br/>Brave · Tavily"]
    API --> EMB["Embeddings<br/>Jina"]
    API --> OA["OpenAlex<br/>publications"]
    API --> WEB["Public web<br/>(guarded crawler)"]
    U -->|"OAuth redirect"| G["Google sign-in"]
    G --> API
    API --> P["Polar<br/>billing"]
```

- The browser never talks to an AI or search provider. **All provider keys live only on the server.**
- Every user's rows are scoped by `user_id` in every query; files are opened through short-lived, file-scoped download tokens.
- Every provider call is charged to the user who caused it, checked before the call (`can_spend`) and charged after it. A guard script (`make guard-billing`) fails if any provider call doesn't charge.

---

## Agentic patterns used

The AI features are built from a small set of named patterns ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)) rather than one big prompt. Every pattern is bounded (step, concurrency and size caps) and every model call is metered.

| Pattern | Where it lives | How it is used here |
|---|---|---|
| **Tool-use agent** | Workspace assistant: [`ai_agent.py`](backend/app/services/ai_agent.py) · [flow](#how-the-ai-agent-works) | A loop of at most 5 model calls over a fixed catalogue of 40+ typed actions, exposed as two tools: `run_read_action` and `propose_changes`. Reads run inside the loop; model output is validated against the catalogue and never executed as code. The same read/propose split is [served to external AI apps over MCP](#connect-your-own-ai-app). |
| **Routing** | [`ai.py`](backend/app/services/ai.py), [`ai_actions.py`](backend/app/services/ai_actions.py) · [scope](#keeping-the-ai-on-task-prompt-injection-and-scope) | A cheap classifier call decides whether a question needs a live web search and writes the query; if it fails, the system searches. Account and admin requests are refused by pattern before any model runs. |
| **Prompt chaining** | Scholarship Hunt: [`scholarship_deep_hunt.py`](backend/app/services/scholarship_deep_hunt.py) · [pipeline](#how-scholarship-hunt-works) | Goal → query planner → search → snippet pre-filter → crawl → structured extraction → relevance judge → expiry and duplicate gates. Each model step feeds the next, with deterministic checks in between. |
| **Orchestrator–workers** | Advisor Atlas: [`service.py`](backend/app/services/advisor_atlas/service.py), [`analysis.py`](backend/app/services/advisor_atlas/analysis.py) · [pipeline](#how-advisor-atlas-works) | A code-driven orchestrator decides the sub-tasks at run time (units → candidate professors) and fans out bounded parallel workers (screening ×4, deep research ×2). Each deep-research worker runs four specialist passes and a final synthesis call. |
| **Evaluator** | Hunt's relevance judge: [`deep_hunt_query_planner.py`](backend/app/services/deep_hunt_query_planner.py) · the agent's validator · Atlas source checks | One batched judge call scores every extracted opportunity against the goal and the form filters, with a deterministic keyword fallback. The agent's validator returns errors to the model so it can fix a proposal. Atlas claims are checked against the sources they cite. |
| **Human-in-the-loop** | Every workspace write: [`ai_agent.py`](backend/app/services/ai_agent.py), `/ai/actions/execute` in [`routes.py`](backend/app/api/routes.py) | Writes are only ever proposed. The user confirms, an unanswered plan is marked superseded when they move on, and role limits are re-checked at execution. |

Each AI step has a non-AI fallback where one is possible (single-shot planner, keyword relevance match, search-by-default routing, deterministic dossier), so a provider outage degrades a result instead of failing a run.

---

## How the AI agent works

The assistant is connected to the workspace through **two tools**, in a bounded tool-calling loop (at most 5 model calls per message). Reads run immediately; **writes are only ever proposed**.

```mermaid
sequenceDiagram
    actor User
    participant UI as Assistant panel
    participant Agent as Agent loop (server)
    participant Model as Chat model
    participant WS as Workspace (DB)

    User->>UI: "Add a blank row after row 4 in my sheet"
    UI->>Agent: message + last 10 turns
    loop up to 5 steps
        Agent->>Model: system rules + action catalog + workspace snapshot
        alt model calls run_read_action
            Model-->>Agent: {type: get_rows, ...}
            Agent->>WS: validate + execute read
            WS-->>Agent: rows (bounded)
        else model calls propose_changes
            Model-->>Agent: [{type: add_rows, rows:[{}], insert_after_row:4}]
            Agent->>Agent: validate against catalog, send errors back to the model
            Agent-->>UI: plan + Confirm / Cancel
        else model replies in text
            Agent-->>UI: answer
        end
    end
    User->>UI: Confirm
    UI->>WS: execute plan (role limits re-checked)
    WS-->>UI: real result
```

- The model only produces **JSON action objects** from a fixed catalog; they are normalized and resolved by name on the server. Model output is never executed as code.
- Writing data takes a human click. An unanswered plan is marked *superseded* as soon as the user asks for something else.
- If a model can't do tool calling, a single-shot planner takes over automatically.

---

## Connect your own AI app

**Use the AI you already pay for on your own application data.** Basic, Pro and Max users can connect an AI app (Claude Code, Cursor, VS Code) to their workspace through a remote [MCP](https://modelcontextprotocol.io) server. The app can read projects, sheets, rows and deadlines and **suggest** changes; nothing changes until you confirm in ScholarDocX. ScholarDocX makes no model call on this path, so it uses none of your AI credits.

Things you can ask once connected:

- *"What deadlines do I have in the next 14 days across my MSc project?"*
- *"Which rows in my Professor Shortlist have no reply yet?"*
- *"Add a row for TU Munich, MSc Informatics, deadline 15 January."* The app proposes it, you click Confirm in ScholarDocX.

1. Profile → **Connected apps** → **Connect an app**. Choose *Can read* or *Can read and suggest changes* and copy the access key (shown once).
2. Add it to your app, for example in Claude Code:

```bash
claude mcp add --transport http scholardocx <backend-url>/mcp --header "Authorization: Bearer <access key>"
```

Cursor and VS Code take the same URL and header in their MCP settings file; the app shows ready-made snippets.

**Tools** (typed, static): `list_projects`, `list_sheets`, `get_rows`, `search_rows`, `filter_rows`, `get_deadlines`, `get_overdue_rows`, `get_dashboard`, and `propose_changes`.

**Security model**

- Access keys are separate from login sessions: random, only a hash is stored, header-only, expiring, revocable, capped at 5 per user, and killed by the same `token_version` bump as "log out everywhere".
- A session token is refused at `/mcp` and an access key is refused everywhere else.
- Writes are only *suggestions*, stored on the server and run by id when you confirm, with your own plan limits. Deletes, bulk edits, documents and outreach records are not reachable.
- Rows can contain pasted text, so tool results are labelled as data, and a hostile row can at worst create a suggestion you dismiss.
- Per-key rate limits, `Origin` checks, and logs that never contain keys or arguments. Design notes: [AI-Context/technical/mcp-server.md](AI-Context/technical/mcp-server.md).

---

## How the web crawler works

Advisor Atlas and Scholarship Hunt share one crawler, built to be polite and to never reach private networks.

```mermaid
flowchart TD
    A["URL to fetch"] --> B{"http/https?<br/>not localhost?"}
    B -- no --> X["reject"]
    B -- yes --> C["robots.txt check<br/>(follows redirects; 5xx = disallow)"]
    C -- disallowed --> X
    C -- allowed --> D["Per-host throttle<br/>0.45 s, shared across all runs"]
    D --> E["Resolve DNS once (non-blocking)<br/>every address must be public"]
    E -- private / CGNAT / loopback --> X
    E -- public --> F["Connect to that pinned IP<br/>Host header + TLS name unchanged"]
    F --> G{"redirect?"}
    G -- yes --> B
    G -- no --> H["Stream body, stop at size cap<br/>HTML/text 1.5 MB · images 4 MB"]
    H --> I["Parse text, links, tables,<br/>mailto + 'name [at] uni [dot] edu' emails"]
```

- **DNS-rebinding safe**: the address that was checked is the address that is connected to.
- Every redirect hop is re-validated, robots-checked and throttled again.
- Scraped text reaching a model is labelled *untrusted data, never instructions*; images are sent to the vision model as the bytes that were validated, never as a URL for the provider to fetch.

---

## How Scholarship Hunt works

```mermaid
flowchart LR
    G["Funding goal<br/>+ degree, countries, field, intake"] --> P["Query planner<br/>4 diverse queries,<br/>acronyms expanded"]
    P --> S["Search<br/>4 queries × 4 results"]
    S --> F["Pre-filter on snippets<br/>drop only clear contradictions:<br/>closed, stale, other country, other field"]
    F --> C["Crawl top pages"]
    C --> E["Extract structured facts<br/>from the page's relevant parts"]
    E --> R["Relevance judge<br/>sees goal + form filters"]
    R --> D["Drop expired / wrong country,<br/>de-duplicate by programme"]
    D --> O["Ranked opportunities<br/>save to your Library"]
```

- Missing facts stay empty; the extractor is told never to guess a deadline, amount or sponsor.
- All-fields programmes (e.g. national government scholarships) are kept but ranked below field-specific ones.
- Results live on the run until you save one; your Library holds up to 100.

---

## How Advisor Atlas works

```mermaid
flowchart TD
    I["University + research field<br/>(+ your research profile)"] --> M["Map related units<br/>departments, institutes, centres"]
    M --> FD["Per unit: search + crawl<br/>faculty directories"]
    FD --> CA["Candidate professors<br/>name checks, same-site links only"]
    CA --> SC["Screen every candidate<br/>targeted search + analysis"]
    SC --> TOP["Top 15 by fit"]
    TOP --> DR["Deep research<br/>8 search passes, crawl profile / lab pages,<br/>publications from OpenAlex"]
    DR --> AN["Specialist AI passes → synthesis"]
    AN --> DO["Dossier: research fit, recent work,<br/>funding, recruitment outlook, next steps"]
```

- A missing fact is acceptable; an invented one is not. Model output is checked against the sources it cites and reconciled with deterministic checks (name-matched emails, publication authorship, profile ownership).
- Publications come from the OpenAlex index rather than scraping, and Google Scholar restrictions are never bypassed.
- **Professor mode** skips discovery and runs the deep pass on one named professor.

---

## Sign-in: Google OAuth

Authorization Code flow with **PKCE**; the code exchange happens on the server, so no OAuth secret ever reaches the browser.

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant API as Backend
    participant G as Google

    User->>FE: "Sign in with Google"
    FE->>API: GET /auth/google/login
    API->>API: create state + nonce + PKCE verifier<br/>store in signed HttpOnly cookie (10 min)
    API-->>User: redirect to Google
    User->>G: choose account, consent
    G-->>API: callback with code + state
    API->>API: verify state cookie (CSRF)
    API->>G: exchange code + PKCE verifier
    G-->>API: id_token
    API->>API: verify signature (JWKS), aud, iss, nonce<br/>refuse unverified emails
    API-->>FE: redirect with app session token
    FE->>FE: store session, go to dashboard
```

- A verified Google email that matches an existing account is linked to it; nothing else is auto-linked.
- Only the identity is kept: no Google access or refresh tokens are stored.

---

## Sessions, secret rotation and "log out everywhere"

Sessions are signed JWTs (HS256, algorithm pinned on decode). Each token carries the user's `token_version`, and **every request compares it with the database**.

```mermaid
sequenceDiagram
    actor User
    participant API as Backend
    participant DB as users table

    Note over DB: token_version = 3
    User->>API: change password (or admin resets it)
    API->>DB: new hash, token_version = 4
    Note over User: Phone, laptop, old tabs<br/>still hold tokens with version 3
    User->>API: any request with an old token
    API->>DB: load user
    DB-->>API: token_version = 4
    API-->>User: 401 Token has been revoked
```

`token_version` is bumped on **password change, admin password reset, suspension and admin revocation**, so all existing sessions die at once without a token blocklist.

**Secrets and rotation**

- The signing secret comes only from the environment (`JWT_SECRET`); there is no fallback value. A placeholder secret that was once committed to the repo is recognised and refused.
- **Rotating `JWT_SECRET` signs every user out at once.** That is the response to a suspected leak.
- Provider keys (AI, search, embeddings, billing, Google OAuth) are server-side environment variables, so they can be rotated without a code change or a client release.
- File links use separate **5-minute, single-file download tokens**, so the long-lived session token never appears in a URL.

---

## Keeping the AI on task (prompt injection and scope)

Defences are layered, so no single prompt is the only line of defence:

```mermaid
flowchart TD
    M["User message"] --> A{"Admin / account command?<br/>roles, plans, tokens, users, invites"}
    A -- yes --> R["Refused before any model call"]
    A -- no --> B["Model with fixed rules"]
    B --> C{"Wants to change data?"}
    C -- no --> T["Answer (scoped to higher education;<br/>off-topic answered briefly)"]
    C -- yes --> D["Must use a catalogue action<br/>(no admin action exists to call)"]
    D --> E["Server validates and normalizes"]
    E --> F["User confirms"]
    F --> G["Executed with the same role limits<br/>as the normal UI"]
    W["Web pages · PDF text · images"] -.->|"framed as untrusted data,<br/>never instructions"| B
```

- **Commands for privileged actions go nowhere**: they are refused by pattern before the model runs, and the action catalogue simply has no admin actions for a model to call even if it tried.
- **Content is data, not instructions**: scraped pages, paper passages and images are explicitly framed as material to analyse; text inside them that tries to change the task is ignored.
- **No hidden side effects**: the model cannot write anything by itself. Every write is a typed action, validated on the server and confirmed by the user.
- **No false claims**: plain chat has no workspace access and is told never to say it changed anything.

---

## How chat memory works

```mermaid
flowchart LR
    subgraph EM["Each message"]
        S["Rolling summary<br/>(≤ 200 tokens)"]
        R["Last N exact turns<br/>(user picks N)"]
        Q["New question"]
    end
    S & R & Q --> AI["Model call"]
    AI --> ANS["Answer"]
    ANS --> BG["Background: summarize<br/>previous summary + this turn"]
    BG --> S
```

- After each reply, a cheap background call folds the newest turn into the **rolling summary**, keeping goals, decisions, names and deadlines and dropping small talk.
- Each request sends the summary plus the **last N turns verbatim**, so long chats stay cheap and still remember context.
- Chat history is stored in the browser **per user** (keyed by account), so people sharing a computer never see each other's chats.
- With web search on, a small routing step first decides whether a live search is needed at all.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind |
| Backend | FastAPI (Python 3.13), SQLAlchemy |
| Data | PostgreSQL + pgvector (Supabase), object storage |
| AI | GLM, Groq, Gemini, Mistral, OpenRouter · Jina embeddings |
| Search & data | Brave, Tavily, OpenAlex |
| Auth & billing | JWT, Google OAuth (PKCE), Polar |
| Integrations | Remote MCP server (Streamable HTTP, scoped access keys) |
| Hosting | Render (free tier) |

## Running it locally

```bash
make setup     # backend venv + frontend packages
make run       # FastAPI on :8000, Vite on :5173
make test      # backend pytest + frontend vitest
```

The backend reads its configuration from `backend/.env`: at minimum `DATABASE_URL` and `JWT_SECRET`, plus whichever provider keys you want enabled (for example `GLM_API_KEY`, `BRAVE_API_KEY`, `TAVILY_API_KEY`, `JINA_API_KEY`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`). Features whose keys are missing fall back gracefully or show as unavailable.

Backend tests run against a throwaway Postgres: `make test-db-start` (Docker).

## Repository layout

```
backend/     FastAPI app: api/ (routes), services/ (features, AI, crawler), auth/, db/
frontend/    React app: components/, lib/, contexts/
AI-Context/  living product + technical context and task history (AI-assisted development)
scripts/     guards: provider-call billing, context drift, CSS invariants
```

This repository is developed with an **AI-assisted workflow**: every change starts from a task in `AI-Context/jira-tasks/` and keeps the context files in `AI-Context/` current, so the reasoning behind each decision travels with the code.
