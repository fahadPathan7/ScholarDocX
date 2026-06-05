import re

store_path = "backend/app/services/store.py"
with open(store_path, "r") as f:
    content = f.read()

# 1. Update __init__
content = content.replace(
    "def __init__(self, connection: sqlite3.Connection) -> None:\n        self.connection = connection",
    "def __init__(self, connection: sqlite3.Connection, current_user_id: int | None = None) -> None:\n        self.connection = connection\n        self.current_user_id = current_user_id"
)

# 2. Update list_records
# Before: rows = self.connection.execute(f"SELECT * FROM {table} ORDER BY {order_by}").fetchall()
# After: rows = self.connection.execute(f"SELECT * FROM {table} WHERE user_id = ? ORDER BY {order_by}", (self.current_user_id,)).fetchall() if self.current_user_id and "user_id" in TABLE_COLUMNS[table] else ...
content = content.replace(
    "rows = self.connection.execute(f\"SELECT * FROM {table} ORDER BY {order_by}\").fetchall()",
    """if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            rows = self.connection.execute(f"SELECT * FROM {table} WHERE user_id = ? ORDER BY {order_by}", (self.current_user_id,)).fetchall()
        else:
            rows = self.connection.execute(f"SELECT * FROM {table} ORDER BY {order_by}").fetchall()"""
)

# 3. Update get_record
content = content.replace(
    "row = self.connection.execute(f\"SELECT * FROM {table} WHERE id = ?\", (record_id,)).fetchone()",
    """if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            row = self.connection.execute(f"SELECT * FROM {table} WHERE id = ? AND user_id = ?", (record_id, self.current_user_id)).fetchone()
        else:
            row = self.connection.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()"""
)

# 4. Update create_record
content = content.replace(
    "data = self._filter_payload(table, payload)",
    """if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            payload["user_id"] = self.current_user_id
        data = self._filter_payload(table, payload)"""
)

# 5. Update update_record
content = content.replace(
    "cursor = self.connection.execute(\n            f\"UPDATE {table} SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?\",\n            values,\n        )",
    """if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            cursor = self.connection.execute(
                f"UPDATE {table} SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                values + (self.current_user_id,),
            )
        else:
            cursor = self.connection.execute(
                f"UPDATE {table} SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                values,
            )"""
)

# 6. Update delete_record
content = content.replace(
    "self.connection.execute(f\"DELETE FROM {table} WHERE id = ?\", (record_id,))",
    """if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            self.connection.execute(f"DELETE FROM {table} WHERE id = ? AND user_id = ?", (record_id, self.current_user_id))
        else:
            self.connection.execute(f"DELETE FROM {table} WHERE id = ?", (record_id,))"""
)

with open(store_path, "w") as f:
    f.write(content)
print("Updated store methods.")
