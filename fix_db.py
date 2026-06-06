import sqlite3

def column_exists(cursor, table, column):
    cursor.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in cursor.fetchall()]
    return column in columns

conn = sqlite3.connect("backend/scholardock.db")
cursor = conn.cursor()

# Fix users table
if not column_exists(cursor, 'users', 'is_blocked'):
    cursor.execute("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0")
    print("Added is_blocked to users")

if not column_exists(cursor, 'users', 'registered_with_invite_id'):
    cursor.execute("ALTER TABLE users ADD COLUMN registered_with_invite_id INTEGER REFERENCES invite_codes(id) ON DELETE SET NULL")
    print("Added registered_with_invite_id to users")

conn.commit()

# Reseed limits
from backend.app.db.schema import SEED_SQL

# We only want the role_limits inserts from SEED_SQL
import re
role_limits_match = re.search(r'(INSERT OR IGNORE INTO role_limits.*?);', SEED_SQL, re.DOTALL)
if role_limits_match:
    sql = role_limits_match.group(1) + ';'
    cursor.executescript(sql)
    conn.commit()
    print("Reseeded role_limits")
else:
    print("Could not find role_limits inserts in SEED_SQL")

conn.close()
