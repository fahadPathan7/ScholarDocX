import sqlite3
import json

conn = sqlite3.connect("backend/scholardock.db")
conn.row_factory = sqlite3.Row

# Get super_admin usage
user_features = conn.execute(
    "SELECT feature FROM role_limits WHERE role = ? ORDER BY feature",
    ("general_user",)
).fetchall()
zero_limits = {row["feature"]: 0 for row in user_features}
print("Admin limits fallback:", json.dumps(zero_limits, indent=2))

# Get a normal user
limits = conn.execute(
    "SELECT feature, limit_count FROM role_limits WHERE role = ?", ("general_user",)
).fetchall()
limits_dict = {row["feature"]: row["limit_count"] for row in limits}
print("General User limits:", json.dumps(limits_dict, indent=2))
