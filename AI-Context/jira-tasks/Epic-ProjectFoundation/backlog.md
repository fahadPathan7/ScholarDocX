# Backlog

Epic: Epic-ProjectFoundation

Initial backlog from source requirements. These are planning items only; do not implement without an active task.

## Ready Or Draft Tasks

## SCHOLARDOCX-0001: Context Foundation

Status: Done

Goal:

Create AI-DLC context folders, root agent instructions, and code rules.

## SCHOLARDOCX-0002: Project Scaffold

Status: Done

Goal:

Choose final stack and create initial frontend/backend project structure.

Needs context update:

- Technical stack decision
- Project structure
- Run commands

## SCHOLARDOCX-0003: Local Workspace Initialization

Status: Done

Goal:

Implement first-run workspace folder creation, SQLite setup, and configuration validation.

Relevant requirements:

- FR-1.1
- FR-1.2
- FR-1.3
- FR-1.4

## SCHOLARDOCX-0004: Application Hierarchy Data Model

Status: Done

Goal:

Implement degree workspaces, universities, programs, professors, applications, and deadlines.

Relevant requirements:

- FR-2.1
- FR-2.2
- FR-2.3

## SCHOLARDOCX-0005: Unified Dashboard MVP

Status: Done

Goal:

Implement aggregated dashboard with application statuses, upcoming deadlines, and reminders.

Relevant requirements:

- FR-2.4
- FR-2.5

## SCHOLARDOCX-0006: Document Playground MVP

Status: Done

Goal:

Implement rich-text document creation and versioning.

Relevant requirements:

- FR-3.1
- FR-3.2

## SCHOLARDOCX-0007: Static File Storage MVP

Status: Done

Goal:

Implement upload/register flow for local static files and application linking.

Relevant requirements:

- FR-3.3
- FR-3.4
- FR-3.5

## SCHOLARDOCX-0008: Email Outreach MVP

Status: Done

Goal:

Implement templates, email drafts, attachment linking, copy/mailto flow, and follow-up reminders.

Relevant requirements:

- FR-4.1
- FR-4.2
- FR-4.3
- FR-4.4

## SCHOLARDOCX-0009: AI Assistant MVP

Status: Done

Goal:

Implement chat UI, backend GLM integration, Tavily research flow, and context-aware drafting safeguards.

Relevant requirements:

- FR-5.1
- FR-5.2
- FR-5.3
- FR-5.4

## SCHOLARDOCX-0010: Optional Google Signin

Status: Draft

Goal:

Implement optional Google OAuth 2.0 / OpenID Connect signin while preserving local-first data access.

Relevant requirements:

- FR-6.1
- FR-6.2
- FR-6.3
- FR-6.4
- FR-6.5
- FR-6.6

Notes:

- Not recommended before core local MVP unless the user prioritizes auth.
- Must include unit tests for provider config, callback handling, profile linking, disconnect behavior, and scope handling.

## SCHOLARDOCX-0014: Project Workspaces

Status: Done

Goal:

Add project workspaces, sheet-like pages, notifications, profile, collapsible navigation, and top-right assistant.

Relevant requirements:

- FR-7.1 through FR-7.10

## SCHOLARDOCX-0015: Project UX Refinement

Status: Done

Goal:

Make Projects root show only create/view/open, move sheet editing inside an opened project, add default sheet pages, row/column add/delete/edit, About page, and Profile workspace details.

Relevant requirements:

- FR-7.1 through FR-7.10
- FR-8.1 through FR-8.4

## SCHOLARDOCX-0016: Sheet Records And Upload-Only Documents

Status: Done

Goal:

Move records and outreach into sheet rows, add generated record forms, row date coloring, document linking, and upload-only documents.

Relevant requirements:

- FR-3 upload/link-only behavior
- FR-7.11 through FR-7.16

## SCHOLARDOCX-0017: Single Sheet Detail Flow

Status: Done

Goal:

Make project detail show only the project dashboard and create/view/open sheets. Move the editable sheet table into a sheet detail view, and make every sheet one page/table only.

Relevant requirements:

- FR-7.4
- FR-7.5
