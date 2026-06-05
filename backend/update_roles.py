import sqlite3

for path in ['/Users/fahadpathan/Documents/ScholarDock/backend/workspace/db/app.db', '/Users/fahadpathan/Documents/ScholarDock/workspace/db/app.db']:
    try:
        conn = sqlite3.connect(path)
        conn.execute("INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period) VALUES ('general_admin', 'admin_manage_role_limits', 1, 'never')")
        conn.execute("INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period) VALUES ('general_admin', 'admin_manage_notification_texts', 1, 'never')")
        conn.execute("INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period) VALUES ('super_admin', 'admin_manage_role_limits', 1, 'never')")
        conn.execute("INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period) VALUES ('super_admin', 'admin_manage_notification_texts', 1, 'never')")
        conn.commit()
        conn.close()
        print("Updated DB:", path)
    except Exception as e:
        print("Skipped:", path, str(e))
