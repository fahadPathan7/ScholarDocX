import sqlite3
from pathlib import Path

from app.core.categories import DEFAULT_MEDIA_CATEGORIES, category_display_name
from app.db.schema import SCHEMA, SEED_SQL


def connect(database_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(database_path: Path) -> None:
    print("INITIALIZE DB CALLED WITH PATH:", database_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(database_path) as connection:
        connection.executescript(SCHEMA)
        migrate_database(connection)
        connection.executescript(SEED_SQL)
        connection.commit()


def migrate_database(connection: sqlite3.Connection) -> None:
    user_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(users)").fetchall()
    }
    if "is_blocked" not in user_columns:
        connection.execute("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON users(is_blocked)")
    if "registered_with_invite_id" not in user_columns:
        connection.execute("ALTER TABLE users ADD COLUMN registered_with_invite_id INTEGER REFERENCES invite_codes(id) ON DELETE SET NULL")
    page_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(project_pages)").fetchall()
    }
    if "sheet_id" not in page_columns:
        connection.execute("ALTER TABLE project_pages ADD COLUMN sheet_id INTEGER REFERENCES project_sheets(id) ON DELETE CASCADE")

    project_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(projects)").fetchall()
    }
    if "is_pinned" not in project_columns:
        connection.execute("ALTER TABLE projects ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0")
    if "pinned_to_dashboard" not in project_columns:
        connection.execute("ALTER TABLE projects ADD COLUMN pinned_to_dashboard INTEGER NOT NULL DEFAULT 0")

    sheet_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(project_sheets)").fetchall()
    }
    if "is_pinned" not in sheet_columns:
        connection.execute("ALTER TABLE project_sheets ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0")
    if "pinned_to_dashboard" not in sheet_columns:
        connection.execute("ALTER TABLE project_sheets ADD COLUMN pinned_to_dashboard INTEGER NOT NULL DEFAULT 0")

    file_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(static_files)").fetchall()
    }
    if "is_pinned" not in file_columns:
        connection.execute("ALTER TABLE static_files ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0")
    if "pinned_to_dashboard" not in file_columns:
        connection.execute("ALTER TABLE static_files ADD COLUMN pinned_to_dashboard INTEGER NOT NULL DEFAULT 0")

    profile_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(local_profiles)").fetchall()
    }
    if profile_columns:
        if "avatar" not in profile_columns:
            connection.execute("ALTER TABLE local_profiles ADD COLUMN avatar TEXT")
        if "notification_settings" not in profile_columns:
            connection.execute("ALTER TABLE local_profiles ADD COLUMN notification_settings TEXT DEFAULT '{\"create_project\": true, \"create_sheet\": true, \"delete_project\": true, \"delete_sheet\": true, \"delete_record\": true, \"delete_whiteboard\": true, \"pin_project\": false, \"pin_sheet\": false, \"create_whiteboard\": false, \"add_record\": false}'")
            


    # Set user_id in related tables where missing
    for table in ["projects", "sticky_notes", "whiteboards", "ai_conversations"]:
        columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}
        if "user_id" not in columns:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")
        connection.execute(f"UPDATE {table} SET user_id = 1 WHERE user_id IS NULL")

    # Migrate document_categories schema to support per-user UNIQUE(slug) instead of global
    category_schema = connection.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='document_categories'").fetchone()
    if category_schema and "UNIQUE(user_id,slug)" not in category_schema["sql"].replace(" ", ""):
        connection.execute("PRAGMA foreign_keys=off")
        connection.execute("""
            CREATE TABLE document_categories_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                slug TEXT NOT NULL,
                display_name TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, slug)
            )
        """)
        connection.execute("INSERT OR IGNORE INTO document_categories_new SELECT * FROM document_categories")
        connection.execute("DROP TABLE document_categories")
        connection.execute("ALTER TABLE document_categories_new RENAME TO document_categories")
        connection.execute("PRAGMA foreign_keys=on")

    # Seed default document categories for users who have 0 categories (fixes old accounts without overriding user deletions)
    users = connection.execute("SELECT id FROM users").fetchall()
    for user in users:
        uid = user["id"]
        cat_count = connection.execute("SELECT COUNT(*) as count FROM document_categories WHERE user_id = ?", (uid,)).fetchone()["count"]
        if cat_count == 0:
            for index, (slug, label) in enumerate(DEFAULT_MEDIA_CATEGORIES):
                connection.execute(
                    "INSERT OR IGNORE INTO document_categories (slug, display_name, sort_order, user_id) VALUES (?, ?, ?, ?)",
                    (slug, label, index, uid),
                )


    static_categories = [
        row["file_type"]
        for row in connection.execute(
            """
            SELECT DISTINCT file_type
            FROM static_files
            WHERE file_type IS NOT NULL AND TRIM(file_type) != ''
            """
        ).fetchall()
    ]
    for slug in static_categories:
        connection.execute(
            """
            INSERT OR IGNORE INTO document_categories (slug, display_name, sort_order)
            VALUES (?, ?, ?)
            """,
            (slug, category_display_name(slug.replace("-", " ")).title(), 100),
        )

    # Ensure web-search permission role limits exist.
    web_search_permission_defaults = [
        ("general_user", "can_use_web_search", 0, "never"),
        ("pro_user", "can_use_web_search", 1, "never"),
        ("max_user", "can_use_web_search", 1, "never"),
    ]
    connection.executemany(
        """
        INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period)
        VALUES (?, ?, ?, ?)
        """,
        web_search_permission_defaults,
    )

    # Ensure admin permission role limits exist for existing databases.
    admin_permission_defaults = [
        ("general_admin", "admin_manage_suspension_appeals", 1, "never"),
        ("super_admin", "admin_manage_suspension_appeals", 1, "never"),
    ]
    connection.executemany(
        """
        INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period)
        VALUES (?, ?, ?, ?)
        """,
        admin_permission_defaults,
    )

    # Migrate legacy sticky note / whiteboard defaults to current baseline limits.
    # Only updates known old defaults so custom admin edits remain untouched.
    limit_migrations = [
        ("general_user", "total_sticky_notes", 20, 5),
        ("general_user", "total_whiteboards", 0, 1),
        ("pro_user", "total_sticky_notes", 100, 20),
        ("pro_user", "total_whiteboards", 0, 3),
        ("max_user", "total_sticky_notes", 500, 50),
        ("general_user", "total_documents_bytes", 52428800, 31457280),
        ("pro_user", "total_documents_bytes", 524288000, 104857600),
        ("max_user", "total_documents_bytes", 5368709120, 314572800),
    ]
    for role, feature, old_value, new_value in limit_migrations:
        connection.execute(
            """
            UPDATE role_limits
            SET limit_count = ?, updated_at = CURRENT_TIMESTAMP
            WHERE role = ? AND feature = ? AND limit_count = ?
            """,
            (new_value, role, feature, old_value),
        )

    # Backfill user_id = NULL rows in tables that are now user-scoped.
    # Use the super_admin user (lowest id with super_admin role) as fallback owner.
    super_admin = connection.execute(
        "SELECT id FROM users WHERE roles LIKE '%super_admin%' ORDER BY id ASC LIMIT 1"
    ).fetchone()
    if super_admin:
        fallback_uid = super_admin["id"]
        for tbl in ("applications", "static_files", "email_drafts", "outreach_logs", "document_categories"):
            connection.execute(
                f"UPDATE {tbl} SET user_id = ? WHERE user_id IS NULL",
                (fallback_uid,),
            )

    # Remove stale role_limits features that are not in the canonical set.
    # This cleans up leftovers from removed providers (e.g. can_use_haiku,
    # can_use_sonnet, can_use_opus) that no longer exist in the seed.
    canonical_features = {
        # User-tier quotas
        "ai_messages_per_session", "daily_ai_chats", "monthly_ai_chats",
        "can_use_gemini", "can_use_glm", "can_use_groq", "can_use_mistral",
        "can_use_agents", "can_use_web_search",
        "web_searches_per_day", "web_searches_per_month",
        "total_projects", "total_sheets", "total_records",
        "sheets_per_project", "records_per_sheet",
        "total_documents_bytes", "total_sticky_notes", "total_whiteboards",
        # Admin permissions
        "admin_create_user", "admin_assign_user_roles", "admin_assign_admin_roles",
        "admin_manage_user_roles", "admin_manage_admin_roles",
        "admin_suspend_user", "admin_revoke_user",
        "admin_manage_invites", "admin_view_audit_logs",
        "admin_manage_plan_requests", "admin_manage_invite_requests",
        "admin_manage_role_limits", "admin_manage_notification_texts",
        "admin_manage_settings", "admin_manage_suspension_appeals",
    }
    placeholders = ",".join("?" for _ in canonical_features)
    connection.execute(
        f"DELETE FROM role_limits WHERE feature NOT IN ({placeholders})",
        list(canonical_features),
    )

    # Sync user_usage_stats with actual database row counts
    # so that existing data is accurately reflected in the Usage & Limits UI.
    users = connection.execute("SELECT id FROM users").fetchall()
    for user in users:
        uid = user["id"]
        
        counts = {
            "total_projects": connection.execute("SELECT COUNT(*) FROM projects WHERE user_id = ?", (uid,)).fetchone()[0],
            "total_sheets": connection.execute("""
                SELECT COUNT(ps.id) FROM project_sheets ps 
                JOIN projects p ON ps.project_id = p.id 
                WHERE p.user_id = ?
            """, (uid,)).fetchone()[0],
            "total_records": connection.execute("""
                SELECT COUNT(pp.id) FROM project_pages pp
                JOIN projects p ON pp.project_id = p.id
                WHERE p.user_id = ?
            """, (uid,)).fetchone()[0],
            "total_documents_bytes": connection.execute("""
                SELECT COALESCE(SUM(size_bytes), 0) FROM static_files WHERE user_id = ?
            """, (uid,)).fetchone()[0] or 0,
            "total_sticky_notes": connection.execute("SELECT COUNT(*) FROM sticky_notes WHERE user_id = ?", (uid,)).fetchone()[0],
            "total_whiteboards": connection.execute("SELECT COUNT(*) FROM whiteboards WHERE user_id = ?", (uid,)).fetchone()[0],
        }
        
        for feature, count in counts.items():
            connection.execute("""
                INSERT INTO user_usage_stats (user_id, feature, current_count, last_reset_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, feature) 
                DO UPDATE SET current_count = excluded.current_count
            """, (uid, feature, count))
