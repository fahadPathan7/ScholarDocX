from app.core.notifications import default_notification_settings_json


SEED_SQL = """
INSERT OR IGNORE INTO degree_workspaces (degree_type, display_name, enabled)
VALUES
  ('bachelors', 'Bachelor''s', 1),
  ('masters', 'Master''s', 1),
  ('phd', 'PhD', 1);

INSERT INTO users (email, password_hash, display_name, roles, is_active, is_blocked)
SELECT 'admin@scholardocx.com', '$2b$12$Ips0zkIqEjVyfWtGRl7BH.TFYknvo8RypghNzxslffUkwXV32k/zq', 'Super Admin', '["super_admin", "max_user"]', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@scholardocx.com');

INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period) VALUES
  ('free_user', 'ai_messages_per_session', 0, 'per_session'),
  ('free_user', 'can_use_gemini', 1, 'never'),
  ('free_user', 'can_use_glm', 0, 'never'),
  ('free_user', 'can_use_groq', 0, 'never'),
  ('free_user', 'can_use_mistral', 0, 'never'),
  ('free_user', 'can_use_agents', 0, 'never'),
  ('free_user', 'can_use_web_search', 0, 'never'),
  ('free_user', 'can_use_advisor_atlas', 0, 'never'),
  ('free_user', 'can_use_scholarship_hunt', 0, 'never'),
  ('free_user', 'total_projects', 1, 'never'),
  ('free_user', 'total_sheets', 2, 'never'),
  ('free_user', 'total_records', 100, 'never'),
  ('free_user', 'sheets_per_project', 2, 'never'),
  ('free_user', 'records_per_sheet', 50, 'never'),
  ('free_user', 'total_documents_bytes', 5242880, 'never'),
  ('free_user', 'total_sticky_notes', 3, 'never'),
  ('free_user', 'total_whiteboards', 1, 'never'),

  ('general_user', 'ai_messages_per_session', 10, 'per_session'),
  ('general_user', 'can_use_gemini', 1, 'never'),
  ('general_user', 'can_use_glm', 0, 'never'),
  ('general_user', 'can_use_groq', 0, 'never'),
  ('general_user', 'can_use_mistral', 0, 'never'),
  ('general_user', 'can_use_agents', 0, 'never'),
  ('general_user', 'can_use_web_search', 0, 'never'),
  ('general_user', 'can_use_advisor_atlas', 0, 'never'),
  ('general_user', 'can_use_scholarship_hunt', 0, 'never'),
  ('general_user', 'total_projects', 3, 'never'),
  ('general_user', 'total_sheets', 10, 'never'),
  ('general_user', 'total_records', 1000, 'never'),
  ('general_user', 'sheets_per_project', 5, 'never'),
  ('general_user', 'records_per_sheet', 100, 'never'),
  ('general_user', 'total_documents_bytes', 31457280, 'never'),
  ('general_user', 'total_sticky_notes', 5, 'never'),
  ('general_user', 'total_whiteboards', 1, 'never'),

  ('pro_user', 'ai_messages_per_session', 30, 'per_session'),
  ('pro_user', 'can_use_gemini', 1, 'never'),
  ('pro_user', 'can_use_groq', 1, 'never'),
  ('pro_user', 'can_use_glm', 0, 'never'),
  ('pro_user', 'can_use_mistral', 0, 'never'),
  ('pro_user', 'can_use_agents', 1, 'never'),
  ('pro_user', 'can_use_web_search', 1, 'never'),
  ('pro_user', 'can_use_advisor_atlas', 1, 'never'),
  ('pro_user', 'can_use_scholarship_hunt', 1, 'never'),
  ('pro_user', 'total_projects', 10, 'never'),
  ('pro_user', 'total_sheets', 50, 'never'),
  ('pro_user', 'total_records', 25000, 'never'),
  ('pro_user', 'sheets_per_project', 10, 'never'),
  ('pro_user', 'records_per_sheet', 500, 'never'),
  ('pro_user', 'total_documents_bytes', 104857600, 'never'),
  ('pro_user', 'total_sticky_notes', 20, 'never'),
  ('pro_user', 'total_whiteboards', 3, 'never'),

  ('max_user', 'ai_messages_per_session', 100, 'per_session'),
  ('max_user', 'can_use_gemini', 1, 'never'),
  ('max_user', 'can_use_groq', 1, 'never'),
  ('max_user', 'can_use_glm', 1, 'never'),
  ('max_user', 'can_use_mistral', 1, 'never'),
  ('max_user', 'can_use_agents', 1, 'never'),
  ('max_user', 'can_use_web_search', 1, 'never'),
  ('max_user', 'can_use_advisor_atlas', 1, 'never'),
  ('max_user', 'can_use_scholarship_hunt', 1, 'never'),
  ('max_user', 'total_projects', 50, 'never'),
  ('max_user', 'total_sheets', 200, 'never'),
  ('max_user', 'total_records', 400000, 'never'),
  ('max_user', 'sheets_per_project', 20, 'never'),
  ('max_user', 'records_per_sheet', 2000, 'never'),
  ('max_user', 'total_documents_bytes', 314572800, 'never'),
  ('max_user', 'total_sticky_notes', 50, 'never'),
  ('max_user', 'total_whiteboards', 10, 'never'),

  ('general_admin', 'admin_create_user', 1, 'never'),
  ('general_admin', 'admin_assign_user_roles', 1, 'never'),
  ('general_admin', 'admin_assign_admin_roles', 0, 'never'),
  ('general_admin', 'admin_manage_user_roles', 1, 'never'),
  ('general_admin', 'admin_manage_admin_roles', 0, 'never'),
  ('general_admin', 'admin_suspend_user', 1, 'never'),
  ('general_admin', 'admin_revoke_user', 1, 'never'),
  ('general_admin', 'admin_manage_invites', 1, 'never'),
  ('general_admin', 'admin_view_audit_logs', 0, 'never'),
  ('general_admin', 'admin_manage_requests', 1, 'never'),
  ('general_admin', 'admin_manage_suspension_appeals', 1, 'never'),
  ('general_admin', 'can_use_agents', 1, 'never'),
  ('general_admin', 'admin_manage_role_limits', 1, 'never'),
  ('general_admin', 'admin_manage_notification_texts', 1, 'never'),
  ('general_admin', 'admin_send_notifications', 1, 'never'),
  ('general_admin', 'admin_manage_settings', 0, 'never'),
  ('general_admin', 'admin_view_info', 1, 'never'),

  ('super_admin', 'admin_create_user', 1, 'never'),
  ('super_admin', 'admin_assign_user_roles', 1, 'never'),
  ('super_admin', 'admin_assign_admin_roles', 1, 'never'),
  ('super_admin', 'admin_manage_user_roles', 1, 'never'),
  ('super_admin', 'admin_manage_admin_roles', 1, 'never'),
  ('super_admin', 'admin_suspend_user', 1, 'never'),
  ('super_admin', 'admin_revoke_user', 1, 'never'),
  ('super_admin', 'admin_manage_invites', 1, 'never'),
  ('super_admin', 'admin_view_audit_logs', 1, 'never'),
  ('super_admin', 'admin_manage_requests', 1, 'never'),
  ('super_admin', 'admin_manage_suspension_appeals', 1, 'never'),
  ('super_admin', 'admin_manage_settings', 1, 'never'),
  ('super_admin', 'admin_view_info', 1, 'never');

INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period) VALUES
  ('free_user', 'ai_tokens_per_month', 0, 'monthly'),
  ('general_user', 'ai_tokens_per_month', 500000, 'monthly'),
  ('pro_user', 'ai_tokens_per_month', 2000000, 'monthly'),
  ('max_user', 'ai_tokens_per_month', 5000000, 'monthly');

INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period) VALUES
  ('free_user', 'can_purchase_token_packs', 0, 'never'),
  ('general_user', 'can_purchase_token_packs', 0, 'never'),
  ('pro_user', 'can_purchase_token_packs', 1, 'never'),
  ('max_user', 'can_purchase_token_packs', 1, 'never'),
  ('free_user', 'can_use_purchased_tokens', 0, 'never'),
  ('general_user', 'can_use_purchased_tokens', 0, 'never'),
  ('pro_user', 'can_use_purchased_tokens', 1, 'never'),
  ('max_user', 'can_use_purchased_tokens', 1, 'never');

-- NOTE: jwt_secret_key is intentionally NOT seeded here. It is generated as a
-- strong random value per install in initialize_database() so the signing key
-- is never a committed, publicly-known constant.
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('jwt_expiration_days', '30'),
  ('plan_price_general_monthly', '0'),
  ('plan_price_general_yearly', '0'),
  ('plan_price_pro_monthly', '50'),
  ('plan_price_pro_yearly', '500'),
  ('plan_price_max_monthly', '180'),
  ('plan_price_max_yearly', '1500'),
  ('ai_token_rate_tokens_per_dollar', '10000'),
  ('tavily_call_cost_usd', '0.01');

"""
