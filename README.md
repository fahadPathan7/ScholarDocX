# ScholarDock

ScholarDock is a local-first, privacy-first higher education application management portal.

It is designed for students and researchers applying to Bachelor's, Master's, and PhD programs who need one private workspace for applications, deadlines, documents, outreach, and AI-assisted academic research.

## Current Status

The project has a local-first MVP implementation.

Created so far:

- AI-DLC context structure
- Business, functional, technical, workflow, and Jira-style task docs
- Root agent rules
- Coding rules
- Testing expectations
- Optional Google OAuth guidance
- FastAPI backend
- SQLite schema and local workspace initialization
- React/Vite/Tailwind frontend
- Dashboard, hierarchy, documents, files, outreach, reminders, and AI assistant MVP
- Project workspaces created from Targets/Projects
- Projects root with create/view/open flow
- Sheets inside each project, with default pages/tabs
- Editable, addable, and deletable sheet rows and columns
- Sheet-generated Add Record forms
- Outreach, follow-up, response, central application, and document-link tracking inside sheet records
- Date-based row highlighting for due items
- Per-project dashboard focused on dates, next moves, and counts
- Central notifications
- Collapsible left navigation
- Top-right collapsible/expandable AI assistant panel
- Local profile page
- About page for storage, AI, and email-compose details
- Backend unit tests

Not included yet:

- Google OAuth implementation
- SMTP email sending
- Packaged desktop installer
- Cloud sync or hosted backend
- Full rich-text editor package
- Automatic Gmail/Outlook attachment insertion through compose links

## Core Product Direction

ScholarDock should help users manage:

- Degree workspaces for Bachelor's, Master's, and PhD
- Projects for each application campaign
- Sheets and default pages for tracking universities, professors, ranks, research fit, emails, responses, follow-ups, attachments, linked documents, dates, and status
- Countries, regions, universities, programs, and professors
- Application statuses and deadlines
- SOPs, research proposals, LOR drafts, and personal statements
- Static files such as CVs, transcripts, certificates, and test scores
- Email templates, outreach logs, attachments, and follow-up reminders
- GLM, Google AI Studio Gemini, and Tavily-assisted research and drafting

## Product Principles

- Local-first data ownership
- Privacy-first defaults
- No required remote backend
- Zero required infrastructure cost
- Optional external AI/search APIs
- Context-first AI-DLC development
- Small, modular files that future AI agents can understand quickly

## Stack

- Frontend: React/Vite/TypeScript with Tailwind CSS
- Backend: Python FastAPI
- Database: SQLite
- Storage: local file system
- AI integrations: GLM AI API, Google AI Studio Gemini API, and Tavily API

## Local Setup

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

Open [http://localhost:5173](http://localhost:5173).

Backend health: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health).

## Access Control (RBAC) & Admin setup

The application now supports Role-Based Access Control. Upon fresh database initialization, a default super admin user is created:
- **Email**: `admin@localhost`
- **Password**: `admin123`

To test the registration flow:
1. Use the default invite code: `TEST_INVITE`
2. Register a new user at [http://localhost:5173](http://localhost:5173)
3. New users get the `general_user` role by default.
4. Log in as an Admin to manage users, assign `pro_user` or `max_user` roles, generate new invite codes, and adjust system limits via the Admin Dashboard.

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

1. Read [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), and [CODE_RULES.md](CODE_RULES.md).
2. Read [AI-Context/README.md](AI-Context/README.md).
3. Read the relevant business, functional, and technical context files.
4. Create or update a Jira task in [AI-Context/jira-tasks](AI-Context/jira-tasks).
5. Update context before code when behavior, architecture, data, or decisions change.
6. Implement the feature.
7. Add or update unit tests when the feature has meaningful behavior.
8. Update the Jira task with changed files, verification, and follow-ups.

## Important Rules

- Do not require remote signup/signin for the local-first MVP.
- Google OAuth 2.0 / OpenID Connect may be added later as an optional identity provider.
- Gmail/Outlook compose links can prefill to, subject, and body, but cannot automatically attach local files without Gmail API or Microsoft Graph integration.
- Records and outreach live inside project sheets, not separate navigation areas.
- Documents are uploaded and linked; ScholarDock does not author SOPs or proposals internally.
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
