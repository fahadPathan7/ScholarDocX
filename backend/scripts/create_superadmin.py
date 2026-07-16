"""Create a super admin user.

SCHOLARDOCX-0140: no default admin is auto-seeded anymore (a committed account
with a publicly-known password hash was a security risk). Run this script after
a fresh ``initialize_database()`` to create the first super admin.

Credentials are taken, in priority order, from:
  1. CLI flags:   --email <email> --password <password>
  2. Environment: CREATE_SUPERADMIN_EMAIL / CREATE_SUPERADMIN_PASSWORD
  3. Interactive prompt (passwords are read via getpass, never echoed).

Roles are stored as a JSON string (never a Python list repr) so the rest of the
app can ``json.loads()`` them at login.

Usage::

    python scripts/create_superadmin.py --email you@example.com --password 's3cret'
    python scripts/create_superadmin.py   # prompts interactively
"""
import getpass
import json
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
from app.core.config import get_settings
from sqlalchemy.orm import sessionmaker


def _read_credentials() -> tuple[str, str]:
    email = ""
    password = ""

    # 1. CLI flags
    if "--email" in sys.argv:
        email = sys.argv[sys.argv.index("--email") + 1]
    if "--password" in sys.argv:
        password = sys.argv[sys.argv.index("--password") + 1]

    # 2. Environment
    email = email or os.getenv("CREATE_SUPERADMIN_EMAIL", "").strip()
    password = password or os.getenv("CREATE_SUPERADMIN_PASSWORD", "").strip()

    # 3. Interactive prompt
    if not email:
        email = input("Super admin email: ").strip()
    if not password:
        password = getpass.getpass("Super admin password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("ERROR: passwords do not match.")
            sys.exit(1)

    if not email or not password:
        print("ERROR: email and password are required.")
        sys.exit(1)
    if len(password) < 4:
        print("ERROR: password must be at least 4 characters.")
        sys.exit(1)

    return email, password


def create_superadmin() -> None:
    email, password = _read_credentials()

    engine = get_engine(get_settings().database_target)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()

    try:
        existing = session.query(Users).filter_by(email=email).first()
        if existing:
            print(f"User {email} already exists (id={existing.id}).")
            return

        admin_user = Users(
            email=email,
            password_hash=hash_password(password),
            display_name="Super Admin",
            roles=json.dumps(["super_admin", "max_user"]),
            is_active=1,
            is_blocked=0,
        )
        session.add(admin_user)
        session.commit()
        session.refresh(admin_user)
        print(f"Super admin created: {email} (id={admin_user.id})")
    finally:
        session.close()


if __name__ == "__main__":
    create_superadmin()
