import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { hasRole } from "../lib/auth";
import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  KeyRound,
  FileClock,
  Shield,
  Bell,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  HardDrive,
  X,
  Info,
  Settings,
  Eye,
  EyeOff,
  Copy,
  Check,
  FileText,
  Globe,
  StickyNote,
  Presentation,
  FileSpreadsheet,
  Database,
  Search,
  Coins,
  Package,
  CircleDollarSign,
  ChevronDown,
  ChevronUp,
  Zap
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { notificationCategories } from "../config/notificationLabels";
import { PlanRequestsTab as PlanRequestsReviewTab } from "./admin/PlanRequestsTab";
import { UsersTab } from "./admin/UsersTab";
import { ModelPricingTab } from "./admin/ModelPricingTab";
import { TokenPacksTab } from "./admin/TokenPacksTab";
import { TokenPurchaseRequestsTab } from "./admin/TokenPurchaseRequestsTab";
import { buildNotification, notificationTemplates } from "../config/notificationCatalog";
import { emitUiError } from "../lib/uiError";
import { useDialog } from "./DialogProvider";
import { Modal } from "./Modal";
import "../admin.css";

/** Compact token formatter for admin displays (e.g. 500K, 1.2M). */
function formatTokenCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

function AdminPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const root = document.getElementById('admin-view-root');
  if (!root) return null;
  return createPortal(children, root);
}

