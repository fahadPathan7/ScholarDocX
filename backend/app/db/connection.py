import secrets
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.categories import DEFAULT_MEDIA_CATEGORIES, category_display_name
from app.core.notifications import default_notification_settings_json
from app.db.schema import SEED_SQL
from app.db.models import Base


USER_SCOPED_TABLES = (
    "local_profiles",
    "projects",
    "project_sheets",
    "project_pages",
    "notifications",
    "universities",
    "programs",
    "professors",
    "applications",
    "deadlines",
    "documents",
    "document_versions",
    "static_files",
    "document_categories",
    "whiteboards",
    "sticky_notes",
    "email_templates",
    "email_drafts",
    "outreach_logs",
    "reminders",
    "ai_conversations",
    "research_notes",
    "bookmarked_news",
    "advisor_atlas_runs",
    "advisor_atlas_candidates",
    "saved_scholarship_queries",
)


from sqlalchemy import create_engine, event

def get_engine(database_path: Path):
    database_url = f"sqlite:///{database_path.absolute()}"
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False, "timeout": 15}
    )
    
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
        
    return engine


def get_db(database_path: Path):
    engine = get_engine(database_path)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def connect(database_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database_path, check_same_thread=False, timeout=15)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(database_path: Path) -> None:
    print("INITIALIZE DB CALLED WITH PATH:", database_path)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 1. Create all tables via SQLAlchemy ORM
    engine = get_engine(database_path)
    Base.metadata.create_all(bind=engine)

    # 2. Run legacy migrations and data seeding
    with connect(database_path) as connection:
        _prepare_legacy_user_scoping(connection)
        migrate_database(connection)
        try:
            connection.executescript(SEED_SQL)
        except Exception as e:
            print("Seed execution warning:", e)
        _ensure_jwt_secret(connection)
        _seed_ai_token_defaults(connection)
        connection.commit()


# A previously-shipped, committed placeholder secret. Any install still using it
# (or a value derived from it) must be treated as publicly known and rotated.
COMPROMISED_JWT_SECRET_PREFIX = "scholar-docx-local-first"


def _ensure_jwt_secret(connection: sqlite3.Connection) -> None:
    """Guarantee a strong, unique JWT signing secret for this install.

    Generates a random secret on first init and stores it in app_settings. If a
    previous install was seeded with the committed placeholder constant, the
    secret is rotated so any token signed with the public value (including
    forged super_admin tokens) stops validating.
    """
    row = connection.execute(
        "SELECT value FROM app_settings WHERE key = 'jwt_secret_key'"
    ).fetchone()
    current = row["value"] if row else None
    if (
        not current
        or str(current).strip() == ""
        or str(current).startswith(COMPROMISED_JWT_SECRET_PREFIX)
    ):
        connection.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('jwt_secret_key', ?)",
            (secrets.token_hex(32),),
        )


