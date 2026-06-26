import sqlite3
import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "db.sqlite3"  # Adjust if needed, looks like it might be scholar_docx.db

# In app/db/connection.py we have settings.database_path.
# Checking the directory, there's `scholar_docx.db` and `db.sqlite3`.
# The app usually uses the one from settings. Let's try scholar_docx.db first.
DB_FILE = BASE_DIR / "scholardocx.db"

if not DB_FILE.exists():
    DB_FILE = BASE_DIR / "app.db"
    
if not DB_FILE.exists():
    DB_FILE = BASE_DIR / "db.sqlite3"

def migrate():
    print(f"Connecting to database: {DB_FILE}")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    try:
        # 1. Create bookmarked_news table
        print("Creating bookmarked_news table...")
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS bookmarked_news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            article_id TEXT NOT NULL,
            title TEXT NOT NULL,
            link TEXT NOT NULL,
            source_name TEXT,
            pub_date TEXT,
            image_url TEXT,
            description TEXT,
            country TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, article_id)
        );
        """)

        # 2. Add Role Limits for news
        print("Adding role limits for news_searches...")
        limits = [
            ('general_user', 'news_searches_per_day', 3, 'daily'),
            ('general_user', 'news_searches_per_month', 30, 'monthly'),
            ('pro_user', 'news_searches_per_day', 10, 'daily'),
            ('pro_user', 'news_searches_per_month', 100, 'monthly'),
            ('max_user', 'news_searches_per_day', 30, 'daily'),
            ('max_user', 'news_searches_per_month', 300, 'monthly'),
            ('general_admin', 'news_searches_per_day', -1, 'daily'),
            ('general_admin', 'news_searches_per_month', -1, 'monthly'),
            ('super_admin', 'news_searches_per_day', -1, 'daily'),
            ('super_admin', 'news_searches_per_month', -1, 'monthly'),
        ]

        for role, feature, count, period in limits:
            cursor.execute("""
            INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period)
            VALUES (?, ?, ?, ?)
            """, (role, feature, count, period))

        conn.commit()
        print("Migration successful.")
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
