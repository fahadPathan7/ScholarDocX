from app.db.schema import SEED_SQL
import sqlite3

conn = sqlite3.connect("backend/scholardocx.db")
conn.executescript(SEED_SQL)
conn.commit()
print("Role limits re-seeded successfully.")
