import ast

# We will just replace the methods via string manipulation since it's safer.
# Instead of `astunparse`, which messes up formatting, I'll use regex to replace the function bodies.
import re

with open("backend/app/services/store.py", "r") as f:
    content = f.read()

# dashboard_summary replacement
dashboard_summary_code = """    def dashboard_summary(self) -> dict:
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
                f\"\"\"
                SELECT d.*, u.name as university_name, p.name as program_name
                FROM deadlines d
                LEFT JOIN applications a ON a.id = d.application_id
                LEFT JOIN universities u ON u.id = a.university_id
                LEFT JOIN programs p ON p.id = a.program_id
                WHERE d.completed_at IS NULL {and_clause.replace('user_id', 'd.user_id')}
                ORDER BY d.due_at ASC
                LIMIT 8
                \"\"\", params
            ).fetchall()
        ]
        reminders = [
            dict(row)
            for row in self.connection.execute(
                f\"\"\"
                SELECT *
                FROM reminders
                WHERE completed_at IS NULL {and_clause}
                ORDER BY due_at ASC
                LIMIT 8
                \"\"\", params
            ).fetchall()
        ]
        notifications = [
            dict(row)
            for row in self.connection.execute(
                f\"\"\"
                SELECT n.*, p.name as project_name
                FROM notifications n
                LEFT JOIN projects p ON p.id = n.project_id
                WHERE n.read_at IS NULL {and_clause.replace('user_id', 'n.user_id')}
                ORDER BY COALESCE(n.due_at, n.created_at) ASC
                LIMIT 8
                \"\"\", params
            ).fetchall()
        ]
        applications = [
            dict(row)
            for row in self.connection.execute(
                f\"\"\"
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
                \"\"\", params
            ).fetchall()
        ]
        projects = [
            dict(row)
            for row in self.connection.execute(
                f\"\"\"
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
                \"\"\", params
            ).fetchall()
        ]
        pinned_projects = [
            dict(row)
            for row in self.connection.execute(
                f\"\"\"
                SELECT p.*,
                       COUNT(DISTINCT ps.id) as sheet_count
                FROM projects p
                LEFT JOIN project_sheets ps ON ps.project_id = p.id
                WHERE p.pinned_to_dashboard = 1 {and_clause.replace('user_id', 'p.user_id')}
                GROUP BY p.id
                ORDER BY p.updated_at DESC
                LIMIT 8
                \"\"\", params
            ).fetchall()
        ]
        pinned_sheets = [
            dict(row)
            for row in self.connection.execute(
                f\"\"\"
                SELECT ps.*, p.name as project_name, p.degree_type
                FROM project_sheets ps
                LEFT JOIN projects p ON p.id = ps.project_id
                WHERE ps.pinned_to_dashboard = 1 {and_clause.replace('user_id', 'ps.user_id')}
                ORDER BY ps.updated_at DESC
                LIMIT 8
                \"\"\", params
            ).fetchall()
        ]
        pinned_docs = [
            dict(row)
            for row in self.connection.execute(
                f\"\"\"
                SELECT *
                FROM static_files
                WHERE pinned_to_dashboard = 1 {and_clause}
                ORDER BY updated_at DESC
                LIMIT 8
                \"\"\", params
            ).fetchall()
        ]
        project_pages = [
            self._decode_page(row)
            for row in self.connection.execute(
                f\"\"\"
                SELECT pp.*, p.name as project_name
                FROM project_pages pp
                LEFT JOIN projects p ON p.id = pp.project_id
                {where_clause.replace('user_id', 'pp.user_id')}
                ORDER BY pp.updated_at DESC
                \"\"\", params
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
        }"""

# find dashboard_summary and replace
start_idx = content.find("    def dashboard_summary(self) -> dict:")
end_idx = content.find("    def project_summary(self, project_id: int) -> dict:")
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + dashboard_summary_code + "\n\n" + content[end_idx:]

with open("backend/app/services/store.py", "w") as f:
    f.write(content)
print("Updated dashboard_summary")
