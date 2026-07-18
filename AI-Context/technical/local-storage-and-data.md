# Secure Storage And Data

## Storage Principle

PostgreSQL stores structured metadata (SCHOLARDOCX-0139; previously SQLite).
Secure files store binary and rich media artifacts on the local workspace.

## Document Size Limit

**Maximum document size: 10 MB per file**

All document uploads are validated both client-side (for immediate user feedback)
and server-side (for security enforcement). Files exceeding 10 MB are rejected
with a clear error message showing the actual file size.

This limit applies to all user-uploaded documents including:
- CV PDFs
- Transcripts
- Certificates
- Test score reports
- Proposals
- Other document types

The limit is enforced in:
- Backend: `app/core/workspace.py` (`save_upload` function)
- Frontend: `FilePickerField.tsx` and `App.tsx` (upload handlers)

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

## Supabase Storage Should Store (SCHOLARDOCX-0139)

User-uploaded files persist in the Supabase `media` bucket (object key =
`<category>/<uuid>-<filename>`). The `static_files.relative_path` column stores
`media/<category>/<uuid>-<filename>` for compatibility; the leading `media/` is
stripped before the Storage REST call. See `app/core/storage.py`.

- CV PDFs
- Transcripts
- Certificates
- Test score reports
- Exported or uploaded proposals
- Other user files

## Path Rules

- File object keys are bucket-relative and sanitized via `normalize_media_category`.
- Upload/download/delete route through `app.core.storage` (Supabase REST + httpx).
- Do not trust user-provided filenames directly — `uuid4().hex` prefix prevents collisions and path injection.
- Normalize user-managed media category names into safe directory slugs.
- Validate file types where a workflow requires it.

## MVP Implementation Note

The backend creates the workspace automatically on startup and through `POST /api/workspace/init`.

The default workspace can be overridden with:

```text
SCHOLARDOCX_WORKSPACE=/absolute/path/to/workspace
```

## Backup Consideration

Data lives in Supabase (Postgres + Storage). Supabase performs automated backups
on paid plans; the free tier does not. Future work should consider scheduled
`pg_dump` exports or enabling Supabase PITR. This is a likely user need.