def _seed_ai_token_defaults(connection: sqlite3.Connection) -> None:
    """Seed default AI models and token packs (idempotent).

    Models are seeded from the provider model lists in app.services.ai with $0
    pricing until a super_admin sets real values. INSERT OR IGNORE ensures
    admin edits are never clobbered. Runs during initialize_database alongside
    the other seeds.
    """
    from app.services.ai import (
        DEFAULT_GLM_MODELS,
        DEFAULT_GEMINI_MODELS,
        DEFAULT_GROQ_MODELS,
        DEFAULT_MISTRAL_MODELS,
    )

    # Set default prices for initial seed.
    prices = {
        "gemini-2.5-flash": (0.075, 0.30),
        "gemini-2.5-flash-lite": (0.0375, 0.15),
        "GLM-5.2": (2.00, 4.00),
        "GLM-5.1": (1.00, 2.00),
        "GLM-5": (1.00, 2.00),
        "GLM-5-Turbo": (0.50, 1.00),
        "GLM-4.7": (0.20, 0.40),
        "openai/gpt-oss-120b": (0.80, 0.80),
        "groq/compound": (0.50, 0.50),
        "llama-3.3-70b-versatile": (0.59, 0.79),
        "qwen/qwen3-32b": (0.70, 0.80),
        "meta-llama/llama-4-scout-17b-16e-instruct": (0.20, 0.20),
        "openai/gpt-oss-20b": (0.20, 0.20),
        "mistral-large-latest": (2.00, 6.00),
        "mistral-medium-3-5": (0.50, 1.50),
        "devstral-2512": (0.20, 0.60),
        "openrouter": (0.08, 0.20),
    }

    order = 0
    for provider, model_ids in (
        ("glm", DEFAULT_GLM_MODELS),
        ("gemini", DEFAULT_GEMINI_MODELS),
        ("groq", DEFAULT_GROQ_MODELS),
        ("mistral", DEFAULT_MISTRAL_MODELS),
        ("openrouter", ["openrouter"]),
    ):
        for model_id in model_ids:
            in_price, out_price = prices.get(model_id, (0.0, 0.0))
            connection.execute(
                "INSERT OR IGNORE INTO ai_models "
                "(provider, model_id, display_name, input_price_per_1m, "
                "output_price_per_1m, is_active, sort_order) "
                "VALUES (?, ?, ?, ?, ?, 1, ?)",
                (provider, model_id, model_id, in_price, out_price, order),
            )
            order += 1

    packs = (
        ("small", "Small", 100000, 10, 1),
        ("medium", "Medium", 500000, 40, 2),
        ("large", "Large", 1500000, 100, 3),
        ("extra_large", "Extra Large", 5000000, 300, 4),
    )
    for code, display_name, token_amount, price_usd, sort_order in packs:
        connection.execute(
            "INSERT OR IGNORE INTO ai_token_packs "
            "(code, display_name, token_amount, price_usd, is_active, sort_order) "
            "VALUES (?, ?, ?, ?, 1, ?)",
            (code, display_name, token_amount, price_usd, sort_order),
        )


