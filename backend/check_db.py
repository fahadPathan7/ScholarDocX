import sys
import os
sys.path.append(os.path.abspath('.'))

from app.db.legacy_db import legacy_connection

rows = legacy_connection.execute("SELECT key, value FROM app_settings WHERE key LIKE 'polar%'").fetchall()
for r in rows:
    print(r["key"], r["value"])
