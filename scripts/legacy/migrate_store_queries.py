import re

store_path = "backend/app/services/store.py"
with open(store_path, "r") as f:
    content = f.read()

# Update _count
content = content.replace(
    """def _count(self, table: str) -> int:
        return int(self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])""",
    """def _count(self, table: str) -> int:
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            return int(self.connection.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id = ?", (self.current_user_id,)).fetchone()[0])
        return int(self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])"""
)

# Update dashboard_summary queries
def inject_where(sql):
    if "WHERE" in sql:
        return sql.replace("WHERE ", "WHERE user_id = ? AND ")
    else:
        if "GROUP BY" in sql:
            return sql.replace("GROUP BY", "WHERE user_id = ? GROUP BY")
        elif "ORDER BY" in sql:
            return sql.replace("ORDER BY", "WHERE user_id = ? ORDER BY")
        else:
            return sql.replace("LIMIT", "WHERE user_id = ? LIMIT")

# We will just replace self.connection.execute(sql).fetchall() with custom parameterized execute if self.current_user_id
# Actually, since all these queries are just string literals, let's just do it manually with multi_replace_file_content or a robust script.
