import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { hasRole } from "../lib/auth";
import {
  LayoutDashboard,
  LayoutGrid,
  Activity,
  GraduationCap,
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
  ChevronRight,
  Zap,
  Lock,
  Compass
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { notificationCategories } from "../config/notificationLabels";
import { PlanRequestsTab as PlanRequestsReviewTab } from "./admin/PlanRequestsTab";
import { AdminPortal } from "./admin/AdminPortal";
import { UsersTab } from "./admin/UsersTab";
import { RoleLimitsTab } from "./admin/RoleLimitsTab";
import { InvitesTab } from "./admin/InvitesTab";
import { InviteRequestsTab } from "./admin/InviteRequestsTab";
import { SettingsTab } from "./admin/SettingsTab";
import { ModelPricingTab } from "./admin/ModelPricingTab";
import { TokenPacksTab } from "./admin/TokenPacksTab";
import { TokenPurchaseRequestsTab } from "./admin/TokenPurchaseRequestsTab";
import { PasswordResetRequestsTab } from "./admin/PasswordResetRequestsTab";
import { InfoTab } from "./admin/InfoTab";
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

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="admin-dashboard-section__header">
      <div className="admin-dashboard-section__icon"><Icon size={16} /></div>
      <div className="admin-dashboard-section__title">
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>
      <div className="admin-dashboard-section__rule" />
    </div>
  );
}

