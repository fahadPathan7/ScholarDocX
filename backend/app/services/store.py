from __future__ import annotations

from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re
import shutil
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.core.categories import category_display_name, normalize_media_category
from app.db import models

MAX_DOCUMENT_CATEGORIES = 16

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
    "saved_scholarship_queries": models.SavedScholarshipQueries,
    "scholarship_opportunities": models.ScholarshipOpportunities,
}

TABLE_COLUMNS = {
    "local_profiles": {"user_id", "display_name", "email", "preferred_email_provider", "timezone", "notes", "avatar", "notification_settings", "hunt_profile_json"},
    "projects": {"user_id", "name", "degree_type", "intake_term", "status", "description", "is_pinned", "pinned_to_dashboard"},
    "project_sheets": {"user_id", "project_id", "name", "is_pinned", "pinned_to_dashboard"},
    "project_pages": {"user_id", "project_id", "sheet_id", "name", "columns_json", "rows_json", "email_config_json"},
    "notifications": {"user_id", "project_id", "title", "body", "notification_type", "preference_key", "due_at", "read_at"},
    "document_categories": {"user_id", "slug", "display_name", "sort_order"},
    "sticky_notes": {"user_id", "title", "body", "color", "is_checklist", "checklist_json", "font", "font_size", "is_pinned"},
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
    "saved_scholarship_queries": {
        "user_id",
        "name",
        "query_string",
        "filters_json",
        "last_used_at",
        "seen_article_ids_json",
    },
    "scholarship_opportunities": {
        "user_id",
        "source",
        "canonical_name",
        "normalized_url",
        "status",
        "sponsor",
        "degree_levels_json",
        "fields_of_study_json",
        "relevance_score",
        "destinations_json",
        "eligible_nationalities_json",
        "funding_json",
        "deadlines_json",
        "requirements_json",
        "field_confidence_json",
        "application_url",
        "linked_sheet_id",
        "linked_row_snapshot",
        "last_deadline_notified_at",
        "deep_hunt_run_id",
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
    "saved_scholarship_queries": "last_used_at DESC",
    "scholarship_opportunities": "updated_at DESC",
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
    def __init__(self, db: Session, current_user_id: str | None = None) -> None:
        self.db = db
        self.current_user_id = current_user_id

    @property
    def legacy_connection(self):
        """Session-backed connection accepting legacy-style raw SQL.

        Delegates to app.db.legacy_db.LegacyConnection, which translates ``?``
        placeholders to named params and appends ``RETURNING id`` to INSERTs so
        ``lastrowid`` works on Postgres. See legacy_db.py for details.
        SCHOLARDOCX-0139.
        """
        from app.db.legacy_db import LegacyConnection
        return LegacyConnection(self.db)

    def list_records(self, table: str) -> list[dict]:
        self._ensure_table(table)
        model = MODEL_MAP[table]
        order_by = DEFAULT_SORT.get(table, "id DESC")
        stmt = select(model)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            stmt = stmt.where(model.user_id == self.current_user_id)
        stmt = stmt.order_by(text(order_by))
        return [self._row(obj) for obj in self.db.scalars(stmt).all()]

    def get_record(self, table: str, record_id: str) -> dict:
        self._ensure_table(table)
        model = MODEL_MAP[table]
        stmt = select(model).where(model.id == record_id)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            stmt = stmt.where(model.user_id == self.current_user_id)
        obj = self.db.scalar(stmt)
        if obj is None:
            self.db.expire_all()
            obj = self.db.scalar(stmt)
        if obj is None:
            raise LookupError(f"{table} record not found")
        return self._row(obj)

    def create_record(self, table: str, payload: dict[str, Any]) -> dict:
        self._ensure_table(table)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            payload["user_id"] = self.current_user_id
        data = self._filter_payload(table, payload)
        if not data:
            raise ValueError("No accepted fields provided")
        
        model = MODEL_MAP[table]
        obj = model(**{k: self._normalize(v) for k, v in data.items()})
        try:
            self.db.add(obj)
            self.db.flush()
            self.db.commit()
        except Exception as err:
            self.db.rollback()
            raise err
        try:
            self.db.refresh(obj)
        except Exception:
            pass
        return self._row(obj)

    def update_record(self, table: str, record_id: str, payload: dict[str, Any]) -> dict:
        self._ensure_table(table)
        model = MODEL_MAP[table]
        stmt = select(model).where(model.id == record_id)
        if self.current_user_id and "user_id" in TABLE_COLUMNS.get(table, {}):
            stmt = stmt.where(model.user_id == self.current_user_id)
        obj = self.db.scalar(stmt)
        if not obj:
            self.db.expire_all()
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
        try:
            self.db.refresh(obj)
        except Exception:
            pass
        return self._row(obj)

    def delete_record(self, table: str, record_id: str) -> dict:
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
        return record

    def document_categories(self) -> list[dict]:
        uid = self.current_user_id
        params = {"uid": uid} if uid else {}
        
        # Build the query to return ALL categories for the user, regardless of whether they have files
        if uid:
            where_dc = "WHERE dc.user_id = :uid"
            join_condition = f"ON sf.file_type = dc.slug AND sf.user_id = :uid"
        else:
            where_dc = ""
            join_condition = "ON sf.file_type = dc.slug"
        
        rows = self.db.execute(text(
            f"""
            SELECT dc.*, COUNT(sf.id) AS document_count, MAX(sf.created_at) AS latest_document_at
            FROM document_categories dc
            LEFT JOIN static_files sf {join_condition}
            {where_dc}
            GROUP BY dc.id
            ORDER BY dc.sort_order ASC, dc.display_name ASC
            """), params
        ).mappings().all()
        return [self._row(row) for row in rows]

    def create_document_category(self, name: str) -> dict:
        uid = self.current_user_id
        model = models.DocumentCategories
        
        stmt = select(func.count()).select_from(model)
        if uid:
            stmt = stmt.where(model.user_id == uid)
        category_count = self.db.scalar(stmt)
        
        if category_count >= MAX_DOCUMENT_CATEGORIES:
            raise ValueError(f"Document categories are limited to {MAX_DOCUMENT_CATEGORIES}")
            
        display_name = category_display_name(name)
        slug = normalize_media_category(display_name)
        
        order_stmt = select(func.coalesce(func.max(model.sort_order), 0))
        if uid:
            order_stmt = order_stmt.where(model.user_id == uid)
        max_order = self.db.scalar(order_stmt)
        
        obj = model(slug=slug, display_name=display_name, sort_order=max_order + 1)
        if uid:
            obj.user_id = uid
            
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return self._row(obj)

    def ensure_document_category(self, slug: str, display_name: str | None = None) -> dict:
        normalized_slug = normalize_media_category(slug)
        model = models.DocumentCategories
        stmt = select(model).where(model.slug == normalized_slug)
        if self.current_user_id:
            stmt = stmt.where(model.user_id == self.current_user_id)
        
        obj = self.db.scalar(stmt)
        if obj:
            return self._row(obj)
            
        display = category_display_name(display_name or normalized_slug.replace("-", " ")).title()
        obj = model(slug=normalized_slug, display_name=display, sort_order=100)
        if self.current_user_id:
            obj.user_id = self.current_user_id
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return self._row(obj)

    def rename_document_category(self, category_id: str, name: str) -> dict:
        category = self.get_record("document_categories", category_id)
        display_name = category_display_name(name)
        next_slug = normalize_media_category(display_name)
        uid = self.current_user_id
        
        if next_slug != category["slug"]:
            sf_model = models.StaticFiles
            sf_stmt = select(sf_model).where(sf_model.file_type == category["slug"])
            if uid:
                sf_stmt = sf_stmt.where(sf_model.user_id == uid)
            for sf in self.db.scalars(sf_stmt).all():
                sf.file_type = next_slug
                sf.updated_at = func.current_timestamp()
                
        model = models.DocumentCategories
        stmt = select(model).where(model.id == category_id)
        if uid:
            stmt = stmt.where(model.user_id == uid)
        obj = self.db.scalar(stmt)
        if obj:
            obj.slug = next_slug
            obj.display_name = display_name
            obj.updated_at = func.current_timestamp()
            
        self.db.commit()
        return self.get_record("document_categories", category_id)

    def delete_document_category(self, category_id: str, workspace_path: Path, media_path: Path) -> dict:
        """Delete a category, its files (from Supabase Storage), and DB rows.

        SCHOLARDOCX-0139: files now live in Supabase Storage, not on disk. The
        workspace_path/media_path params are retained for signature compat but
        no longer used for physical file deletion — that goes through the
        Storage REST API (app.core.storage).
        """
        from app.core.storage import delete_file

        category = self.get_record("document_categories", category_id)
        uid = self.current_user_id

        sf_model = models.StaticFiles
        sf_stmt = select(sf_model).where(sf_model.file_type == category["slug"])
        if uid:
            sf_stmt = sf_stmt.where(sf_model.user_id == uid)

        files = self.db.scalars(sf_stmt).all()
        file_records = [self._row(f) for f in files]

        # Delete each file from Storage (best-effort; DB row is the source of truth).
        for file_record in file_records:
            try:
                delete_file(file_record["relative_path"])
            except Exception:
                pass

        for f in files:
            self.db.delete(f)

        cat_model = models.DocumentCategories
        cat_stmt = select(cat_model).where(cat_model.id == category_id)
        if uid:
            cat_stmt = cat_stmt.where(cat_model.user_id == uid)
        cat_obj = self.db.scalar(cat_stmt)
        if cat_obj:
            self.db.delete(cat_obj)

        self.db.commit()
        return {**category, "deleted_document_count": len(files)}

    def restore_default_categories(self) -> int:
        """Restore missing default document categories for the current user."""
        from app.core.categories import DEFAULT_MEDIA_CATEGORIES
        
        uid = self.current_user_id
        if not uid:
            raise ValueError("User authentication required")
        
        # Get existing category slugs for this user
        model = models.DocumentCategories
        stmt = select(model.slug).where(model.user_id == uid)
        existing_slugs = set(self.db.scalars(stmt).all())
        
        # Insert missing default categories
        restored_count = 0
        for index, (slug, display_name) in enumerate(DEFAULT_MEDIA_CATEGORIES):
            if slug not in existing_slugs:
                category = model(
                    slug=slug,
                    display_name=display_name,
                    sort_order=index,
                    user_id=uid
                )
                self.db.add(category)
                restored_count += 1
        
        if restored_count > 0:
            self.db.commit()
        
        return restored_count

    def dashboard_summary(self) -> dict:
        uid = self.current_user_id
        params = {"uid": uid} if uid else {}
        where_clause = "WHERE user_id = :uid" if uid else ""
        and_clause = "AND user_id = :uid" if uid else ""
        
        statuses = [
            dict(row)
            for row in self.db.execute(text(
                f"SELECT status, COUNT(*) as count FROM applications {where_clause} GROUP BY status ORDER BY status"
            ), params).mappings().all()
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
            for row in self.db.execute(text(
                f"""
                SELECT d.*, u.name as university_name, p.name as program_name
                FROM deadlines d
                LEFT JOIN applications a ON a.id = d.application_id
                LEFT JOIN universities u ON u.id = a.university_id
                LEFT JOIN programs p ON p.id = a.program_id
                WHERE d.completed_at IS NULL {and_clause.replace('user_id', 'd.user_id')}
                ORDER BY d.due_at ASC
                LIMIT 8
                """), params
            ).mappings().all()
        ]
        reminders = [
            dict(row)
            for row in self.db.execute(text(
                f"""
                SELECT *
                FROM reminders
                WHERE completed_at IS NULL {and_clause}
                ORDER BY due_at ASC
                LIMIT 8
                """), params
            ).mappings().all()
        ]
        notifications = [
            dict(row)
            for row in self.db.execute(text(
                f"""
                SELECT n.*, p.name as project_name
                FROM notifications n
                LEFT JOIN projects p ON p.id = n.project_id
                WHERE n.read_at IS NULL {and_clause.replace('user_id', 'n.user_id')}
                ORDER BY COALESCE(n.due_at, n.created_at) ASC
                LIMIT 8
                """), params
            ).mappings().all()
        ]
        applications = [
            dict(row)
            for row in self.db.execute(text(
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
                """), params
            ).mappings().all()
        ]
        projects = [
            dict(row)
            for row in self.db.execute(text(
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
                """), params
            ).mappings().all()
        ]
        pinned_projects = [
            dict(row)
            for row in self.db.execute(text(
                f"""
                SELECT p.*,
                       COUNT(DISTINCT ps.id) as sheet_count
                FROM projects p
                LEFT JOIN project_sheets ps ON ps.project_id = p.id
                WHERE p.pinned_to_dashboard = 1 {and_clause.replace('user_id', 'p.user_id')}
                GROUP BY p.id
                ORDER BY p.updated_at DESC
                LIMIT 8
                """), params
            ).mappings().all()
        ]
        pinned_sheets = [
            dict(row)
            for row in self.db.execute(text(
                f"""
                SELECT ps.*, p.name as project_name, p.degree_type
                FROM project_sheets ps
                LEFT JOIN projects p ON p.id = ps.project_id
                WHERE ps.pinned_to_dashboard = 1 {and_clause.replace('user_id', 'ps.user_id')}
                ORDER BY ps.updated_at DESC
                LIMIT 8
                """), params
            ).mappings().all()
        ]
        pinned_docs = [
            dict(row)
            for row in self.db.execute(text(
                f"""
                SELECT *
                FROM static_files
                WHERE pinned_to_dashboard = 1 {and_clause}
                ORDER BY updated_at DESC
                LIMIT 8
                """), params
            ).mappings().all()
        ]
        project_pages = [
            self._decode_page(row)
            for row in self.db.execute(text(
                f"""
                SELECT pp.*, p.name as project_name
                FROM project_pages pp
                LEFT JOIN projects p ON p.id = pp.project_id
                {where_clause.replace('user_id', 'pp.user_id')}
                ORDER BY pp.updated_at DESC
                """), params
            ).mappings().all()
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

    def project_summary(self, project_id: str) -> dict:
        project = self.get_record("projects", project_id)  # already enforces user_id ownership
        uid = self.current_user_id
        if uid:
            sheets = [
                dict(row)
                for row in self.db.execute(text(
                    "SELECT * FROM project_sheets WHERE project_id = :pid AND user_id = :uid ORDER BY is_pinned DESC, created_at DESC"
                ), {"pid": project_id, "uid": uid}).mappings().all()
            ]
            pages = [
                self._decode_page(row)
                for row in self.db.execute(text(
                    "SELECT * FROM project_pages WHERE project_id = :pid AND user_id = :uid ORDER BY sheet_id DESC, updated_at DESC"
                ), {"pid": project_id, "uid": uid}).mappings().all()
            ]
            notifications = [
                dict(row)
                for row in self.db.execute(text(
                    "SELECT * FROM notifications WHERE project_id = :pid AND user_id = :uid AND read_at IS NULL ORDER BY COALESCE(due_at, created_at) ASC"
                ), {"pid": project_id, "uid": uid}).mappings().all()
            ]
        else:
            sheets = [
                dict(row)
                for row in self.db.execute(text(
                    "SELECT * FROM project_sheets WHERE project_id = :pid ORDER BY is_pinned DESC, created_at DESC"
                ), {"pid": project_id}).mappings().all()
            ]
            pages = [
                self._decode_page(row)
                for row in self.db.execute(text(
                    "SELECT * FROM project_pages WHERE project_id = :pid ORDER BY sheet_id DESC, updated_at DESC"
                ), {"pid": project_id}).mappings().all()
            ]
            notifications = [
                dict(row)
                for row in self.db.execute(text(
                    "SELECT * FROM notifications WHERE project_id = :pid AND read_at IS NULL ORDER BY COALESCE(due_at, created_at) ASC"
                ), {"pid": project_id}).mappings().all()
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

    def project_meta(self, project_id: str, include_calendar: bool = True) -> dict:
        """Lightweight project metadata for project/dashboard/sheet-list views.

        Ships ONLY stubs (id, sheet_id, name, updated_at, row_count) — never the
        full `rows`/`columns`. Per-stub `row_count` and the total `row_count` are
        computed server-side. `calendar_items` is computed server-side too and is
        optional so the post-save refresh (which does not redraw the dashboard
        calendar) can skip the scan.

        The open sheet's full rows/columns are fetched separately via
        `get_project_page` / `GET /project_pages/{page_id}`.
        """
        project = self.get_record("projects", project_id)
        uid = self.current_user_id
        params = {"pid": project_id, "uid": uid} if uid else {"pid": project_id}
        uid_clause = "AND user_id = :uid" if uid else ""

        sheets = [
            dict(row)
            for row in self.db.execute(text(
                f"SELECT * FROM project_sheets WHERE project_id = :pid {uid_clause} ORDER BY is_pinned DESC, created_at DESC"
            ), params).mappings().all()
        ]
        # Pull columns_json/rows_json ONLY to derive counts + calendar locally;
        # the decoded rows are never put on the returned stubs.
        raw_pages = self.db.execute(text(
            f"SELECT id, sheet_id, name, project_id, updated_at, columns_json, rows_json "
            f"FROM project_pages WHERE project_id = :pid {uid_clause} "
            f"ORDER BY sheet_id DESC, updated_at DESC"
        ), params).mappings().all()

        page_stubs: list[dict] = []
        decoded_pages: list[dict] = []
        total_row_count = 0
        for row in raw_pages:
            decoded = self._decode_page(row)
            row_count = len(decoded["rows"])
            total_row_count += row_count
            # Preserve project_name on calendar items (matches project_summary).
            decoded["project_name"] = project.get("name")
            decoded_pages.append(decoded)
            page_stubs.append({
                "id": decoded["id"],
                "sheet_id": decoded["sheet_id"],
                "name": decoded["name"],
                "project_id": decoded.get("project_id"),
                "updated_at": decoded.get("updated_at"),
                "row_count": row_count,
            })

        notifications = [
            dict(row)
            for row in self.db.execute(text(
                f"SELECT * FROM notifications WHERE project_id = :pid {uid_clause} AND read_at IS NULL ORDER BY COALESCE(due_at, created_at) ASC"
            ), params).mappings().all()
        ]

        result = {
            "project": project,
            "sheet_count": len(sheets),
            "page_count": len(page_stubs),
            "row_count": total_row_count,
            "notification_count": len(notifications),
            "sheets": sheets,
            "page_stubs": page_stubs,
            "notifications": notifications,
        }
        if include_calendar:
            result["calendar_items"] = self._calendar_items(decoded_pages)
        return result

    def get_project_page(self, page_id: str) -> dict:
        """Return one fully decoded project page (columns, rows, email_config).

        Used by the frontend to load the one open sheet's full data without
        transferring every other sheet's rows. User-scoped like get_record.
        """
        uid = self.current_user_id
        params = {"pid": page_id, "uid": uid} if uid else {"pid": page_id}
        uid_clause = "AND user_id = :uid" if uid else ""
        row = self.db.execute(text(
            f"SELECT * FROM project_pages WHERE id = :pid {uid_clause}"
        ), params).mappings().first()
        if row is None:
            raise LookupError(f"project_pages record not found: {page_id}")
        return self._decode_page(row)

    def project_sheet_counts(self) -> dict[str, int]:
        """Sheet counts for every project owned by the current user, in one query.

        Replaces the frontend's per-project `/summary` loop on the Projects list.
        Returns ``{ "<project_id>": <int> }`` with an entry for EVERY project
        the user owns — including projects with zero sheets (count 0). A plain
        ``GROUP BY project_id`` on ``project_sheets`` would silently omit
        empty projects, leaving their card's "X / Y sheets" counter stuck on
        "loading..." in the UI (SCHOLARDOCX-0150).
        """
        uid = self.current_user_id
        if uid:
            rows = self.db.execute(text(
                # LEFT JOIN from the user's projects so empty projects still
                # emit a row with COUNT(sheets.id) = 0.
                "SELECT p.id AS project_id, COUNT(s.id) AS n "
                "FROM projects p "
                "LEFT JOIN project_sheets s ON s.project_id = p.id AND s.user_id = :uid "
                "WHERE p.user_id = :uid "
                "GROUP BY p.id"
            ), {"uid": uid}).mappings().all()
        else:
            rows = self.db.execute(text(
                "SELECT p.id AS project_id, COUNT(s.id) AS n "
                "FROM projects p "
                "LEFT JOIN project_sheets s ON s.project_id = p.id "
                "GROUP BY p.id"
            )).mappings().all()
        return {str(row["project_id"]): int(row["n"]) for row in rows}

    def create_sheet_with_defaults(self, project_id: str, name: str) -> dict:
        try:
            project = self.get_record("projects", project_id)
            degree_type = (project.get("degree_type") or "phd").lower()
        except LookupError:
            degree_type = "phd"

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

        from uuid import uuid4
        sheet_obj = models.ProjectSheets(
            id=str(uuid4()),
            project_id=project_id,
            name=name,
            user_id=self.current_user_id,
        )
        page_obj = models.ProjectPages(
            id=str(uuid4()),
            project_id=project_id,
            sheet_id=sheet_obj.id,
            name=name,
            columns_json=json.dumps(columns, ensure_ascii=True),
            rows_json=json.dumps([], ensure_ascii=True),
            user_id=self.current_user_id,
        )
        try:
            self.db.add(sheet_obj)
            self.db.add(page_obj)
            self.db.flush()
            self.db.commit()
        except Exception as err:
            self.db.rollback()
            raise err
        return {"sheet": self._row(sheet_obj), "page": self._decode_page(self._row(page_obj))}

    def render_template(self, template_id: str, variables: dict[str, Any]) -> dict:
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
            return int(self.db.execute(text(
                f"SELECT COUNT(*) FROM {table} WHERE user_id = :uid"
            ), {"uid": uid}).scalar())
        return int(self.db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar())

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

    def _row(self, obj: Any) -> dict:
        if isinstance(obj, dict):
            return obj
        if hasattr(obj, "_mapping"):
            return dict(obj._mapping)
        if hasattr(obj, "keys"):
            return dict(obj)
        res = {}
        for c in obj.__table__.columns:
            try:
                res[c.name] = getattr(obj, c.name)
            except Exception:
                res[c.name] = obj.__dict__.get(c.name)
        return res

    def _decode_page(self, row: Any) -> dict:
        data = dict(row)
        columns = safe_json_loads(data.get("columns_json"), default=[])
        # Auto-migrate old string[] columns to {name, type}[] format
        if columns and isinstance(columns[0], str):
            columns = [{"name": col, "type": "text"} for col in columns]
        data["columns"] = columns
        data["rows"] = safe_json_loads(data.get("rows_json"), default=[])
        data["email_config"] = safe_json_loads(data.get("email_config_json"), default=None)
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
        dt = safe_parse_datetime(value)
        return dt.date() if dt else None
    except ValueError:
        try:
            return safe_parse_date(value)
        except ValueError:
            return None


def _date_key(value: Any) -> str | None:
    parsed = _parse_date(value)
    return parsed.isoformat() if parsed else None
