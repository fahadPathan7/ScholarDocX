from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads
import json
from typing import Any, Optional, List, Dict
import random
import string
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.auth.limits import invalidate_limits_cache
from app.auth.password import hash_password
from app.core.notifications import ADMIN_NOTIFICATION_KEYS, is_notification_enabled
from app.db.legacy_db import LegacyConnection

DEFAULT_ROLE_LIMITS = {
    'free_user': [
        ('ai_messages_per_session', 0, 'per_session'),
        ('can_use_gemini', 1, 'never'),
        ('can_use_glm', 0, 'never'),
        ('can_use_groq', 0, 'never'),
        ('can_use_mistral', 0, 'never'),
        ('can_use_agents', 0, 'never'),
        ('can_use_web_search', 0, 'never'),
        ('can_use_advisor_atlas', 0, 'never'),
        ('can_use_scholarship_hunt', 0, 'never'),
        ('total_projects', 1, 'never'),
        ('total_sheets', 2, 'never'),
        ('total_records', 100, 'never'),
        ('sheets_per_project', 2, 'never'),
        ('records_per_sheet', 50, 'never'),
        ('total_documents_bytes', 5242880, 'never'),
        ('total_sticky_notes', 3, 'never'),
        ('total_whiteboards', 1, 'never'),
        ('ai_tokens_per_month', 0, 'monthly'),
    ],
    'general_user': [
        ('ai_messages_per_session', 10, 'per_session'),
        ('can_use_gemini', 1, 'never'),
        ('can_use_glm', 0, 'never'),
        ('can_use_groq', 0, 'never'),
        ('can_use_mistral', 0, 'never'),
        ('can_use_agents', 0, 'never'),
        ('can_use_web_search', 0, 'never'),
        ('can_use_advisor_atlas', 0, 'never'),
        ('can_use_scholarship_hunt', 0, 'never'),
        ('total_projects', 3, 'never'),
        ('total_sheets', 10, 'never'),
        ('total_records', 1000, 'never'),
        ('sheets_per_project', 5, 'never'),
        ('records_per_sheet', 100, 'never'),
        ('total_documents_bytes', 31457280, 'never'),
        ('total_sticky_notes', 5, 'never'),
        ('total_whiteboards', 1, 'never'),
        ('ai_tokens_per_month', 500000, 'monthly'),
        ('can_purchase_token_packs', 0, 'never'),
        ('can_use_purchased_tokens', 0, 'never'),
    ],
    'pro_user': [
        ('ai_messages_per_session', 30, 'per_session'),
        ('can_use_gemini', 1, 'never'),
        ('can_use_groq', 1, 'never'),
        ('can_use_glm', 0, 'never'),
        ('can_use_mistral', 0, 'never'),
        ('can_use_agents', 1, 'never'),
        ('can_use_web_search', 1, 'never'),
        ('can_use_advisor_atlas', 1, 'never'),
        ('can_use_scholarship_hunt', 1, 'never'),
        ('total_projects', 10, 'never'),
        ('total_sheets', 50, 'never'),
        ('total_records', 25000, 'never'),
        ('sheets_per_project', 10, 'never'),
        ('records_per_sheet', 500, 'never'),
        ('total_documents_bytes', 104857600, 'never'),
        ('total_sticky_notes', 20, 'never'),
        ('total_whiteboards', 3, 'never'),
        ('ai_tokens_per_month', 2000000, 'monthly'),
        ('can_purchase_token_packs', 1, 'never'),
        ('can_use_purchased_tokens', 1, 'never'),
        ('can_use_advisor_atlas', 1, 'never'),
    ],
    'max_user': [
        ('ai_messages_per_session', 100, 'per_session'),
        ('can_use_gemini', 1, 'never'),
        ('can_use_groq', 1, 'never'),
        ('can_use_glm', 1, 'never'),
        ('can_use_mistral', 1, 'never'),
        ('can_use_agents', 1, 'never'),
        ('can_use_web_search', 1, 'never'),
        ('can_use_advisor_atlas', 1, 'never'),
        ('can_use_scholarship_hunt', 1, 'never'),
        ('total_projects', 50, 'never'),
        ('total_sheets', 200, 'never'),
        ('total_records', 400000, 'never'),
        ('sheets_per_project', 20, 'never'),
        ('records_per_sheet', 2000, 'never'),
        ('total_documents_bytes', 314572800, 'never'),
        ('total_sticky_notes', 50, 'never'),
        ('total_whiteboards', 10, 'never'),
        ('ai_tokens_per_month', 5000000, 'monthly'),
        ('can_purchase_token_packs', 1, 'never'),
        ('can_use_purchased_tokens', 1, 'never'),
        ('can_use_advisor_atlas', 1, 'never'),
    ],
    'general_admin': [
        ('admin_view_dashboard', 1, 'never'),
        ('admin_create_user', 1, 'never'),
        ('admin_assign_user_roles', 1, 'never'),
        ('admin_assign_admin_roles', 0, 'never'),
        ('admin_manage_user_roles', 1, 'never'),
        ('admin_manage_admin_roles', 0, 'never'),
        ('admin_suspend_user', 1, 'never'),
        ('admin_revoke_user', 1, 'never'),
        ('admin_manage_invites', 1, 'never'),
        ('admin_manage_invite_requests', 1, 'never'),
        ('admin_manage_suspension_appeals', 1, 'never'),
        ('admin_manage_role_limits', 1, 'never'),
        ('admin_manage_notification_texts', 1, 'never'),
        ('admin_view_audit_logs', 0, 'never'),
        ('admin_manage_plan_requests', 1, 'never'),
        ('admin_manage_token_requests', 1, 'never'),
        ('admin_manage_password_resets', 1, 'never'),
        ('admin_send_notifications', 1, 'never'),
        ('admin_view_info', 1, 'never'),
    ],
    'super_admin': [
        ('admin_view_dashboard', 1, 'never'),
        ('admin_create_user', 1, 'never'),
        ('admin_assign_user_roles', 1, 'never'),
        ('admin_assign_admin_roles', 1, 'never'),
        ('admin_manage_user_roles', 1, 'never'),
        ('admin_manage_admin_roles', 1, 'never'),
        ('admin_suspend_user', 1, 'never'),
        ('admin_revoke_user', 1, 'never'),
        ('admin_manage_invites', 1, 'never'),
        ('admin_manage_invite_requests', 1, 'never'),
        ('admin_manage_suspension_appeals', 1, 'never'),
        ('admin_manage_role_limits', 1, 'never'),
        ('admin_manage_notification_texts', 1, 'never'),
        ('admin_view_audit_logs', 1, 'never'),
        ('admin_manage_plan_requests', 1, 'never'),
        ('admin_manage_token_requests', 1, 'never'),
        ('admin_manage_password_resets', 1, 'never'),
        ('admin_send_notifications', 1, 'never'),
        ('admin_view_info', 1, 'never'),
    ],
    'free_user': [
        ('ai_messages_per_session', 0, 'per_session'),
        ('can_use_gemini', 1, 'never'),
        ('can_use_glm', 0, 'never'),
        ('can_use_groq', 0, 'never'),
        ('can_use_mistral', 0, 'never'),
        ('can_use_agents', 0, 'never'),
        ('can_use_web_search', 0, 'never'),
        ('can_use_advisor_atlas', 0, 'never'),
        ('can_use_scholarship_hunt', 0, 'never'),
        ('total_projects', 1, 'never'),
        ('total_sheets', 2, 'never'),
        ('total_records', 100, 'never'),
        ('sheets_per_project', 2, 'never'),
        ('records_per_sheet', 50, 'never'),
        ('total_documents_bytes', 5242880, 'never'),
        ('total_sticky_notes', 3, 'never'),
        ('total_whiteboards', 1, 'never'),
        ('ai_tokens_per_month', 0, 'monthly'),
        ('can_purchase_token_packs', 0, 'never'),
        ('can_use_purchased_tokens', 0, 'never'),
    ]
}

