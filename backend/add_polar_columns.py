import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
database_url = os.environ.get("DATABASE_URL")
if not database_url:
    print("No DATABASE_URL set.")
    exit(1)

if database_url.startswith("postgresql://"):
    database_url = "postgresql+psycopg://" + database_url[len("postgresql://"):]
elif database_url.startswith("sqlite"):
    pass

engine = create_engine(database_url)

with engine.begin() as conn:
    print("Altering users table to add polar columns...")
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN polar_customer_id TEXT;"))
    except Exception as e:
        print(e)
    
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN polar_subscription_id TEXT;"))
    except Exception as e:
        print(e)
    print("Success.")
