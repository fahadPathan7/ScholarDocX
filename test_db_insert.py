import os
from sqlalchemy import create_engine, text
db_url = os.environ.get("DATABASE_URL", "postgresql://postgres.mzpvyrglalhpnezsnqjj:%2311905112aA%2A@aws-1-ap-south-1.pooler.supabase.com:6543/postgres")
engine = create_engine(db_url)
with engine.connect() as conn:
    conn.execute(text("INSERT INTO app_settings (key, value, updated_at) VALUES ('polar_product_id_basic_monthly', 'test', CURRENT_TIMESTAMP)"))
    conn.commit()
    rows = conn.execute(text("SELECT key, value FROM app_settings WHERE key LIKE 'polar%'")).fetchall()
    for r in rows:
        print(f"{r.key}: {r.value}")
