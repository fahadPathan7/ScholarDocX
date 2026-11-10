# CLAUDE.md

Project: ScholarDocX — an AI-DLC managed repository. Context is part of the product.

Read [AGENTS.md](AGENTS.md) first; it holds the rules, workflow, and hard constraints.
This file only adds the reading order and product summary.

## Reading order

1. [AGENTS.md](AGENTS.md)
2. [CODE_RULES.md](AI-Context/CODE_RULES.md)
3. [AI-Context/README.md](AI-Context/README.md) (the map of where each rule lives)
4. The relevant skill in `.claude/skills`
5. The active task in [AI-Context/jira-tasks](AI-Context/jira-tasks)
6. Only the business / functional / technical files the task touches

## Product

A cloud-deployed (Render + Supabase, free tier) portal for higher-education applicants:

- Hierarchical application tracking: projects, sheets, programs, professors.
- Dashboard for deadlines, progress, outreach, reminders; central calendar and notifications.
- Document vault: users upload and link externally prepared files (it is not a writing surface).
- Outreach/email tracking and follow-ups inside project sheets.
- AI assistant, Research Expert, Advisor Atlas, Scholarship Hunt, behind backend services with per-user billing and limits.
- Email/password + invite-code accounts and optional Google sign-in; plans via Polar.

## Guardrails

- Zero-infrastructure-cost footprint; no new paid services, analytics, or telemetry without approval.
- Each user's data stays isolated and is never exposed to third parties.
- Do not code before context and the Jira task are updated for new or changed behaviour.
