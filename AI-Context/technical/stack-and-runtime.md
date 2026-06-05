# Stack And Runtime

## Recommended Stack From Source Notes

- Frontend: Next.js or React/Vite with Tailwind CSS.
- Backend: Python FastAPI.
- Database: SQLite.
- Storage: local file system.
- AI providers: GLM AI API and Tavily API.

## Current Stack Decision Status

Accepted for MVP.

Frontend:

- React with Vite, TypeScript, and Tailwind CSS.

Backend:

- Python FastAPI.

Database:

- SQLite through Python standard library `sqlite3`.

Backend dependency manager:

- `pip` with `requirements.txt`.

Frontend package manager:

- `npm`.

## Runtime Expectations

The app is expected to run locally. A likely development setup is:

- Frontend dev server on `http://localhost:5173`.
- FastAPI backend on `http://localhost:8000`.
- SQLite database stored under the workspace directory.
- Media files stored under the workspace directory.

## Local Workspace Path

Default workspace:

```text
workspace/
```

Override with:

```text
SCHOLARDOCK_WORKSPACE=/absolute/path/to/workspace
```

## Development Run Commands

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
npm run dev
```

Tests:

```bash
cd backend
pytest
```
