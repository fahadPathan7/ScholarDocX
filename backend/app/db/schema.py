from app.core.notifications import default_notification_settings_json


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS degree_workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  degree_type TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'User',
  avatar TEXT,
  roles TEXT NOT NULL DEFAULT '["general_user"]',
  token_version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  plan_started_at TEXT,
  plan_ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  registered_with_invite_id INTEGER REFERENCES invite_codes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS local_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  preferred_email_provider TEXT,
  timezone TEXT,
  notes TEXT,
  avatar TEXT,
  notification_settings TEXT DEFAULT '""" + default_notification_settings_json().replace("'", "''") + """',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_local_profiles_user_id ON local_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token_version ON users(token_version);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_expires_at ON invite_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by ON invite_codes(created_by);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_jti TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_jti ON user_sessions(token_jti);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked_at ON user_sessions(revoked_at);

CREATE TABLE IF NOT EXISTS role_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  feature TEXT NOT NULL,
  limit_count INTEGER NOT NULL DEFAULT -1,
  reset_period TEXT NOT NULL DEFAULT 'never',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role, feature)
);

CREATE INDEX IF NOT EXISTS idx_role_limits_role ON role_limits(role);
CREATE INDEX IF NOT EXISTS idx_role_limits_feature ON role_limits(feature);

