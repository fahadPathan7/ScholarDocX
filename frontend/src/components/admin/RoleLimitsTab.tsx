import { AdminPortal } from "./AdminPortal";
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";
import { hasRole } from "../../lib/auth";
import { emitUiError } from "../../lib/uiError";
import { useDialog } from "../DialogProvider";
import { Modal } from "../Modal";
import { 
  CheckCircle, XCircle, Info, Copy, Settings,
  ShieldAlert, Clock, Trash2, Check, X, Shield, Activity
, } from "lucide-react";

function formatTokenCount(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export function RoleLimitsTab({ onLimitsUpdated }: { onLimitsUpdated?: () => void }) {
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
        { key: "can_purchase_token_packs", label: "Can Purchase Extra AI Credit Packs", description: "Controls whether users on this plan can buy extra AI credit packs (Small / Medium / Large). Default ON for Pro and Max, OFF for Free and General. When OFF, the Buy Credits flow shows an upgrade upsell instead of the pack list." },
        { key: "can_use_purchased_tokens", label: "Can Use Purchased AI Credits", description: "Controls whether users on this plan can consume their purchased extra AI credits. Default ON for Pro and Max, OFF for Free and General. When OFF, purchased credits are locked and unusable until the user upgrades." }
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
        { key: "can_use_scholarship_hunt", label: "Can Use Scholarship Hunt", description: "Controls whether users can access the automated scholarship finding suite, including search, catalog cycle checks, opportunity analysis, and deep hunt." },
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
      name: "Dashboard",
      features: [
        { key: "admin_view_dashboard", label: "Can View Dashboard", description: "Allows viewing the overview dashboard and statistics." }
      ]
    },
    {
      name: "Users",
      features: [
        { key: "admin_create_user", label: "Can Create Users", description: "Allows creating new user accounts with email, password, and assigned roles." },
        { key: "admin_assign_user_roles", label: "Can Assign User Roles", description: "Allows changing a user's role to user-level roles (Free User, General User, Pro User, Max User)." },
        { key: "admin_assign_admin_roles", label: "Can Assign Admin Roles", description: "Allows changing a user's role to admin-level roles (General Admin, Super Admin)." },
        { key: "admin_suspend_user", label: "Can Suspend Users", description: "Allows suspending or activating user accounts to control their access." },
        { key: "admin_revoke_user", label: "Can Revoke User Tokens", description: "Allows revoking all active sessions for a user, forcing them to log in again." },
        { key: "admin_send_notifications", label: "Can Send Notifications To Users", description: "Allows sending categorized notifications to all users, filtered groups, or specific users." }
      ]
    },
    {
      name: "Suspension Appeals",
      features: [
        { key: "admin_manage_suspension_appeals", label: "Can Manage Suspension Appeals", description: "Allows reviewing and resolving user suspension appeals." }
      ]
    },
    {
      name: "Invite Codes",
      features: [
        { key: "admin_manage_invites", label: "Can Manage Invite Codes", description: "Allows generating and managing invite codes for new user registration." }
      ]
    },
    {
      name: "Requests",
      features: [
        { key: "admin_manage_invite_requests", label: "Can Manage Invite Requests", description: "Allows approving or rejecting user invite requests." },
        { key: "admin_manage_plan_requests", label: "Can Manage Plan Requests", description: "Allows approving or rejecting user plan upgrade and extension requests." },
        { key: "admin_manage_token_requests", label: "Can Manage Credit Purchase Requests", description: "Allows approving or rejecting user requests to buy AI Extra Credit packs. Model pricing and pack configuration remain super-admin only." },
        { key: "admin_manage_password_resets", label: "Can Manage Password Resets", description: "Allows approving or rejecting user password reset requests." }
      ]
    },
    {
      name: "Role Limits",
      features: [
        { key: "admin_manage_user_roles", label: "Can Manage Role Limits", description: "Allows editing limits and quotas for user-level roles (Free User, General User, Pro User, Max User)." },
        { key: "admin_manage_role_limits", label: "Can View Role Limits", description: "Allows opening the Role Limits section and viewing role-limit settings and admin permission toggles." },
        { key: "admin_manage_admin_roles", label: "Can Manage Admin Roles", description: "Allows editing permissions for admin-level roles." }
      ]
    },
    {
      name: "Notification Texts",
      features: [
        { key: "admin_manage_notification_texts", label: "Can Manage Notification Texts", description: "Allows editing system-wide notification message templates." }
      ]
    },
    {
      name: "Audit Logs",
      features: [
        { key: "admin_view_audit_logs", label: "Can View Audit Logs", description: "Allows viewing system audit logs tracking all administrative actions." }
      ]
    },
    {
      name: "Info",
      features: [
        { key: "admin_view_info", label: "Can View Info", description: "Allows viewing the Info tab, which lists all active request rate limits enforced across the application. Read-only." }
      ]
    },
    {
      name: "Settings",
      features: [
        { key: "admin_manage_settings", label: "Can Manage App Settings", description: "Allows editing global application settings." }
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
                {groups.map((group, groupIdx) => {
                  // Skip the whole group (header included) when none of its
                  // features have a seeded limit yet — otherwise an empty
                  // category header renders with no rows beneath it.
                  const visibleFeatures = group.features.filter(
                    (f) => getLimitByFeature(f.key)
                  );
                  if (visibleFeatures.length === 0) return null;
                  return (
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
                              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${isBooleanFeature
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
                  );
                })}
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

