from __future__ import annotations

from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re
import shutil
import sqlite3
from typing import Any

from app.core.categories import category_display_name, normalize_media_category


MAX_DOCUMENT_CATEGORIES = 16


TABLE_COLUMNS = {
    "local_profiles": {"user_id", "display_name", "email", "preferred_email_provider", "timezone", "notes", "avatar", "notification_settings"},
    "projects": {"user_id", "name", "degree_type", "intake_term", "status", "description", "is_pinned", "pinned_to_dashboard"},
    "project_sheets": {"user_id", "project_id", "name", "is_pinned", "pinned_to_dashboard"},
    "project_pages": {"user_id", "project_id", "sheet_id", "name", "columns_json", "rows_json", "email_config_json"},
    "notifications": {"user_id", "project_id", "title", "body", "notification_type", "preference_key", "due_at", "read_at"},
    "document_categories": {"user_id", "slug", "display_name", "sort_order"},
    "sticky_notes": {"user_id", "title", "body", "color", "is_bold", "is_checklist", "checklist_json"},
    "degree_workspaces": {"user_id", "degree_type", "display_name", "enabled"},
    "universities": {"user_id", "name", "country", "region", "website_url", "notes"},
    "programs": {"user_id", "university_id", "name", "degree_type", "department", "application_url", "funding_url", "notes"},
    "professors": {"user_id", "university_id", "program_id", "name", "title", "email", "profile_url", "research_interests", "notes"},
    "applications": {
        "user_id",
        "degree_workspace_id",
        "university_id",
        "program_id",
        "professor_id",
        "status",
        "intake_term",
        "application_url",
        "priority",
        "notes",
    },
    "deadlines": {"user_id", "application_id", "deadline_type", "title", "due_at", "completed_at", "notes"},
    "documents": {"user_id", "document_type", "title", "owner_scope", "owner_id"},
    "document_versions": {"user_id", "document_id", "version_label", "content_format", "content", "application_id"},
    "static_files": {
        "user_id",
        "display_name",
        "file_type",
        "relative_path",
        "mime_type",
        "size_bytes",
        "application_id",
        "notes",
        "is_pinned",
        "pinned_to_dashboard"
    },
    "email_templates": {"user_id", "name", "subject_template", "body_template"},
    "email_drafts": {
        "user_id",
        "template_id",
        "application_id",
        "professor_id",
        "recipient_email",
        "subject",
        "body",
        "status",
    },
    "outreach_logs": {
        "user_id",
        "email_draft_id",
        "application_id",
        "professor_id",
        "recipient_email",
        "subject",
        "sent_at",
        "response_status",
        "notes",
    },
    "reminders": {"user_id", "application_id", "outreach_log_id", "title", "due_at", "completed_at", "notes"},
    "ai_conversations": {"user_id", "title"},
    "research_notes": {"user_id", "application_id", "professor_id", "university_id", "title", "content", "sources"},
    "whiteboards": {"user_id", "name", "shapes_json", "camera_json", "last_used_at"},
    "bookmarked_news": {"user_id", "article_id", "title", "link", "source_name", "pub_date", "image_url", "description", "country"},
    "scholarship_search_feedback": {
        "user_id",
        "initial_query",
        "refined_query",
        "filters_json",
        "was_edited",
        "provider_status",
        "result_count",
    },
}


DEFAULT_SORT = {
    "deadlines": "due_at ASC",
    "reminders": "due_at ASC",
    "notifications": "COALESCE(due_at, created_at) ASC",
    "applications": "updated_at DESC",
    "project_pages": "updated_at DESC",
    "projects": "is_pinned DESC, created_at DESC",
    "project_sheets": "is_pinned DESC, created_at DESC",
    "static_files": "is_pinned DESC, created_at DESC",
    "document_categories": "sort_order ASC, display_name ASC",
    "sticky_notes": "updated_at DESC",
    "document_versions": "created_at DESC",
    "whiteboards": "last_used_at DESC",
    "scholarship_search_feedback": "created_at DESC",
}

