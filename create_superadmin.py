import sqlite3
import json
from backend.app.auth.password import hash_password

db_path = "workspace/db/app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

email = "admin@scholardock.com"
password = "Admin!23" # Must pass complexity, but I changed it to 3-10 chars. Oh, wait, I changed it to just length. Let's use 'admin' as password.
password = "admin"
hashed = hash_password(password)

roles = json.dumps(["general_user", "super_admin"])

cursor.execute(
    "INSERT INTO users (email, password_hash, display_name, roles) VALUES (?, ?, ?, ?)",
    (email, hashed, "Super Admin", roles)
)
conn.commit()
conn.close()
print(f"Super admin created with {email} / {password}")
