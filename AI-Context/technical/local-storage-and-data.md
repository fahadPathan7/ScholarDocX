# Secure Storage And Data

## Storage Principle

PostgreSQL stores structured metadata (SCHOLARDOCX-0139; previously SQLite).
Secure files store binary and rich media artifacts on the local workspace.

## Workspace

Initial workspace path:

```text
workspace/
```

Initial database path:

The relational store is PostgreSQL, configured via `DATABASE_URL` (see
stack-and-runtime.md). There is no local database file. `Settings.database_path`
is retained only for legacy path math and is not used for relational data.

Initial media path:

```text
workspace/media/
```

## PostgreSQL Should Store

- Scholarship Hunt beta query feedback: user ID, generated query, approved
  query, selected filters JSON, whether the user edited it, provider status,
  result count, and timestamps.

- Users or local profile if needed later
- Degree workspaces
- Countries, regions, universities, programs, professors
- Applications
- Deadlines
- Documents and document versions
- Document categories
- Static file metadata and paths
- Email templates and drafts
- Outreach logs
- Reminders
- AI conversations and saved research notes

## File System Should Store

- CV PDFs
- Transcripts
- Certificates
- Test score reports
- Exported or uploaded proposals
- Other user files

## Path Rules

- Store relative paths from the workspace root where possible.
- Resolve paths through a backend storage service.
- Do not trust user-provided paths directly.
- Prevent `..` traversal.
- Normalize user-managed media category names into safe directory slugs.
- Validate file types where a workflow requires it.

## MVP Implementation Note

The backend creates the workspace automatically on startup and through `POST /api/workspace/init`.

The default workspace can be overridden with:

```text
SCHOLARDOCX_WORKSPACE=/absolute/path/to/workspace
```

## Backup Consideration

Because all data is local, future work should consider export and backup tools. This is not part of the initial source requirements but is a likely user need.
