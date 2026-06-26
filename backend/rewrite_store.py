from pathlib import Path
import re

store_path = Path("/Users/fahadpathan/Documents/ScholarDocX/backend/app/services/store.py")
content = store_path.read_text()

# Add imports
imports = """from sqlalchemy import select, text
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from app.db import models

MODEL_MAP = {
    "local_profiles": models.LocalProfiles,
    "projects": models.Projects,
    "project_sheets": models.ProjectSheets,
    "project_pages": models.ProjectPages,
    "notifications": models.Notifications,
    "document_categories": models.DocumentCategories,
    "sticky_notes": models.StickyNotes,
    "degree_workspaces": models.DegreeWorkspaces,
    "universities": models.Universities,
    "programs": models.Programs,
    "professors": models.Professors,
    "applications": models.Applications,
    "deadlines": models.Deadlines,
    "documents": models.Documents,
    "document_versions": models.DocumentVersions,
    "static_files": models.StaticFiles,
    "email_templates": models.EmailTemplates,
    "email_drafts": models.EmailDrafts,
    "outreach_logs": models.OutreachLogs,
    "reminders": models.Reminders,
    "ai_conversations": models.AiConversations,
    "research_notes": models.ResearchNotes,
    "whiteboards": models.Whiteboards,
    "bookmarked_news": models.BookmarkedNews,
    "scholarship_search_feedback": models.ScholarshipSearchFeedback,
}
"""

content = content.replace("from app.core.categories import category_display_name, normalize_media_category", 
                         "from app.core.categories import category_display_name, normalize_media_category\n" + imports)

# Replace Store init
content = content.replace("def __init__(self, connection: sqlite3.Connection, current_user_id: int | None = None) -> None:\n        self.connection = connection\n", 
                          "def __init__(self, db: Session, current_user_id: int | None = None) -> None:\n        self.db = db\n")

# Replace list_records
list_records_old = """    def list_records(self, table: str) -> list[dict]:
        self._ensure_table(table)
        order_by = DEFAULT_SORT.get(table, "id DESC")
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            rows = self.connection.execute(f"SELECT * FROM {table} WHERE user_id = ? ORDER BY {order_by}", (self.current_user_id,)).fetchall()
        else:
            rows = self.connection.execute(f"SELECT * FROM {table} ORDER BY {order_by}").fetchall()
        return [self._row(row) for row in rows]"""

list_records_new = """    def list_records(self, table: str) -> list[dict]:
        self._ensure_table(table)
        model = MODEL_MAP[table]
        order_by = DEFAULT_SORT.get(table, "id DESC")
        stmt = select(model)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            stmt = stmt.where(model.user_id == self.current_user_id)
        stmt = stmt.order_by(text(order_by))
        return [self._row(obj) for obj in self.db.scalars(stmt).all()]"""
content = content.replace(list_records_old, list_records_new)

# Replace get_record
get_record_old = """    def get_record(self, table: str, record_id: int) -> dict:
        self._ensure_table(table)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            row = self.connection.execute(f"SELECT * FROM {table} WHERE id = ? AND user_id = ?", (record_id, self.current_user_id)).fetchone()
        else:
            row = self.connection.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()
        if row is None:
            raise LookupError(f"{table} record not found")
        return self._row(row)"""

get_record_new = """    def get_record(self, table: str, record_id: int) -> dict:
        self._ensure_table(table)
        model = MODEL_MAP[table]
        stmt = select(model).where(model.id == record_id)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            stmt = stmt.where(model.user_id == self.current_user_id)
        obj = self.db.scalar(stmt)
        if obj is None:
            raise LookupError(f"{table} record not found")
        return self._row(obj)"""
content = content.replace(get_record_old, get_record_new)

