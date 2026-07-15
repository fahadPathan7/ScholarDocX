# Stack And Runtime

## Recommended Stack From Source Notes

- Frontend: Next.js or React/Vite with Tailwind CSS.
- Backend: Python FastAPI.
- Database: SQLite (original; migrated to PostgreSQL in SCHOLARDOCX-0139).
- Storage: secure file system (original; migrated to Supabase Storage in SCHOLARDOCX-0139).
- AI providers: GLM AI API and Tavily API.

## Current Stack Decision Status

Accepted for MVP.

Frontend:

- React with Vite, TypeScript, and Tailwind CSS.

Backend:

- Python FastAPI.

Database:

- PostgreSQL via SQLAlchemy 2.0 + psycopg3 driver (`psycopg[binary]`).
- Hosted Supabase for development/production.
- SQLite support was fully removed in SCHOLARDOCX-0139 (single-dialect codebase).

File storage:

- Supabase Storage (`media` bucket). User uploads (CVs, transcripts, documents)
  persist across host restarts via the Storage REST API. See
  `backend/app/core/storage.py`.

Backend dependency manager:

- `pip` with `requirements.txt`. Includes `psycopg[binary]` (psycopg3) for Postgres.

## Database Connection (SCHOLARDOCX-0139)

The backend connects to PostgreSQL via `DATABASE_URL` (no SQLite fallback):

```text
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

- `Settings.database_target` resolves the URL and raises if unset.
- URL-encode special chars in the password (`#`→`%23`, `*`→`%2A`, `@`→`%40`).
- A bare `postgresql://` is normalized to `postgresql+psycopg://` internally so
  SQLAlchemy uses psycopg3 (psycopg2 has no Python 3.13 wheel).
- Raw-SQL call sites route through `app.db.legacy_db.LegacyConnection`, which
  translates SQLite-style `?` params → named params and emulates
  `cursor.lastrowid` via `RETURNING id`. This keeps ~80 call sites unchanged.

## Deployment Architecture (SCHOLARDOCX-0139)

The app is cloud-deployed on Render (free tier). Both services run on Render;
the database and file storage are on Supabase.

```text
Frontend  →  Render Static Site    https://scholardocx.onrender.com
             (Vite build, serves dist/)
Backend   →  Render Web Service    https://scholardocx-api.onrender.com
             (FastAPI + uvicorn, long-running process)
Database  →  Supabase Postgres     (Session pooler, IPv4)
Storage   →  Supabase Storage      (media bucket)
```

- `render.yaml` at the repo root defines both services.
- The backend is a long-running process (not serverless) so Deep Hunt and
  Advisor Atlas async crawls are not killed by a function timeout.
- Render free tier sleeps after ~15 min idle; wakes on first request (~30s).
- Backend health check: `GET /docs`.

## File Storage Connection (SCHOLARDOCX-0139)

```text
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_BUCKET=media
```

- `app/core/storage.py` uploads/downloads/deletes via the Supabase Storage REST
  API using `httpx` (no SDK dependency).
- The new-format `sb_secret_` key requires the `apikey` header in addition to
  `Authorization` for the Storage API (legacy JWTs worked with Authorization
  alone).
- Object keys are bucket-relative (the leading `media/` in
  `static_files.relative_path` is stripped before the Storage call).

Frontend package manager:

- `npm`.

## Runtime Expectations

The app runs both locally (development) and on Render (production).

Local development:

- Frontend dev server on `http://localhost:5173`.
- FastAPI backend on `http://localhost:8000`.
- Database: Supabase Postgres via `DATABASE_URL` in `.env`.
- Media: Supabase Storage (same bucket for dev and prod).
- The workspace now only holds ephemeral/runtime files (logs, temp). Structured
  data is in Postgres; uploaded files are in Supabase Storage.

## Local Workspace Path

The workspace now only holds ephemeral/runtime files. Structured data is in
Postgres; uploaded files are in Supabase Storage.

Default workspace:

```text
workspace/
```

Override with:

```text
SCHOLARDOCX_WORKSPACE=/absolute/path/to/workspace
```

On Render, set `SCHOLARDOCX_WORKSPACE=/tmp/scholardocx-workspace`.

## Development Run Commands

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
npm run dev
```

Tests:

```bash
cd backend
pytest
```
