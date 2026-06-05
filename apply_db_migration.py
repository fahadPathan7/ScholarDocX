import sqlite3
import os

db_path = "backend/workspace/db/app.db"
if not os.path.exists(db_path):
    print("DB does not exist.")
    exit(0)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
exclude = ["users", "invite_codes", "role_limits", "app_settings", "sqlite_sequence"]

for (table_name,) in tables:
    if table_name in exclude:
        continue
    
    # Check if user_id exists
    columns = [col[1] for col in cursor.execute(f"PRAGMA table_info({table_name})").fetchall()]
    if "user_id" not in columns:
        print(f"Adding user_id to {table_name}")
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")

conn.commit()
print("Migration applied to sqlite db.")
