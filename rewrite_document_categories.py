import re

with open("backend/app/services/store.py", "r") as f:
    content = f.read()

replacement = """    def document_categories(self) -> list[dict]:
        uid = self.current_user_id
        params = (uid, uid) if uid else ()
        where_clause = "WHERE (? IS NULL OR dc.user_id = ?) AND (? IS NULL OR sf.user_id = ?)" if uid else ""
        
        rows = self.connection.execute(
            f\"\"\"
            SELECT dc.*, COUNT(sf.id) AS document_count, MAX(sf.created_at) AS latest_document_at
            FROM document_categories dc
            LEFT JOIN static_files sf ON sf.file_type = dc.slug {("AND sf.user_id = ?" if uid else "")}
            {("WHERE dc.user_id = ?" if uid else "")}
            GROUP BY dc.id
            ORDER BY dc.sort_order ASC, dc.display_name ASC
            \"\"\", (uid, uid) if uid else ()
        ).fetchall()
        return [self._row(row) for row in rows]"""

start_idx = content.find("    def document_categories(self) -> list[dict]:")
end_idx = content.find("    def create_document_category(self, name: str) -> dict:")

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + replacement + "\n\n" + content[end_idx:]

with open("backend/app/services/store.py", "w") as f:
    f.write(content)
print("Updated document_categories")
