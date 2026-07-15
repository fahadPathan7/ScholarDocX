# AGENTS.md

Project: ScholarDocX

This file is the root instruction file for AI agents working in this repository.

## Mission

ScholarDocX is a secure personal workspace, privacy-first higher education application management portal. It helps applicants manage universities, programs, professors, deadlines, documents, outreach emails, and AI-assisted academic research from one local workspace.

## Mandatory AI-DLC Workflow

Before writing or changing product code:

1. Read [AI-Context/README.md](AI-Context/README.md).
2. Read the relevant repo-carried skills automatically loaded from `.agents/skills`, `.claude/skills`, or `.codex/skills`.
3. Read the relevant business, functional, and technical context files for the requested work.
4. Read or create the relevant Jira task file in [AI-Context/jira-tasks](AI-Context/jira-tasks).
5. Refine context first when a feature is new, changed, unclear, or crosses module boundaries.
6. Only then implement code.
7. After implementation, update context and the Jira task with decisions, changed files, tests, and follow-ups.

### STRICT ENFORCEMENTS
- **NO WORK WITHOUT JIRA**: Every piece of major work (features, large refactors, UI updates) MUST have an associated Jira story in `AI-Context/jira-tasks/`. Do not start writing code for major changes without first creating the task file inside an Epic.
- **MANDATORY CONTEXT UPDATE**: After every feature or code update, the AI Agent MUST update the relevant AI-Context files (for example `technical/frontend-visual-system.md`, `technical/api-boundaries.md`, `technical/project-structure.md`, or `technical/security-privacy.md`) with any new architectural or design decisions. Do not end the session without updating the context.

## Repo-Carried Agent Skills

ScholarDocX keeps project-specific `SKILL.md` files natively integrated in `.agents/skills`, `.claude/skills`, and `.codex/skills`. These skills are compact task guides for coding, context updates, test cases, context review, UI/UX, AI integrations, security/privacy, and handoff.

Use only the skills relevant to the current task. Skills supplement the source-of-truth order below; they do not override the user's latest instruction, root rules, the active Jira task, or AI-Context.



## Source Of Truth

Use this order when resolving conflicts:

1. The user's latest explicit instruction.
2. Root rules: this file, [CLAUDE.md](CLAUDE.md), and [CODE_RULES.md](AI-Context/CODE_RULES.md).
3. Current Jira task file.
4. AI-Context files.
5. Existing codebase patterns.
6. Historical source notes, now absorbed into [AI-Context](AI-Context/README.md).

## Non-Negotiable Product Constraints

- Cloud-deployed (SCHOLARDOCX-0139): the app runs on Render (free tier),
  database on Supabase Postgres, file storage on Supabase Storage. The original
  local-first / SQLite / local-file constraints were superseded by this
  deployment decision.
- Zero infrastructure cost: Render free + Supabase free tier.
- AI integrations are optional external API calls controlled by server-side keys.
- External AI/search calls remain explicit user actions behind backend services.
- The app must remain maintainable by AI coding assistants as it grows.

## File Size And Modularity Rule

- Target maximum file size: 1000 lines.
- Temporary grace limit: up to 1150 lines during the current feature if a file starts near the limit.
- If a file exceeds 1150 lines after a feature is completed, split it before beginning the next feature.
- Prefer cohesive modules over large mixed-purpose files.
- Before editing a large file, check line count and consider extracting helpers, components, schemas, routes, or services.

## Expected Agent Behavior

- Keep changes scoped to the active Jira task.
- Do not start implementation if the user explicitly asks for context, planning, or documentation only.
- Prefer existing patterns once code exists.
- Do not introduce cloud services, remote databases, analytics, or telemetry unless context and user approval explicitly require it.
- Never commit secrets or real API keys.
- Keep documentation short, structured, and easy for future agents to scan.
- STRICT RULE: Do NOT create any summary `.md` files at the root of the project or anywhere else unless explicitly told by the user. All context updates must happen inside the existing files in `AI-Context/` or as a new Jira task file.
- Add or update unit tests for each feature when meaningful behavior, data transformation, validation, persistence, or integration boundaries are introduced.