function DashboardTab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [isRegistrationsOpen, setIsRegistrationsOpen] = useState(false);
  const [isLoginsOpen, setIsLoginsOpen] = useState(false);

  useEffect(() => {
    api.get<any>("/admin/dashboard").then(setStats).catch(console.error);
  }, []);

  if (!stats) return <div className="admin-dashboard-loading">Loading dashboard...</div>;

  const statCards = [
    {
      label: "Total Users",
      value: stats.counts.total_users,
      icon: Users,
      tone: "indigo"
    },
    {
      label: "Active (30d)",
      value: stats.counts.active_users,
      icon: CheckCircle,
      tone: "emerald"
    },
    {
      label: "Invite Requests",
      value: stats.counts.pending_invite_requests || 0,
      icon: KeyRound,
      tone: "amber"
    },
    {
      label: "Plan Requests",
      value: stats.counts.pending_plan_requests || 0,
      icon: FileClock,
      tone: "purple"
    },
    {
      label: "Credit Requests",
      value: stats.counts.pending_credit_requests || 0,
      icon: Coins,
      tone: "amber"
    },
    {
      label: "Suspension Appeals",
      value: stats.counts.pending_appeals || 0,
      icon: ShieldAlert,
      tone: "rose"
    },
    {
      label: "Total Projects",
      value: stats.counts.total_projects,
      icon: LayoutDashboard,
      tone: "blue"
    },
    {
      label: "Total Sheets",
      value: stats.counts.total_sheets || 0,
      icon: FileSpreadsheet,
      tone: "emerald"
    },
    {
      label: "Total Documents",
      value: stats.counts.total_documents || 0,
      icon: FileText,
      tone: "indigo"
    },
    {
      label: "Total Sticky Notes",
      value: stats.counts.total_sticky_notes || 0,
      icon: StickyNote,
      tone: "amber"
    },
    {
      label: "Total Whiteboards",
      value: stats.counts.total_whiteboards || 0,
      icon: Presentation,
      tone: "rose"
    },
    {
      label: "Total Records",
      value: stats.counts.total_records || 0,
      icon: Database,
      tone: "blue"
    },
    {
      label: "Storage Used",
      value: (
        <>
          {((stats.counts.storage_bytes || 0) / 1024 / 1024).toFixed(2)}
          <span>MB</span>
        </>
      ),
      icon: HardDrive,
      tone: "amber"
    },
    {
      label: "AI Credits Used",
      value: formatTokenCount(stats.counts.total_ai_tokens || 0),
      icon: Zap,
      tone: "purple"
    }
  ];

  return (
    <div className="admin-dashboard-tab animate-in fade-in duration-300">
      <div className="admin-dashboard-stat-grid">
        {statCards.map((card) => {
          const isHighlightable = ["Invite Requests", "Plan Requests", "Credit Requests", "Suspension Appeals"].includes(card.label);
          const hasValue = typeof card.value === 'number' && card.value > 0;
          return (
            <div key={card.label} className={`admin-dashboard-stat-card admin-dashboard-stat-card--${card.tone}`}>
              <div className="admin-dashboard-stat-card__header">
                <div className="admin-dashboard-stat-card__icon">
                  <card.icon size={19} />
                </div>
                <p>{card.label}</p>
              </div>
              {isHighlightable && hasValue ? (
                <div className="flex items-center justify-between mt-1">
                  <p 
                    className="admin-dashboard-stat-card__value text-white px-4 py-0.5 rounded-xl shadow-md animate-[pulse_2s_ease-in-out_infinite]"
                    style={{ backgroundColor: "var(--admin-stat-color)" }}
                  >
                    {card.value}
                  </p>
                  <button 
                    onClick={() => {
                      if (!onNavigate) return;
                      if (card.label === "Invite Requests") onNavigate("invite_requests");
                      else if (card.label === "Plan Requests") onNavigate("plan_requests");
                      else if (card.label === "Credit Requests") onNavigate("token_purchase_requests");
                      else if (card.label === "Suspension Appeals") onNavigate("suspension_appeals");
                    }}
                    className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg shadow-sm hover:opacity-80 transition-opacity cursor-pointer border-none"
                    style={{ backgroundColor: "var(--admin-stat-bg)", color: "var(--admin-stat-color)" }}
                  >
                    Needs Action
                  </button>
                </div>
              ) : (
                <p className="admin-dashboard-stat-card__value">{card.value}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="admin-dashboard-panel admin-dashboard-panel--full-width mt-4 mb-4">
        <div className="admin-dashboard-panel__header">
          <div>
            <Zap size={16} />
            <h3>10-Day AI Credit Usage</h3>
          </div>
        </div>
        <div className="admin-dashboard-chart-wrap" style={{ height: 250, padding: "16px 20px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.ai_usage_10d || []}>
              <defs>
                <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" minTickGap={0} interval="preserveStartEnd" tick={{ fill: "var(--ui-text-dim)", fontSize: 10 }} tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatTokenCount} tick={{ fill: "var(--ui-text-dim)", fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip 
                contentStyle={{ backgroundColor: "var(--ui-bg-panel)", border: "1px solid var(--ui-border)", borderRadius: "8px", color: "var(--ui-text)" }}
                itemStyle={{ color: "#8b5cf6" }}
              />
              <Area type="monotone" dataKey="tokens" name="AI Credits" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorTokens)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="admin-dashboard-activity-grid">
        <div className="admin-dashboard-panel self-start">
          <div className="admin-dashboard-panel__header cursor-pointer select-none" onClick={() => setIsRegistrationsOpen(!isRegistrationsOpen)}>
            <div>
              <Users size={16} />
              <h3>Recent Registrations</h3>
            </div>
            <div className="flex items-center gap-2 text-sm text-ui-text-dim">
              <span>Showing latest {stats.recent_registrations.length}</span>
              {isRegistrationsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
          {isRegistrationsOpen && (
            <div className="admin-dashboard-table-wrap">
              <table className="admin-dashboard-table">
                <thead>
                  <tr><th>Email</th><th className="text-right">Time</th></tr>
                </thead>
                <tbody>
                  {stats.recent_registrations.map((u: any) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td className="text-right">
                        <span className="admin-dashboard-time"><Clock size={14} /> {new Date(u.created_at + 'Z').toLocaleString("en-GB")}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.recent_registrations.length === 0 && (
                <div className="admin-dashboard-empty">No new registrations yet.</div>
              )}
            </div>
          )}
        </div>

        <div className="admin-dashboard-panel self-start">
          <div className="admin-dashboard-panel__header cursor-pointer select-none" onClick={() => setIsLoginsOpen(!isLoginsOpen)}>
            <div>
              <Clock size={16} />
              <h3>Recent Logins</h3>
            </div>
            <div className="flex items-center gap-2 text-sm text-ui-text-dim">
              <span>Showing latest {stats.recent_logins.length}</span>
              {isLoginsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
          {isLoginsOpen && (
            <div className="admin-dashboard-table-wrap">
              <table className="admin-dashboard-table">
                <thead>
                  <tr><th>Email</th><th className="text-right">Time</th></tr>
                </thead>
                <tbody>
                  {stats.recent_logins.map((u: any) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td className="text-right">
                        <span className="admin-dashboard-time"><Clock size={14} /> {new Date(u.last_login_at + 'Z').toLocaleString("en-GB")}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.recent_logins.length === 0 && (
                <div className="admin-dashboard-empty">No recent logins yet.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LimitsTab({ onLimitsUpdated }: { onLimitsUpdated?: () => void }) {
  const { showConfirm } = useDialog();
  type RoleFeature = {
    key: string;
    label: string;
    description: string;
    format?: (v: number) => string;
  };

  type RoleFeatureGroup = {
    name: string;
    features: RoleFeature[];
  };

  const [limits, setLimits] = useState<any[]>([]);
  const [editingLimit, setEditingLimit] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const isSuperAdmin = hasRole("super_admin");
  const availableRoles = isSuperAdmin
    ? ["free_user", "general_user", "pro_user", "max_user", "general_admin", "super_admin"]
    : ["free_user", "general_user", "pro_user", "max_user"];

  const fetchLimits = () => {
    api.get<any[]>("/admin/limits").then(setLimits).catch(console.error);
  };

  useEffect(() => {
    fetchLimits();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.patch(`/admin/limits/${editingLimit.role}/${editingLimit.feature}`, {
        limit_count: parseInt(editingLimit.limit_count)
      });
      setEditingLimit(null);
      fetchLimits();
      onLimitsUpdated?.();
    } catch (err: any) {
      emitUiError({ title: "Permission denied", message: "Failed to update limit. Ensure you have the required permissions.", kind: "permission" });
    }
  };

  const handleResetRoleLimits = async () => {
    if (!selectedRole || isResetting) return;
    const confirmed = await showConfirm(
      `Reset all limits and permissions for ${selectedRole.replace('_', ' ')} to default values?`,
      "Confirm Reset"
    );
    if (!confirmed) return;

    try {
      setIsResetting(true);
      await api.post(`/admin/limits/${selectedRole}/reset`, {});
      fetchLimits();
      onLimitsUpdated?.();
    } catch (err: any) {
      emitUiError({ title: "Permission denied", message: "Failed to reset role limits. Ensure you have the required permissions.", kind: "permission" });
    } finally {
      setIsResetting(false);
    }
  };

  // Feature information for the info modal
  const featureInfo: Record<string, { description: string; resetInfo: string; example: string }> = {
    can_use_agents: {
      description: "Controls whether a user can access AI agentic features like automated project creation, data retrieval operations, and advanced AI workflows.",
      resetInfo: "This is a permission setting, not a consumable limit. It does not reset.",
      example: "When enabled, users can use AI agents to create projects, retrieve data, and perform complex multi-step operations. When disabled, users can only use basic chat."
    },
    ai_messages_per_session: {
      description: "Limits the number of AI chat messages a user can send in a single conversation session.",
      resetInfo: "Resets when the user starts a new conversation or closes the current chat session.",
      example: "If limit is 10, user can send 10 messages per conversation. Starting a new conversation resets the counter to 0."
    },
    ai_tokens_per_month: {
      description: "Monthly AI credit grant for this role. Each model call is metered at the model's per-1M-token input/output price and deducted from this allowance as credits (at the configurable credits-per-dollar rate).",
      resetInfo: "Resets on the 1st of each month at midnight UTC. Unused subscription credits do NOT roll over. Purchased credits (bought via packs) never expire and are consumed after this allowance.",
      example: "If the allowance is 500,000 credits, the user can spend up to that much metered AI usage this month. When it runs out, actions are blocked until they buy more credits or the allowance resets."
    },
    web_searches_per_day: {
      description: "Limits the number of web search requests per day.",
      resetInfo: "Resets daily at midnight UTC (00:00 UTC).",
      example: "If limit is 5, user can perform 5 web searches today. Counter resets at midnight UTC."
    },
    web_searches_per_month: {
      description: "Limits the total number of web search requests in a calendar month.",
      resetInfo: "Resets on the 1st of each month at midnight UTC.",
      example: "If limit is 150, user can perform 150 web searches this month. Counter resets on the 1st of next month."
    },
    news_searches_per_day: {
      description: "Limits the number of Scholarship Hunt searches per day.",
      resetInfo: "Resets daily at midnight UTC (00:00 UTC).",
      example: "If limit is 50, the user can run 50 scholarship hunts today. Counter resets at midnight UTC."
    },
    news_searches_per_month: {
      description: "Limits the total number of Scholarship Hunt searches in a calendar month.",
      resetInfo: "Resets on the 1st of each month at midnight UTC.",
      example: "If limit is 500, the user can run 500 scholarship hunts this month. Counter resets on the 1st of next month."
    },
    total_projects: {
      description: "Limits the total number of projects a user can create.",
      resetInfo: "Never resets. This is a cumulative limit.",
      example: "If limit is 3, user can create up to 3 projects total. Deleting a project does NOT free up quota."
    },
    total_sheets: {
      description: "Limits the total number of sheets a user can create across all projects.",
      resetInfo: "Never resets. This is a cumulative limit.",
      example: "If limit is 10, user can create up to 10 sheets total. Deleting a sheet does NOT free up quota."
    },
    total_records: {
      description: "Limits the total number of records across ALL sheets. Prevents database bloat.",
      resetInfo: "Never resets, but deleting records DOES free up quota.",
      example: "If limit is 1,000, user can have up to 1,000 records total across all sheets. Deleting 10 records frees up 10 quota."
    },
    sheets_per_project: {
      description: "Limits the number of sheets within a single project.",
      resetInfo: "Never resets. This is a per-project limit.",
      example: "If limit is 5, each project can have up to 5 sheets. User can still create multiple projects."
    },
    records_per_sheet: {
      description: "Limits the number of records within a single sheet.",
      resetInfo: "Never resets, but deleting records DOES free up quota.",
      example: "If limit is 100, each sheet can have up to 100 records. Deleting records in that sheet frees up quota."
    },
    total_documents_bytes: {
      description: "Limits the total storage space for uploaded documents (PDFs, images, etc.).",
      resetInfo: "Never resets, but deleting documents DOES free up quota.",
      example: "If limit is 50 MB, user can upload up to 50 MB of documents total. Deleting a 5 MB file frees up 5 MB."
    },
    total_sticky_notes: {
      description: "Limits the total number of sticky notes a user can create.",
      resetInfo: "Never resets. This is a cumulative limit.",
      example: "If limit is 20, user can create up to 20 sticky notes total. Deleting notes does NOT free up quota."
    },
    total_whiteboards: {
      description: "Limits the total number of whiteboards a user can create.",
      resetInfo: "Never resets. This is a cumulative limit.",
      example: "If limit is 10, user can create up to 10 whiteboards total. Deleting whiteboards does NOT free up quota."
    }
  };

  // Feature grouping and display names
  const featureGroups: RoleFeatureGroup[] = [
    {
      name: "AI Chat",
      features: [
        { key: "ai_messages_per_session", label: "Maximum AI Messages Per Session", description: "Limits the number of AI messages a user can send in a single conversation session." }
      ]
    },
    {
      name: "AI Credits",
      features: [
        { key: "ai_tokens_per_month", label: "Monthly AI Credit Allowance", format: (v: number) => v === -1 ? "Unlimited" : formatTokenCount(v), description: "Monthly AI credit grant for this role. Each model call is metered at its per-1M-token price and deducted as credits. Resets monthly with no rollover; purchased credits (never expire) are used after this allowance." },
        { key: "can_purchase_token_packs", label: "Can Purchase Extra AI Credit Packs", description: "Controls whether users on this plan can buy extra AI credit packs (Small / Medium / Large). Default ON for Pro and Max, OFF for Free and General. When OFF, the Buy Credits flow shows an upgrade upsell instead of the pack list." }
      ]
    },
    {
      name: "AI Models",
      features: [
        { key: "can_use_glm", label: "Can Use GLM Models", description: "Allows users to access GLM AI models (GLM-5.2, GLM-5.1, GLM-5, GLM-4.7, etc.)." },
        { key: "can_use_gemini", label: "Can Use Gemini Models", description: "Allows users to access Google Gemini AI models (gemini-2.5-flash, gemini-2.5-flash-lite)." },
        { key: "can_use_groq", label: "Can Use Groq Models", description: "Allows users to access Groq-hosted models (Llama, Qwen, GPT-OSS, etc.)." },
        { key: "can_use_mistral", label: "Can Use Mistral Models", description: "Allows users to access Mistral AI models (mistral-large, mistral-medium, devstral)." }
      ]
    },
    {
      name: "AI Agent Capabilities",
      features: [
        { key: "can_use_agents", label: "Can Use AI Agents", description: "Controls whether users can access AI agentic features like automated project creation, data retrieval operations, and advanced AI workflows." }
      ]
    },
    {
      name: "Advisor Atlas",
      features: [
        { key: "can_use_advisor_atlas", label: "Can Use Advisor Atlas", description: "Controls whether users can access Advisor Atlas, the supervisor intelligence workspace. Default ON for Pro and Max, OFF for Free and General. Ineligible users see a locked tab that routes to Choose Plan." }
      ]
    },
    {
      name: "Web Search",
      features: [
        { key: "can_use_web_search", label: "Can Use Web Search", description: "Controls whether users can enable web search in AI chat research mode." },
        { key: "web_searches_per_day", label: "Maximum Daily Web Searches", description: "Limits the number of web search requests per day." },
        { key: "web_searches_per_month", label: "Maximum Monthly Web Searches", description: "Limits the total number of web search requests in a calendar month." }
      ]
    },
    {
      name: "Scholarship Hunt",
      features: [
        { key: "news_searches_per_day", label: "Maximum Scholarship Hunt Searches Per Day", description: "Limits the number of Scholarship Hunt searches per day." },
        { key: "news_searches_per_month", label: "Maximum Scholarship Hunt Searches Per Month", description: "Limits the total number of Scholarship Hunt searches in a calendar month." }
      ]
    },
    {
      name: "Projects & Sheets",
      features: [
        { key: "total_projects", label: "Maximum Total Projects", description: "Limits the total number of projects a user can create." },
        { key: "total_sheets", label: "Maximum Total Sheets", description: "Limits the total number of sheets a user can create across all projects." },
        { key: "total_records", label: "Maximum Total Records", description: "Limits the total number of records across all sheets. Deleting records DOES free up quota." },
        { key: "sheets_per_project", label: "Maximum Sheets Per Project", description: "Limits the number of sheets within a single project." },
        { key: "records_per_sheet", label: "Maximum Records Per Sheet", description: "Limits the number of records within a single sheet. Deleting records frees up quota." }
      ]
    },
    {
      name: "Storage & Content",
      features: [
        { key: "total_documents_bytes", label: "Maximum Document Storage", format: (v: number) => v === -1 ? "Unlimited" : `${Math.round(v / (1024 * 1024))} MB`, description: "Limits the total storage space for uploaded documents (PDFs, images, etc.). Deleting documents DOES free up quota." },
        { key: "total_sticky_notes", label: "Maximum Sticky Notes", description: "Limits the total number of sticky notes a user can create." },
        { key: "total_whiteboards", label: "Maximum Whiteboards", description: "Limits the total number of whiteboards a user can create." }
      ]
    }
  ];

  const adminFeatureGroups: RoleFeatureGroup[] = [
    {
      name: "User Management",
      features: [
        { key: "admin_create_user", label: "Can Create Users", description: "Allows creating new user accounts with email, password, and assigned roles." },
        { key: "admin_assign_user_roles", label: "Can Edit Individual User To User Role", description: "Allows changing a user's role to user-level roles (Free User, General User, Pro User, Max User)." },
        { key: "admin_assign_admin_roles", label: "Can Edit Individual User To Admin Role", description: "Allows changing a user's role to admin-level roles (General Admin, Super Admin)." },
        { key: "admin_suspend_user", label: "Can Suspend Users", description: "Allows suspending or activating user accounts to control their access." },
        { key: "admin_revoke_user", label: "Can Revoke User Tokens", description: "Allows revoking all active sessions for a user, forcing them to log in again." }
      ]
    },
    {
      name: "Role Management",
      features: [
        { key: "admin_manage_user_roles", label: "Can View Role Limits", description: "Allows editing limits and quotas for user-level roles (Free User, General User, Pro User, Max User)." },
        { key: "admin_manage_role_limits", label: "Can Manage Role Limits", description: "Allows opening the Role Limits section and viewing role-limit settings and admin permission toggles." },
        { key: "admin_manage_admin_roles", label: "Can Manage Admin Roles", description: "Allows editing permissions for admin-level roles." }
      ]
    },
    {
      name: "System Configuration",
      features: [
        { key: "admin_manage_invites", label: "Can Manage Invite Codes", description: "Allows generating and managing invite codes for new user registration." },
        { key: "admin_manage_invite_requests", label: "Can Manage Invite Requests", description: "Allows approving or rejecting user invite requests." },
        { key: "admin_manage_plan_requests", label: "Can Manage Plan Requests", description: "Allows approving or rejecting user plan upgrade and extension requests." },
        { key: "admin_manage_token_requests", label: "Can Manage Credit Purchase Requests", description: "Allows approving or rejecting user requests to buy AI Extra Credit packs. Model pricing and pack configuration remain super-admin only." },
        { key: "admin_manage_suspension_appeals", label: "Can Manage Suspension Appeals", description: "Allows reviewing and resolving user suspension appeals." },
        { key: "admin_manage_notification_texts", label: "Can Manage Notification Texts", description: "Allows editing system-wide notification message templates." },
        { key: "admin_send_notifications", label: "Can Send Notifications", description: "Allows sending categorized notifications to all users, filtered groups, or specific users." },
        { key: "admin_manage_settings", label: "Can Manage App Settings", description: "Allows editing global application settings." },
        { key: "admin_view_audit_logs", label: "Can View Audit Logs", description: "Allows viewing system audit logs tracking all administrative actions." }
      ]
    }
  ];

  const formatRole = (r: string) => r.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const filteredLimits = selectedRole ? limits.filter(l => l.role === selectedRole) : [];
  const isAdminRole = selectedRole?.endsWith('_admin');
  const groups = isAdminRole ? adminFeatureGroups : featureGroups;

  const getLimitByFeature = (featureKey: string) => {
    return filteredLimits.find(l => l.feature === featureKey);
  };

  const getFeatureLabel = (featureKey: string) => {
    const allGroups = [...featureGroups, ...adminFeatureGroups];
    for (const group of allGroups) {
      const feature = group.features.find(f => f.key === featureKey);
      if (feature) return feature.label;
    }
    return featureKey.replace(/_/g, ' ');
  };

  const getFeatureDescription = (featureKey: string) => {
    const allGroups = [...featureGroups, ...adminFeatureGroups];
    for (const group of allGroups) {
      const feature = group.features.find(f => f.key === featureKey);
      if (feature) return feature.description || '';
    }
    return '';
  };

  const userRoles = availableRoles.filter(r => !r.endsWith('_admin'));
  const adminRoles = availableRoles.filter(r => r.endsWith('_admin'));

  return (
    <div className="h-full flex flex-col space-y-8 animate-in fade-in duration-300 overflow-y-auto pr-2">
      <div>
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 ml-1">User Roles</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 shrink-0">
          {userRoles.map(role => (
            <button 
              key={role}
              onClick={() => setSelectedRole(role)}
              className="flex items-center gap-3 profile-system-card glass-panel hover:border-indigo-300 hover:shadow-md transition-all group text-left" style={{ padding: '20px' }}
            >
              <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Shield size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 capitalize">{role.replace('_', ' ')}</p>
                <p className="text-xs text-slate-500 mt-0.5">Manage limits for this role</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {adminRoles.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 ml-1">Admin Roles</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 shrink-0">
            {adminRoles.map(role => (
              <button 
                key={role}
                onClick={() => setSelectedRole(role)}
                className="flex items-center gap-3 profile-system-card glass-panel hover:border-emerald-300 hover:shadow-md transition-all group text-left" style={{ padding: '20px' }}
              >
                <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Shield size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 capitalize">{role.replace('_', ' ')}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Manage permissions for this role</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedRole && (
        <AdminPortal>
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-12 backdrop-blur-[10px]" style={{ background: 'rgba(30, 41, 37, 0.22)' }} onClick={() => setSelectedRole(null)}>
            <div className="modal-panel shadow-2xl flex flex-col mx-4" style={{ width: '900px', maxWidth: '95vw', maxHeight: '85vh', padding: '0' }} onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-200 shrink-0 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Role Limits</p>
                  <h2 className="text-2xl font-bold text-slate-800 capitalize mt-1">{selectedRole.replace('_', ' ')}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {!isAdminRole && (
                    <button
                      onClick={() => setShowInfo(true)}
                      className="p-2 hover:bg-indigo-50 rounded-lg transition-colors text-indigo-600"
                      title="View reset period information"
                    >
                      <Info size={20} />
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedRole(null)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Close"
                  >
                    <X size={20} className="text-slate-500" />
                  </button>
                </div>
              </div>
              
              <div className="overflow-y-auto flex-1 p-6 space-y-6">
                {groups.map((group, groupIdx) => (
                  <div key={groupIdx} className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                      <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                      {group.name}
                    </h3>
                    <div className="space-y-3">
                      {group.features.map((feature) => {
                        const limit = getLimitByFeature(feature.key);
                        if (!limit) return null;

                        const isBooleanFeature = feature.key.startsWith('admin_') || feature.key.startsWith('can_');
                        const displayValue = isBooleanFeature
                          ? (limit.limit_count === 1 ? "Enabled" : "Disabled")
                          : (limit.limit_count === -1 ? "Unlimited" : (feature.format ? feature.format(limit.limit_count) : limit.limit_count));

                        return (
                          <div key={feature.key} className="bg-white rounded-lg p-4 border border-slate-200 flex items-center justify-between hover:border-indigo-200 transition-colors">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-800">{feature.label}</p>
                              {!isBooleanFeature && (
                                <p className="text-xs text-slate-500 mt-1 capitalize">
                                  Resets: {limit.reset_period.replace('_', ' ')}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                                isBooleanFeature
                                  ? (limit.limit_count === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')
                                  : (limit.limit_count === -1 ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700')
                              }`}>
                                {displayValue}
                              </span>
                              <button
                                onClick={() => setEditingLimit({ ...limit })}
                                className="px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
                <button
                  onClick={handleResetRoleLimits}
                  disabled={isResetting}
                  className="px-5 py-2.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isResetting ? "Resetting..." : "Reset to Default"}
                </button>
                <button
                  onClick={() => setSelectedRole(null)}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </AdminPortal>
      )}

      {editingLimit && (
        <AdminPortal>
          <div className="absolute inset-0 z-[60] flex items-start justify-center pt-24 backdrop-blur-[10px]" style={{ background: 'rgba(30, 41, 37, 0.22)' }} onClick={() => setEditingLimit(null)}>
            <form className="modal-panel shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={handleSave}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Feature Limits</p>
                  <h2>Edit Limit</h2>
                </div>
                <button className="icon-button" type="button" onClick={() => setEditingLimit(null)} title="Close form">
                  <X size={20} />
                </button>
              </div>

            <div className="modal-content form-grid">
              <div className="mb-0.5 p-3 bg-slate-50 rounded-lg border border-slate-100 flex flex-col gap-1" style={{ gridColumn: '1 / -1' }}>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target</span>
                <span className="text-sm font-medium text-slate-700 capitalize">{editingLimit.role.replace('_', ' ')}</span>
              </div>

              <div className="mb-0.5 p-3 bg-slate-50 rounded-lg border border-slate-100 flex flex-col gap-1" style={{ gridColumn: '1 / -1' }}>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Feature</span>
                <span className="text-sm font-medium text-slate-700">{getFeatureLabel(editingLimit.feature)}</span>
              </div>

              <div className="mb-1 p-3 bg-indigo-50 rounded-lg border border-indigo-100 flex flex-col gap-1" style={{ gridColumn: '1 / -1' }}>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Description</span>
                <span className="text-sm text-slate-700">{getFeatureDescription(editingLimit.feature)}</span>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                {editingLimit.feature.startsWith('admin_') || editingLimit.feature.startsWith('can_') ? (
                  <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-white">
                    <div>
                      <h4 className="text-sm font-medium text-slate-900">Enable Permission</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Allow this role to use this feature.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={editingLimit.limit_count === 1}
                        onChange={(e) => setEditingLimit({ ...editingLimit, limit_count: e.target.checked ? 1 : 0 })}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Limit Count <span className="text-slate-400 font-normal">(-1 for unlimited)</span></label>
                    <input
                      type="number"
                      value={editingLimit.limit_count}
                      onChange={(e) => setEditingLimit({ ...editingLimit, limit_count: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow mb-4"
                    />

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-sm font-medium text-slate-700">Reset Period</span>
                      <span className="text-sm text-slate-600 font-semibold capitalize bg-white px-3 py-1.5 rounded-md border border-slate-200">
                        {editingLimit.reset_period.replace('_', ' ')}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setEditingLimit(null)} className="secondary">
                Cancel
              </button>
              <button type="submit" className="primary">
                Save Changes
              </button>
            </div>
          </form>
        </div>
        </AdminPortal>
      )}

      {showInfo && (
        <AdminPortal>
          <div className="absolute inset-0 z-[70] flex items-start justify-center pt-24 backdrop-blur-[10px]" style={{ background: 'rgba(30, 41, 37, 0.22)' }} onClick={() => setShowInfo(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full mx-4" style={{ width: '600px', maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-200 shrink-0 flex items-center justify-between">
                <div>
                  <p className="eyebrow">Role Limits</p>
                  <h2 className="text-xl font-bold text-slate-800 mt-1">Reset Periods</h2>
                </div>
                <button
                  onClick={() => setShowInfo(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="p-6 space-y-3">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-2">Per Session</h3>
                  <p className="text-xs text-slate-600">Resets when the user starts a new conversation or closes the current chat session.</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-2">Daily</h3>
                  <p className="text-xs text-slate-600">Resets every day at midnight UTC (00:00 UTC).</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-2">Weekly</h3>
                  <p className="text-xs text-slate-600">Resets every week on Sunday at midnight UTC.</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-2">Monthly</h3>
                  <p className="text-xs text-slate-600">Resets on the 1st of every month at midnight UTC.</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-2">Yearly</h3>
                  <p className="text-xs text-slate-600">Resets on January 1st at midnight UTC.</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-2">Never</h3>
                  <p className="text-xs text-slate-600">Does not reset. This is a cumulative or permanent limit.</p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
                <button
                  onClick={() => setShowInfo(false)}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </AdminPortal>
      )}
    </div>
  );
}

function InvitesTab() {
  const { showConfirm } = useDialog();
  const [invites, setInvites] = useState<any[]>([]);
  const [maxUses, setMaxUses] = useState(1);
  const [expirationHours, setExpirationHours] = useState<number>(24);
  const [viewUsagesCode, setViewUsagesCode] = useState<string | null>(null);
  const [usages, setUsages] = useState<any[]>([]);
  const [loadingUsages, setLoadingUsages] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const visibleInvites = useMemo<any[]>(() => {
    if (!searchQuery) return invites;
    const lowerQ = searchQuery.toLowerCase();
    return invites.filter(inv => inv.code.toLowerCase().includes(lowerQ));
  }, [invites, searchQuery]);

  const fetchInvites = () => {
    api.get<any[]>("/admin/invites").then(setInvites).catch(console.error);
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/admin/invites", { max_uses: maxUses, expiration_hours: expirationHours });
      fetchInvites();
    } catch (err) {
      emitUiError({ title: "Action failed", message: "Failed to create invite.", kind: "general" });
    }
  };

  const handleDelete = async (code: string) => {
    const confirmed = await showConfirm(
      `Are you sure you want to delete invite code "${code}"?`,
      "Confirm Delete"
    );
    if (!confirmed) return;
    try {
      await api.delete(`/admin/invites/${code}`);
      fetchInvites();
    } catch (err) {
      emitUiError({ title: "Action failed", message: "Failed to delete invite.", kind: "general" });
    }
  };

  const handleViewUsages = async (code: string) => {
    setViewUsagesCode(code);
    setLoadingUsages(true);
    setUsages([]);
    try {
      const res = await api.get<any[]>(`/admin/invites/${code}/usages`);
      setUsages(res);
    } catch (err) {
      emitUiError({ title: "Failed to fetch usages", message: "Could not load invite code usages.", kind: "general" });
    } finally {
      setLoadingUsages(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-300">
      <div className="shrink-0 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <KeyRound size={18} className="text-amber-500" />
          Generate New Invite Code
        </h3>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-end gap-4">
          <div className="w-full sm:w-56">
            <label className="block text-sm font-medium text-slate-700 mb-1 whitespace-nowrap">Max Uses <span className="text-slate-400 font-normal">(0 for unlimited)</span></label>
            <input
              type="number"
              min="0"
              value={maxUses}
              onChange={e => setMaxUses(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
            />
          </div>
          <div className="w-full sm:w-56">
            <label className="block text-sm font-medium text-slate-700 mb-1 whitespace-nowrap">Expiration Hours <span className="text-slate-400 font-normal">(0 for never)</span></label>
            <input
              type="number"
              value={expirationHours}
              onChange={e => setExpirationHours(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
              min="0"
            />
          </div>
          <button type="submit" className="w-full sm:w-auto px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap">
            Generate Code
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200/50 bg-transparent shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200/50 rounded-xl text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
            />
          </div>
          <button onClick={fetchInvites} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
            Refresh
          </button>
        </div>
        <div className="overflow-auto flex-1 bg-white relative">
          <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-semibold">Code</th>
                <th className="px-6 py-4 font-semibold text-center">Uses</th>
                <th className="px-6 py-4 font-semibold text-center">Max Uses</th>
                <th className="px-6 py-4 font-semibold text-right">Created At</th>
                <th className="px-6 py-4 font-semibold text-right">Expires At</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleInvites.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-2">
                    <span className="font-mono text-indigo-700 font-bold tracking-widest bg-indigo-50 px-3 py-1 rounded border border-indigo-100">{inv.code}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(inv.code);
                        setCopiedCode(inv.code);
                        setTimeout(() => setCopiedCode(null), 2000);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title={copiedCode === inv.code ? "Copied!" : "Copy Code"}
                    >
                      {copiedCode === inv.code ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center text-slate-700 font-medium">{inv.used_count}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${inv.max_uses === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                      {inv.max_uses === 0 ? "Unlimited" : inv.max_uses}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500 text-xs">{new Date(inv.created_at).toLocaleString("en-GB")}</td>
                  <td className="px-6 py-4 text-right text-slate-500 text-xs">
                    {inv.expires_at ? (
                      <span className={new Date(inv.expires_at) < new Date() ? 'text-red-500 font-medium' : ''}>
                        {new Date(inv.expires_at).toLocaleString("en-GB")}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">Never</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-1">
                    <button onClick={() => handleViewUsages(inv.code)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="View Usages">
                      <Eye size={16} />
                    </button>
                    <button onClick={() => handleDelete(inv.code)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete Code">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {viewUsagesCode && (
        <AdminPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setViewUsagesCode(null)}></div>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative animate-in zoom-in-95 duration-200">
              <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <KeyRound className="text-indigo-500" size={20} />
                  Usages for "{viewUsagesCode}"
                </h3>
                <button onClick={() => setViewUsagesCode(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                {loadingUsages ? (
                  <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  </div>
                ) : usages.length === 0 ? (
                  <div className="text-center p-8 text-slate-500">
                    <p>No usages found for this invite code.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[60vh]">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 font-semibold rounded-tl-lg">User Email</th>
                          <th className="px-4 py-3 font-semibold rounded-tr-lg text-right">Registered At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {usages.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-slate-700">{u.email}</td>
                            <td className="px-4 py-3 text-right text-slate-500 text-xs">
                              {new Date(u.created_at).toLocaleString("en-GB")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setViewUsagesCode(null)}
                  className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </AdminPortal>
      )}
    </div>
  );
}

function AuditLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const visibleLogs = useMemo<any[]>(() => {
    if (!searchQuery) return logs;
    const lowerQ = searchQuery.toLowerCase();
    return logs.filter(log => 
      (log.user_email || "").toLowerCase().includes(lowerQ) || 
      String(log.user_id || "").includes(lowerQ) ||
      log.action.toLowerCase().includes(lowerQ)
    );
  }, [logs, searchQuery]);

  useEffect(() => {
    api.get<any[]>("/admin/audit-logs").then(setLogs).catch(console.error);
  }, []);

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      <div className="profile-system-card glass-panel flex-1 flex flex-col min-h-0 overflow-hidden" style={{ padding: '0' }}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200/50 bg-transparent shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search user or action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200/50 rounded-xl text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
            />
          </div>
        </div>
        <div className="overflow-auto flex-1 relative">
          <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-200/50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 font-semibold">Time</th>
              <th className="px-6 py-4 font-semibold">User</th>
              <th className="px-6 py-4 font-semibold">Action</th>
              <th className="px-6 py-4 font-semibold">Target</th>
              <th className="px-6 py-4 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/50">
            {visibleLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap"><Clock size={12} className="inline mr-1" />{new Date(log.created_at).toLocaleString("en-GB")}</td>
                <td className="px-6 py-4 font-medium text-slate-700">{log.user_email || log.user_id}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded capitalize">{log.action.replace('_', ' ')}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs text-slate-500 uppercase tracking-wider">{log.target_type}</span> <span className="font-mono text-slate-700">#{log.target_id}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="max-h-24 overflow-y-auto w-full max-w-xs text-xs font-mono bg-slate-800 text-emerald-400 p-2 rounded">
                    {JSON.stringify(log.details, null, 2)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function NotificationTextsTab() {
  const sampleVarsBySetting: Record<string, Record<string, any>> = {
    project_create: { projectName: "Computer Vision Fall 2027", projectId: 42 },
    project_delete: { projectName: "Computer Vision Fall 2027", projectId: 42 },
    project_pin: { projectName: "Computer Vision Fall 2027", actionLabel: "added to dashboard" },
    sheet_create: { sheetName: "Professors Shortlist", sheetId: 7 },
    sheet_delete: { sheetName: "Professors Shortlist", sheetId: 7 },
    sheet_pin: { sheetName: "Professors Shortlist", actionLabel: "pinned" },
    record_create: {},
    record_delete: {},
    whiteboard_create: { whiteboardName: "Research Plan" },
    whiteboard_delete: { whiteboardName: "Research Plan" },
    scheduled_email: {
      sheetName: "Prof. Jane Doe",
      dueAt: "2026-06-01T09:00:00Z",
      attachmentSummary: "CV, SOP, Transcript"
    }
  };

  return (
    <div className="h-full overflow-y-auto pr-2 space-y-6 animate-in fade-in duration-300">
      {notificationCategories.map((category) => (
        <div key={category.title} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-base font-semibold text-slate-800 mb-4">{category.title}</h3>
          <div className="space-y-3">
            {category.settings.map((setting) => {
              const template = notificationTemplates[setting.key as keyof typeof notificationTemplates];
              if (!template) return null;
              const preview = buildNotification(setting.key as keyof typeof notificationTemplates, sampleVarsBySetting[setting.key] || {});
              return (
                <div key={setting.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <p className="text-sm font-semibold text-slate-800">{setting.label}</p>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 rounded px-2 py-1">
                      {template.notification_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1">Title preview</p>
                  <p className="text-sm font-medium text-slate-700 mb-2">{preview.title}</p>
                  <p className="text-xs text-slate-500 mb-1">Body preview</p>
                  <p className="text-sm text-slate-700">{preview.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function InviteRequestsTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const visibleRequests = useMemo<any[]>(() => {
    if (!searchQuery) return requests;
    const lowerQ = searchQuery.toLowerCase();
    return requests.filter(req => 
      (req.name || "").toLowerCase().includes(lowerQ) || 
      (req.email || "").toLowerCase().includes(lowerQ)
    );
  }, [requests, searchQuery]);

  const fetchRequests = async () => {
    try {
      const res = await api.get<any[]>("/admin/invite-requests");
      setRequests(res);
    } catch (err) {
      console.error(err);
      emitUiError({ title: "Failed to load requests", message: "Could not fetch invite requests." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleReview = async (id: number, action: string, req: any) => {
    try {
      const res = await api.post<any>(`/admin/invite-requests/${id}/review`, { action });
      
      if (action === 'approve' && res.invite_code) {
        const subject = encodeURIComponent("Welcome to ScholarDocX - Your Invite Code");
        const body = encodeURIComponent(`Hi ${req.name},\n\nWe are excited to welcome you to ScholarDocX! Here is your single-use invite code to create your account:\n\n${res.invite_code}\n\nPlease head to the registration page and sign up with this code.\n\nBest,\nThe ScholarDocX Team`);
        const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(req.email)}&su=${subject}&body=${body}`;
        const a = document.createElement('a');
        a.href = gmailLink;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      fetchRequests();
    } catch (err: any) {
      emitUiError({ title: "Review failed", message: err.message || "Failed to process request." });
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading requests...</div>;

  return (
    <div className="h-full overflow-y-auto pr-2 animate-in fade-in duration-300">
      <div className="profile-system-card glass-panel flex flex-col min-h-[400px]" style={{ padding: '0' }}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200/50 bg-transparent shrink-0">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Users size={18} className="text-indigo-600" /> Invite Requests</h2>
          <div className="flex items-center gap-2">
            <div className="relative mr-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200/50 rounded-xl text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
              />
            </div>
            <button onClick={fetchRequests} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
              Refresh
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {requests.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <ShieldAlert size={48} className="mb-4 opacity-20" />
              <p>No invite requests found.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-200/50 shadow-sm z-10">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRequests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{r.name}</td>
                    <td className="px-4 py-3 text-slate-500">{r.email}</td>
                    <td className="px-4 py-3 text-slate-500">{r.phone || '-'}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-500" title={r.description}>{r.description || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        r.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(r.created_at + 'Z').toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'Pending' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleReview(r.id, 'approve', r)} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium border border-transparent hover:border-emerald-200">
                            Generate & Email
                          </button>
                          <button onClick={() => handleReview(r.id, 'reject', r)} className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium border border-transparent hover:border-red-200">
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const { showAlert } = useDialog();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showJwt, setShowJwt] = useState(false);
  
  const [showJwtModal, setShowJwtModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showModelPricingModal, setShowModelPricingModal] = useState(false);
  const [showTokenPacksModal, setShowTokenPacksModal] = useState(false);
  const [showExternalApisModal, setShowExternalApisModal] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await api.get<Record<string, string>>("/admin/settings");
      setSettings(res);
    } catch (err) {
      console.error(err);
      emitUiError({ title: "Failed to load settings", message: "Could not fetch app settings." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleUpdate = async (key: string, value: string) => {
    try {
      await api.patch(`/admin/settings/${key}`, { value });
      setSettings(prev => ({ ...prev, [key]: value }));
      if (key === "jwt_secret_key") {
        await showAlert(
          "Warning: Updating the secret key will invalidate all active sessions immediately!",
          "Security Warning"
        );
      }
    } catch (err) {
      console.error(err);
      emitUiError({ title: "Update Failed", message: "Failed to update setting." });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <h2 className="text-xl font-semibold text-slate-800">App Settings</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* JWT Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-6 flex items-center gap-4">
            <div className="bg-rose-100/50 p-3 rounded-xl border border-rose-200">
              <ShieldAlert className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-lg">JWT Configuration</h3>
              <p className="text-sm text-slate-500 mt-1">Manage secrets and session lifetimes.</p>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
             <button onClick={() => setShowJwtModal(true)} className="profile-primary-button">
               Configure JWT
             </button>
          </div>
        </div>

        {/* Pricing Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-6 flex items-center gap-4">
            <div className="bg-emerald-100/50 p-3 rounded-xl border border-emerald-200 flex items-center justify-center w-12 h-12">
              <span className="font-bold text-emerald-600">BDT</span>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-lg">Plan Pricing</h3>
              <p className="text-sm text-slate-500 mt-1">Configure pricing for all user plans.</p>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
             <button onClick={() => setShowPricingModal(true)} className="profile-primary-button">
               Configure Pricing
             </button>
          </div>
        </div>

        {/* Model Pricing Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-6 flex items-center gap-4">
            <div className="bg-indigo-100/50 p-3 rounded-xl border border-indigo-200">
              <CircleDollarSign className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-lg">AI Models Configuration</h3>
              <p className="text-sm text-slate-500 mt-1">Set per-1M token input/output prices for each model.</p>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
             <button onClick={() => setShowModelPricingModal(true)} className="profile-primary-button">
               Configure Models
             </button>
          </div>
        </div>

        {/* Token Packs Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-6 flex items-center gap-4">
            <div className="bg-purple-100/50 p-3 rounded-xl border border-purple-200">
              <Package className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-lg">AI Credit Packs</h3>
              <p className="text-sm text-slate-500 mt-1">Manage AI credit pack offerings and pricing.</p>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
             <button onClick={() => setShowTokenPacksModal(true)} className="profile-primary-button">
               Configure Packs
             </button>
          </div>
        </div>

        {/* External APIs Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-6 flex items-center gap-4">
            <div className="bg-orange-100/50 p-3 rounded-xl border border-orange-200">
              <Globe className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-lg">External APIs</h3>
              <p className="text-sm text-slate-500 mt-1">Configure pricing for external tools like Tavily.</p>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
             <button onClick={() => setShowExternalApisModal(true)} className="profile-primary-button">
               Configure External APIs
             </button>
          </div>
        </div>
      </div>

      {showJwtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                JWT Configuration
              </h3>
              <button onClick={() => setShowJwtModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">JWT Sign Key</label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input 
                      type={showJwt ? "text" : "password"} 
                      defaultValue={settings["jwt_secret_key"] || "scholar-docx-local-first-secret-key-do-not-use-in-cloud"}
                      id="modal-input-jwt_secret_key"
                      className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowJwt(!showJwt)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showJwt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button 
                    onClick={() => {
                      const el = document.getElementById("modal-input-jwt_secret_key") as HTMLInputElement;
                      if (el) handleUpdate("jwt_secret_key", el.value);
                    }}
                    className="profile-primary-button px-5"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-rose-500 font-medium">Warning: Changing this will instantly log out all active users!</p>
              </div>
              
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">JWT Expiration (Days)</label>
                <div className="flex gap-3">
                  <input 
                    type="number" 
                    min="1"
                    defaultValue={settings["jwt_expiration_days"] || "30"}
                    id="modal-input-jwt_expiration_days"
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <button 
                    onClick={() => {
                      const el = document.getElementById("modal-input-jwt_expiration_days") as HTMLInputElement;
                      if (el) handleUpdate("jwt_expiration_days", el.value);
                    }}
                    className="profile-primary-button px-5"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-slate-500 font-medium">How many days until a user session expires.</p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowJwtModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPricingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-sm font-bold">BDT</span>
                Plan Pricing Configuration
              </h3>
              <button onClick={() => setShowPricingModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="space-y-6">
                {/* General Plan */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                    General Plan
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input 
                          type="number" 
                          min="0"
                          defaultValue={settings["plan_price_general_monthly"] || "0"}
                          id="modal-input-plan_price_general_monthly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Yearly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input 
                          type="number" 
                          min="0"
                          defaultValue={settings["plan_price_general_yearly"] || "0"}
                          id="modal-input-plan_price_general_yearly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pro Plan */}
                <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-5">
                  <h4 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    Pro Plan
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input 
                          type="number" 
                          min="0"
                          defaultValue={settings["plan_price_pro_monthly"] || "50"}
                          id="modal-input-plan_price_pro_monthly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Yearly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input 
                          type="number" 
                          min="0"
                          defaultValue={settings["plan_price_pro_yearly"] || "500"}
                          id="modal-input-plan_price_pro_yearly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Max Plan */}
                <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-5">
                  <h4 className="font-semibold text-purple-900 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    Max Plan
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input 
                          type="number" 
                          min="0"
                          defaultValue={settings["plan_price_max_monthly"] || "180"}
                          id="modal-input-plan_price_max_monthly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Yearly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input 
                          type="number" 
                          min="0"
                          defaultValue={settings["plan_price_max_yearly"] || "1500"}
                          id="modal-input-plan_price_max_yearly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button 
                onClick={() => setShowPricingModal(false)} 
                className="px-5 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  const keys = [
                    "plan_price_general_monthly", "plan_price_general_yearly",
                    "plan_price_pro_monthly", "plan_price_pro_yearly",
                    "plan_price_max_monthly", "plan_price_max_yearly"
                  ];
                  let updated = false;
                  for (const key of keys) {
                    const el = document.getElementById(`modal-input-${key}`) as HTMLInputElement;
                    if (el && el.value !== String(settings[key] || "0")) {
                      await handleUpdate(key, el.value);
                      updated = true;
                    }
                  }
                  if (updated) fetchSettings();
                  setShowPricingModal(false);
                }} 
                className="px-6 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm hover:shadow transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showModelPricingModal && (
        <Modal onClose={() => setShowModelPricingModal(false)} zIndex={999}>
          <div
            className="modal-panel pricing-modal-panel max-h-[85vh] overflow-x-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <CircleDollarSign className="w-5 h-5 text-indigo-500 shrink-0" />
                <div>
                  <h3 className="text-base font-semibold text-slate-800">AI Models Configuration</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Set per-1M token input/output prices for each model.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModelPricingModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-content overflow-y-auto overflow-x-hidden flex-1 min-h-[360px]">
              <ModelPricingTab />
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowModelPricingModal(false)}
                className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showExternalApisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-orange-500" />
                External APIs & Agents Pricing
              </h3>
              <button onClick={() => setShowExternalApisModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">Tavily Search Cost (USD per search)</label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                    <input 
                      type="number"
                      step="0.001"
                      min="0"
                      defaultValue={settings["tavily_call_cost_usd"] || "0.01"}
                      id="modal-input-tavily_call_cost_usd"
                      className="w-full pl-7 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      const el = document.getElementById("modal-input-tavily_call_cost_usd") as HTMLInputElement;
                      if (el && el.value) handleUpdate("tavily_call_cost_usd", el.value);
                    }}
                    className="profile-primary-button px-5"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Controls the amount deducted from a user's AI token balance (converted via token rate) for each Web Search and Scholarship Hunt API call.
                </p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowExternalApisModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showTokenPacksModal && (
        <Modal onClose={() => setShowTokenPacksModal(false)} zIndex={999}>
          <div
            className="modal-panel pricing-modal-panel max-h-[85vh] overflow-x-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-purple-500 shrink-0" />
                <div>
                  <h3 className="text-base font-semibold text-slate-800">AI Credit Packs</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Manage AI credit pack offerings and pricing.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTokenPacksModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-content overflow-y-auto overflow-x-hidden flex-1 min-h-[360px]">
              <TokenPacksTab />
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowTokenPacksModal(false)}
                className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function SuspensionAppealsTab() {
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const visibleAppeals = useMemo<any[]>(() => {
    if (!searchQuery) return appeals;
    const lowerQ = searchQuery.toLowerCase();
    return appeals.filter(a => 
      (a.email || "").toLowerCase().includes(lowerQ)
    );
  }, [appeals, searchQuery]);

  const fetchAppeals = async () => {
    try {
      const res = await api.get<any>('/admin/suspension-appeals');
      if (Array.isArray(res)) {
        setAppeals(res);
      } else if (res && res.appeals) {
        setAppeals(res.appeals);
      }
    } catch (error) {
      console.error(error);
      emitUiError({ title: "Failed to fetch appeals", message: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppeals();
  }, []);

  const handleResolve = async (appealId: number, action: 'Resolve' | 'Dismiss') => {
    try {
      await api.post(`/admin/suspension-appeals/${appealId}/resolve`, { action });
      fetchAppeals();
    } catch (error) {
      console.error(error);
      emitUiError({ title: "Failed to resolve appeal", message: error instanceof Error ? error.message : "Unknown error" });
    }
  };

  if (loading) return <div className="p-8 text-center text-zinc-400">Loading appeals...</div>;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-800">
          <ShieldAlert className="h-5 w-5 text-indigo-500" />
          Suspension Appeals
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative mr-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white border border-zinc-200/80 rounded-xl text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
            />
          </div>
          <button onClick={fetchAppeals} className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-100">
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-600">
          <thead className="border-b border-zinc-200 bg-zinc-50/50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Message</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {appeals.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                  No suspension appeals found.
                </td>
              </tr>
            ) : (
              visibleAppeals.map((a) => (
                <tr key={a.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-zinc-900">{a.email}</td>
                  <td className="px-6 py-4 max-w-md truncate" title={a.message}>{a.message}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium border
                        ${a.status === 'Pending' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        (a.status === 'Resolved' || a.status === 'Resolve') ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                        (a.status === 'Dismissed' || a.status === 'Dismiss') ? 'bg-red-100 text-red-700 border-red-200' :
                          'bg-zinc-100 text-zinc-700 border-zinc-200'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-400">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    {a.status === 'Pending' && (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleResolve(a.id, 'Resolve')} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium border border-transparent hover:border-emerald-200">
                          Resolve
                        </button>
                        <button onClick={() => handleResolve(a.id, 'Dismiss')} className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium border border-transparent hover:border-red-200">
                          Dismiss
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminView() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const isSuperAdmin = hasRole("super_admin");
  const [adminPermissions, setAdminPermissions] = useState<Record<string, boolean>>({
    admin_manage_invites: true,
    admin_manage_invite_requests: true,
    admin_manage_user_roles: isSuperAdmin,
    admin_manage_admin_roles: isSuperAdmin,
    admin_manage_role_limits: isSuperAdmin,
    admin_send_notifications: true,
    admin_manage_settings: isSuperAdmin,
    admin_suspend_user: isSuperAdmin,
    admin_manage_plan_requests: true,
    admin_manage_token_requests: true,
    admin_manage_suspension_appeals: true
  });

  const adminRole = isSuperAdmin ? "super_admin" : "general_admin";

  useEffect(() => {
    api.get<any[]>("/admin/limits").then(limits => {
      const myLimits = limits.filter(l => l.role === adminRole);
      setAdminPermissions(prev => {
        const next = { ...prev };
        myLimits.forEach(l => {
          if (l.feature.startsWith("admin_")) {
            next[l.feature] = l.limit_count !== 0;
          }
        });
        return next;
      });
    }).catch(console.error);
  }, [adminRole]);

  const fetchAdminPermissions = () => {
    api.get<any[]>("/admin/limits").then(limits => {
      const myLimits = limits.filter(l => l.role === adminRole);
      setAdminPermissions(prev => {
        const next = { ...prev };
        myLimits.forEach(l => {
          if (l.feature.startsWith("admin_")) {
            next[l.feature] = l.limit_count !== 0;
          }
        });
        return next;
      });
    }).catch(console.error);
  };
  
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  ];

  if (adminPermissions["admin_manage_user_roles"]) {
    tabs.push({ id: "users", label: "Users", icon: Users });
  }

  if (adminPermissions["admin_manage_invite_requests"]) {
    tabs.push({ id: "invite_requests", label: "Invite Requests", icon: Users });
  }

  if (adminPermissions["admin_manage_suspension_appeals"]) {
    tabs.push({ id: "suspension_appeals", label: "Suspension Appeals", icon: ShieldAlert });
  }

  if (adminPermissions["admin_manage_invites"]) {
    tabs.push({ id: "invites", label: "Invite Codes", icon: KeyRound });
  }

  if (adminPermissions["admin_manage_plan_requests"]) {
    tabs.push({ id: "plan_requests", label: "Plan Requests", icon: CheckCircle });
  }

  if (adminPermissions["admin_manage_token_requests"]) {
    tabs.push({ id: "token_purchase_requests", label: "Credit Requests", icon: Coins });
  }

  if (adminPermissions["admin_manage_role_limits"]) {
    tabs.push({ id: "limits", label: "Role Limits", icon: ShieldAlert });
  }

  if (adminPermissions["admin_manage_notification_texts"]) {
    tabs.push({ id: "notification_texts", label: "Notification Texts", icon: Bell });
  }

  if (adminPermissions["admin_view_audit_logs"]) {
    tabs.push({ id: "audit", label: "Audit Logs", icon: FileClock });
  }

  if (adminPermissions["admin_manage_settings"]) {
    tabs.push({ id: "settings", label: "Settings", icon: Settings });
  }

  return (
    <div id="admin-view-root" className="profile-page w-full flex-1 min-h-0 flex flex-col relative overflow-hidden" style={{ margin: 0, height: '100dvh', maxWidth: 'none', padding: '0 24px 24px' }}>
      
      {/* Hero — Admin Header */}
      <div className="profile-hero-wrapper" style={{ marginTop: '24px' }}>
        <div className="profile-hero-bg-anim">
          <div className="gradient-blob shape-1" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 60%)' }}></div>
          <div className="gradient-blob shape-2" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 60%)' }}></div>
          <div className="gradient-blob shape-3" style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.2) 0%, transparent 60%)' }}></div>
        </div>
        <div className="profile-hero glass-panel">
          <div className="profile-avatar profile-avatar-img flex items-center justify-center bg-indigo-100" style={{ padding: '0' }}>
             <ShieldAlert className="w-10 h-10 text-indigo-600" />
          </div>
          <div className="profile-hero-text">
            <h2>Admin Dashboard</h2>
            <span>Manage workspace settings, user access, and system logs.</span>
            <div className="flex gap-2 mt-2 profile-role-tags">
              <span className="role-tag bg-indigo-100 text-indigo-700">
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-tab-strip">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={isActive ? 'active' : ''}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

        <div className="flex-1 min-h-0 flex flex-col pb-8">
          {activeTab === "dashboard" && <DashboardTab onNavigate={setActiveTab} />}
          {activeTab === "users" && <UsersTab adminPermissions={adminPermissions} />}
          {activeTab === "limits" && <LimitsTab onLimitsUpdated={fetchAdminPermissions} />}
          {activeTab === "notification_texts" && adminPermissions["admin_manage_notification_texts"] && <NotificationTextsTab />}
          {activeTab === "plan_requests" && adminPermissions["admin_manage_plan_requests"] && (
            <PlanRequestsReviewTab
              requestType="all"
              title="Plan Upgrade & Renewal Requests"
              description="Review and manage user plan upgrades and extensions."
              emptyMessage="No plan requests found."
            />
          )}
          {activeTab === "token_purchase_requests" && adminPermissions["admin_manage_token_requests"] && <TokenPurchaseRequestsTab />}
          {activeTab === "invite_requests" && adminPermissions["admin_manage_invite_requests"] && <InviteRequestsTab />}
          {activeTab === "suspension_appeals" && adminPermissions["admin_manage_suspension_appeals"] && <SuspensionAppealsTab />}
          {activeTab === "invites" && adminPermissions["admin_manage_invites"] && <InvitesTab />}
          {activeTab === "audit" && adminPermissions["admin_view_audit_logs"] && <AuditLogsTab />}
          {activeTab === "settings" && adminPermissions["admin_manage_settings"] && <SettingsTab />}
        </div>
    </div>
  );
}
