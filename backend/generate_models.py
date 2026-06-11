import sqlite3
import os
import subprocess
import sys

# Add backend to path so we can import schema
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.db.schema import SCHEMA

db_path = '/tmp/test_schema.db'
if os.path.exists(db_path):
    os.remove(db_path)

conn = sqlite3.connect(db_path)
conn.executescript(SCHEMA)
conn.commit()
conn.close()

print("Running sqlacodegen...")
result = subprocess.run(["sqlacodegen", "sqlite:////tmp/test_schema.db", "--outfile", "app/db/models.py", "--generator", "declarative"], capture_output=True, text=True)
if result.returncode != 0:
    print("Error:", result.stderr)
else:
    print("Success: Generated models.py")
