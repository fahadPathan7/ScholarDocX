import os
import sys
from sqlalchemy import text
from app.db.connection import get_engine

env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
with open(env_path, "r") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#"):
            key, val = line.split("=", 1)
            os.environ[key] = val

url = os.environ.get("DATABASE_URL")
if not url:
    print("DATABASE_URL not set")
    sys.exit(1)

engine = get_engine(url)
with engine.begin() as conn:
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN plan_renews_at TIMESTAMPTZ;"))
        print("Added plan_renews_at")
    except Exception as e:
        print("Failed to add plan_renews_at (may already exist):", e)
        
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN polar_cancel_at_period_end INTEGER NOT NULL DEFAULT 0;"))
        print("Added polar_cancel_at_period_end")
    except Exception as e:
        print("Failed to add polar_cancel_at_period_end (may already exist):", e)

print("Migration complete")
