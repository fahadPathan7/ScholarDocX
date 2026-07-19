import sys
import os
sys.path.append(os.path.abspath('.'))

from app.db.connection import engine
from sqlalchemy import text

with engine.connect() as conn:
    rows = conn.execute(text("SELECT key, value FROM app_settings WHERE key LIKE 'polar%'")).fetchall()
    for r in rows:
        print(f"{r.key}: {r.value}")
