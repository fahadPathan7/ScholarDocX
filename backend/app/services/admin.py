import json
from typing import Any, Optional
import sqlite3
import random
import string
from datetime import datetime, timedelta
from app.auth.limits import invalidate_limits_cache

DEFAULT_ROLE_LIMITS = {
    'general_user': [
        ('ai_messages_per_session', 10, 'per_session'),
        ('daily_ai_chats', 15, 'daily'),
        ('monthly_ai_chats', 150, 'monthly'),
        ('can_use_gemini', 1, 'never'),
        ('can_use_glm', 0, 'never'),
        ('can_use_groq', 0, 'never'),
        ('can_use_mistral', 0, 'never'),
        ('can_use_agents', 0, 'never'),
        ('can_use_web_search', 0, 'never'),
        ('web_searches_per_day', 0, 'daily'),
        ('web_searches_per_month', 0, 'monthly'),
        ('total_projects', 3, 'never'),
        ('total_sheets', 10, 'never'),
        ('total_records', 1000, 'never'),
        ('sheets_per_project', 5, 'never'),
        ('records_per_sheet', 100, 'never'),
        ('total_documents_bytes', 31457280, 'never'),
        ('total_sticky_notes', 5, 'never'),
        ('total_whiteboards', 1, 'never'),
    ],
    'pro_user': [
        ('ai_messages_per_session', 30, 'per_session'),
        ('daily_ai_chats', 50, 'daily'),
        ('monthly_ai_chats', 500, 'monthly'),
        ('can_use_gemini', 1, 'never'),
        ('can_use_groq', 1, 'never'),
        ('can_use_glm', 0, 'never'),
        ('can_use_mistral', 0, 'never'),
        ('can_use_agents', 1, 'never'),
        ('can_use_web_search', 1, 'never'),
        ('web_searches_per_day', 5, 'daily'),
        ('web_searches_per_month', 150, 'monthly'),
        ('total_projects', 10, 'never'),
        ('total_sheets', 50, 'never'),
        ('total_records', 25000, 'never'),
        ('sheets_per_project', 10, 'never'),
        ('records_per_sheet', 500, 'never'),
        ('total_documents_bytes', 104857600, 'never'),
        ('total_sticky_notes', 20, 'never'),
        ('total_whiteboards', 3, 'never'),
    ],
    'max_user': [
        ('ai_messages_per_session', 100, 'per_session'),
        ('daily_ai_chats', 200, 'daily'),
        ('monthly_ai_chats', 2000, 'monthly'),
        ('can_use_gemini', 1, 'never'),
        ('can_use_groq', 1, 'never'),
        ('can_use_glm', 1, 'never'),
        ('can_use_mistral', 1, 'never'),
        ('can_use_agents', 1, 'never'),
        ('can_use_web_search', 1, 'never'),
        ('web_searches_per_day', 20, 'daily'),
        ('web_searches_per_month', 600, 'monthly'),
        ('total_projects', 50, 'never'),
        ('total_sheets', 200, 'never'),
        ('total_records', 400000, 'never'),
        ('sheets_per_project', 20, 'never'),
        ('records_per_sheet', 2000, 'never'),
        ('total_documents_bytes', 314572800, 'never'),
        ('total_sticky_notes', 50, 'never'),
        ('total_whiteboards', 10, 'never'),
    ],
    'general_admin': [
        ('admin_create_user', 1, 'never'),
        ('admin_assign_user_roles', 1, 'never'),
        ('admin_assign_admin_roles', 0, 'never'),
        ('admin_manage_user_roles', 1, 'never'),
        ('admin_manage_admin_roles', 0, 'never'),
        ('admin_suspend_user', 1, 'never'),
        ('admin_revoke_user', 1, 'never'),
        ('admin_manage_invites', 1, 'never'),
        ('admin_view_audit_logs', 0, 'never'),
        ('can_use_agents', 1, 'never'),
    ],
    'super_admin': [
        ('admin_create_user', 1, 'never'),
        ('admin_assign_user_roles', 1, 'never'),
        ('admin_assign_admin_roles', 1, 'never'),
        ('admin_manage_user_roles', 1, 'never'),
        ('admin_manage_admin_roles', 1, 'never'),
        ('admin_suspend_user', 1, 'never'),
        ('admin_revoke_user', 1, 'never'),
        ('admin_manage_invites', 1, 'never'),
        ('admin_view_audit_logs', 1, 'never'),
        ('can_use_agents', 1, 'never'),
    ]
}