def _prepare_legacy_user_scoping(connection: sqlite3.Connection) -> None:
    existing_tables = {
        row["name"]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    for table in USER_SCOPED_TABLES:
        if table not in existing_tables:
            continue
        columns = {
            row["name"]
            for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if "user_id" not in columns:
            connection.execute(
                f"ALTER TABLE {table} ADD COLUMN user_id "
                "INTEGER REFERENCES users(id) ON DELETE CASCADE"
            )


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
    if "plan_started_at" not in user_columns:
        connection.execute("ALTER TABLE users ADD COLUMN plan_started_at TEXT")
    if "plan_ends_at" not in user_columns:
        connection.execute("ALTER TABLE users ADD COLUMN plan_ends_at TEXT")
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

    ai_token_balance_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(ai_token_balances)").fetchall()
    }
    if ai_token_balance_columns and "purchased_total" not in ai_token_balance_columns:
        connection.execute("ALTER TABLE ai_token_balances ADD COLUMN purchased_total INTEGER NOT NULL DEFAULT 0")

    # SCHOLARDOCX-0086: authoritative monthly-used counter. Previously "used this
    # month" was derived in the UI as (allowance - remaining), which collapsed to 0
    # whenever the live bucket was granted at a higher tier than the current plan
    # (e.g. after a mid-period downgrade). Track it explicitly instead. On first add,
    # backfill it once from the ledger for each row's current period so existing
    # activity is reflected immediately.
    if ai_token_balance_columns and "subscription_used_this_period" not in ai_token_balance_columns:
        connection.execute(
            "ALTER TABLE ai_token_balances "
            "ADD COLUMN subscription_used_this_period INTEGER NOT NULL DEFAULT 0"
        )
        connection.execute(
            """
            UPDATE ai_token_balances
            SET subscription_used_this_period = COALESCE(
              (SELECT SUM(-tokens_delta)
               FROM ai_token_ledger
               WHERE user_id = ai_token_balances.user_id
                 AND balance_bucket IN ('subscription', 'mixed')
                 AND substr(created_at, 1, 7) = ai_token_balances.subscription_period),
              0
            )
            """
        )

    # SCHOLARDOCX-0085: purchased_total is the lifetime total of purchased AI
    # credits ever granted. grant_purchased maintains it now, but grants made
    # before that fix left it at 0, so the UsageModal purchased breakdown showed
    # "0 / 0" despite an active purchase. Recompute it authoritatively from the
    # ledger (sum of positive purchased-bucket grants) for any out-of-sync row.
    if ai_token_balance_columns and "purchased_total" in ai_token_balance_columns:
        connection.execute(
            """
            UPDATE ai_token_balances
            SET purchased_total = COALESCE(
              (SELECT SUM(tokens_delta)
               FROM ai_token_ledger
               WHERE user_id = ai_token_balances.user_id
                 AND balance_bucket = 'purchased'
                 AND tokens_delta > 0), 0
            )
            WHERE purchased_total <> COALESCE(
              (SELECT SUM(tokens_delta)
               FROM ai_token_ledger
               WHERE user_id = ai_token_balances.user_id
                 AND balance_bucket = 'purchased'
                 AND tokens_delta > 0), 0
            )
            """
        )

    profile_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(local_profiles)").fetchall()
    }
    if profile_columns:
        if "avatar" not in profile_columns:
            connection.execute("ALTER TABLE local_profiles ADD COLUMN avatar TEXT")
        if "notification_settings" not in profile_columns:
            default_json = default_notification_settings_json().replace("'", "''")
            connection.execute(f"ALTER TABLE local_profiles ADD COLUMN notification_settings TEXT DEFAULT '{default_json}'")

    notification_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(notifications)").fetchall()
    }
    if notification_columns and "preference_key" not in notification_columns:
        connection.execute("ALTER TABLE notifications ADD COLUMN preference_key TEXT NOT NULL DEFAULT 'system'")

    plan_request_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(plan_upgrade_requests)").fetchall()
    }
    if plan_request_columns and "request_type" not in plan_request_columns:
        connection.execute("ALTER TABLE plan_upgrade_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'upgrade'")

    advisor_candidate_columns = {
        row["name"]
        for row in connection.execute(
            "PRAGMA table_info(advisor_atlas_candidates)"
        ).fetchall()
    }
    if advisor_candidate_columns and "intelligence_json" not in advisor_candidate_columns:
        connection.execute(
            "ALTER TABLE advisor_atlas_candidates "
            "ADD COLUMN intelligence_json TEXT NOT NULL DEFAULT '{}'"
        )

    # Set user_id in related tables where missing
    for table in USER_SCOPED_TABLES:
        columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}
        if "user_id" not in columns:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE")

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

    # Ensure token-pack purchase permission role limits exist for existing databases.
    # Default: pro/max can purchase extra token packs; free/general cannot.
    # Admin roles are intentionally not seeded — the enforcement resolver
    # (get_primary_user_role) ignores them for non-admin_ features.
    purchase_pack_permission_defaults = [
        ("free_user", "can_purchase_token_packs", 0, "never"),
        ("general_user", "can_purchase_token_packs", 0, "never"),
        ("pro_user", "can_purchase_token_packs", 1, "never"),
        ("max_user", "can_purchase_token_packs", 1, "never"),
        ("free_user", "can_use_purchased_tokens", 0, "never"),
        ("general_user", "can_use_purchased_tokens", 0, "never"),
        ("pro_user", "can_use_purchased_tokens", 1, "never"),
        ("max_user", "can_use_purchased_tokens", 1, "never"),
    ]
    connection.executemany(
        """
        INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period)
        VALUES (?, ?, ?, ?)
        """,
        purchase_pack_permission_defaults,
    )

    # Ensure Advisor Atlas permission role limits exist for existing databases.
    # Default: pro/max can use Advisor Atlas; free/general cannot. Admin roles
    # are intentionally not seeded — the enforcement resolver
    # (get_primary_user_role) ignores them for non-admin_ features.
    advisor_atlas_permission_defaults = [
        ("free_user", "can_use_advisor_atlas", 0, "never"),
        ("general_user", "can_use_advisor_atlas", 0, "never"),
        ("pro_user", "can_use_advisor_atlas", 1, "never"),
        ("max_user", "can_use_advisor_atlas", 1, "never"),
    ]
    connection.executemany(
        """
        INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period)
        VALUES (?, ?, ?, ?)
        """,
        advisor_atlas_permission_defaults,
    )

    # Ensure Scholarship Hunt permission role limits exist for existing databases.
    scholarship_hunt_permission_defaults = [
        ("free_user", "can_use_scholarship_hunt", 0, "never"),
        ("general_user", "can_use_scholarship_hunt", 0, "never"),
        ("pro_user", "can_use_scholarship_hunt", 1, "never"),
        ("max_user", "can_use_scholarship_hunt", 1, "never"),
    ]
    connection.executemany(
        """
        INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period)
        VALUES (?, ?, ?, ?)
        """,
        scholarship_hunt_permission_defaults,
    )

    # Ensure admin permission role limits exist for existing databases.
    admin_permission_defaults = [
        ("general_admin", "admin_manage_suspension_appeals", 1, "never"),
        ("general_admin", "admin_manage_plan_requests", 1, "never"),
        ("general_admin", "admin_manage_token_requests", 1, "never"),
        ("super_admin", "admin_manage_suspension_appeals", 1, "never"),
        ("super_admin", "admin_manage_plan_requests", 1, "never"),
        ("super_admin", "admin_manage_token_requests", 1, "never"),
    ]
    connection.executemany(
        """
        INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period)
        VALUES (?, ?, ?, ?)
        """,
        admin_permission_defaults,
    )

    # Ensure free_user role limits exist for existing databases.
    free_user_defaults = [
        ('free_user', 'ai_messages_per_session', 0, 'per_session'),
        ('free_user', 'can_use_gemini', 1, 'never'),
        ('free_user', 'can_use_glm', 0, 'never'),
        ('free_user', 'can_use_groq', 0, 'never'),
        ('free_user', 'can_use_mistral', 0, 'never'),
        ('free_user', 'can_use_agents', 0, 'never'),
        ('free_user', 'can_use_web_search', 0, 'never'),
        ('free_user', 'can_use_scholarship_hunt', 0, 'never'),
        ('free_user', 'total_projects', 1, 'never'),
        ('free_user', 'total_sheets', 2, 'never'),
        ('free_user', 'total_records', 100, 'never'),
        ('free_user', 'sheets_per_project', 2, 'never'),
        ('free_user', 'records_per_sheet', 50, 'never'),
        ('free_user', 'total_documents_bytes', 5242880, 'never'),
        ('free_user', 'total_sticky_notes', 3, 'never'),
        ('free_user', 'total_whiteboards', 1, 'never'),
        ('free_user', 'ai_tokens_per_month', 0, 'monthly'),
    ]
    connection.executemany(
        """
        INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period)
        VALUES (?, ?, ?, ?)
        """,
        free_user_defaults,
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
        for tbl in USER_SCOPED_TABLES:
            connection.execute(
                f"UPDATE {tbl} SET user_id = ? WHERE user_id IS NULL",
                (fallback_uid,),
            )

    # Remove stale role_limits features that are not in the canonical set.
    # This cleans up leftovers from removed providers (e.g. can_use_haiku,
    # can_use_sonnet, can_use_opus) that no longer exist in the seed.
    canonical_features = {
        # User-tier quotas
        "ai_messages_per_session",
        "ai_tokens_per_month",
        "can_use_gemini", "can_use_glm", "can_use_groq", "can_use_mistral",
        "can_use_agents", "can_use_web_search",
        "can_use_advisor_atlas",
        "can_use_scholarship_hunt",
        "can_purchase_token_packs",
        "can_use_purchased_tokens",
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
        "admin_send_notifications",
        "admin_manage_settings", "admin_manage_suspension_appeals",
        "admin_manage_token_requests",
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
