from fastapi import Depends
from app.core.config import Settings, get_settings
from app.core.workspace import ensure_workspace
from app.db.connection import connect, initialize_database
from app.services.store import Store

def get_store(settings: Settings = Depends(get_settings)) -> Store:
    ensure_workspace(settings)
    initialize_database(settings.database_path)
    connection = connect(settings.database_path)
    try:
        yield Store(connection)
    finally:
        connection.close()