def get_columns_for_degree(degree_type: str) -> list[dict]:
    uni_name = [{"name": "University name", "type": "text", "unique": True}]
    uni_details = [
        {"name": "Uni details", "type": "group", "color": "#6f42c1"},
        {"name": "Global rank", "type": "number", "group": "Uni details"},
        {"name": "Local rank", "type": "number", "group": "Uni details"},
        {"name": "Program", "type": "text", "group": "Uni details"},
        {"name": "Deadline", "type": "date", "group": "Uni details"},
        {"name": "Application portal", "type": "url", "group": "Uni details"},
        {"name": "Application fee", "type": "number", "group": "Uni details"},
        {"name": "TOEFL / IELTS", "type": "text", "group": "Uni details"},
        {"name": "SAT" if degree_type not in ["phd", "masters"] else "GRE", "type": "text", "group": "Uni details"},
    ]
    prof_details = [
        {"name": "Professor name", "type": "text", "unique": True},
        {"name": "Prof details", "type": "group", "color": "#2f6d7a"},
        {"name": "Email", "type": "text", "group": "Prof details"},
        {"name": "Department", "type": "text", "group": "Prof details"},
        {"name": "Interests", "type": "text", "group": "Prof details"},
        {"name": "Google Scholar", "type": "url", "group": "Prof details"},
        {"name": "Portfolio", "type": "url", "group": "Prof details"},
        {"name": "Uni profile", "type": "url", "group": "Prof details"},
    ]
    funding = []
    if degree_type in ["phd", "masters"]:
        funding = [
            {"name": "Funding", "type": "group", "color": "#007bff"},
            {"name": "Uni fund available", "type": "bool", "group": "Funding"},
            {"name": "Uni fund details", "type": "text", "group": "Funding"},
            {"name": "Prof fund available", "type": "bool", "group": "Funding"},
            {"name": "Prof fund details", "type": "text", "group": "Funding"},
        ]

    email_group = [
        {"name": "Email", "type": "group", "color": "#4f8a45"},
        {"name": "Subject", "type": "text", "group": "Email"},
        {"name": "Body", "type": "text", "group": "Email"},
        {"name": "Scheduled time", "type": "date", "group": "Email"},
        {"name": "Cold email sent", "type": "bool", "group": "Email"},
        {"name": "Cold email date", "type": "date", "group": "Email"},
        {"name": "First follow-up sent", "type": "bool", "group": "Email"},
        {"name": "First follow-up date", "type": "date", "group": "Email"},
        {"name": "Second follow-up sent", "type": "bool", "group": "Email"},
        {"name": "Second follow-up date", "type": "date", "group": "Email"},
        {"name": "Email thread link", "type": "url", "group": "Email"},
    ]
    scholarship = [
        {"name": "Scholarship", "type": "group", "color": "#007bff"},
        {"name": "Available", "type": "bool", "group": "Scholarship"},
        {"name": "Details", "type": "text", "group": "Scholarship"},
        {"name": "Separate app needed", "type": "bool", "group": "Scholarship"},
        {"name": "Applied", "type": "bool", "group": "Scholarship"},
    ]
    status_options = ["Researching", "Ready", "Applied", "Waitlisted", "Accepted", "Rejected", "Archived"]
    if degree_type in ["phd", "masters"]:
        status_options = ["Researching", "Ready", "Sent", "Follow-up due", "Applied", "Waitlisted", "Accepted", "Rejected", "Archived"]

    status_applied = [
        {"name": "Status", "type": "select", "options": status_options},
        {"name": "Applied", "type": "bool"},
    ]
    notes = [{"name": "Notes", "type": "text"}]
    response = [{"name": "Response", "type": "text"}]

    if degree_type in ["phd", "masters"]:
        return uni_name + uni_details + prof_details + funding + status_applied + response + notes + email_group
    else:
        return uni_name + uni_details + scholarship + status_applied + notes


