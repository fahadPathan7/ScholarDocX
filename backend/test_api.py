from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
# To bypass auth, we need to know how it works or just see the server error locally?
# Actually if we just print store.list_records directly we don't need auth!
from app.db.connection import get_db
from app.services.store import Store
from pathlib import Path

db = get_db(Path("workspace/db/app.db"))
store = Store(db, current_user_id=1)
try:
    print(store.list_records("saved_scholarship_queries"))
except Exception as e:
    import traceback
    traceback.print_exc()
