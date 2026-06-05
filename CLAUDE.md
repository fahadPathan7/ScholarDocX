# CLAUDE.md

Project: ScholarDock

Claude and other coding agents should treat this repository as an AI-DLC managed project. Context is part of the product, not an afterthought.

## Quick Start

For any task, load context in this order:

1. [AGENTS.md](/Users/fahadpathan/Documents/ScholarDock/AGENTS.md)
2. [CODE_RULES.md](/Users/fahadpathan/Documents/ScholarDock/CODE_RULES.md)
3. [AI-Context/README.md](/Users/fahadpathan/Documents/ScholarDock/AI-Context/README.md)
4. The active task file in [AI-Context/jira-tasks](/Users/fahadpathan/Documents/ScholarDock/AI-Context/jira-tasks)
5. Only the business, functional, and technical files relevant to the task

## Work Protocol

- If the task is new, create a Jira task file before coding.
- If the task modifies behavior, update functional context first.
- If the task changes architecture, storage, APIs, integrations, or file organization, update technical context first.
- If the task changes user value, product scope, privacy posture, monetization, or target users, update business context first.
- Keep each context file focused. Do not create one giant project brain.
- Record decisions in the proper decision file, not only in chat.

## Current Product Direction

ScholarDock is a locally hosted application portal for higher education applicants. It combines:

- Hierarchical application tracking by degree, geography, institution, program, and professor.
- Unified dashboard for deadlines, progress, outreach, and reminders.
- Rich document drafting for SOPs, research proposals, LOR drafts, and variations.
- Local storage for PDFs, CVs, transcripts, certificates, and linked files.
- Email template and follow-up management.
- GLM AI plus Tavily search for research, drafting, and academic strategy support.

## Guardrails

- Do not build a remote SaaS backend.
- Do not store private application data outside the local machine.
- Do not exceed the file-size policy in [CODE_RULES.md](/Users/fahadpathan/Documents/ScholarDock/CODE_RULES.md).
- Do not add features that require paid infrastructure by default.
- Do not code before context is updated for new or changed features.