class Store:
    def __init__(self, connection: sqlite3.Connection, current_user_id: int | None = None) -> None:
        self.connection = connection
        self.current_user_id = current_user_id

    def list_records(self, table: str) -> list[dict]:
        self._ensure_table(table)
        order_by = DEFAULT_SORT.get(table, "id DESC")
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            rows = self.connection.execute(f"SELECT * FROM {table} WHERE user_id = ? ORDER BY {order_by}", (self.current_user_id,)).fetchall()
        else:
            rows = self.connection.execute(f"SELECT * FROM {table} ORDER BY {order_by}").fetchall()
        return [self._row(row) for row in rows]

    def get_record(self, table: str, record_id: int) -> dict:
        self._ensure_table(table)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            row = self.connection.execute(f"SELECT * FROM {table} WHERE id = ? AND user_id = ?", (record_id, self.current_user_id)).fetchone()
        else:
            row = self.connection.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()
        if row is None:
            raise LookupError(f"{table} record not found")
        return self._row(row)

    def create_record(self, table: str, payload: dict[str, Any]) -> dict:
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
        return self.get_record(table, int(cursor.lastrowid))

    def update_record(self, table: str, record_id: int, payload: dict[str, Any]) -> dict:
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
        return self.get_record(table, record_id)

    def delete_record(self, table: str, record_id: int) -> dict:
        self._ensure_table(table)
        record = self.get_record(table, record_id)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            self.connection.execute(f"DELETE FROM {table} WHERE id = ? AND user_id = ?", (record_id, self.current_user_id))
        else:
            self.connection.execute(f"DELETE FROM {table} WHERE id = ?", (record_id,))
        self.connection.commit()
        return record

    def document_categories(self) -> list[dict]:
        uid = self.current_user_id
        params = (uid, uid) if uid else ()
        where_clause = "WHERE (? IS NULL OR dc.user_id = ?) AND (? IS NULL OR sf.user_id = ?)" if uid else ""
        
        rows = self.connection.execute(
            f"""
            SELECT dc.*, COUNT(sf.id) AS document_count, MAX(sf.created_at) AS latest_document_at
            FROM document_categories dc
            LEFT JOIN static_files sf ON sf.file_type = dc.slug {("AND sf.user_id = ?" if uid else "")}
            {("WHERE dc.user_id = ?" if uid else "")}
            GROUP BY dc.id
            ORDER BY dc.sort_order ASC, dc.display_name ASC
            """, (uid, uid) if uid else ()
        ).fetchall()
        return [self._row(row) for row in rows]

    def create_document_category(self, name: str) -> dict:
        uid = self.current_user_id
        if uid:
            category_count = self.connection.execute(
                "SELECT COUNT(*) AS count FROM document_categories WHERE user_id = ?", (uid,)
            ).fetchone()["count"]
        else:
            category_count = self.connection.execute(
                "SELECT COUNT(*) AS count FROM document_categories"
            ).fetchone()["count"]
        if category_count >= MAX_DOCUMENT_CATEGORIES:
            raise ValueError(f"Document categories are limited to {MAX_DOCUMENT_CATEGORIES}")
        display_name = category_display_name(name)
        slug = normalize_media_category(display_name)
        uid = self.current_user_id
        if uid:
            max_order = self.connection.execute(
                "SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM document_categories WHERE user_id = ?", (uid,)
            ).fetchone()["sort_order"]
        else:
            max_order = self.connection.execute(
                "SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM document_categories"
            ).fetchone()["sort_order"]
        data: dict = {"slug": slug, "display_name": display_name, "sort_order": int(max_order) + 1}
        if uid:
            data["user_id"] = uid
        columns = ", ".join(data.keys())
        placeholders = ", ".join("?" for _ in data)
        cursor = self.connection.execute(
            f"INSERT INTO document_categories ({columns}) VALUES ({placeholders})",
            tuple(data.values()),
        )
        self.connection.commit()
        return self.get_record("document_categories", int(cursor.lastrowid))

    def ensure_document_category(self, slug: str, display_name: str | None = None) -> dict:
        normalized_slug = normalize_media_category(slug)
        uid = self.current_user_id
        if uid:
            row = self.connection.execute(
                "SELECT * FROM document_categories WHERE slug = ? AND user_id = ?",
                (normalized_slug, uid),
            ).fetchone()
        else:
            row = self.connection.execute(
                "SELECT * FROM document_categories WHERE slug = ?",
                (normalized_slug,),
            ).fetchone()
        if row:
            return self._row(row)
        display = category_display_name(display_name or normalized_slug.replace("-", " ")).title()
        if uid:
            cursor = self.connection.execute(
                "INSERT INTO document_categories (slug, display_name, sort_order, user_id) VALUES (?, ?, ?, ?)",
                (normalized_slug, display, 100, uid),
            )
        else:
            cursor = self.connection.execute(
                "INSERT INTO document_categories (slug, display_name, sort_order) VALUES (?, ?, ?)",
                (normalized_slug, display, 100),
            )
        self.connection.commit()
        return self.get_record("document_categories", int(cursor.lastrowid))

    def rename_document_category(self, category_id: int, name: str) -> dict:
        category = self.get_record("document_categories", category_id)
        display_name = category_display_name(name)
        next_slug = normalize_media_category(display_name)
        uid = self.current_user_id
        if next_slug != category["slug"]:
            if uid:
                self.connection.execute(
                    "UPDATE static_files SET file_type = ?, updated_at = CURRENT_TIMESTAMP WHERE file_type = ? AND user_id = ?",
                    (next_slug, category["slug"], uid),
                )
            else:
                self.connection.execute(
                    "UPDATE static_files SET file_type = ?, updated_at = CURRENT_TIMESTAMP WHERE file_type = ?",
                    (next_slug, category["slug"]),
                )
        if uid:
            self.connection.execute(
                "UPDATE document_categories SET slug = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
                (next_slug, display_name, category_id, uid),
            )
        else:
            self.connection.execute(
                "UPDATE document_categories SET slug = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (next_slug, display_name, category_id),
            )
        self.connection.commit()
        return self.get_record("document_categories", category_id)

    def delete_document_category(self, category_id: int, workspace_path: Path, media_path: Path) -> dict:
        category = self.get_record("document_categories", category_id)
        uid = self.current_user_id
        if uid:
            files = [
                self._row(row)
                for row in self.connection.execute(
                    "SELECT * FROM static_files WHERE file_type = ? AND user_id = ?",
                    (category["slug"], uid),
                ).fetchall()
            ]
        else:
            files = [
                self._row(row)
                for row in self.connection.execute(
                    "SELECT * FROM static_files WHERE file_type = ?",
                    (category["slug"],),
                ).fetchall()
            ]
        for file_record in files:
            file_path = (workspace_path / file_record["relative_path"]).resolve()
            if workspace_path.resolve() in file_path.parents and file_path.exists() and file_path.is_file():
                file_path.unlink()
        if uid:
            self.connection.execute("DELETE FROM static_files WHERE file_type = ? AND user_id = ?", (category["slug"], uid))
            self.connection.execute("DELETE FROM document_categories WHERE id = ? AND user_id = ?", (category_id, uid))
        else:
            self.connection.execute("DELETE FROM static_files WHERE file_type = ?", (category["slug"],))
            self.connection.execute("DELETE FROM document_categories WHERE id = ?", (category_id,))
        category_dir = (media_path / category["slug"]).resolve()
        if media_path.resolve() in category_dir.parents and category_dir.exists():
            shutil.rmtree(category_dir)
        self.connection.commit()
        return {**category, "deleted_document_count": len(files)}

    def dashboard_summary(self) -> dict:
        uid = self.current_user_id
        params = (uid,) if uid else ()
        where_clause = "WHERE user_id = ?" if uid else ""
        and_clause = "AND user_id = ?" if uid else ""
        
        statuses = [
            dict(row)
            for row in self.connection.execute(
                f"SELECT status, COUNT(*) as count FROM applications {where_clause} GROUP BY status ORDER BY status", params
            ).fetchall()
        ]
        counts = {
            "applications": self._count("applications"),
            "projects": self._count("projects"),
            "project_sheets": self._count("project_sheets"),
            "universities": self._count("universities"),
            "professors": self._count("professors"),
            "documents": self._count("static_files"),
            "files": self._count("static_files"),
            "sticky_notes": self._count("sticky_notes"),
            "whiteboards": self._count("whiteboards"),
            "email_drafts": self._count("email_drafts"),
        }
        upcoming_deadlines = [
            dict(row)
            for row in self.connection.execute(
                f"""
                SELECT d.*, u.name as university_name, p.name as program_name
                FROM deadlines d
                LEFT JOIN applications a ON a.id = d.application_id
                LEFT JOIN universities u ON u.id = a.university_id
                LEFT JOIN programs p ON p.id = a.program_id
                WHERE d.completed_at IS NULL {and_clause.replace('user_id', 'd.user_id')}
                ORDER BY d.due_at ASC
                LIMIT 8
                """, params
            ).fetchall()
        ]
        reminders = [
            dict(row)
            for row in self.connection.execute(
                f"""
                SELECT *
                FROM reminders
                WHERE completed_at IS NULL {and_clause}
                ORDER BY due_at ASC
                LIMIT 8
                """, params
            ).fetchall()
        ]
        notifications = [
            dict(row)
            for row in self.connection.execute(
                f"""
                SELECT n.*, p.name as project_name
                FROM notifications n
                LEFT JOIN projects p ON p.id = n.project_id
                WHERE n.read_at IS NULL {and_clause.replace('user_id', 'n.user_id')}
                ORDER BY COALESCE(n.due_at, n.created_at) ASC
                LIMIT 8
                """, params
            ).fetchall()
        ]
        applications = [
            dict(row)
            for row in self.connection.execute(
                f"""
                SELECT a.*, dw.display_name as degree_name, u.name as university_name,
                       p.name as program_name, pr.name as professor_name
                FROM applications a
                LEFT JOIN degree_workspaces dw ON dw.id = a.degree_workspace_id
                LEFT JOIN universities u ON u.id = a.university_id
                LEFT JOIN programs p ON p.id = a.program_id
                LEFT JOIN professors pr ON pr.id = a.professor_id
                {where_clause.replace('user_id', 'a.user_id')}
                ORDER BY a.updated_at DESC
                LIMIT 12
                """, params
            ).fetchall()
        ]
        projects = [
            dict(row)
            for row in self.connection.execute(
                f"""
                SELECT p.*,
                       COUNT(DISTINCT ps.id) as sheet_count,
                       COUNT(DISTINCT pp.id) as page_count
                FROM projects p
                LEFT JOIN project_sheets ps ON ps.project_id = p.id
                LEFT JOIN project_pages pp ON pp.project_id = p.id
                {where_clause.replace('user_id', 'p.user_id')}
                GROUP BY p.id
                ORDER BY p.updated_at DESC
                LIMIT 5
                """, params
            ).fetchall()
        ]
        pinned_projects = [
            dict(row)
            for row in self.connection.execute(
                f"""
                SELECT p.*,
                       COUNT(DISTINCT ps.id) as sheet_count
                FROM projects p
                LEFT JOIN project_sheets ps ON ps.project_id = p.id
                WHERE p.pinned_to_dashboard = 1 {and_clause.replace('user_id', 'p.user_id')}
                GROUP BY p.id
                ORDER BY p.updated_at DESC
                LIMIT 8
                """, params
            ).fetchall()
        ]
        pinned_sheets = [
            dict(row)
            for row in self.connection.execute(
                f"""
                SELECT ps.*, p.name as project_name, p.degree_type
                FROM project_sheets ps
                LEFT JOIN projects p ON p.id = ps.project_id
                WHERE ps.pinned_to_dashboard = 1 {and_clause.replace('user_id', 'ps.user_id')}
                ORDER BY ps.updated_at DESC
                LIMIT 8
                """, params
            ).fetchall()
        ]
        pinned_docs = [
            dict(row)
            for row in self.connection.execute(
                f"""
                SELECT *
                FROM static_files
                WHERE pinned_to_dashboard = 1 {and_clause}
                ORDER BY updated_at DESC
                LIMIT 8
                """, params
            ).fetchall()
        ]
        project_pages = [
            self._decode_page(row)
            for row in self.connection.execute(
                f"""
                SELECT pp.*, p.name as project_name
                FROM project_pages pp
                LEFT JOIN projects p ON p.id = pp.project_id
                {where_clause.replace('user_id', 'pp.user_id')}
                ORDER BY pp.updated_at DESC
                """, params
            ).fetchall()
        ]
        return {
            "counts": counts,
            "status_counts": statuses,
            "upcoming_deadlines": upcoming_deadlines,
            "reminders": reminders,
            "notifications": notifications,
            "recent_applications": applications,
            "recent_projects": projects,
            "pinned_projects": pinned_projects,
            "pinned_sheets": pinned_sheets,
            "pinned_docs": pinned_docs,
            "calendar_items": self._calendar_items(project_pages),
        }

    def project_summary(self, project_id: int) -> dict:
        project = self.get_record("projects", project_id)  # already enforces user_id ownership
        uid = self.current_user_id
        if uid:
            sheets = [
                dict(row)
                for row in self.connection.execute(
                    "SELECT * FROM project_sheets WHERE project_id = ? AND user_id = ? ORDER BY is_pinned DESC, created_at DESC",
                    (project_id, uid),
                ).fetchall()
            ]
            pages = [
                self._decode_page(row)
                for row in self.connection.execute(
                    "SELECT * FROM project_pages WHERE project_id = ? AND user_id = ? ORDER BY sheet_id DESC, updated_at DESC",
                    (project_id, uid),
                ).fetchall()
            ]
            notifications = [
                dict(row)
                for row in self.connection.execute(
                    "SELECT * FROM notifications WHERE project_id = ? AND user_id = ? AND read_at IS NULL ORDER BY COALESCE(due_at, created_at) ASC",
                    (project_id, uid),
                ).fetchall()
            ]
        else:
            sheets = [
                dict(row)
                for row in self.connection.execute(
                    "SELECT * FROM project_sheets WHERE project_id = ? ORDER BY is_pinned DESC, created_at DESC",
                    (project_id,),
                ).fetchall()
            ]
            pages = [
                self._decode_page(row)
                for row in self.connection.execute(
                    "SELECT * FROM project_pages WHERE project_id = ? ORDER BY sheet_id DESC, updated_at DESC",
                    (project_id,),
                ).fetchall()
            ]
            notifications = [
                dict(row)
                for row in self.connection.execute(
                    "SELECT * FROM notifications WHERE project_id = ? AND read_at IS NULL ORDER BY COALESCE(due_at, created_at) ASC",
                    (project_id,),
                ).fetchall()
            ]
        row_count = sum(len(page["rows"]) for page in pages)
        return {
            "project": project,
            "sheet_count": len(sheets),
            "page_count": len(pages),
            "row_count": row_count,
            "notification_count": len(notifications),
            "sheets": sheets,
            "pages": pages,
            "notifications": notifications,
            "calendar_items": self._calendar_items(pages),
        }

    def create_sheet_with_defaults(self, project_id: int, name: str) -> dict:
        project = self.get_record("projects", project_id)
        degree_type = (project.get("degree_type") or "phd").lower()

        # Build columns list dynamically based on degree type
        columns = get_columns_for_degree(degree_type)

        columns.append({"name": "Attachments", "type": "group", "color": "#c58940", "width": 150})
        attachments = []
        if degree_type == "phd":
            attachments = [
                {"name": "CV", "type": "file", "group": "Attachments"},
                {"name": "SOP", "type": "file", "group": "Attachments"},
                {"name": "Research Proposal", "type": "file", "group": "Attachments"},
                {"name": "BSc certificate", "type": "file", "group": "Attachments"},
                {"name": "BSc transcript", "type": "file", "group": "Attachments"},
                {"name": "MSc certificate", "type": "file", "group": "Attachments"},
                {"name": "MSc transcript", "type": "file", "group": "Attachments"},
                {"name": "LOR1", "type": "file", "group": "Attachments"},
                {"name": "LOR2", "type": "file", "group": "Attachments"},
                {"name": "LOR3", "type": "file", "group": "Attachments"},
            ]
        elif degree_type == "masters":
            attachments = [
                {"name": "CV", "type": "file", "group": "Attachments"},
                {"name": "SOP", "type": "file", "group": "Attachments"},
                {"name": "BSc certificate", "type": "file", "group": "Attachments"},
                {"name": "BSc transcript", "type": "file", "group": "Attachments"},
                {"name": "LOR1", "type": "file", "group": "Attachments"},
                {"name": "LOR2", "type": "file", "group": "Attachments"},
                {"name": "LOR3", "type": "file", "group": "Attachments"},
            ]
        else:
            attachments = [
                {"name": "CV", "type": "file", "group": "Attachments"},
                {"name": "SOP", "type": "file", "group": "Attachments"},
                {"name": "High school certificate", "type": "file", "group": "Attachments"},
                {"name": "High school transcript", "type": "file", "group": "Attachments"},
                {"name": "LOR1", "type": "file", "group": "Attachments"},
                {"name": "LOR2", "type": "file", "group": "Attachments"},
                {"name": "LOR3", "type": "file", "group": "Attachments"},
            ]

        for attach in attachments:
            columns.append(attach)

        sheet = self.create_record("project_sheets", {"project_id": project_id, "name": name})
        page = self.create_record(
            "project_pages",
            {
                "project_id": project_id,
                "sheet_id": sheet["id"],
                "name": name,
                "columns_json": columns,
                "rows_json": [],
                "email_config_json": None,
            },
        )
        return {"sheet": sheet, "page": page}

    def render_template(self, template_id: int, variables: dict[str, Any]) -> dict:
        template = self.get_record("email_templates", template_id)
        subject = render_text(template["subject_template"], variables)
        body = render_text(template["body_template"], variables)
        return {"subject": subject, "body": body}

    def log_outreach(self, payload: dict[str, Any], follow_up_days: int | None = None) -> dict:
        outreach = self.create_record("outreach_logs", payload)
        if follow_up_days:
            sent_at = _parse_date(payload.get("sent_at")) or date.today()
            due_at = sent_at + timedelta(days=follow_up_days)
            self.create_record(
                "reminders",
                {
                    "application_id": payload.get("application_id"),
                    "outreach_log_id": outreach["id"],
                    "title": f"Follow up: {payload.get('subject', 'outreach')}",
                    "due_at": due_at.isoformat(),
                    "notes": "Auto-created from outreach log.",
                },
            )
        return outreach

    def _count(self, table: str) -> int:
        uid = self.current_user_id
        if uid and "user_id" in TABLE_COLUMNS.get(table, {}):
            return int(self.connection.execute(
                f"SELECT COUNT(*) FROM {table} WHERE user_id = ?", (uid,)
            ).fetchone()[0])
        return int(self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])

    def _filter_payload(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        accepted = TABLE_COLUMNS[table]
        filtered = {key: value for key, value in payload.items() if key in accepted}

        # Profile email is identity-bound and must not be user-editable from profile updates.
        if table == "local_profiles":
            filtered.pop("email", None)

        return filtered

    def _ensure_table(self, table: str) -> None:
        if table not in TABLE_COLUMNS:
            raise ValueError(f"Unsupported table: {table}")

    def _row(self, row: sqlite3.Row) -> dict:
        return dict(row)

    def _decode_page(self, row: sqlite3.Row) -> dict:
        data = dict(row)
        columns = json.loads(data.get("columns_json") or "[]")
        # Auto-migrate old string[] columns to {name, type}[] format
        if columns and isinstance(columns[0], str):
            columns = [{"name": col, "type": "text"} for col in columns]
        data["columns"] = columns
        data["rows"] = json.loads(data.get("rows_json") or "[]")
        data["email_config"] = json.loads(data.get("email_config_json") or "null")
        return data

    def _calendar_items(self, pages: list[dict]) -> list[dict]:
        items = []
        for page in pages:
            date_keys = self._calendar_date_keys(page)
            for row_index, row in enumerate(page["rows"]):
                for key in date_keys:
                    normalized_date = _date_key(row.get(key))
                    if normalized_date:
                        items.append(
                            {
                                "title": row.get("Name") or row.get("Professor name") or row.get("Item") or row.get("Subject") or row.get("Email subject") or page["name"],
                                "date": row[key],
                                "date_key": normalized_date,
                                "date_field": key,
                                "type": "sheet-date",
                                "source": page["name"],
                                "project_id": page.get("project_id"),
                                "project_name": page.get("project_name"),
                                "sheet_id": page.get("sheet_id"),
                                "page_id": page.get("id"),
                                "row_index": row_index,
                            }
                        )
        return sorted(items, key=lambda item: (item["date_key"], item["date"]))

    def _calendar_date_keys(self, page: dict) -> list[str]:
        keys = []
        for column in page.get("columns", []):
            if isinstance(column, str):
                name = column
                column_type = "text"
            else:
                name = column.get("name", "")
                column_type = column.get("type", "text")
            lowered = name.lower()
            if column_type == "date" or any(token in lowered for token in ("date", "deadline", "scheduled", "time")):
                keys.append(name)
        fallback_keys = ("Scheduled send time", "Follow-up date", "Email sent date", "Date")
        for key in fallback_keys:
            if key not in keys:
                keys.append(key)
        return keys

    def _normalize(self, value: Any) -> Any:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        return value


def render_text(template: str, variables: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        return str(variables.get(key, match.group(0)))

    return re.sub(r"\{\{\s*([a-zA-Z0-9_ -]+)\s*\}\}", replace, template)


def _parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None


def _date_key(value: Any) -> str | None:
    parsed = _parse_date(value)
    return parsed.isoformat() if parsed else None