class AdminService:
    def __init__(self, db: Session):
        self.db = db
        # SCHOLARDOCX-0139: route raw-SQL call sites through the legacy shim so
        # the ~35 self.connection.execute(...) sites (with ? params and
        # fetchone()[0] / row["col"] access) work unchanged on Postgres.
        self.connection = LegacyConnection(db)

    @staticmethod
    def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return safe_parse_datetime(value)
        except (ValueError, AttributeError):
            return None

    def _calculate_plan_extension_window(self, user: dict, billing_cycle: str) -> tuple[str, str]:
        current_start = self._parse_iso_datetime(user.get("plan_started_at"))
        current_end = self._parse_iso_datetime(user.get("plan_ends_at"))
        
        now = datetime.now(timezone.utc)
        if current_end and current_end.tzinfo is not None:
            now = datetime.now(current_end.tzinfo)

        duration_days = 365 if billing_cycle == "yearly" else 30

        if current_end and current_end > now:
            base_dt = current_end
            start_dt = current_start or now
        else:
            base_dt = now
            start_dt = now

        new_end = base_dt + timedelta(days=duration_days)
        return start_dt.isoformat(), new_end.isoformat()

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
        def _get_count(query: str) -> int:
            row = self.connection.execute(query).fetchone()
            return row[0] if row and row[0] is not None else 0

        total_users = _get_count("SELECT COUNT(*) FROM users")
        active_users = _get_count("SELECT COUNT(*) FROM users WHERE last_login_at::timestamp >= now() - interval '30 days'")
        active_users_7d = _get_count("SELECT COUNT(*) FROM users WHERE last_login_at::timestamp >= now() - interval '7 days'")
        total_projects = _get_count("SELECT COUNT(*) FROM projects")
        total_sheets = _get_count("SELECT COUNT(*) FROM project_sheets")
        total_documents = _get_count("SELECT COUNT(*) FROM documents")
        total_sticky_notes = _get_count("SELECT COUNT(*) FROM sticky_notes")
        total_whiteboards = _get_count("SELECT COUNT(*) FROM whiteboards")
        # rows_json is TEXT holding a JSON array; cast to jsonb for array length.
        # NULLIF guards against empty-string values (invalid json syntax).
        total_records = _get_count("SELECT COALESCE(SUM(jsonb_array_length(COALESCE(NULLIF(rows_json, ''), '[]')::jsonb)), 0) FROM project_pages")
        storage_bytes = _get_count("SELECT SUM(size_bytes) FROM static_files")

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

        pending_invite_requests = _get_count("SELECT COUNT(*) FROM invite_requests WHERE status = 'Pending'")
        pending_appeals = _get_count("SELECT COUNT(*) FROM suspension_appeals WHERE status = 'Pending'")
        pending_plan_requests = _get_count("SELECT COUNT(*) FROM plan_upgrade_requests WHERE status = 'Pending'")
        pending_credit_requests = _get_count("SELECT COUNT(*) FROM ai_token_purchase_requests WHERE status = 'Pending'")
        pending_password_resets = _get_count("SELECT COUNT(*) FROM password_reset_requests WHERE status = 'Pending'")

        total_ai_tokens = _get_count("SELECT COALESCE(SUM(-tokens_delta), 0) FROM ai_token_ledger WHERE tokens_delta < 0")
        ai_tokens_30d = _get_count("SELECT COALESCE(SUM(-tokens_delta), 0) FROM ai_token_ledger WHERE tokens_delta < 0 AND created_at::timestamp >= now() - interval '30 days'")
        ai_tokens_7d = _get_count("SELECT COALESCE(SUM(-tokens_delta), 0) FROM ai_token_ledger WHERE tokens_delta < 0 AND created_at::timestamp >= now() - interval '7 days'")
        tavily_total = _get_count("SELECT COUNT(*) FROM ai_token_ledger WHERE source IN ('web_search', 'scholarship_hunt', 'advisor_atlas_search')")
        tavily_web_search = _get_count("SELECT COUNT(*) FROM ai_token_ledger WHERE source = 'web_search'")
        tavily_scholarship_hunt = _get_count("SELECT COUNT(*) FROM ai_token_ledger WHERE source = 'scholarship_hunt'")
        tavily_advisor_atlas = _get_count("SELECT COUNT(*) FROM ai_token_ledger WHERE source = 'advisor_atlas_search'")

        ai_usage_10d_rows = self.connection.execute(
            "SELECT created_at::timestamp::date as day, SUM(-tokens_delta) as tokens "
            "FROM ai_token_ledger "
            "WHERE tokens_delta < 0 AND created_at::timestamp >= now() - interval '10 days' "
            "GROUP BY day ORDER BY day ASC"
        ).fetchall()
        
        # Fill in missing dates for the last 10 days to ensure a continuous chart
        import datetime
        today = datetime.date.today()
        date_list = [(today - datetime.timedelta(days=x)).isoformat() for x in range(9, -1, -1)]
        usage_map = {row["day"]: row["tokens"] for row in ai_usage_10d_rows}
        ai_usage_10d = [{"date": d, "tokens": usage_map.get(d, 0)} for d in date_list]

        return {
            "counts": {
                "total_users": total_users,
                "active_users": active_users,
                "active_users_7d": active_users_7d,
                "total_projects": total_projects,
                "total_sheets": total_sheets,
                "total_documents": total_documents,
                "total_sticky_notes": total_sticky_notes,
                "total_whiteboards": total_whiteboards,
                "total_records": total_records,
                "storage_bytes": storage_bytes,
                "pending_invite_requests": pending_invite_requests,
                "pending_appeals": pending_appeals,
                "pending_plan_requests": pending_plan_requests,
                "pending_credit_requests": pending_credit_requests,
                "pending_password_resets": pending_password_resets,
                "total_ai_tokens": total_ai_tokens,
                "ai_tokens_30d": ai_tokens_30d,
                "ai_tokens_7d": ai_tokens_7d,
                "tavily_total": tavily_total,
                "tavily_web_search": tavily_web_search,
                "tavily_scholarship_hunt": tavily_scholarship_hunt,
                "tavily_advisor_atlas": tavily_advisor_atlas
            },
            "recent_registrations": recent_registrations,
            "recent_logins": recent_logins,
            "ai_usage_10d": ai_usage_10d
        }

    def list_users(self) -> list[dict]:
        users = self.connection.execute(
            "SELECT id, email, display_name, roles, is_active, is_blocked, last_login_at, plan_started_at, plan_ends_at, created_at, token_version FROM users ORDER BY created_at DESC"
        ).fetchall()
        
        results = []
        for u in users:
            d = dict(u)
            d["roles"] = safe_json_loads(d["roles"], default=[])
            results.append(d)
            
        return results

    def send_notifications(
        self,
        admin_id: int,
        *,
        title: str,
        body: str,
        category: str,
        send_to_all: bool = False,
        recipient_user_ids: Optional[list[int]] = None,
    ) -> dict:
        cleaned_title = (title or "").strip()
        cleaned_body = (body or "").strip()
        if not cleaned_title:
            raise ValueError("Notification title is required")
        if not cleaned_body:
            raise ValueError("Notification body is required")
        if category not in ADMIN_NOTIFICATION_KEYS:
            raise ValueError("Unsupported notification category")

        explicit_ids = sorted({user_id for user_id in (recipient_user_ids or []) if user_id})
        if send_to_all:
            recipient_rows = self.connection.execute("SELECT id FROM users ORDER BY id ASC").fetchall()
            target_user_ids = [int(row["id"]) for row in recipient_rows]
        else:
            if not explicit_ids:
                raise ValueError("At least one recipient is required")
            placeholders = ",".join("?" for _ in explicit_ids)
            recipient_rows = self.connection.execute(
                f"SELECT id FROM users WHERE id IN ({placeholders}) ORDER BY id ASC",
                explicit_ids,
            ).fetchall()
            target_user_ids = [int(row["id"]) for row in recipient_rows]

        if not target_user_ids:
            raise ValueError("No matching recipients found")

        placeholders = ",".join("?" for _ in target_user_ids)
        profile_rows = self.connection.execute(
            f"SELECT user_id, notification_settings FROM local_profiles WHERE user_id IN ({placeholders})",
            target_user_ids,
        ).fetchall()
        settings_by_user_id = {
            int(row["user_id"]): row["notification_settings"]
            for row in profile_rows
        }

        delivered_user_ids: list[int] = []
        skipped_user_ids: list[int] = []
        for user_id in target_user_ids:
            if not is_notification_enabled(settings_by_user_id.get(user_id), category):
                skipped_user_ids.append(user_id)
                continue
            self.connection.execute(
                """
                INSERT INTO notifications (user_id, title, body, notification_type, preference_key)
                VALUES (?, ?, ?, 'general', ?)
                """,
                (user_id, cleaned_title, cleaned_body, category),
            )
            delivered_user_ids.append(user_id)

        self.connection.commit()
        self.log_audit_action(
            admin_id,
            "send_notifications",
            "notifications",
            None,
            {
                "category": category,
                "send_to_all": send_to_all,
                "recipient_count": len(target_user_ids),
                "delivered_count": len(delivered_user_ids),
                "skipped_count": len(skipped_user_ids),
            },
        )
        return {
            "status": "success",
            "category": category,
            "delivered_count": len(delivered_user_ids),
            "skipped_count": len(skipped_user_ids),
            "delivered_user_ids": delivered_user_ids,
            "skipped_user_ids": skipped_user_ids,
        }

    def get_user_details(self, user_id: int) -> dict:
        user = self.connection.execute(
            "SELECT id, email, display_name, roles, is_active, is_blocked, last_login_at, plan_started_at, plan_ends_at, created_at, token_version FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        
        if not user:
            raise LookupError("User not found")
            
        d = dict(user)
        d["roles"] = safe_json_loads(d["roles"], default=[])
        
        usage = self.connection.execute(
            "SELECT feature, current_count, last_reset_at FROM user_usage_stats WHERE user_id = ?", (user_id,)
        ).fetchall()
        
        d["usage"] = [dict(u) for u in usage]
        return d

    def update_user_roles(self, admin_id: int, user_id: int, roles: list[str], plan_duration_days: Optional[int] = None, plan_start_date: Optional[str] = None, plan_end_date: Optional[str] = None) -> dict:
        roles_json = json.dumps(roles)

        # Only set plan dates for user-level roles (free_user, general_user, pro_user, max_user)
        # Admin-only users don't have plan expiration
        has_user_role = any(r in ["free_user", "general_user", "pro_user", "max_user"] for r in roles)

        if has_user_role:
            # Use custom dates if provided, otherwise calculate from duration
            if plan_start_date and plan_end_date:
                plan_started_at = plan_start_date
                plan_ends_at = plan_end_date
                audit_details = {"new_roles": roles, "custom_dates": {"start": plan_start_date, "end": plan_end_date}}
            else:
                plan_started_at = datetime.now(timezone.utc).isoformat()
                # Use provided duration or default to 30 days
                days = plan_duration_days if plan_duration_days is not None else 30
                plan_ends_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
                audit_details = {"new_roles": roles, "plan_duration_days": days}

            self.connection.execute(
                "UPDATE users SET roles = ?, plan_started_at = ?, plan_ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (roles_json, plan_started_at, plan_ends_at, user_id)
            )
            self.connection.execute(
                "UPDATE ai_token_balances SET subscription_period = 'FORCE_RESET' WHERE user_id = ?",
                (user_id,)
            )
            self.log_audit_action(admin_id, "update_roles", "users", str(user_id), audit_details)
        else:
            # Clear plan dates for admin-only users
            self.connection.execute(
                "UPDATE users SET roles = ?, plan_started_at = NULL, plan_ends_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (roles_json, user_id)
            )
            self.connection.execute(
                "UPDATE ai_token_balances SET subscription_period = 'FORCE_RESET' WHERE user_id = ?",
                (user_id,)
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
        if not row:
            raise LookupError("Failed to fetch created invite code")
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
        plan_started_at = datetime.now(timezone.utc).isoformat()

        # Calculate plan_ends_at based on plan_duration
        if plan_duration == "1_month":
            plan_ends_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        elif plan_duration == "1_year":
            plan_ends_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        else:
            # Default to 1 month if invalid value
            plan_ends_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        
        cursor = self.connection.execute(
            """
            INSERT INTO users (email, password_hash, display_name, roles, is_active, plan_started_at, plan_ends_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            """,
            (email, password_hash, display_name, roles_json, plan_started_at, plan_ends_at)
        )
        user_id = cursor.lastrowid
        assert user_id is not None

        # Initialize usage stats
        features = ['ai_messages_per_session', 'total_projects', 'total_sheets', 'total_records', 'sheets_per_project',
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
                "INSERT INTO document_categories (slug, display_name, sort_order, user_id) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
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
        
        if feature == "ai_tokens_per_month":
            self.connection.execute(
                """
                UPDATE ai_token_balances 
                SET subscription_period = 'FORCE_RESET'
                WHERE user_id IN (
                    SELECT id FROM users
                    WHERE roles ILIKE ?
                )
                """,
                (f'%"{role}"%',)
            )
            self.connection.commit()

        self.log_audit_action(admin_id, "update_limit", "role_limits", f"{role}:{feature}", {"limit_count": limit_count, "reset_period": reset_period})

        row = self.connection.execute(
            "SELECT * FROM role_limits WHERE role = ? AND feature = ?", (role, feature)
        ).fetchone()
        if not row:
            raise LookupError(f"Failed to fetch updated role limit for {role}:{feature}")
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
        
        self.connection.execute(
            """
            UPDATE ai_token_balances 
            SET subscription_period = 'FORCE_RESET'
            WHERE user_id IN (
                SELECT id FROM users 
                WHERE roles LIKE ?
            )
            """,
            (f'%"{role}"%',)
        )
        self.connection.commit()

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
            d["details"] = safe_json_loads(d["details"], default=None)
            results.append(d)
        return results

    def list_plan_requests(self, request_type: Optional[str] = None) -> list[dict]:
        if request_type:
            requests = self.connection.execute(
                """
                SELECT p.*, u.email as user_email
                FROM plan_upgrade_requests p
                JOIN users u ON u.id = p.user_id
                WHERE COALESCE(p.request_type, 'upgrade') = ?
                ORDER BY p.created_at DESC
                """,
                (request_type,),
            ).fetchall()
        else:
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
            request_type = req["request_type"] or "upgrade"
            plan_started_at = datetime.now(timezone.utc).isoformat()
            days_to_add = 365 if req["billing_cycle"] == "yearly" else 30
            audit_details = {
                "request_type": request_type,
                "billing_cycle": req["billing_cycle"],
                "requested_plan": req["requested_plan"],
            }

            if request_type == "extension":
                new_roles = current_roles
                plan_started_at, plan_ends_at = self._calculate_plan_extension_window(user, req["billing_cycle"])
            else:
                # Remove old plan roles
                new_roles = [r for r in current_roles if r not in ["free_user", "general_user", "pro_user", "max_user"]]
                # Add requested plan
                if req["requested_plan"] not in new_roles:
                    new_roles.append(req["requested_plan"])
                plan_ends_at = (datetime.now(timezone.utc) + timedelta(days=days_to_add)).isoformat()
                
                self.connection.execute(
                    "UPDATE ai_token_balances SET subscription_period = 'FORCE_RESET' WHERE user_id = ?",
                    (req["user_id"],)
                )
            roles_json = json.dumps(new_roles)
            audit_details.update({
                "plan_started_at": plan_started_at,
                "plan_ends_at": plan_ends_at,
            })

            self.connection.execute(
                "UPDATE users SET roles = ?, plan_started_at = ?, plan_ends_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (roles_json, plan_started_at, plan_ends_at, req["user_id"])
            )
            self.connection.commit()
            self.log_audit_action(admin_id, f"resolve_plan_request_{new_status.lower()}", "plan_upgrade_requests", str(request_id), audit_details)
            return {"status": "success", "message": f"Request {new_status.lower()}."}
        self.connection.commit()
        self.log_audit_action(admin_id, f"resolve_plan_request_{new_status.lower()}", "plan_upgrade_requests", str(request_id), {"request_type": req["request_type"] or "upgrade"})
        return {"status": "success", "message": f"Request {new_status.lower()}."}

    def list_password_reset_requests(self, status: Optional[str] = None) -> list[dict]:
        if status and status.lower() != "all":
            requests = self.connection.execute(
                """
                SELECT p.id, p.email, p.user_id, p.status, p.ip_address,
                       p.reviewed_by, p.reviewed_at, p.created_at, p.updated_at,
                       u.email as user_email
                FROM password_reset_requests p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE p.status = ?
                ORDER BY p.created_at DESC
                """,
                (status,),
            ).fetchall()
        else:
            requests = self.connection.execute(
                """
                SELECT p.id, p.email, p.user_id, p.status, p.ip_address,
                       p.reviewed_by, p.reviewed_at, p.created_at, p.updated_at,
                       u.email as user_email
                FROM password_reset_requests p
                LEFT JOIN users u ON u.id = p.user_id
                ORDER BY p.created_at DESC
                """
            ).fetchall()
        return [dict(r) for r in requests]

    def resolve_password_reset_request(self, admin_id: int, request_id: int, action: str, new_password: Optional[str] = None) -> dict:
        req = self.connection.execute(
            "SELECT * FROM password_reset_requests WHERE id = ?", (request_id,)
        ).fetchone()

        if not req:
            raise LookupError("Request not found")

        if req["status"] != "Pending":
            raise ValueError("Request is already resolved")

        normalized_action = (action or "").lower()
        if normalized_action == "set_password":
            if not new_password or not new_password.strip():
                raise ValueError("A new password is required.")
            if not req["user_id"]:
                raise ValueError("This request is not linked to a user account.")
            new_hash = hash_password(new_password)
            # Update password and bump token_version to invalidate all existing sessions.
            self.connection.execute(
                "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (new_hash, req["user_id"])
            )
            new_status = "Completed"
        elif normalized_action == "dismiss":
            new_status = "Dismissed"
        else:
            raise ValueError("Invalid action. Use 'set_password' or 'dismiss'.")

        self.connection.execute(
            """
            UPDATE password_reset_requests
            SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (new_status, admin_id, request_id)
        )
        self.connection.commit()
        self.log_audit_action(
            admin_id,
            f"resolve_password_reset_{new_status.lower()}",
            "password_reset_requests",
            str(request_id),
            {"action": normalized_action},
        )
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
