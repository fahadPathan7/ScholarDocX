## Migration: SQLite → PostgreSQL (Supabase), keeping SQLite for tests

**Per AGENTS.md workflow:** I'll create a Jira task file first, then implement. Data in the current DB is fake and will be wiped — no data migration.

### Design principle: one codebase, two dialects
Since dev=Postgres and tests=SQLite, all SQL must run on both. Strategy:
- Route raw SQL through SQLAlchemy `text()` (normalizes execution across drivers).
- Replace `cursor.lastrowid` → `INSERT ... RETURNING id` (works on both; SQLite 3.35+ supports RETURNING).
- Replace `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING` (both dialects).
- Add a tiny `dialect.py` helper for the ~4 functions that genuinely differ (`date('now',N)` → Postgres interval, `LIKE`→`ILIKE`, etc.).
- Gate SQLite-only code (PRAGMA, `migrate_database`, `sqlite_master`) behind `if dialect == 'sqlite'`.

---

### Step 1 — Config & driver
- **`backend/app/core/config.py`**: add `database_url = os.getenv("DATABASE_URL")`. If set → use it directly; else fall back to current `sqlite:///<database_path>` (preserves SQLite for tests/local).
- **`backend/requirements.txt`**: add `psycopg[binary]>=3.1` (psycopg3, async-friendly, supports `RETURNING` cleanly).
- **`.env.example`**: document `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db`.

### Step 2 — Connection layer rewrite (`backend/app/db/connection.py`)
This is the core. Make `get_engine`/`get_db`/`initialize_database` accept either a URL or a path:
- `get_engine(database_path_or_url)`: detect `postgresql`/`sqlite` scheme; apply `connect_args`/PRAGMA event listener **only** for SQLite. Postgres gets a standard `create_engine` with `pool_pre_ping=True`.
- `connect()` (raw driver): keep returning `sqlite3.Connection` **for SQLite only**; for Postgres, return a SQLAlchemy `Connection` wrapper exposing the same `.execute()/.fetchone()/.commit()` surface used by the 9 caller modules. Callers stay unchanged at the call-site level.
- `initialize_database()`: `create_all()` runs on both. Then gate the SQLite-only block (`_prepare_legacy_user_scoping`, `migrate_database`, `executescript(SEED_SQL)`) behind `if dialect=='sqlite'`. For Postgres, run `SEED_SQL` via SQLAlchemy `text()` with multi-statement execution, and run only the seed defaults (no legacy migration needed on a fresh DB).
- The `_ensure_jwt_secret` / `_seed_ai_token_defaults` functions use `INSERT OR REPLACE` — rewrite to `ON CONFLICT DO UPDATE` (portable).

### Step 3 — Seed SQL (`backend/app/db/schema.py`)
Rewrite `SEED_SQL` from `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING` (portable to both dialects). Keep it as one string; execute via SQLAlchemy in Postgres mode.

### Step 4 — Raw-SQL site fixes (the ~100 sites)
Mechanical, dialect-safe rewrites across these files:
- **`app/auth/limits.py`** (12 `text()` sites): `json_array_length` works on both but the `NULLIF(col,'')` hack needs a `COALESCE(col,'[]')` wrapper that works on both; UPSERT `ON CONFLICT(user_id,feature)` already portable (verify unique constraint exists in models — it does).
- **`app/services/ai_tokens.py`** (5 sites), **`app/services/news_feedback.py`** (5 sites): `lastrowid` → `RETURNING id`.
- **`app/api/auth.py`**: `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`; `lastrowid` → `RETURNING id`; `user["is_active"]==1` stays (Integer columns work on both).
- **`app/db/connection.py`** (`migrate_database` ~580 lines): leave the code as-is, **only run it in SQLite mode**. Postgres gets schema from `create_all()` + seed only.
- **`date('now','-30 days')`** sites in `admin.py`/`connection.py`: route through a `dialect.days_ago(column, n)` helper returning the right SQL per dialect.
- **`LIKE '%super_admin%'`** (2 sites): switch to `ILIKE` via dialect helper (SQLite treats `ILIKE` as `LIKE`, or emit `LIKE` for SQLite / `ILIKE` for Postgres).
- **`substr(created_at,1,7)`** (1 site): dialect helper → `to_char` on Postgres.
- **`executescript`/`executemany`**: only in SQLite-gated paths; replace Postgres-path equivalents with SQLAlchemy `text()` loops.