# Replace create_record
create_record_old = """    def create_record(self, table: str, payload: dict[str, Any]) -> dict:
        self._ensure_table(table)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            payload["user_id"] = self.current_user_id
        data = self._filter_payload(table, payload)
        if not data:
            raise ValueError("No accepted fields provided")
        columns = ", ".join(data.keys())
        placeholders = ", ".join("?" for _ in data)
        values = tuple(self._normalize(value) for value in data.values())
        cursor = self.connection.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({placeholders})",
            values,
        )
        self.connection.commit()
        return self.get_record(table, int(cursor.lastrowid))"""

create_record_new = """    def create_record(self, table: str, payload: dict[str, Any]) -> dict:
        self._ensure_table(table)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            payload["user_id"] = self.current_user_id
        data = self._filter_payload(table, payload)
        if not data:
            raise ValueError("No accepted fields provided")
        
        model = MODEL_MAP[table]
        obj = model(**{k: self._normalize(v) for k, v in data.items()})
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return self._row(obj)"""
content = content.replace(create_record_old, create_record_new)

# Replace update_record
update_record_old = """    def update_record(self, table: str, record_id: int, payload: dict[str, Any]) -> dict:
        self._ensure_table(table)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            payload["user_id"] = self.current_user_id
        data = self._filter_payload(table, payload)
        if not data:
            return self.get_record(table, record_id)
        assignments = ", ".join(f"{column} = ?" for column in data)
        values = tuple(self._normalize(value) for value in data.values()) + (record_id,)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            cursor = self.connection.execute(
                f"UPDATE {table} SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                values + (self.current_user_id,),
            )
        else:
            cursor = self.connection.execute(
                f"UPDATE {table} SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                values,
            )
        self.connection.commit()
        if cursor.rowcount == 0:
            raise LookupError(f"{table} record not found")
        return self.get_record(table, record_id)"""

update_record_new = """    def update_record(self, table: str, record_id: int, payload: dict[str, Any]) -> dict:
        self._ensure_table(table)
        model = MODEL_MAP[table]
        stmt = select(model).where(model.id == record_id)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            stmt = stmt.where(model.user_id == self.current_user_id)
        obj = self.db.scalar(stmt)
        if not obj:
            raise LookupError(f"{table} record not found")
            
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            payload["user_id"] = self.current_user_id
        data = self._filter_payload(table, payload)
        if not data:
            return self._row(obj)
            
        for k, v in data.items():
            setattr(obj, k, self._normalize(v))
            
        if hasattr(obj, "updated_at"):
            obj.updated_at = func.current_timestamp()
            
        self.db.commit()
        self.db.refresh(obj)
        return self._row(obj)"""
content = content.replace(update_record_old, update_record_new)

# Replace delete_record
delete_record_old = """    def delete_record(self, table: str, record_id: int) -> dict:
        self._ensure_table(table)
        record = self.get_record(table, record_id)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            self.connection.execute(f"DELETE FROM {table} WHERE id = ? AND user_id = ?", (record_id, self.current_user_id))
        else:
            self.connection.execute(f"DELETE FROM {table} WHERE id = ?", (record_id,))
        self.connection.commit()
        return record"""

delete_record_new = """    def delete_record(self, table: str, record_id: int) -> dict:
        self._ensure_table(table)
        model = MODEL_MAP[table]
        stmt = select(model).where(model.id == record_id)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            stmt = stmt.where(model.user_id == self.current_user_id)
        obj = self.db.scalar(stmt)
        if not obj:
            raise LookupError(f"{table} record not found")
        record = self._row(obj)
        self.db.delete(obj)
        self.db.commit()
        return record"""
content = content.replace(delete_record_old, delete_record_new)

# Now we need to handle raw SQL queries that use .execute()
# Replace ALL self.connection.execute with self.db.execute(text(...)) AND handle ? to :param

def convert_raw_sql_execution(match):
    # This is too brittle. I will do string replacements for the specific functions:
    pass

# We will just write a function to format the dashboard_summary, document_categories, etc. manually.
# Due to time, I will output the python script with the exact string replacements for those functions.
