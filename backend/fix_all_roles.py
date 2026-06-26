import sqlite3

def inject(path):
    try:
        conn = sqlite3.connect(path)
        # Re-inject the ones that might have been deleted
        roles = [
            ('general_admin', 'admin_manage_role_limits', 1),
            ('general_admin', 'admin_manage_notification_texts', 1),
            ('general_admin', 'admin_manage_settings', 0),
            ('general_admin', 'admin_manage_plan_requests', 1),
            ('general_admin', 'admin_manage_invite_requests', 1),
            
            ('super_admin', 'admin_manage_role_limits', 1),
            ('super_admin', 'admin_manage_notification_texts', 1),
            ('super_admin', 'admin_manage_settings', 1),
            ('super_admin', 'admin_manage_plan_requests', 1),
            ('super_admin', 'admin_manage_invite_requests', 1),
        ]
        for role, feature, count in roles:
            conn.execute("INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period) VALUES (?, ?, ?, 'never')", (role, feature, count))
        conn.commit()
        conn.close()
        print("Fixed DB:", path)
    except Exception as e:
        pass

for p in ['/Users/fahadpathan/Documents/ScholarDocX/backend/workspace/db/app.db', '/Users/fahadpathan/Documents/ScholarDocX/workspace/db/app.db']:
    inject(p)
