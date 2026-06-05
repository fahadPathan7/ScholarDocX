import re

store_path = "backend/app/services/store.py"
with open(store_path, "r") as f:
    content = f.read()

def safe_replace(old, new):
    global content
    if old in content:
        content = content.replace(old, new)
    else:
        print(f"Warning: could not find {old[:30]}...")

safe_replace(
    '"SELECT status, COUNT(*) as count FROM applications GROUP BY status ORDER BY status"',
    'f"SELECT status, COUNT(*) as count FROM applications WHERE {\\"user_id = ?\\" if self.current_user_id else \\"1=1\\"} GROUP BY status ORDER BY status", (self.current_user_id,) if self.current_user_id else ()'
)

safe_replace(
    """SELECT d.*, u.name as university_name, p.name as program_name
                FROM deadlines d
                LEFT JOIN applications a ON a.id = d.application_id
                LEFT JOIN universities u ON u.id = a.university_id
                LEFT JOIN programs p ON p.id = a.program_id
                WHERE d.completed_at IS NULL
                ORDER BY d.due_at ASC
                LIMIT 8""",
    """SELECT d.*, u.name as university_name, p.name as program_name
                FROM deadlines d
                LEFT JOIN applications a ON a.id = d.application_id
                LEFT JOIN universities u ON u.id = a.university_id
                LEFT JOIN programs p ON p.id = a.program_id
                WHERE d.completed_at IS NULL AND ({0})
                ORDER BY d.due_at ASC
                LIMIT 8""".replace("{0}", "? IS NULL OR d.user_id = ?")
)
# For these multiline queries, we need to pass parameters.
# The query execute calls need to be updated.
# Let's write a smarter script that parses AST.