CREATE TABLE IF NOT EXISTS user_usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  current_count INTEGER NOT NULL DEFAULT 0,
  last_reset_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_user_usage_stats_user_id ON user_usage_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_usage_stats_feature ON user_usage_stats(feature);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  degree_type TEXT,
  intake_term TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  description TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  pinned_to_dashboard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  pinned_to_dashboard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sheet_id INTEGER REFERENCES project_sheets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  columns_json TEXT NOT NULL DEFAULT '[]',
  rows_json TEXT NOT NULL DEFAULT '[]',
  email_config_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  notification_type TEXT NOT NULL DEFAULT 'general',
  preference_key TEXT NOT NULL DEFAULT 'system',
  due_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS universities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  website_url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  university_id INTEGER NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  degree_type TEXT,
  department TEXT,
  application_url TEXT,
  funding_url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS professors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  university_id INTEGER REFERENCES universities(id) ON DELETE SET NULL,
  program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  profile_url TEXT,
  research_interests TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  degree_workspace_id INTEGER REFERENCES degree_workspaces(id) ON DELETE SET NULL,
  university_id INTEGER REFERENCES universities(id) ON DELETE SET NULL,
  program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
  professor_id INTEGER REFERENCES professors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Researching',
  intake_term TEXT,
  application_url TEXT,
  priority TEXT DEFAULT 'Medium',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  deadline_type TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  completed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  owner_scope TEXT DEFAULT 'general',
  owner_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'markdown',
  content TEXT NOT NULL,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS static_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER DEFAULT 0,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  notes TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  pinned_to_dashboard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS whiteboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shapes_json TEXT NOT NULL DEFAULT '[]',
  camera_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sticky_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT,
  color TEXT NOT NULL DEFAULT 'sun',
  is_bold INTEGER NOT NULL DEFAULT 0,
  is_checklist INTEGER NOT NULL DEFAULT 0,
  checklist_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  professor_id INTEGER REFERENCES professors(id) ON DELETE SET NULL,
  recipient_email TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outreach_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email_draft_id INTEGER REFERENCES email_drafts(id) ON DELETE SET NULL,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  professor_id INTEGER REFERENCES professors(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  response_status TEXT DEFAULT 'Waiting',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  outreach_log_id INTEGER REFERENCES outreach_logs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  completed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  professor_id INTEGER REFERENCES professors(id) ON DELETE SET NULL,
  university_id INTEGER REFERENCES universities(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sources TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS scholarship_search_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initial_query TEXT NOT NULL,
  refined_query TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  was_edited INTEGER NOT NULL DEFAULT 0,
  provider_status TEXT NOT NULL DEFAULT 'pending',
  result_count INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scholarship_search_feedback_user_id
  ON scholarship_search_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_scholarship_search_feedback_created_at
  ON scholarship_search_feedback(created_at);

CREATE TABLE IF NOT EXISTS plan_upgrade_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL DEFAULT 'upgrade',
  requested_plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  message TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invite_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  description TEXT,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suspension_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

"""

SEED_SQL = """
INSERT OR IGNORE INTO degree_workspaces (degree_type, display_name, enabled)
VALUES
  ('bachelors', 'Bachelor''s', 1),
  ('masters', 'Master''s', 1),
  ('phd', 'PhD', 1);

INSERT INTO users (email, password_hash, display_name, roles, is_active, is_blocked)
SELECT 'admin@scholardock.com', '$2b$12$Ips0zkIqEjVyfWtGRl7BH.TFYknvo8RypghNzxslffUkwXV32k/zq', 'Super Admin', '["super_admin", "max_user"]', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@scholardock.com');

INSERT OR IGNORE INTO role_limits (role, feature, limit_count, reset_period) VALUES
  ('general_user', 'ai_messages_per_session', 10, 'per_session'),
  ('general_user', 'daily_ai_chats', 15, 'daily'),
  ('general_user', 'monthly_ai_chats', 150, 'monthly'),
  ('general_user', 'can_use_gemini', 1, 'never'),
  ('general_user', 'can_use_glm', 0, 'never'),
  ('general_user', 'can_use_groq', 0, 'never'),
  ('general_user', 'can_use_mistral', 0, 'never'),
  ('general_user', 'can_use_agents', 0, 'never'),
  ('general_user', 'can_use_web_search', 0, 'never'),
  ('general_user', 'web_searches_per_day', 0, 'daily'),
  ('general_user', 'web_searches_per_month', 0, 'monthly'),
  ('general_user', 'total_projects', 3, 'never'),
  ('general_user', 'total_sheets', 10, 'never'),
  ('general_user', 'total_records', 1000, 'never'),
  ('general_user', 'sheets_per_project', 5, 'never'),
  ('general_user', 'records_per_sheet', 100, 'never'),
  ('general_user', 'total_documents_bytes', 31457280, 'never'),
  ('general_user', 'total_sticky_notes', 5, 'never'),
  ('general_user', 'total_whiteboards', 1, 'never'),
  ('general_user', 'news_searches_per_day', 3, 'daily'),
  ('general_user', 'news_searches_per_month', 30, 'monthly'),

  ('pro_user', 'ai_messages_per_session', 30, 'per_session'),
  ('pro_user', 'daily_ai_chats', 50, 'daily'),
  ('pro_user', 'monthly_ai_chats', 500, 'monthly'),
  ('pro_user', 'can_use_gemini', 1, 'never'),
  ('pro_user', 'can_use_groq', 1, 'never'),
  ('pro_user', 'can_use_glm', 0, 'never'),
  ('pro_user', 'can_use_mistral', 0, 'never'),
  ('pro_user', 'can_use_agents', 1, 'never'),
  ('pro_user', 'can_use_web_search', 1, 'never'),
  ('pro_user', 'web_searches_per_day', 5, 'daily'),
  ('pro_user', 'web_searches_per_month', 150, 'monthly'),
  ('pro_user', 'total_projects', 10, 'never'),
  ('pro_user', 'total_sheets', 50, 'never'),
  ('pro_user', 'total_records', 25000, 'never'),
  ('pro_user', 'sheets_per_project', 10, 'never'),
  ('pro_user', 'records_per_sheet', 500, 'never'),
  ('pro_user', 'total_documents_bytes', 104857600, 'never'),
  ('pro_user', 'total_sticky_notes', 20, 'never'),
  ('pro_user', 'total_whiteboards', 3, 'never'),
  ('pro_user', 'news_searches_per_day', 10, 'daily'),
  ('pro_user', 'news_searches_per_month', 100, 'monthly'),

  ('max_user', 'ai_messages_per_session', 100, 'per_session'),
  ('max_user', 'daily_ai_chats', 200, 'daily'),
  ('max_user', 'monthly_ai_chats', 2000, 'monthly'),
  ('max_user', 'can_use_gemini', 1, 'never'),
  ('max_user', 'can_use_groq', 1, 'never'),
  ('max_user', 'can_use_glm', 1, 'never'),
  ('max_user', 'can_use_mistral', 1, 'never'),
  ('max_user', 'can_use_agents', 1, 'never'),
  ('max_user', 'can_use_web_search', 1, 'never'),
  ('max_user', 'web_searches_per_day', 20, 'daily'),
  ('max_user', 'web_searches_per_month', 600, 'monthly'),
  ('max_user', 'total_projects', 50, 'never'),
  ('max_user', 'total_sheets', 200, 'never'),
  ('max_user', 'total_records', 400000, 'never'),
  ('max_user', 'sheets_per_project', 20, 'never'),
  ('max_user', 'records_per_sheet', 2000, 'never'),
  ('max_user', 'total_documents_bytes', 314572800, 'never'),
  ('max_user', 'total_sticky_notes', 50, 'never'),
  ('max_user', 'total_whiteboards', 10, 'never'),
  ('max_user', 'news_searches_per_day', 30, 'daily'),
  ('max_user', 'news_searches_per_month', 300, 'monthly'),

  ('general_admin', 'admin_create_user', 1, 'never'),
  ('general_admin', 'admin_assign_user_roles', 1, 'never'),
  ('general_admin', 'admin_assign_admin_roles', 0, 'never'),
  ('general_admin', 'admin_manage_user_roles', 1, 'never'),
  ('general_admin', 'admin_manage_admin_roles', 0, 'never'),
  ('general_admin', 'admin_suspend_user', 1, 'never'),
  ('general_admin', 'admin_revoke_user', 1, 'never'),
  ('general_admin', 'admin_manage_invites', 1, 'never'),
  ('general_admin', 'admin_view_audit_logs', 0, 'never'),
  ('general_admin', 'admin_manage_plan_requests', 1, 'never'),
  ('general_admin', 'admin_manage_invite_requests', 1, 'never'),
  ('general_admin', 'admin_manage_suspension_appeals', 1, 'never'),
  ('general_admin', 'can_use_agents', 1, 'never'),
  ('general_admin', 'admin_manage_role_limits', 1, 'never'),
  ('general_admin', 'admin_manage_notification_texts', 1, 'never'),
  ('general_admin', 'admin_send_notifications', 1, 'never'),
  ('general_admin', 'admin_manage_settings', 0, 'never'),
  ('general_admin', 'news_searches_per_day', -1, 'daily'),
  ('general_admin', 'news_searches_per_month', -1, 'monthly'),

  ('super_admin', 'admin_create_user', 1, 'never'),
  ('super_admin', 'admin_assign_user_roles', 1, 'never'),
  ('super_admin', 'admin_assign_admin_roles', 1, 'never'),
  ('super_admin', 'admin_manage_user_roles', 1, 'never'),
  ('super_admin', 'admin_manage_admin_roles', 1, 'never'),
  ('super_admin', 'admin_suspend_user', 1, 'never'),
  ('super_admin', 'admin_revoke_user', 1, 'never'),
  ('super_admin', 'admin_manage_invites', 1, 'never'),
  ('super_admin', 'admin_view_audit_logs', 1, 'never'),
  ('super_admin', 'admin_manage_plan_requests', 1, 'never'),
  ('super_admin', 'admin_manage_invite_requests', 1, 'never'),
  ('super_admin', 'admin_manage_suspension_appeals', 1, 'never'),
  ('super_admin', 'can_use_agents', 1, 'never'),
  ('super_admin', 'admin_manage_role_limits', 1, 'never'),
  ('super_admin', 'admin_manage_notification_texts', 1, 'never'),
  ('super_admin', 'admin_send_notifications', 1, 'never'),
  ('super_admin', 'admin_manage_settings', 1, 'never'),
  ('super_admin', 'news_searches_per_day', -1, 'daily'),
  ('super_admin', 'news_searches_per_month', -1, 'monthly');

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('jwt_secret_key', 'scholar-dock-local-first-secret-key-do-not-use-in-cloud'),
  ('jwt_expiration_days', '30'),
  ('plan_price_general_monthly', '0'),
  ('plan_price_general_yearly', '0'),
  ('plan_price_pro_monthly', '50'),
  ('plan_price_pro_yearly', '500'),
  ('plan_price_max_monthly', '180'),
  ('plan_price_max_yearly', '1500');

"""
