import React, { useState, useEffect } from "react";
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
  Pencil,
  Clock,
  HardDrive,
  X,
  Info,
  Settings,
  Eye,
  EyeOff,
  Calendar,
  Ban,
  Copy
} from "lucide-react";
import { notificationCategories } from "../config/notificationLabels";
import DateRangeCalendar from "./DateRangeCalendar";
import { buildNotification, notificationTemplates } from "../config/notificationCatalog";
import { emitUiError } from "../lib/uiError";
import { useDialog } from "./DialogProvider";
import "../admin.css";

function AdminPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const root = document.getElementById('admin-view-root');
  if (!root) return null;
  return createPortal(children, root);
}

function DashboardTab() {
  const [stats, setStats] = useState<any>(null);

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
      label: "Total Projects",
      value: stats.counts.total_projects,
      icon: LayoutDashboard,
      tone: "blue"
    },
    {
      label: "Storage Used",
      value: (
        <>
          {(stats.counts.storage_bytes / 1024 / 1024).toFixed(2)}
          <span>MB</span>
        </>
      ),
      icon: HardDrive,
      tone: "amber"
    }
  ];

  return (
    <div className="admin-dashboard-tab animate-in fade-in duration-300">
      <div className="admin-dashboard-stat-grid">
        {statCards.map((card) => (
          <div key={card.label} className={`admin-dashboard-stat-card admin-dashboard-stat-card--${card.tone}`}>
            <div className="admin-dashboard-stat-card__header">
              <div className="admin-dashboard-stat-card__icon">
                <card.icon size={19} />
              </div>
              <p>{card.label}</p>
            </div>
            <p className="admin-dashboard-stat-card__value">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="admin-dashboard-activity-grid">
        <div className="admin-dashboard-panel">
          <div className="admin-dashboard-panel__header">
            <div>
              <Users size={16} />
              <h3>Recent Registrations</h3>
            </div>
            <span>{stats.recent_registrations.length}</span>
          </div>
          <div className="admin-dashboard-table-wrap">
            <table className="admin-dashboard-table">
              <thead>
                <tr><th>Email</th><th className="text-right">Date</th></tr>
              </thead>
              <tbody>
                {stats.recent_registrations.map((u: any) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td className="text-right">{new Date(u.created_at).toLocaleDateString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.recent_registrations.length === 0 && (
              <div className="admin-dashboard-empty">No new registrations yet.</div>
            )}
          </div>
        </div>

        <div className="admin-dashboard-panel">
          <div className="admin-dashboard-panel__header">
            <div>
              <Clock size={16} />
              <h3>Recent Logins</h3>
            </div>
            <span>{stats.recent_logins.length}</span>
          </div>
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
                      <span className="admin-dashboard-time"><Clock size={14} /> {new Date(u.last_login_at).toLocaleString("en-GB")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.recent_logins.length === 0 && (
              <div className="admin-dashboard-empty">No recent logins yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ adminPermissions }: { adminPermissions: Record<string, boolean> }) {
  const { showConfirm } = useDialog();
  const [users, setUsers] = useState<any[]>([]);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editingMode, setEditingMode] = useState<"user" | "admin" | null>(null);
  const [editPlanDuration, setEditPlanDuration] = useState<"1_month" | "1_year" | "custom">( "1_month");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [planStatusFilter, setPlanStatusFilter] = useState<"all" | "expiring_soon" | "expired">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  // User Creation States
  const [creatingUser, setCreatingUser] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createRoles, setCreateRoles] = useState<string[]>(["general_user"]);
  const [planDuration, setPlanDuration] = useState<"1_month" | "1_year" | "custom">("1_month");
  const [createCustomStart, setCreateCustomStart] = useState("");
  const [createCustomEnd, setCreateCustomEnd] = useState("");

  const fetchUsers = () => {
    api.get<any[]>(`/admin/users?t=${Date.now()}`).then(setUsers).catch(console.error);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (user: any) => {
    const confirmed = await showConfirm(
      `Are you sure you want to ${user.is_active ? "suspend" : "activate"} ${user.email}?`,
      "Confirm Status Change"
    );
    if (!confirmed) return;
    try {
      await api.post(`/admin/users/${user.id}/toggle-status`, { is_active: !user.is_active });
      fetchUsers();
    } catch (error) {
      emitUiError({ title: "Action failed", message: "Failed to toggle status.", kind: "general" });
    }
  };

  const handleRevoke = async (user: any) => {
    const confirmed = await showConfirm(
      `Revoke all tokens for ${user.email}? They will be logged out immediately.`,
      "Confirm Revoke"
    );
    if (!confirmed) return;
    try {
      await api.post(`/admin/users/${user.id}/revoke`, {});
      fetchUsers();
    } catch (e) {
      emitUiError({ title: "Action failed", message: "Failed to revoke tokens.", kind: "general" });
    }
  };

  const handleSaveRoles = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const hasUserRole = editingUser.roles.some((r: string) => ["general_user", "pro_user", "max_user"].includes(r));

      // Only include plan duration if user roles are present
      const payload: any = {
        roles: editingUser.roles
      };

      if (hasUserRole && editingMode === "user") {
        if (editPlanDuration === "custom") {
          // Validate custom dates
          if (!customStartDate || !customEndDate) {
            emitUiError({ title: "Validation Error", message: "Please select both start and end dates for custom duration.", kind: "general" });
            return;
          }
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          if (end <= start) {
            emitUiError({ title: "Validation Error", message: "End date must be after start date.", kind: "general" });
            return;
          }
          payload.plan_start_date = customStartDate;
          payload.plan_end_date = customEndDate;
        } else {
          // Calculate duration in days for preset options
          let durationDays: number;
          if (editPlanDuration === "1_month") {
            durationDays = 30;
          } else {
            durationDays = 365;
          }
          payload.plan_duration_days = durationDays;
        }
      }

      await api.patch(`/admin/users/${editingUser.id}/roles`, payload);
      setEditingUser(null);
      setEditingMode(null);
      setEditPlanDuration("1_month");
      setCustomStartDate("");
      setCustomEndDate("");
      fetchUsers();
    } catch (err) {
      emitUiError({ title: "Permission denied", message: "Failed to update roles. You might not have super_admin permissions.", kind: "permission" });
    }
  };

  const toggleRole = (role: string) => {
    let newRoles = [...editingUser.roles];
    const isUserRole = ["general_user", "pro_user", "max_user"].includes(role);
    const isAdminRole = ["general_admin", "super_admin"].includes(role);

    if (newRoles.includes(role)) {
      newRoles = newRoles.filter((r: string) => r !== role);
    } else {
      if (isUserRole) {
        newRoles = newRoles.filter((r: string) => !["general_user", "pro_user", "max_user"].includes(r));
      } else if (isAdminRole) {
        newRoles = newRoles.filter((r: string) => !["general_admin", "super_admin"].includes(r));
      }
      newRoles.push(role);
    }
    setEditingUser({ ...editingUser, roles: newRoles });
  };

  const toggleCreateRole = (role: string) => {
    setCreateRoles((prev: string[]) => {
      let newRoles = [...prev];
      const isUserRole = ["general_user", "pro_user", "max_user"].includes(role);
      const isAdminRole = ["general_admin", "super_admin"].includes(role);

      if (newRoles.includes(role)) {
        newRoles = newRoles.filter(r => r !== role);
      } else {
        if (isUserRole) {
          newRoles = newRoles.filter(r => !["general_user", "pro_user", "max_user"].includes(r));
        } else if (isAdminRole) {
          newRoles = newRoles.filter(r => !["general_admin", "super_admin"].includes(r));
        }
        newRoles.push(role);
      }
      return newRoles;
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const hasUserRole = createRoles.some(r => ["general_user", "pro_user", "max_user"].includes(r));
      const payload: any = {
        email: createEmail,
        password: createPassword,
        display_name: createDisplayName || "User",
        roles: createRoles
      };
      if (hasUserRole) {
        if (planDuration === "custom") {
          if (!createCustomStart || !createCustomEnd) {
            emitUiError({ title: "Validation Error", message: "Please select both start and end dates for custom duration.", kind: "general" });
            return;
          }
          const s = new Date(createCustomStart);
          const en = new Date(createCustomEnd);
          if (en <= s) {
            emitUiError({ title: "Validation Error", message: "End date must be after start date.", kind: "general" });
            return;
          }
          payload.plan_start_date = createCustomStart;
          payload.plan_end_date = createCustomEnd;
        } else {
          payload.plan_duration = planDuration;
        }
      }
      await api.post("/admin/users", payload);
      setCreatingUser(false);
      setCreateEmail("");
      setCreatePassword("");
      setCreateDisplayName("");
      setCreateRoles(["general_user"]);
      setPlanDuration("1_month");
      setCreateCustomStart("");
      setCreateCustomEnd("");
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to create user";
      emitUiError({ title: "Action failed", message: String(msg), kind: "general" });
    }
  };

  // Determine allowed roles for creation/editing
  const availableRoles = adminPermissions["admin_assign_admin_roles"]
    ? ["general_user", "pro_user", "max_user", "general_admin", "super_admin"]
    : ["general_user", "pro_user", "max_user"];

  // Helper function to determine plan status
  const getPlanStatus = (user: any): "expired" | "expiring_soon" | "active" | "no_plan" => {
    if (!user.plan_ends_at) return "no_plan";
    const now = new Date();
    const endDate = new Date(user.plan_ends_at);
    const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) return "expired";
    if (daysUntilExpiry <= 7) return "expiring_soon";
    return "active";
  };

  // Filter users based on both role and plan status
  const filteredUsers = users.filter((u: any) => {
    // Role filter
    const roleMatch = roleFilter === "all" || u.roles.includes(roleFilter);
    if (!roleMatch) return false;

    // Status filter
    if (statusFilter !== "all") {
      const isActive = u.is_active;
      if (statusFilter === "active" && !isActive) return false;
      if (statusFilter === "suspended" && isActive) return false;
    }

    // Plan status filter
    if (planStatusFilter === "all") return true;
    const planStatus = getPlanStatus(u);
    return planStatus === planStatusFilter;
  });

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-300">
      <div className="shrink-0 flex justify-between items-center profile-system-card glass-panel" style={{ padding: '16px' }}>
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Users size={18} className="text-indigo-600" /> User Management</h3>
          <p className="text-slate-500 text-xs mt-0.5">Manage user access, statuses, active tokens, and assign roles.</p>
        </div>
        <button
          onClick={() => setCreatingUser(true)}
          className="profile-primary-button"
        >
          <Users size={16} />
          Create User
        </button>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-2 shrink-0 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50">
        {[
          { id: "all", label: "All Users" },
          { id: "general_user", label: "General User" },
          { id: "pro_user", label: "Pro User" },
          { id: "max_user", label: "Max User" },
          { id: "general_admin", label: "General Admin" },
          { id: "super_admin", label: "Super Admin" },
        ].map((tab) => {
          const isActive = roleFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setRoleFilter(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all rounded-lg ${isActive
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Plan and Status Filters */}
      <div className="flex flex-wrap gap-2 mb-2 shrink-0 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50">
        {[
          { id: "all" as const, label: "All Plans", icon: null, tone: "slate" },
          { id: "expiring_soon" as const, label: "Expiring Soon (7 days)", icon: Clock, tone: "amber" },
          { id: "expired" as const, label: "Expired", icon: XCircle, tone: "rose" },
        ].map((tab) => {
          const isActive = planStatusFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setPlanStatusFilter(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all rounded-lg ${isActive
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
            >
              {tab.icon && <tab.icon size={14} />}
              {tab.label}
            </button>
          );
        })}

        <div className="w-px bg-slate-200 mx-2 self-stretch hidden sm:block"></div>

        {[
          { id: "all" as const, label: "All Statuses", icon: null, tone: "slate" },
          { id: "active" as const, label: "Active", icon: CheckCircle, tone: "emerald" },
          { id: "suspended" as const, label: "Suspended", icon: Ban, tone: "rose" },
        ].map((tab) => {
          const isActive = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all rounded-lg ${isActive
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
            >
              {tab.icon && <tab.icon size={14} />}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="profile-system-card glass-panel flex-1 flex flex-col min-h-0 overflow-hidden" style={{ padding: '0' }}>
        <div className="overflow-auto flex-1 relative">
          <table className="w-full text-sm text-left whitespace-nowrap relative">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-200/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-semibold">ID</th>
                <th className="px-6 py-4 font-semibold">Email</th>
                <th className="px-6 py-4 font-semibold">Roles</th>
                <th className="px-6 py-4 font-semibold">Plan Duration</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Last Login</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const planStatus = getPlanStatus(u);
                return (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-slate-500">{u.id}</td>
                  <td className="px-6 py-4 font-medium text-slate-800">{u.email}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {u.roles.map((r: string) => (
                        <span key={r} className={`px-2 py-0.5 rounded text-xs font-medium ${r === 'super_admin' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100/50 text-indigo-700'}`}>
                          {r.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {(u.plan_started_at || u.plan_ends_at) ? (
                      <div className="flex flex-col gap-1">
                        <div><span className="font-medium">Started:</span> {u.plan_started_at ? new Date(u.plan_started_at).toLocaleDateString("en-GB") : '-'}</div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Ends:</span>
                          <span>{u.plan_ends_at ? new Date(u.plan_ends_at).toLocaleDateString("en-GB") : '-'}</span>
                          {planStatus === "expired" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                              <XCircle size={10} /> Expired
                            </span>
                          )}
                          {planStatus === "expiring_soon" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              <Clock size={10} /> Soon
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="italic text-slate-400">N/A</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${u.is_active ? 'bg-emerald-100/50 text-emerald-700' : 'bg-slate-100/50 text-slate-600'}`}>
                      {u.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {u.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-GB") : "Never"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      {(!u.roles.some((r: string) => ["general_admin", "super_admin"].includes(r)) || adminPermissions["admin_assign_admin_roles"]) ? (
                        <>
                          {(adminPermissions["admin_assign_user_roles"] || adminPermissions["admin_assign_admin_roles"]) && (
                        <button
                          onClick={() => { setEditingUser(u); setEditingMode("user"); }}
                          className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                          title="Edit User Plan"
                        >
                          <Pencil size={12} />
                          <span>Plan</span>
                        </button>
                      )}
                      {adminPermissions["admin_assign_admin_roles"] && (
                        <button
                          onClick={() => { setEditingUser(u); setEditingMode("admin"); }}
                          className="px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                          title="Edit Admin Roles"
                        >
                          <ShieldAlert size={12} />
                          <span>Admin</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                          u.is_active
                            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                        title={u.is_active ? "Suspend User" : "Activate User"}
                      >
                        {u.is_active ? <XCircle size={12} /> : <CheckCircle size={12} />}
                        <span>{u.is_active ? "Suspend" : "Activate"}</span>
                      </button>
                      <button
                        onClick={() => handleRevoke(u)}
                        className="px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                        title="Revoke All Sessions"
                      >
                        <KeyRound size={12} />
                        <span>Revoke</span>
                      </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Protected</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Roles Modal */}
      {editingUser && editingMode && (
        <AdminPortal>
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 backdrop-blur-[10px]" style={{ background: 'rgba(30, 41, 37, 0.22)' }} onClick={() => { setEditingUser(null); setEditingMode(null); }}>
            <form className="modal-panel shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={handleSaveRoles}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">User Management</p>
                  <h2>{editingMode === "admin" ? "Edit Admin Roles" : "Edit User Plan"}</h2>
                </div>
                <button className="icon-button" type="button" onClick={() => { setEditingUser(null); setEditingMode(null); }} title="Close form">
                  <X size={20} />
                </button>
              </div>

              <div className="modal-content form-grid">
                <div style={{ gridColumn: '1 / -1' }}>
                  <p className="text-sm text-slate-500 mb-4">Editing roles for <strong className="text-slate-700">{editingUser.email}</strong></p>

                  <div className="space-y-6">
                    {editingMode === "user" && (
                    <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30">
                      <label className="block text-sm font-semibold text-indigo-900 mb-3">User Roles &amp; Duration</label>
                      <div className="space-y-2 mb-4">
                        {availableRoles.filter(role => ["general_user", "pro_user", "max_user"].includes(role)).map(role => (
                          <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={editingUser.roles.includes(role)}
                              onChange={() => toggleRole(role)}
                              className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-slate-700 capitalize">{role.replace('_', ' ')}</span>
                          </label>
                        ))}
                      </div>

                      {/* Plan Duration - nested inside User Roles card, matching Create New User style */}
                      {editingUser.roles.some((r: string) => ["general_user", "pro_user", "max_user"].includes(r)) && (
                        <div className="pt-3 border-t border-indigo-200">
                          <label className="block text-xs font-medium text-indigo-800 mb-2">Duration</label>
                          <div className="flex gap-2">
                            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                              editPlanDuration === "1_month"
                                ? "bg-indigo-500 border-indigo-600 text-white shadow-sm"
                                : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            }`}>
                              <input
                                type="radio"
                                name="editPlanDuration"
                                value="1_month"
                                checked={editPlanDuration === "1_month"}
                                onChange={() => setEditPlanDuration("1_month")}
                                className="sr-only"
                              />
                              <Clock size={14} />
                              <span className="font-medium">1 Month</span>
                            </label>
                            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                              editPlanDuration === "1_year"
                                ? "bg-indigo-500 border-indigo-600 text-white shadow-sm"
                                : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            }`}>
                              <input
                                type="radio"
                                name="editPlanDuration"
                                value="1_year"
                                checked={editPlanDuration === "1_year"}
                                onChange={() => setEditPlanDuration("1_year")}
                                className="sr-only"
                              />
                              <Calendar size={14} />
                              <span className="font-medium">1 Year</span>
                            </label>
                            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                              editPlanDuration === "custom"
                                ? "bg-indigo-500 border-indigo-600 text-white shadow-sm"
                                : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            }`}>
                              <input
                                type="radio"
                                name="editPlanDuration"
                                value="custom"
                                checked={editPlanDuration === "custom"}
                                onChange={() => setEditPlanDuration("custom")}
                                className="sr-only"
                              />
                              <Calendar size={14} />
                              <span className="font-medium">Custom</span>
                            </label>
                          </div>
                          {editPlanDuration === "custom" && (
                            <DateRangeCalendar
                              startDate={customStartDate}
                              endDate={customEndDate}
                              onChange={(s, e) => { setCustomStartDate(s); setCustomEndDate(e); }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    )}

                    {editingMode === "admin" && availableRoles.some(role => ["general_admin", "super_admin"].includes(role)) && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800 mb-3">Admin Roles</h4>
                        <div className="space-y-3">
                          {availableRoles.filter(role => ["general_admin", "super_admin"].includes(role)).map(role => (
                            <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-rose-50 hover:bg-rose-100 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={editingUser.roles.includes(role)}
                                onChange={() => toggleRole(role)}
                                className="w-4 h-4 text-rose-600 border-rose-300 rounded focus:ring-rose-500"
                              />
                              <span className="text-sm font-medium text-rose-700 capitalize">{role.replace('_', ' ')}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => { setEditingUser(null); setEditingMode(null); }} className="secondary">
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Save Roles
                </button>
              </div>
            </form>
          </div>
        </AdminPortal>
      )}

      {/* Create New User Modal */}
      {creatingUser && (
        <AdminPortal>
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 backdrop-blur-[10px]" style={{ background: 'rgba(30, 41, 37, 0.22)' }} onClick={() => setCreatingUser(false)}>
            <form className="modal-panel shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={handleCreateUser}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">User Management</p>
                  <h2>Create New User</h2>
                </div>
                <button className="icon-button" type="button" onClick={() => setCreatingUser(false)} title="Close form">
                  <X size={20} />
                </button>
              </div>

              <div className="modal-content form-grid">
                <div style={{ gridColumn: '1 / -1' }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={createEmail}
                      onChange={e => setCreateEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white"
                      placeholder="user@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                    <input
                      type="password"
                      required
                      value={createPassword}
                      onChange={e => setCreatePassword(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Display Name <span className="text-slate-400 font-normal">(Optional)</span></label>
                    <input
                      type="text"
                      value={createDisplayName}
                      onChange={e => setCreateDisplayName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white"
                      placeholder="e.g. John Doe"
                    />
                  </div>

                  <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30">
                    <label className="block text-sm font-semibold text-indigo-900 mb-3">User Roles & Duration</label>
                    <div className="space-y-2 mb-4">
                      {availableRoles.filter(role => ["general_user", "pro_user", "max_user"].includes(role)).map(role => (
                        <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={createRoles.includes(role)}
                            onChange={() => toggleCreateRole(role)}
                            className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-slate-700 capitalize">{role.replace('_', ' ')}</span>
                        </label>
                      ))}
                    </div>
                    {createRoles.some(r => ["general_user", "pro_user", "max_user"].includes(r)) && (
                      <div className="pt-3 border-t border-indigo-200">
                        <label className="block text-xs font-medium text-indigo-800 mb-2">Duration</label>
                        <div className="flex gap-2">
                          <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                            planDuration === "1_month"
                              ? "bg-indigo-500 border-indigo-600 text-white shadow-sm"
                              : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          }`}>
                            <input
                              type="radio"
                              name="planDuration"
                              value="1_month"
                              checked={planDuration === "1_month"}
                              onChange={() => setPlanDuration("1_month")}
                              className="sr-only"
                            />
                            <Clock size={14} />
                            <span className="font-medium">1 Month</span>
                          </label>
                          <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                            planDuration === "1_year"
                              ? "bg-indigo-500 border-indigo-600 text-white shadow-sm"
                              : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          }`}>
                            <input
                              type="radio"
                              name="planDuration"
                              value="1_year"
                              checked={planDuration === "1_year"}
                              onChange={() => setPlanDuration("1_year")}
                              className="sr-only"
                            />
                            <Calendar size={14} />
                            <span className="font-medium">1 Year</span>
                          </label>
                          <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                            planDuration === "custom"
                              ? "bg-indigo-500 border-indigo-600 text-white shadow-sm"
                              : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                          }`}>
                            <input
                              type="radio"
                              name="planDuration"
                              value="custom"
                              checked={planDuration === "custom"}
                              onChange={() => setPlanDuration("custom")}
                              className="sr-only"
                            />
                            <Calendar size={14} />
                            <span className="font-medium">Custom</span>
                          </label>
                        </div>
                        {planDuration === "custom" && (
                          <DateRangeCalendar
                            startDate={createCustomStart}
                            endDate={createCustomEnd}
                            onChange={(s, e) => { setCreateCustomStart(s); setCreateCustomEnd(e); }}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {availableRoles.some(role => ["general_admin", "super_admin"].includes(role)) && (
                    <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/30">
                      <label className="block text-sm font-semibold text-rose-900 mb-3">Admin Roles</label>
                      <div className="space-y-2">
                        {availableRoles.filter(role => ["general_admin", "super_admin"].includes(role)).map(role => (
                          <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={createRoles.includes(role)}
                              onChange={() => toggleCreateRole(role)}
                              className="w-4 h-4 text-rose-600 border-rose-300 rounded focus:ring-rose-500"
                            />
                            <span className="text-sm font-medium text-rose-700 capitalize">{role.replace('_', ' ')}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => { setCreatingUser(false); setPlanDuration("1_month"); setCreateCustomStart(""); setCreateCustomEnd(""); }} className="secondary">
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Create User
                </button>
              </div>
            </form>
          </div>
        </AdminPortal>
      )}
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
    ? ["general_user", "pro_user", "max_user", "general_admin", "super_admin"]
    : ["general_user", "pro_user", "max_user"];

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
    daily_ai_chats: {
      description: "Limits the total number of AI chat messages across all conversations in a 24-hour period.",
      resetInfo: "Resets daily at midnight UTC (00:00 UTC).",
      example: "If limit is 15, user can send 15 messages total across all conversations today. Counter resets at midnight UTC."
    },
    monthly_ai_chats: {
      description: "Limits the total number of AI chat messages across all conversations in a calendar month.",
      resetInfo: "Resets on the 1st of each month at midnight UTC.",
      example: "If limit is 150, user can send 150 messages total this month. Counter resets on the 1st of next month."
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
        { key: "ai_messages_per_session", label: "Maximum AI Messages Per Session", description: "Limits the number of AI messages a user can send in a single conversation session." },
        { key: "daily_ai_chats", label: "Maximum Daily AI Messages", description: "Limits the total number of AI messages across all conversations in a 24-hour period." },
        { key: "monthly_ai_chats", label: "Maximum Monthly AI Messages", description: "Limits the total number of AI messages across all conversations in a calendar month." }
      ]
    },
    {
      name: "AI Models",
      features: [
        { key: "can_use_glm", label: "Can Use GLM Models", description: "Allows users to access GLM AI models (GLM-5.1, GLM-5, GLM-4.7, etc.)." },
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
      name: "Web Search",
      features: [
        { key: "can_use_web_search", label: "Can Use Web Search", description: "Controls whether users can enable web search in AI chat research mode." },
        { key: "web_searches_per_day", label: "Maximum Daily Web Searches", description: "Limits the number of web search requests per day." },
        { key: "web_searches_per_month", label: "Maximum Monthly Web Searches", description: "Limits the total number of web search requests in a calendar month." }
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
        { key: "admin_assign_user_roles", label: "Can Edit Individual User To User Role", description: "Allows changing a user's role to user-level roles (General User, Pro User, Max User)." },
        { key: "admin_assign_admin_roles", label: "Can Edit Individual User To Admin Role", description: "Allows changing a user's role to admin-level roles (General Admin, Super Admin)." },
        { key: "admin_suspend_user", label: "Can Suspend Users", description: "Allows suspending or activating user accounts to control their access." },
        { key: "admin_revoke_user", label: "Can Revoke User Tokens", description: "Allows revoking all active sessions for a user, forcing them to log in again." }
      ]
    },
    {
      name: "Role Management",
      features: [
        { key: "admin_manage_user_roles", label: "Can Manage User Roles", description: "Allows editing limits and quotas for user-level roles (General User, Pro User, Max User)." },
        { key: "admin_manage_role_limits", label: "Can Manage User Role Limits", description: "Allows managing role limits and toggling admin permissions." },
        { key: "admin_manage_admin_roles", label: "Can Manage Admin Roles", description: "Allows editing permissions for admin-level roles." }
      ]
    },
    {
      name: "System Configuration",
      features: [
        { key: "admin_manage_invites", label: "Can Manage Invite Codes", description: "Allows generating and managing invite codes for new user registration." },
        { key: "admin_manage_invite_requests", label: "Can Manage Invite Requests", description: "Allows approving or rejecting user invite requests." },
        { key: "admin_manage_plan_requests", label: "Can Manage Plan Requests", description: "Allows approving or rejecting user plan upgrade requests." },
        { key: "admin_manage_suspension_appeals", label: "Can Manage Suspension Appeals", description: "Allows reviewing and resolving user suspension appeals." },
        { key: "admin_manage_notification_texts", label: "Can Manage Notification Texts", description: "Allows editing system-wide notification message templates." },
        { key: "admin_manage_settings", label: "Can Manage App Settings", description: "Allows editing global application settings." },
        { key: "admin_view_audit_logs", label: "Can View Audit Logs", description: "Allows viewing system audit logs tracking all administrative actions." }
      ]
    }
  ];

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
          <div className="w-full sm:w-48">
            <label className="block text-sm font-medium text-slate-700 mb-1">Max Uses <span className="text-slate-400 font-normal">(-1 for unlimited)</span></label>
            <input
              type="number"
              value={maxUses}
              onChange={e => setMaxUses(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
            />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-sm font-medium text-slate-700 mb-1">Expiration Hours <span className="text-slate-400 font-normal">(Default 24)</span></label>
            <input
              type="number"
              value={expirationHours}
              onChange={e => setExpirationHours(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
              min="1"
            />
          </div>
          <button type="submit" className="w-full sm:w-auto px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap">
            Generate Code
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
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
              {invites.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-2">
                    <span className="font-mono text-indigo-700 font-bold tracking-widest bg-indigo-50 px-3 py-1 rounded border border-indigo-100">{inv.code}</span>
                    <button 
                      onClick={() => navigator.clipboard.writeText(inv.code)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title="Copy Code"
                    >
                      <Copy size={16} />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center text-slate-700 font-medium">{inv.used_count}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${inv.max_uses === -1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                      {inv.max_uses === -1 ? "Unlimited" : inv.max_uses}
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

  useEffect(() => {
    api.get<any[]>("/admin/audit-logs").then(setLogs).catch(console.error);
  }, []);

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300">
      <div className="profile-system-card glass-panel flex-1 flex flex-col min-h-0 overflow-hidden" style={{ padding: '0' }}>
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
            {logs.map((log) => (
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
        const subject = encodeURIComponent("Welcome to ScholarDock - Your Invite Code");
        const body = encodeURIComponent(`Hi ${req.name},\n\nWe are excited to welcome you to ScholarDock! Here is your single-use invite code to create your account:\n\n${res.invite_code}\n\nPlease head to the registration page and sign up with this code.\n\nBest,\nThe ScholarDock Team`);
        const mailtoLink = `mailto:${req.email}?subject=${subject}&body=${body}`;
        const a = document.createElement('a');
        a.href = mailtoLink;
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
          <button onClick={fetchRequests} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
            Refresh
          </button>
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
                {requests.map((r) => (
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

function PlanRequestsTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const res = await api.get<any[]>("/admin/plan-requests");
      setRequests(res);
    } catch (err) {
      console.error(err);
      emitUiError({ title: "Failed to load requests", message: "Could not fetch plan requests." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleReview = async (id: number, action: string) => {
    try {
      await api.post(`/admin/plan-requests/${id}/review`, { action });
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
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><CheckCircle size={18} className="text-indigo-600" /> Plan Upgrade Requests</h2>
          <button onClick={fetchRequests} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
            Refresh
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {requests.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <ShieldAlert size={48} className="mb-4 opacity-20" />
              <p>No plan requests found.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-200/50 shadow-sm z-10">
                <tr>
                  <th className="px-4 py-3">User Email</th>
                  <th className="px-4 py-3">Requested Plan</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{r.user_email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        r.requested_plan === 'pro_user' ? 'bg-emerald-100 text-emerald-700' :
                        r.requested_plan === 'max_user' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {r.requested_plan === 'pro_user' ? 'Pro' : r.requested_plan === 'max_user' ? 'Max' : 'General'}
                      </span>
                      {r.billing_cycle && (
                        <span className="ml-2 text-xs font-medium text-slate-500 capitalize bg-slate-100 px-2 py-0.5 rounded">
                          {r.billing_cycle}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate" title={r.message}>{r.message || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        r.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                        r.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(r.created_at).toLocaleDateString("en-GB")}</td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'Pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleReview(r.id, 'Approve')}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded text-xs font-semibold transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReview(r.id, 'Reject')}
                            className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded text-xs font-semibold transition-colors"
                          >
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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <h2 className="text-xl font-semibold text-slate-800">App Settings</h2>
      </div>
      
      <div className="profile-system-card glass-panel overflow-hidden shrink-0 mb-6" style={{ padding: '0' }}>
        <div className="p-5 border-b border-slate-200/50 flex items-center gap-3 bg-slate-50/30">
          <div className="bg-rose-100/50 p-2 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">JWT Configuration</h3>
            <p className="text-sm text-slate-500">Manage JSON Web Token secrets and lifetimes.</p>
          </div>
        </div>
        <div className="p-5 space-y-6">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">JWT Sign Key</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input 
                  type={showJwt ? "text" : "password"} 
                  defaultValue={settings["jwt_secret_key"] || "scholar-dock-local-first-secret-key-do-not-use-in-cloud"}
                  id="input-jwt_secret_key"
                  className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowJwt(!showJwt)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                >
                  {showJwt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button 
                onClick={() => {
                  const el = document.getElementById("input-jwt_secret_key") as HTMLInputElement;
                  if (el) handleUpdate("jwt_secret_key", el.value);
                }}
                className="profile-primary-button"
              >
                Update
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
                id="input-jwt_expiration_days"
                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
              <button 
                onClick={() => {
                  const el = document.getElementById("input-jwt_expiration_days") as HTMLInputElement;
                  if (el) handleUpdate("jwt_expiration_days", el.value);
                }}
                className="profile-primary-button"
              >
                Update
              </button>
            </div>
            <p className="text-xs text-slate-500 font-medium">How many days until a user session expires.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SuspensionAppealsTab() {
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        <button onClick={fetchAppeals} className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-100">
          Refresh
        </button>
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
              appeals.map((a) => (
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
    admin_manage_settings: isSuperAdmin,
    admin_suspend_user: isSuperAdmin,
    admin_manage_plan_requests: true,
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
          {activeTab === "dashboard" && <DashboardTab />}
          {activeTab === "users" && <UsersTab adminPermissions={adminPermissions} />}
          {activeTab === "limits" && <LimitsTab onLimitsUpdated={fetchAdminPermissions} />}
          {activeTab === "notification_texts" && adminPermissions["admin_manage_notification_texts"] && <NotificationTextsTab />}
          {activeTab === "plan_requests" && adminPermissions["admin_manage_plan_requests"] && <PlanRequestsTab />}
          {activeTab === "invite_requests" && adminPermissions["admin_manage_invite_requests"] && <InviteRequestsTab />}
          {activeTab === "suspension_appeals" && adminPermissions["admin_manage_suspension_appeals"] && <SuspensionAppealsTab />}
          {activeTab === "invites" && adminPermissions["admin_manage_invites"] && <InvitesTab />}
          {activeTab === "audit" && adminPermissions["admin_view_audit_logs"] && <AuditLogsTab />}
          {activeTab === "settings" && adminPermissions["admin_manage_settings"] && <SettingsTab />}
        </div>
    </div>
  );
}
