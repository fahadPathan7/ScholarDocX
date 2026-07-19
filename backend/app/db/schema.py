from app.core.notifications import default_notification_settings_json


SEED_SQL = """
INSERT INTO degree_workspaces (degree_type, display_name, enabled)
VALUES
  ('bachelors', 'Bachelor''s', 1),
  ('masters', 'Master''s', 1),
  ('phd', 'PhD', 1)
ON CONFLICT (degree_type) DO NOTHING;

-- NOTE: SCHOLARDOCX-0140 — no default admin user is auto-seeded. A committed
-- account with a publicly-known password hash was a security risk. Super admins
-- are created explicitly via scripts/create_superadmin.py (which now prompts
-- for credentials) after a fresh DB init. Only global reference data
-- (degree_workspaces, role_limits, app_settings, ai_models, ai_token_packs)
-- is seeded here / by initialize_database().

-- NOTE: role_limits are NO LONGER seeded here. SCHOLARDOCX-0140 consolidated
-- role-limit defaults into a single source of truth: DEFAULT_ROLE_LIMITS in
-- app/services/admin.py. initialize_database() seeds them via
-- _seed_role_limits(). This removes the dual-source drift that previously left
-- admin roles missing features (admin_view_dashboard,
-- admin_manage_invite_requests, admin_send_notifications,
-- admin_manage_role_limits, etc.).

-- NOTE: jwt_secret_key is intentionally NOT seeded here. It is generated as a
-- strong random value per install in initialize_database() so the signing key
-- is never a committed, publicly-known constant.
INSERT INTO app_settings (key, value) VALUES
  ('jwt_expiration_days', '30'),
  ('plan_price_general_monthly', '0'),
  ('plan_price_general_quarterly', '0'),
  ('plan_price_pro_monthly', '50'),
  ('plan_price_pro_quarterly', '500'),
  ('plan_price_max_monthly', '180'),
  ('plan_price_max_quarterly', '1500'),
  ('plan_ai_credits_free', '0'),
  ('plan_ai_credits_general', '500000'),
  ('plan_ai_credits_pro', '2000000'),
  ('plan_ai_credits_max', '5000000'),
  ('plan_is_active_free', '1'),
  ('plan_is_active_general', '1'),
  ('plan_is_active_pro', '1'),
  ('plan_is_active_max', '1'),
  ('ai_token_rate_tokens_per_dollar', '10000'),
  ('tavily_call_cost_usd', '0.01')
ON CONFLICT (key) DO NOTHING;

"""
