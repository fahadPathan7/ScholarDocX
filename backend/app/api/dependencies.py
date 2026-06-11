from fastapi import Depends
from app.core.config import Settings, get_settings
from app.core.workspace import ensure_workspace
from app.db.connection import get_db, initialize_database
from app.services.store import Store

def get_store(settings: Settings = Depends(get_settings)) -> Store:
    ensure_workspace(settings)
    initialize_database(settings.database_path)
    for session in get_db(settings.database_path):
        yield Store(session)
