import threading

from fastapi import Depends
from app.core.config import Settings, get_settings
from app.core.workspace import ensure_workspace
from app.db.connection import get_db, initialize_database
from app.services.store import Store

# SCHOLARDOCX-0149: module-level memo + lock. A plain bool flag let a concurrent
# cold-start burst (e.g. several simultaneous first requests) both see False and
# both run initialize_database, re-introducing the connection-pool exhaustion
# the memo was meant to prevent. The lock makes the check-and-set atomic.
# Pattern mirrors app/auth/rate_limit.py.
_db_initialized = False
_db_init_lock = threading.Lock()


def ensure_db_initialized(settings: Settings) -> None:
    """Run DB schema + seed setup at most once per process.

    Both ``get_store`` and the ``/workspace/init`` route funnel through here so
    DDL never races with concurrent reads, which previously exhausted the
    connection pool and stalled the app on repeated refreshes. The boot path
    (create_app) also calls this so the flag is set before the first request.
    """
    global _db_initialized
    if _db_initialized:
        return
    with _db_init_lock:
        if _db_initialized:
            return
        ensure_workspace(settings)
        initialize_database(settings.database_target)
        _db_initialized = True


def get_store(settings: Settings = Depends(get_settings)) -> Store:
    ensure_db_initialized(settings)
    for session in get_db(settings.database_target):
        yield Store(session)
