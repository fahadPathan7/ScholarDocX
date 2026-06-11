import sys
from pathlib import Path

# Add backend to PYTHONPATH so imports work correctly
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.auth.password import hash_password
from app.db.connection import get_engine
from app.db.models import Users
from sqlalchemy.orm import sessionmaker

def create_superadmin():
    repo_root = backend_dir.parent
    db_path = repo_root / "workspace" / "db" / "app.db"
    
    # Ensure directory exists
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    engine = get_engine(db_path)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()

    email = "admin@scholardock.com"
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
