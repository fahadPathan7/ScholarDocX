# ScholarDocX

ScholarDocX is a secure personal workspace, privacy-first higher education application management portal.

It is designed for students and researchers applying to Bachelor's, Master's, and PhD programs who need one private workspace for applications, deadlines, documents, outreach, and AI-assisted academic research.

## Current Status

The project is a cloud-deployed web application (see SCHOLARDOCX-0139). The MVP
runs on free-tier cloud hosting: a FastAPI backend, a Postgres database, and
cloud object storage for uploaded files.

What exists:

- AI-DLC context structure
- Business, functional, technical, workflow, and Jira-style task docs
- Root agent rules
- Coding rules
- Testing expectations
- FastAPI backend with JWT auth, Role-Based Access Control (RBAC), invite-code
  registration, and optional paid self-registration (Basic/Pro/Max plans)
- PostgreSQL-backed persistence (Supabase), with cloud object storage for media
  and document uploads
- Polar (polar.sh) billing integration for plan purchases, subscription
  lifecycle, and webhook-reconciled activation
- React/Vite/TypeScript frontend with Tailwind CSS
- Dashboard, hierarchy, documents, files, outreach, reminders, and AI assistant
- Project workspaces created from Targets/Projects
- Projects root with create/view/open flow
- Sheets inside each project, with default pages/tabs
- Editable, addable, and deletable sheet rows and columns
- Sheet-generated Add Record forms
- Outreach, follow-up, response, central application, and document-link tracking
  inside sheet records
- Date-based row highlighting for due items
- Per-project dashboard focused on dates, next moves, and counts
- Central notifications
- Collapsible left navigation
- Top-right collapsible/expandable AI assistant panel
- Advisor Atlas for evidence-backed professor discovery, fit ranking, dossiers,
  publication reading paths, recruitment signals, comparison, and shortlists
- Scholarship opportunities discovery and deep-hunt research
- Profile page with plan/subscription details
- About page for storage, AI, and email-compose details
- Backend unit tests

Not included yet:

- Google OAuth implementation
- SMTP email sending
- Full rich-text editor package
- Automatic Gmail/Outlook attachment insertion through compose links

## Core Product Direction

ScholarDocX helps users manage:

- Degree workspaces for Bachelor's, Master's, and PhD
- Projects for each application campaign
- Sheets and default pages for tracking universities, professors, ranks, research fit, emails, responses, follow-ups, attachments, linked documents, dates, and status
- Countries, regions, universities, programs, and professors
- Application statuses and deadlines
- SOPs, research proposals, LOR drafts, and personal statements
- Static files such as CVs, transcripts, certificates, and test scores
- Email templates, outreach logs, attachments, and follow-up reminders
- GLM, Google AI Studio Gemini, Groq, Mistral, OpenRouter, and Tavily-assisted
  research and drafting

## Product Principles

- Secure personal workspace data ownership
- Privacy-first defaults
- Zero required infrastructure cost (free-tier cloud hosting)
- Optional external AI/search APIs (server-side keys, explicit user actions)
- Context-first AI-DLC development
- Small, modular files that future AI agents can understand quickly

## Stack

- Frontend: React/Vite/TypeScript with Tailwind CSS
- Backend: Python FastAPI
- Database: PostgreSQL (Supabase)
- File storage: cloud object storage (Supabase Storage)
- Hosting: Render (free-tier Web Service + Static Site); see `render.yaml`
- Billing: Polar (polar.sh) for plan purchases and subscription lifecycle
- AI integrations: GLM-5.1, GLM vision, Google AI Studio Gemini, Groq, Mistral,
  OpenRouter, and Tavily

## Local Setup

