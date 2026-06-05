import sqlite3
from pathlib import Path
import json

db_path = Path("backend/workspace/db/app.db")
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# 1. Re-create local_profiles
conn.execute("""
CREATE TABLE IF NOT EXISTS local_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  preferred_email_provider TEXT,
  timezone TEXT,
  notes TEXT,
  avatar TEXT,
  notification_settings TEXT DEFAULT '{"create_project": true, "create_sheet": true, "delete_project": true, "delete_sheet": true, "delete_record": true, "delete_whiteboard": true, "pin_project": false, "pin_sheet": false, "create_whiteboard": false, "add_record": false}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
""")

conn.execute("CREATE INDEX IF NOT EXISTS idx_local_profiles_user_id ON local_profiles(user_id);")

# 2. Insert local_profiles for existing users who don't have one
users = conn.execute("SELECT id, display_name, email FROM users").fetchall()
for u in users:
    has_profile = conn.execute("SELECT 1 FROM local_profiles WHERE user_id = ?", (u["id"],)).fetchone()
    if not has_profile:
        conn.execute("""
            INSERT INTO local_profiles (user_id, display_name, email)
            VALUES (?, ?, ?)
        """, (u["id"], u["display_name"], u["email"]))

# 3. Remove admin@localhost if it exists
admin_local = conn.execute("SELECT id FROM users WHERE email = 'admin@localhost'").fetchone()
if admin_local:
    conn.execute("DELETE FROM users WHERE id = ?", (admin_local["id"],))

conn.commit()
conn.close()
print("Migration completed successfully.")
