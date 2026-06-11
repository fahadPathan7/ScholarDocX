import sqlite3
from pathlib import Path

db_path = Path("backend/workspace/db/app.db")
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# Delete admin@localhost
admin_local = conn.execute("SELECT id FROM users WHERE email = 'admin@localhost'").fetchone()
if admin_local:
    conn.execute("DELETE FROM users WHERE id = ?", (admin_local["id"],))

conn.commit()
conn.close()
print("Cleaned up admin@localhost")
