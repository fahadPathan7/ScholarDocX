import re
import os

schema_path = "backend/app/db/schema.py"
with open(schema_path, "r") as f:
    schema = f.read()

# Tables that already have user_id: users, user_sessions, role_limits (not really), user_usage_stats, audit_logs, projects, whiteboards, sticky_notes, ai_conversations, plan_upgrade_requests, invite_requests
# Let's just find ALL CREATE TABLE IF NOT EXISTS statements, check if they have user_id.
# If they don't, and they are not users, invite_codes, role_limits, app_settings, add it.

exclude = ["users", "invite_codes", "role_limits", "app_settings"]

def replacer(match):
    table_name = match.group(1)
    body = match.group(2)
    if table_name in exclude:
        return match.group(0)
    
    if "user_id INTEGER" in body:
        return match.group(0)
        
    # Inject user_id right after id INTEGER PRIMARY KEY AUTOINCREMENT,
    new_body = re.sub(
        r"(id INTEGER PRIMARY KEY AUTOINCREMENT,)",
        r"\1\n  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,",
        body
    )
    return f"CREATE TABLE IF NOT EXISTS {table_name} ({new_body})"

new_schema = re.sub(r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\);", replacer, schema, flags=re.DOTALL)

with open(schema_path, "w") as f:
    f.write(new_schema)
print("Updated schema.py")