class AdminService:
    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection

    def log_audit_action(self, user_id: int, action: str, target_type: str, target_id: Optional[str] = None, details: Optional[dict] = None) -> None:
        details_json = json.dumps(details) if details else None
        self.connection.execute(
            """
            INSERT INTO audit_logs (user_id, action, target_type, target_id, details)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, action, target_type, target_id, details_json)
        )
        self.connection.commit()

    def get_dashboard_stats(self) -> dict:
        total_users = self.connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        active_users = self.connection.execute("SELECT COUNT(*) FROM users WHERE last_login_at >= date('now', '-30 days')").fetchone()[0]
        total_projects = self.connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        total_sheets = self.connection.execute("SELECT COUNT(*) FROM project_sheets").fetchone()[0]
        storage_row = self.connection.execute("SELECT SUM(size_bytes) FROM static_files").fetchone()
        storage_bytes = storage_row[0] if storage_row and storage_row[0] else 0

        # Fetch recent activity
        recent_registrations = [
            dict(row) for row in self.connection.execute(
                "SELECT id, email, display_name, created_at FROM users ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
        ]
        
        recent_logins = [
            dict(row) for row in self.connection.execute(
                "SELECT id, email, display_name, last_login_at FROM users WHERE last_login_at IS NOT NULL ORDER BY last_login_at DESC LIMIT 5"
            ).fetchall()
        ]

        return {
            "counts": {
                "total_users": total_users,
                "active_users": active_users,
                "total_projects": total_projects,
                "total_sheets": total_sheets,
                "storage_bytes": storage_bytes
            },
            "recent_registrations": recent_registrations,
            "recent_logins": recent_logins
        }

    def list_users(self) -> list[dict]:
        users = self.connection.execute(
            "SELECT id, email, display_name, roles, is_active, is_blocked, last_login_at, plan_started_at, plan_ends_at, created_at, token_version FROM users ORDER BY created_at DESC"
        ).fetchall()
        
        results = []
        for u in users:
            d = dict(u)
            d["roles"] = json.loads(d["roles"]) if d["roles"] else []
            results.append(d)
            
        return results

    def get_user_details(self, user_id: int) -> dict:
        user = self.connection.execute(
            "SELECT id, email, display_name, roles, is_active, is_blocked, last_login_at, plan_started_at, plan_ends_at, created_at, token_version FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        
        if not user:
            raise LookupError("User not found")
            
        d = dict(user)
        d["roles"] = json.loads(d["roles"]) if d["roles"] else []
        
        usage = self.connection.execute(
            "SELECT feature, current_count, last_reset_at FROM user_usage_stats WHERE user_id = ?", (user_id,)
        ).fetchall()
        
        d["usage"] = [dict(u) for u in usage]
        return d

    def update_user_roles(self, admin_id: int, user_id: int, roles: list[str], plan_duration_days: Optional[int] = None, plan_start_date: Optional[str] = None, plan_end_date: Optional[str] = None) -> dict:
        roles_json = json.dumps(roles)

        # Only set plan dates for user-level roles (general_user, pro_user, max_user)
        # Admin-only users don't have plan expiration
        has_user_role = any(r in ["general_user", "pro_user", "max_user"] for r in roles)

        if has_user_role:
            # Use custom dates if provided, otherwise calculate from duration
            if plan_start_date and plan_end_date:
                plan_started_at = plan_start_date
                plan_ends_at = plan_end_date
                audit_details = {"new_roles": roles, "custom_dates": {"start": plan_start_date, "end": plan_end_date}}
            else:
                plan_started_at = datetime.utcnow().isoformat()
                # Use provided duration or default to 30 days
                days = plan_duration_days if plan_duration_days is not None else 30
                plan_ends_at = (datetime.utcnow() + timedelta(days=days)).isoformat()
                audit_details = {"new_roles": roles, "plan_duration_days": days}

            self.connection.execute(
                "UPDATE users SET roles = ?, plan_started_at = ?, plan_ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (roles_json, plan_started_at, plan_ends_at, user_id)
            )
            self.log_audit_action(admin_id, "update_roles", "users", str(user_id), audit_details)
        else:
            # Clear plan dates for admin-only users
            self.connection.execute(
                "UPDATE users SET roles = ?, plan_started_at = NULL, plan_ends_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (roles_json, user_id)
            )
            self.log_audit_action(admin_id, "update_roles", "users", str(user_id), {"new_roles": roles})

        return self.get_user_details(user_id)

    def toggle_user_status(self, admin_id: int, user_id: int, is_active: bool) -> dict:
        self.connection.execute(
            "UPDATE users SET is_active = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (1 if is_active else 0, user_id)
        )
        self.log_audit_action(admin_id, "toggle_status", "users", str(user_id), {"is_active": is_active})
        return self.get_user_details(user_id)

    def toggle_user_block(self, admin_id: int, user_id: int, is_blocked: bool) -> dict:
        self.connection.execute(
            "UPDATE users SET is_blocked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (1 if is_blocked else 0, user_id)
        )
        self.log_audit_action(admin_id, "toggle_block", "users", str(user_id), {"is_blocked": is_blocked})
        return self.get_user_details(user_id)

    def revoke_tokens(self, admin_id: int, user_id: int) -> dict:
        self.connection.execute(
            "UPDATE users SET token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (user_id,)
        )
        self.log_audit_action(admin_id, "revoke_tokens", "users", str(user_id))
        return self.get_user_details(user_id)

    def list_invite_codes(self) -> list[dict]:
        codes = self.connection.execute(
            "SELECT * FROM invite_codes ORDER BY created_at DESC"
        ).fetchall()
        return [dict(c) for c in codes]

    def create_invite_code(self, admin_id: int, max_uses: int, expires_at: Optional[str] = None) -> dict:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=12))
        cursor = self.connection.execute(
            """
            INSERT INTO invite_codes (code, max_uses, expires_at, created_by)
            VALUES (?, ?, ?, ?)
            """,
            (code, max_uses, expires_at, admin_id)
        )
        new_id = cursor.lastrowid
        self.log_audit_action(admin_id, "create_invite_code", "invite_codes", str(new_id), {"code": code, "max_uses": max_uses})
        self.connection.commit()
        
        row = self.connection.execute("SELECT * FROM invite_codes WHERE id = ?", (new_id,)).fetchone()
        return dict(row)

    def get_invite_usages(self, admin_id: int, code: str) -> list[dict]:
        invite = self.connection.execute("SELECT id FROM invite_codes WHERE code = ?", (code,)).fetchone()
        if not invite:
            raise LookupError("Invite code not found")
            
        users = self.connection.execute(
            "SELECT id, email, created_at FROM users WHERE registered_with_invite_id = ? ORDER BY created_at DESC",
            (invite["id"],)
        ).fetchall()
        return [dict(u) for u in users]

    def delete_invite_code(self, admin_id: int, code: str) -> None:
        row = self.connection.execute("SELECT id FROM invite_codes WHERE code = ?", (code,)).fetchone()
        if not row:
            raise LookupError("Invite code not found")
        self.connection.execute("DELETE FROM invite_codes WHERE code = ?", (code,))
        self.connection.commit()
        self.log_audit_action(admin_id, "delete_invite_code", "invite_codes", str(row["id"]), {"code": code})

    def list_invite_requests(self) -> list[dict]:
        requests = self.connection.execute(
            "SELECT * FROM invite_requests ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in requests]

    def resolve_invite_request(self, admin_id: int, request_id: int, action: str) -> dict:
        req = self.connection.execute(
            "SELECT * FROM invite_requests WHERE id = ?", (request_id,)
        ).fetchone()
        if not req:
            raise LookupError("Invite request not found")

        if action == "approve":
            # Generate an invite code
            code_record = self.create_invite_code(admin_id, max_uses=1, expires_at=None)
            self.connection.execute(
                "UPDATE invite_requests SET status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (request_id,)
            )
            self.log_audit_action(admin_id, "resolve_invite_request", "invite_requests", str(request_id), {"action": "approve"})
            self.connection.commit()
            return {"status": "success", "invite_code": code_record["code"]}
        elif action == "reject":
            self.connection.execute(
                "UPDATE invite_requests SET status = 'Rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (request_id,)
            )
            self.log_audit_action(admin_id, "resolve_invite_request", "invite_requests", str(request_id), {"action": "reject"})
            self.connection.commit()
            return {"status": "success"}
        else:
            raise ValueError(f"Invalid action: {action}")

    def list_suspension_appeals(self) -> list[dict]:
        appeals = self.connection.execute(
            "SELECT * FROM suspension_appeals ORDER BY created_at DESC"
        ).fetchall()
        return [dict(a) for a in appeals]

    def resolve_suspension_appeal(self, admin_id: int, appeal_id: int, action: str) -> dict:
        appeal = self.connection.execute(
            "SELECT * FROM suspension_appeals WHERE id = ?", (appeal_id,)
        ).fetchone()
        if not appeal:
            raise LookupError("Appeal not found")

        if action not in ["Resolve", "Dismiss"]:
            raise ValueError(f"Invalid action: {action}")

        self.connection.execute(
            "UPDATE suspension_appeals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (action, appeal_id)
        )
        
        if action == "Resolve":
            # Automatically unsuspend the user
            self.connection.execute(
                "UPDATE users SET is_active = 1, token_version = token_version + 1 WHERE email = ?",
                (appeal["email"],)
            )
        self.log_audit_action(admin_id, "resolve_suspension_appeal", "suspension_appeals", str(appeal_id), {"action": action})
        self.connection.commit()
        return {"status": "success"}
    def create_user(self, admin_id: int, email: str, password_hash: str, display_name: str, roles: list[str], plan_duration: str = "1_month") -> dict:
        # Check if email already exists
        existing_user = self.connection.execute(
            "SELECT id FROM users WHERE email = ?", (email,)
        ).fetchone()
        if existing_user:
            raise ValueError("Email already registered.")

        roles_json = json.dumps(roles)
        plan_started_at = datetime.utcnow().isoformat()

        # Calculate plan_ends_at based on plan_duration
        if plan_duration == "1_month":
            plan_ends_at = (datetime.utcnow() + timedelta(days=30)).isoformat()
        elif plan_duration == "1_year":
            plan_ends_at = (datetime.utcnow() + timedelta(days=365)).isoformat()
        else:
            # Default to 1 month if invalid value
            plan_ends_at = (datetime.utcnow() + timedelta(days=30)).isoformat()
        
        cursor = self.connection.execute(
            """
            INSERT INTO users (email, password_hash, display_name, roles, is_active, plan_started_at, plan_ends_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            """,
            (email, password_hash, display_name, roles_json, plan_started_at, plan_ends_at)
        )
        user_id = cursor.lastrowid

        # Initialize usage stats
        features = ['ai_messages_per_session', 'daily_ai_chats', 'monthly_ai_chats', 'web_searches_per_day', 'web_searches_per_month', 'total_projects', 'total_sheets', 'total_records', 'sheets_per_project', 
                    'records_per_sheet', 'total_documents_bytes', 'total_sticky_notes', 'total_whiteboards']
        for feature in features:
            self.connection.execute(
                """
                INSERT INTO user_usage_stats (user_id, feature, current_count, last_reset_at)
                VALUES (?, ?, 0, CURRENT_TIMESTAMP)
                """, (user_id, feature)
            )

        # Initialize local profile
        self.connection.execute(
            """
            INSERT INTO local_profiles (user_id, display_name, email)
            VALUES (?, ?, ?)
            """,
            (user_id, display_name, email)
        )

        # Seed default document categories
        from app.core.categories import DEFAULT_MEDIA_CATEGORIES
        for index, (slug, label) in enumerate(DEFAULT_MEDIA_CATEGORIES):
            self.connection.execute(
                "INSERT OR IGNORE INTO document_categories (slug, display_name, sort_order, user_id) VALUES (?, ?, ?, ?)",
                (slug, label, index, user_id)
            )

        self.connection.commit()
        self.log_audit_action(admin_id, "create_user", "users", str(user_id), {"email": email, "roles": roles})
        return self.get_user_details(user_id)

    def list_role_limits(self) -> list[dict]:
        limits = self.connection.execute("SELECT * FROM role_limits ORDER BY role, feature").fetchall()
        return [dict(l) for l in limits]

    def update_role_limit(self, admin_id: int, role: str, feature: str, limit_count: int, reset_period: Optional[str] = None) -> dict:
        if reset_period is not None:
            self.connection.execute(
                """
                UPDATE role_limits
                SET limit_count = ?, reset_period = ?, updated_at = CURRENT_TIMESTAMP
                WHERE role = ? AND feature = ?
                """,
                (limit_count, reset_period, role, feature)
            )
        else:
            self.connection.execute(
                """
                UPDATE role_limits
                SET limit_count = ?, updated_at = CURRENT_TIMESTAMP
                WHERE role = ? AND feature = ?
                """,
                (limit_count, role, feature)
            )
        self.connection.commit()
        invalidate_limits_cache()
        self.log_audit_action(admin_id, "update_limit", "role_limits", f"{role}:{feature}", {"limit_count": limit_count, "reset_period": reset_period})

        row = self.connection.execute(
            "SELECT * FROM role_limits WHERE role = ? AND feature = ?", (role, feature)
        ).fetchone()
        return dict(row)

    def reset_role_limits(self, admin_id: int, role: str) -> list[dict]:
        if role not in DEFAULT_ROLE_LIMITS:
            raise ValueError("Invalid role for reset")
            
        self.connection.execute("DELETE FROM role_limits WHERE role = ?", (role,))
        
        for feature, limit_count, reset_period in DEFAULT_ROLE_LIMITS[role]:
            self.connection.execute(
                """
                INSERT INTO role_limits (role, feature, limit_count, reset_period)
                VALUES (?, ?, ?, ?)
                """,
                (role, feature, limit_count, reset_period)
            )
            
        self.connection.commit()
        invalidate_limits_cache()
        self.log_audit_action(admin_id, "reset_limits", "role_limits", role)
        
        limits = self.connection.execute("SELECT * FROM role_limits WHERE role = ? ORDER BY feature", (role,)).fetchall()
        return [dict(l) for l in limits]

    def list_audit_logs(self) -> list[dict]:
        logs = self.connection.execute(
            """
            SELECT a.*, u.email as user_email
            FROM audit_logs a
            LEFT JOIN users u ON u.id = a.user_id
            ORDER BY a.created_at DESC
            LIMIT 100
            """
        ).fetchall()
        results = []
        for row in logs:
            d = dict(row)
            d["details"] = json.loads(d["details"]) if d["details"] else None
            results.append(d)
        return results

    def list_plan_requests(self) -> list[dict]:
        requests = self.connection.execute(
            """
            SELECT p.*, u.email as user_email
            FROM plan_upgrade_requests p
            JOIN users u ON u.id = p.user_id
            ORDER BY p.created_at DESC
            """
        ).fetchall()
        return [dict(r) for r in requests]

    def resolve_plan_request(self, admin_id: int, request_id: int, action: str) -> dict:
        req = self.connection.execute(
            "SELECT * FROM plan_upgrade_requests WHERE id = ?", (request_id,)
        ).fetchone()
        
        if not req:
            raise LookupError("Request not found")
            
        if req["status"] != "Pending":
            raise ValueError("Request is already resolved")
            
        new_status = "Approved" if action.lower() == "approve" else "Rejected"
        
        self.connection.execute(
            """
            UPDATE plan_upgrade_requests 
            SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (new_status, admin_id, request_id)
        )
        
        if new_status == "Approved":
            user = self.get_user_details(req["user_id"])
            current_roles = user.get("roles", [])
            
            # Remove old plan roles
            new_roles = [r for r in current_roles if r not in ["general_user", "pro_user", "max_user"]]
            # Add requested plan
            if req["requested_plan"] not in new_roles:
                new_roles.append(req["requested_plan"])
                
            roles_json = json.dumps(new_roles)
            plan_started_at = datetime.utcnow().isoformat()
            days_to_add = 365 if req["billing_cycle"] == "yearly" else 30
            plan_ends_at = (datetime.utcnow() + timedelta(days=days_to_add)).isoformat()

            self.connection.execute(
                "UPDATE users SET roles = ?, plan_started_at = ?, plan_ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (roles_json, plan_started_at, plan_ends_at, req["user_id"])
            )
            
        self.connection.commit()
        self.log_audit_action(admin_id, f"resolve_plan_request_{new_status.lower()}", "plan_upgrade_requests", str(request_id))
        return {"status": "success", "message": f"Request {new_status.lower()}."}

    def get_app_settings(self) -> dict:
        """Get all global app settings"""
        settings = self.connection.execute("SELECT key, value FROM app_settings").fetchall()
        return {row["key"]: row["value"] for row in settings}

    def update_app_setting(self, admin_id: int, key: str, value: str) -> dict:
        """Update a specific app setting"""
        self.connection.execute(
            """
            INSERT INTO app_settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET 
            value = excluded.value, 
            updated_at = excluded.updated_at
            """, 
            (key, value)
        )
        self.connection.commit()
        self.log_audit_action(admin_id, "update_app_setting", "app_settings", key, {"new_value": value})
        return {"status": "success", "message": f"Setting {key} updated successfully."}