function DashboardTab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [isRegistrationsOpen, setIsRegistrationsOpen] = useState(true);
  const [isLoginsOpen, setIsLoginsOpen] = useState(true);
  const [dashboardView, setDashboardView] = useState<"all" | "overview" | "ai" | "activity">("overview");

  useEffect(() => {
    api.get<any>("/admin/dashboard").then(setStats).catch(console.error);
  }, []);

  if (!stats) return <div className="admin-dashboard-loading">Loading dashboard...</div>;

  const statCardGroups: { key: string; label: string; emphasis?: boolean; cards: any[] }[] = [
    {
      key: "action",
      label: "Needs Action",
      emphasis: true,
      cards: [
        { label: "Invite Requests", value: stats.counts.pending_invite_requests || 0, icon: KeyRound, tone: "amber", navigateTo: "invite_requests", infoText: "Number of pending invite code requests requiring admin approval." },
        { label: "Plan Requests", value: stats.counts.pending_plan_requests || 0, icon: FileClock, tone: "purple", navigateTo: "plan_requests", infoText: "Number of pending plan upgrade/change requests requiring admin approval." },
        { label: "Credit Requests", value: stats.counts.pending_credit_requests || 0, icon: Coins, tone: "amber", navigateTo: "token_purchase_requests", infoText: "Number of pending AI token purchase requests requiring admin approval." },
        { label: "Suspension Appeals", value: stats.counts.pending_appeals || 0, icon: ShieldAlert, tone: "rose", navigateTo: "suspension_appeals", infoText: "Number of pending user suspension appeals requiring review." },
        { label: "Forget Pass Requests", value: stats.counts.pending_password_resets || 0, icon: Lock, tone: "purple", navigateTo: "password_reset_requests", infoText: "Number of pending password reset requests from users." },
      ],
    },
    {
      key: "users",
      label: "Users",
      cards: [
        { label: "Total Users", value: stats.counts.total_users, icon: Users, tone: "indigo", infoText: "Total number of registered users in the system." },
        { label: "Active (30d)", value: stats.counts.active_users, icon: CheckCircle, tone: "emerald", infoText: "Number of users who have logged in or interacted in the last 30 days." },
        { label: "Active (7D)", value: stats.counts.active_users_7d || 0, icon: Activity, tone: "blue", infoText: "Number of users who have logged in or interacted in the last 7 days." },
      ],
    },
    {
      key: "workspace",
      label: "Workspace",
      cards: [
        { label: "Total Projects", value: stats.counts.total_projects, icon: LayoutDashboard, tone: "blue", infoText: "Total number of projects created across all workspaces." },
        { label: "Total Sheets", value: stats.counts.total_sheets || 0, icon: FileSpreadsheet, tone: "emerald", infoText: "Total number of spreadsheet documents created." },
        { label: "Total Records", value: stats.counts.total_records || 0, icon: Database, tone: "blue", infoText: "Total number of rows/records across all spreadsheets." },
      ],
    },
    {
      key: "documents",
      label: "Documents & Storage",
      cards: [
        { label: "Total Documents", value: stats.counts.total_documents || 0, icon: FileText, tone: "indigo", infoText: "Total number of text documents created." },
        {
          label: "Storage Used",
          value: (
            <>
              {((stats.counts.storage_bytes || 0) / 1024 / 1024).toFixed(2)}
              <span>MB</span>
            </>
          ),
          icon: HardDrive,
          tone: "amber",
          infoText: "Total cloud storage space consumed by user files and attachments."
        },
      ],
    },
    {
      key: "canvas",
      label: "Notes & Boards",
      cards: [
        { label: "Total Sticky Notes", value: stats.counts.total_sticky_notes || 0, icon: StickyNote, tone: "amber", infoText: "Total number of sticky note boards created." },
        { label: "Total Whiteboards", value: stats.counts.total_whiteboards || 0, icon: Presentation, tone: "rose", infoText: "Total number of drawing whiteboards created." },
      ],
    },
    {
      key: "ai",
      label: "AI",
      cards: [
        { label: "Total AI Credits Used", value: formatTokenCount(stats.counts.total_ai_tokens || 0), icon: Zap, tone: "purple", infoText: "Total number of AI tokens consumed by all users combined." },
        { label: "Last 30 Days", value: formatTokenCount(stats.counts.ai_tokens_30d || 0), icon: Clock, tone: "emerald", infoText: "AI tokens consumed in the last 30 days." },
        { label: "Last 7 Days", value: formatTokenCount(stats.counts.ai_tokens_7d || 0), icon: Clock, tone: "blue", infoText: "AI tokens consumed in the last 7 days." },
      ],
    },
    {
      key: "tavily",
      label: "Tavily Usage",
      cards: [
        { label: "Total Usage", value: stats.counts.tavily_total || 0, icon: Globe, tone: "indigo", infoText: "Total number of Tavily search API requests made." },
        { label: "Web Search", value: stats.counts.tavily_web_search || 0, icon: Search, tone: "blue", infoText: "Total number of general web searches performed." },
        { label: "Scholarship Hunt", value: stats.counts.tavily_scholarship_hunt || 0, icon: GraduationCap, tone: "purple", infoText: "Total number of scholarship-specific searches performed." },
        { label: "Advisor Atlas", value: stats.counts.tavily_advisor_atlas || 0, icon: Compass, tone: "amber", infoText: "Total number of academic advisor searches performed." },
      ],
    },
  ];
  // Total outstanding items across the "Needs Action" group, surfaced as a badge on its label.
  const actionableTotal = (statCardGroups[0]?.cards || []).reduce(
    (sum, c) => sum + (typeof c.value === "number" ? c.value : 0),
    0,
  );

  const showOverview = dashboardView === "all" || dashboardView === "overview";
  const showAi = dashboardView === "all" || dashboardView === "ai";
  const showActivity = dashboardView === "all" || dashboardView === "activity";
  const dashboardSubtabs: { id: "all" | "overview" | "ai" | "activity"; label: string; icon: any }[] = [
    { id: "all", label: "View All", icon: LayoutGrid },
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "ai", label: "Graphs", icon: Activity },
    { id: "activity", label: "User Activity", icon: Users },
  ];

  // Needs Action stays full-width at the top; remaining groups render
  // sequentially below with compact cards spanning the full width.
  const actionGroup = statCardGroups[0];
  const remainingGroups = statCardGroups.slice(1);

  const renderStatGroup = (
    group: { key: string; label: string; emphasis?: boolean; cards: any[] },
    compact = false,
  ) => (
    <div
      key={group.key}
      className={[
        "admin-dashboard-stat-group",
        group.emphasis ? "admin-dashboard-stat-group--emphasis" : "",
        compact ? "admin-dashboard-stat-group--compact" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="admin-dashboard-stat-group__label">
        {group.label}
        {group.emphasis && actionableTotal > 0 && (
          <span className="admin-dashboard-stat-group__badge">{actionableTotal}</span>
        )}
      </div>
      <div className="admin-dashboard-stat-grid">
        {group.cards.map((card) => {
          const isActionable = !!card.navigateTo;
          const hasValue = typeof card.value === "number" && card.value > 0;
          const isZero = isActionable && !hasValue;
          return (
            <div
              key={card.label}
              className={[
                "admin-dashboard-stat-card",
                `admin-dashboard-stat-card--${card.tone}`,
                isActionable && hasValue ? "admin-dashboard-stat-card--actionable" : "",
                isZero ? "admin-dashboard-stat-card--zero" : "",
              ].filter(Boolean).join(" ")}
            >
              <div className="admin-dashboard-stat-card__header flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <div className="admin-dashboard-stat-card__icon">
                    <card.icon size={compact ? 15 : 19} />
                  </div>
                  <p>{card.label}</p>
                </div>
                {card.infoText && (
                  <div className="custom-tooltip-container flex items-center justify-center">
                    <Info size={14} className="text-slate-400 cursor-help opacity-70 hover:opacity-100 transition-opacity" />
                    <div className="custom-tooltip text-xs text-left w-max max-w-[200px]" style={{ whiteSpace: 'normal' }}>
                      {card.infoText}
                    </div>
                  </div>
                )}
              </div>
              {isActionable && hasValue ? (
                <div className="flex items-center justify-between mt-1">
                  <p
                    className="admin-dashboard-stat-card__value text-white px-4 py-0.5 rounded-xl shadow-md"
                    style={{ backgroundColor: "var(--admin-stat-color)" }}
                  >
                    {card.value}
                  </p>
                  <button
                    onClick={() => onNavigate?.(card.navigateTo)}
                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm hover:shadow-md hover:scale-105 transition-all cursor-pointer border-none"
                    style={{ backgroundColor: "var(--admin-stat-bg)", color: "var(--admin-stat-color)" }}
                  >
                    Review
                    <ChevronRight size={12} />
                  </button>
                </div>
              ) : (
                <p className="admin-dashboard-stat-card__value">{card.value}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="admin-dashboard-tab animate-in fade-in duration-300">
      {/* Sub-view tabs */}
      <div className="admin-dashboard-subtabs">
        {dashboardSubtabs.map((t) => {
          const Icon = t.icon;
          const active = dashboardView === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setDashboardView(t.id)}
              className={`admin-dashboard-subtab${active ? " admin-dashboard-subtab--active" : ""}`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>
      {/* 1 — Overview */}
      {showOverview && (
        <section className="admin-dashboard-section">
          <SectionHeader icon={LayoutDashboard} title="Overview" subtitle="Platform statistics & key metrics" />
          <div className="admin-dashboard-stat-groups">
            {/* Needs Action — full width, prominent */}
            {renderStatGroup(actionGroup, false)}
            {/* Remaining groups — full-width compact cards */}
            {remainingGroups.map((g) => renderStatGroup(g, true))}
          </div>
        </section>
      )}

      {/* 2 — Credit Usage */}
      {showAi && (
        <section className="admin-dashboard-section">
          <SectionHeader icon={Zap} title="Credit Usage" subtitle="Credits consumed over the last 10 days" />
          <div className="admin-dashboard-panel admin-dashboard-panel--full-width">
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
                  <XAxis dataKey="date" minTickGap={0} interval="preserveStartEnd" tick={{ fill: "var(--ui-text-dim)", fontSize: 10 }} tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatTokenCount} tick={{ fill: "var(--ui-text-dim)", fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--ui-bg-panel)", border: "1px solid var(--ui-border)", borderRadius: "8px", color: "var(--ui-text)" }}
                    itemStyle={{ color: "#8b5cf6" }}
                  />
                  <Area type="monotone" dataKey="tokens" name="Credits" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorTokens)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* 3 — User Activity */}
      {showActivity && (
        <section className="admin-dashboard-section">
          <SectionHeader icon={Users} title="User Activity" subtitle="Recent registrations & logins" />
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
        </section>
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

export function SuspensionAppealsTab() {
  const { showAlert } = useDialog();
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

  const handleResolve = async (appealId: string, action: 'Resolve' | 'Dismiss') => {
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
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white border border-zinc-200/80 rounded-xl text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
            />
          </div>
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
                  <td className="px-6 py-4 max-w-md truncate">
                    {a.message ? (
                      <button
                        onClick={() => showAlert(a.message, "Appeal Message", "info")}
                        className="hover:text-indigo-600 truncate max-w-md text-left"
                        title="Click to view full message"
                      >
                        {a.message}
                      </button>
                    ) : '-'}
                  </td>
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

export function AdminView({ refreshTrigger }: { refreshTrigger?: number }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const isSuperAdmin = hasRole("super_admin");
  const [adminPermissions, setAdminPermissions] = useState<Record<string, boolean>>({
    admin_view_dashboard: true,
    admin_manage_invites: true,
    admin_manage_user_roles: isSuperAdmin,
    admin_manage_admin_roles: isSuperAdmin,
    admin_manage_role_limits: isSuperAdmin,
    admin_send_notifications: true,
    admin_manage_settings: isSuperAdmin,
    admin_suspend_user: isSuperAdmin,
    admin_manage_plan_requests: true,
    admin_manage_invite_requests: true,
    admin_manage_token_requests: true,
    admin_manage_password_resets: true,
    admin_manage_suspension_appeals: true,
    admin_view_info: true,
  });

  const [activeRequestSubtab, setActiveRequestSubtab] = useState("plan_requests");

  const adminRole = isSuperAdmin ? "super_admin" : "general_admin";

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

  useEffect(() => {
    fetchAdminPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminRole, refreshTrigger]);



  const tabs: any[] = [];
  
  if (adminPermissions["admin_view_dashboard"]) {
    tabs.push({ id: "dashboard", label: "Dashboard", icon: LayoutDashboard });
  }

  if (adminPermissions["admin_manage_user_roles"]) {
    tabs.push({ id: "users", label: "Users", icon: Users });
  }

  if (adminPermissions["admin_manage_invites"]) {
    tabs.push({ id: "invites", label: "Invite Codes", icon: KeyRound });
  }

  const hasAnyRequestPermission = adminPermissions["admin_manage_plan_requests"] ||
    adminPermissions["admin_manage_invite_requests"] ||
    adminPermissions["admin_manage_token_requests"] ||
    adminPermissions["admin_manage_password_resets"];

  if (hasAnyRequestPermission) {
    tabs.push({ id: "requests", label: "Requests", icon: CheckCircle });
  }

  if (adminPermissions["admin_manage_suspension_appeals"]) {
    tabs.push({ id: "suspension_appeals", label: "Suspension Appeals", icon: ShieldAlert });
  }

  if (adminPermissions["admin_manage_role_limits"]) {
    tabs.push({ id: "limits", label: "Role Limits", icon: ShieldAlert });
  }

  if (adminPermissions["admin_manage_notification_texts"]) {
    tabs.push({ id: "notification_texts", label: "Notification Texts", icon: Bell });
  }

  if (adminPermissions["admin_manage_settings"]) {
    tabs.push({ id: "settings", label: "Settings", icon: Settings });
  }

  if (adminPermissions["admin_view_audit_logs"]) {
    tabs.push({ id: "audit", label: "Audit Logs", icon: FileClock });
  }

  if (adminPermissions["admin_view_info"]) {
    tabs.push({ id: "info", label: "Info", icon: Info });
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
        {activeTab === "dashboard" && (
          <DashboardTab
            onNavigate={(target) => {
              if (
                ["plan_requests", "invite_requests", "token_purchase_requests", "password_reset_requests"].includes(
                  target
                )
              ) {
                setActiveTab("requests");
                setActiveRequestSubtab(target);
              } else {
                setActiveTab(target);
              }
            }}
          />
        )}
        {activeTab === "users" && <UsersTab adminPermissions={adminPermissions} refreshTrigger={refreshTrigger} />}
        {activeTab === "limits" && <RoleLimitsTab onLimitsUpdated={fetchAdminPermissions} />}
        {activeTab === "notification_texts" && adminPermissions["admin_manage_notification_texts"] && <NotificationTextsTab />}
        {activeTab === "requests" && hasAnyRequestPermission && (
          <div className="flex flex-col h-full w-full">
            <div className="admin-tab-strip" style={{ marginBottom: "24px" }}>
              {adminPermissions["admin_manage_plan_requests"] && (
                <button
                  onClick={() => setActiveRequestSubtab("plan_requests")}
                  className={activeRequestSubtab === "plan_requests" ? "active" : ""}
                >
                  Plan Requests
                </button>
              )}
              {adminPermissions["admin_manage_invite_requests"] && (
                <button
                  onClick={() => setActiveRequestSubtab("invite_requests")}
                  className={activeRequestSubtab === "invite_requests" ? "active" : ""}
                >
                  Invite Requests
                </button>
              )}
              {adminPermissions["admin_manage_token_requests"] && (
                <button
                  onClick={() => setActiveRequestSubtab("token_purchase_requests")}
                  className={activeRequestSubtab === "token_purchase_requests" ? "active" : ""}
                >
                  Credit Requests
                </button>
              )}
              {adminPermissions["admin_manage_password_resets"] && (
                <button
                  onClick={() => setActiveRequestSubtab("password_reset_requests")}
                  className={activeRequestSubtab === "password_reset_requests" ? "active" : ""}
                >
                  Forget Pass Requests
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {activeRequestSubtab === "plan_requests" && adminPermissions["admin_manage_plan_requests"] && (
                <PlanRequestsReviewTab
                  requestType="all"
                  title="Plan Upgrade & Renewal Requests"
                  description="Review and manage user plan upgrades and extensions."
                  emptyMessage="No plan requests found."
                />
              )}
              {activeRequestSubtab === "token_purchase_requests" && adminPermissions["admin_manage_token_requests"] && <TokenPurchaseRequestsTab />}
              {activeRequestSubtab === "password_reset_requests" && adminPermissions["admin_manage_password_resets"] && <PasswordResetRequestsTab refreshTrigger={refreshTrigger} />}
              {activeRequestSubtab === "invite_requests" && adminPermissions["admin_manage_invite_requests"] && <InviteRequestsTab />}
            </div>
          </div>
        )}
        {activeTab === "suspension_appeals" && adminPermissions["admin_manage_suspension_appeals"] && <SuspensionAppealsTab />}
        {activeTab === "invites" && adminPermissions["admin_manage_invites"] && <InvitesTab />}
        {activeTab === "audit" && adminPermissions["admin_view_audit_logs"] && <AuditLogsTab />}
        {activeTab === "info" && adminPermissions["admin_view_info"] && <InfoTab />}
        {activeTab === "settings" && adminPermissions["admin_manage_settings"] && <SettingsTab />}
      </div>
    </div>
  );
}
