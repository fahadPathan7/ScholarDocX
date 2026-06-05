# AGENTS.md

Project: ScholarDock

This file is the root instruction file for AI agents working in this repository.

## Mission

ScholarDock is a local-first, privacy-first higher education application management portal. It helps applicants manage universities, programs, professors, deadlines, documents, outreach emails, and AI-assisted academic research from one local workspace.

## Mandatory AI-DLC Workflow

Before writing or changing product code:

1. Read [AI-Context/README.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/README.md).
2. Read the relevant repo-carried skills in [AI-Context/agent-skills](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills).
3. Read the relevant business, functional, and technical context files for the requested work.
4. Read or create the relevant Jira task file in [AI-Context/jira-tasks](/Users/fahadpathan/Documents/ScholarDock/AI-Context/jira-tasks).
5. Refine context first when a feature is new, changed, unclear, or crosses module boundaries.
6. Only then implement code.
7. After implementation, update context and the Jira task with decisions, changed files, tests, and follow-ups.

Do not skip context refinement for new features or feature modifications.

## Repo-Carried Agent Skills

ScholarDock keeps project-specific `SKILL.md` files in [AI-Context/agent-skills](/Users/fahadpathan/Documents/ScholarDock/AI-Context/agent-skills). These skills are compact task guides for coding, context updates, test cases, context review, UI/UX, AI integrations, security/privacy, and handoff.

Use only the skills relevant to the current task. Skills supplement the source-of-truth order below; they do not override the user's latest instruction, root rules, the active Jira task, or AI-Context.

The upstream `ui-ux-pro-max` skill is installed in project-local agent folders and is ScholarDock's primary UI style authority for UI/UX work. Use it first for visual quality, interaction, accessibility, layout, typography, color, motion, forms, navigation, and data readability; then apply ScholarDock's AI-DLC workflow, Jira/context rules, local-first constraints, and browser verification requirements.

## Source Of Truth

Use this order when resolving conflicts:

1. The user's latest explicit instruction.
2. Root rules: this file, [CLAUDE.md](/Users/fahadpathan/Documents/ScholarDock/CLAUDE.md), and [CODE_RULES.md](/Users/fahadpathan/Documents/ScholarDock/CODE_RULES.md).
3. Current Jira task file.
4. AI-Context files.
5. Existing codebase patterns.
6. Historical source notes, now absorbed into [AI-Context](/Users/fahadpathan/Documents/ScholarDock/AI-Context/README.md).

## Non-Negotiable Product Constraints

- Local-first: user data stays on the user's machine.
- Privacy-first: no remote backend for user application data.
- Zero infrastructure cost: use local SQLite and local file storage.
- AI integrations are optional external API calls controlled by local API keys.
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
- Add or update unit tests for each feature when meaningful behavior, data transformation, validation, persistence, or integration boundaries are introduced.

## UI/UX Skill Rule

- For ScholarDock UI/UX design, frontend polish, layout, interaction, accessibility, visual design, design-system, responsive behavior, or UX review tasks, automatically select and use the `ui-ux-pro-max` skill when available.
- Treat `ui-ux-pro-max` as the main UI style authority for the project, not optional inspiration.
- The user should not need to mention the skill by name; agents must infer it from the task type.
- This applies to Codex and Antigravity/Gemini-style agents.
- In ScholarDock, the AI-DLC workflow, Jira task, context files, local-first constraints, and browser verification remain higher priority than the skill's generic recommendations.
