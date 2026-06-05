import json
import sqlite3
import jwt
from app.core.config import get_settings

conn = sqlite3.connect(get_settings().database_path)
conn.row_factory = sqlite3.Row
user = conn.execute("SELECT * FROM users WHERE email='admin@scholardock.com'").fetchone()

roles = json.loads(user["roles"])
print("Roles in DB:", roles)

user_dict = dict(user)
user_dict["roles"] = roles

from app.auth.jwt import create_token, decode_token
token = create_token(user_dict, "scholar-dock-local-first-secret-key-do-not-use-in-cloud", 30)

payload = decode_token(token, "scholar-dock-local-first-secret-key-do-not-use-in-cloud")
print("Payload roles:", payload.get("roles"))
