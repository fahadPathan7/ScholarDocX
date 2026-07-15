import os
import sys
from pathlib import Path

# Add backend to PYTHONPATH so imports work correctly
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv(backend_dir.parent / ".env")

from app.auth.password import hash_password
from app.db.connection import get_engine
from app.db.models import Users
from sqlalchemy.orm import sessionmaker

def create_superadmin():
    # SCHOLARDOCX-0139: Postgres-only. DATABASE_URL is required.
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        print("ERROR: DATABASE_URL is not set. Configure it in .env.")
        sys.exit(1)

    engine = get_engine(database_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()

    email = "admin@scholardocx.com"
    password = "admin"
    hashed = hash_password(password)

    # Check if admin already exists
    existing = session.query(Users).filter_by(email=email).first()
    if existing:
        print(f"Super admin {email} already exists.")
        session.close()
        return

    admin_user = Users(
        email=email,
        password_hash=hashed,
        display_name="Super Admin",
        roles=["general_user", "super_admin"]
    )

    session.add(admin_user)
    session.commit()
    session.close()

    print(f"Super admin created with {email} / {password}")

if __name__ == "__main__":
    create_superadmin()
