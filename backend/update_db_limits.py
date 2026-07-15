import os
import sys

# Parse .env file
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
if os.path.exists(env_path):
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith('DATABASE_URL='):
                os.environ['DATABASE_URL'] = line.strip().split('=', 1)[1]
else:
    print(".env not found")
    sys.exit(1)

from app.db.connection import get_engine
from sqlalchemy import text
from app.services.admin import DEFAULT_ROLE_LIMITS

def main():
    database_url = os.environ.get('DATABASE_URL')
    if database_url is None:
        print("DATABASE_URL environment variable is not set")
        sys.exit(1)
    engine = get_engine(database_url)
    with engine.begin() as conn:
        print("Connected to DB")
        for role, limits in DEFAULT_ROLE_LIMITS.items():
            for feature, limit_count, reset_period in limits:
                conn.execute(text("""
                    INSERT INTO role_limits (role, feature, limit_count, reset_period)
                    VALUES (:r, :f, :c, :p)
                    ON CONFLICT (role, feature) DO UPDATE
                    SET limit_count = EXCLUDED.limit_count,
                        reset_period = EXCLUDED.reset_period
                """), {"r": role, "f": feature, "c": limit_count, "p": reset_period})
        print("Updated limits in Postgres DB")

if __name__ == "__main__":
    main()
