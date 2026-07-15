from fastapi import Depends
from app.core.config import Settings, get_settings
from app.core.workspace import ensure_workspace
from app.db.connection import get_db, initialize_database
from app.services.store import Store

_db_initialized = False


def get_store(settings: Settings = Depends(get_settings)) -> Store:
    global _db_initialized
    if not _db_initialized:
        ensure_workspace(settings)
        initialize_database(settings.database_target)
        _db_initialized = True
    for session in get_db(settings.database_target):
        yield Store(session)