The app reads its database and storage credentials from environment variables
(see `.env.example`). For local development, point `DATABASE_URL` at a Postgres
instance and configure the storage/AI provider keys you want to exercise.

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Bind 0.0.0.0 so the API is reachable from other devices on the LAN (matches the
# frontend's `vite --host 0.0.0.0`). Without it, mobile/LAN access fails on login.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

Open [http://localhost:5173](http://localhost:5173).

Backend health: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health).

## Deployment

ScholarDocX is deployed to Render using `render.yaml` at the repo root
(SCHOLARDOCX-0139):

- **Backend** — FastAPI Web Service running uvicorn. Set `DATABASE_URL`,
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET`, and the AI/billing
  secrets in the Render dashboard under Environment.
- **Frontend** — Vite Static Site. Render builds it and serves `dist/`, with
  `VITE_API_BASE_URL` injected to point at the backend.
- **Database / storage** — Supabase Postgres pooler URL and a storage bucket
  for media uploads.

Free-tier notes: the backend Web Service sleeps after 15 min of idle. Unpaid
pending accounts are reaped every 2h by a scheduled cleanup plus a lazy safety
net on login (see the paid-registration Jira task).

## Access Control (RBAC) & Admin setup

The application supports Role-Based Access Control. **No default super admin is
auto-seeded on fresh database initialization** (SCHOLARDOCX-0140 — a committed
account with a publicly-known password hash was a security risk). Super admins
are created explicitly via `backend/scripts/create_superadmin.py`, which prompts
for credentials. The RBAC roles and permissions are defined in
`backend/app/services/admin.py` and seeded by `initialize_database()`.

Registration flow:

1. **Invite code** — an admin generates an invite code from the Admin Dashboard
   (or via the API). New users register with the code and get the `general_user`
   role by default.
2. **Paid self-registration** (admin-configurable via the `registration_mode`
   app setting) — a user can register without an invite code by purchasing a
   Basic/Pro/Max plan at signup. The account is created inert and activates
   automatically once the billing webhook confirms payment; unpaid accounts are
   deleted after 2 hours. Paid registration is rate-limited to 1 request / 24h
   per IP.

To manage users after setup: log in as a super admin to assign `pro_user` /
`max_user` roles, generate invite codes, toggle `registration_mode`, run the
pending-account cleanup, and adjust system limits via the Admin Dashboard.

## Tests

Backend:

```bash
cd backend
.venv/bin/pytest
```

Frontend build:

```bash
cd frontend
npm run build
```

## AI-DLC Workflow

Before implementing a new feature or modifying an existing feature:

1. Read [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), and [CODE_RULES.md](AI-Context/CODE_RULES.md).
2. Read [AI-Context/README.md](AI-Context/README.md).
3. Read the relevant business, functional, and technical context files.
4. Create or update a Jira task in [AI-Context/jira-tasks](AI-Context/jira-tasks).
5. Update context before code when behavior, architecture, data, or decisions change.
6. Implement the feature.
7. Add or update unit tests when the feature introduces meaningful behavior.
8. Update the Jira task with changed files, verification, and follow-ups.

## Important Rules

- Google OAuth 2.0 / OpenID Connect may be added later as an optional identity provider.
- Gmail/Outlook compose links can prefill to, subject, and body, but cannot automatically attach files without Gmail API or Microsoft Graph integration.
- Records and outreach live inside project sheets, not separate navigation areas.
- Documents are uploaded and linked; ScholarDocX does not author SOPs or proposals internally.
- Do not commit secrets or real API keys.
- Keep source files under 1000 lines when possible.
- A file may temporarily reach about 1150 lines during a cohesive feature, but split it before adding more work.
- Every feature should include unit tests when it introduces business logic, data transformation, validation, persistence, integration boundaries, or file system behavior.
- If unit tests are not needed, explain why in the Jira task.

## Context Map

- [AI-Context/business](AI-Context/business): product vision, users, requirements, decisions, risks
- [AI-Context/functional](AI-Context/functional): features, requirements, workflows, entity relationships
- [AI-Context/technical](AI-Context/technical): architecture, storage, APIs, AI integrations, auth, testing
- [AI-Context/jira-tasks](AI-Context/jira-tasks): task template, backlog, execution records
- [AI-Context/workflows](AI-Context/workflows): AI-DLC process and handoff rules

## Next Recommended Tasks

- Replace the MVP textarea document surface with a richer editor when document editing becomes central.
- Add Google OAuth only when there is clear value, such as Calendar/Gmail/Drive integration.
- Add Gmail API, Microsoft Graph, or SMTP only after web compose workflows are proven insufficient.

## Maintaining This README

Update this README when:

- The project status changes
- The stack is finalized
- Setup or run commands are added
- MVP scope changes
- Major architecture decisions are accepted
- Authentication, AI, storage, or testing policy changes
