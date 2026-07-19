import os
from sqlalchemy import create_engine, text
db_url = os.environ.get("DATABASE_URL", "postgresql://postgres.mzpvyrglalhpnezsnqjj:%2311905112aA%2A@aws-1-ap-south-1.pooler.supabase.com:6543/postgres")
engine = create_engine(db_url)
with engine.connect() as conn:
    rows = conn.execute(text("SELECT email FROM users LIMIT 1")).fetchall()
    for r in rows:
        print(f"email: {r.email}")
