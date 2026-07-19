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
    print("Altering ai_token_packs table to add polar_product_id column...")
    try:
        conn.execute(text("ALTER TABLE ai_token_packs ADD COLUMN polar_product_id TEXT;"))
    except Exception as e:
        print(e)
    
    print("Success.")