### Step 5 — Store & AdminService refactor (`store.py`, `admin.py`)
Both extract the raw DBAPI connection + force `sqlite3.Row`. This breaks on Postgres.
- **`Store`**: the existing `legacy_connection` property (lines 251-276) is *already* a SQLAlchemy-based wrapper with `lastrowid` shim. I'll route `self.connection` users through `legacy_connection` + make `legacy_connection.execute()` return `RETURNING`-aware results, and drop the raw `dbapi_connection` extraction. Keeps call-site SQL strings working.
- **`AdminService`** (~35 `self.connection.execute(...)` sites with `.fetchone()[0]` pattern): replace `self.connection` with a SQLAlchemy-backed executor (`self.db.execute(text(...))` returning `CursorResult`). Rewrite the handful of SQLite-function queries (`json_array_length`, `date('now',N)`) via dialect helpers. `dict(row)` access → `dict(result.mappings().fetchall())`.

### Step 6 — Repositories (`advisor_atlas/repository.py`, `scholarship_deep_hunt.py`)
Both take `database_path: Path` and call raw `connect()` per-method (~23 sites).
- Change constructor to accept the engine/session from `get_settings()` instead of a path.
- Replace `connect(database_path)` calls with SQLAlchemy session usage.
- `lastrowid` → `RETURNING id`; `ON CONFLICT` UPSERTs already portable (verify unique constraints exist).
- `PRAGMA foreign_keys=ON` → gate behind SQLite mode.

### Step 7 — Frontend + CORS + deployment config
- **`frontend/src/lib/api.ts`**: generalize `defaultApiBase()` — when not localhost, use same-origin `/api` (drop `:8000`). Keeps local dev working.
- **`backend/app/main.py` / `config.py`**: CORS already reads `CORS_ORIGINS` env — just document setting the Supabase/host origin there.
- Add **`render.yaml`** or equivalent for Supabase + the app host (TBD with user on app-host choice — Supabase is DB-only; the FastAPI app + frontend still need a host). *This may need a follow-up decision.*

### Step 8 — Verification
- Add Postgres to CI (GitHub Actions service container) OR document running the suite against a Supabase dev DB. Per your choice, **tests stay SQLite** — so existing `tests/helpers.py`/`make_settings` keep working unchanged. I'll add a small smoke test that runs `initialize_database` against Postgres (skipped if no `DATABASE_URL`) to catch dialect regressions in CI.
- Run full SQLite test suite to confirm no regressions: `cd backend && python -m pytest tests/`.
- Manual: start app against a Supabase DB, hit a few endpoints, confirm schema + seed created.

### Step 9 — Context & Jira updates (mandatory per AGENTS.md)
- Create `AI-Context/jira-tasks/` task under appropriate Epic.
- Update `AI-Context/technical/` files (security-privacy, api-boundaries, project-structure) with the Postgres decision and `DATABASE_URL` config.
- Completion notes + changed-file list via handoff skill.

---

### Files touched (estimated)
| File | Change |
|---|---|
| `backend/app/core/config.py` | add `DATABASE_URL` |
| `backend/app/db/connection.py` | **major** — URL-aware engine, dialect gating |
| `backend/app/db/schema.py` | `INSERT OR IGNORE` → `ON CONFLICT` |
| `backend/app/db/dialect.py` | **new** — dialect helper functions |
| `backend/app/services/store.py` | drop raw DBAPI extraction |
| `backend/app/services/admin.py` | SQLAlchemy executor + dialect helpers |
| `backend/app/services/ai_tokens.py` | `lastrowid` → `RETURNING` |
| `backend/app/services/news_feedback.py` | `lastrowid` → `RETURNING` |
| `backend/app/services/advisor_atlas/repository.py` | session-based, `RETURNING` |
| `backend/app/services/scholarship_deep_hunt.py` | session-based, `RETURNING` |
| `backend/app/auth/limits.py` | dialect-safe JSON/date SQL |
| `backend/app/api/auth.py` | `ON CONFLICT`, `RETURNING` |
| `backend/requirements.txt` | `psycopg[binary]` |
| `frontend/src/lib/api.ts` | same-origin prod base URL |
| `.env.example` | document `DATABASE_URL` |
| **new**: Jira task + AI-Context updates | per workflow |

### Risk / scope honesty
This is a **large refactor (~15 files, 100+ SQL sites)**. I'll work in order and run tests after each layer so we catch breaks early. The SQLite test suite is our safety net — if it stays green after each step, the shared code paths still work. I'll flag immediately if I hit something that forces a design change.