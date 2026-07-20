import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  BellRing,
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  KeyRound,
  Megaphone,
  MoreVertical,
  Pencil,
  Search,
  Send,
  ShieldAlert,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { hasRole, formatRoleName } from "../../lib/auth";
import { api } from "../../lib/api";
import { emitUiError } from "../../lib/uiError";
import { adminNotificationCategories, getNotificationSettingLabel } from "../../config/notificationLabels";
import { useDialog } from "../DialogProvider";
import DateRangeCalendar from "../DateRangeCalendar";

type UserRecord = {
  id: string;
  email: string;
  display_name: string;
  roles: string[];
  is_active: boolean;
  last_login_at?: string | null;
  plan_started_at?: string | null;
  plan_ends_at?: string | null;
  polar_subscription_id?: string | null;
  polar_cancel_at_period_end?: number | null;
};

type RoleFilter = "all" | "any_user" | "any_admin" | "free_user" | "general_user" | "pro_user" | "max_user" | "general_admin" | "super_admin";
type PlanStatusFilter = "all" | "expiring_soon" | "expiring_soon_3d" | "expired";
type AccountStatusFilter = "all" | "active" | "suspended";
type NotificationModalMode = "broadcast" | "user" | null;

function AdminPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const root = document.getElementById("admin-view-root");
  if (!root) return null;
  return createPortal(children, root);
}

const roleTabs = [
  { id: "all" as const, label: "All Users" },
  { id: "any_user" as const, label: "Any User" },
  { id: "free_user" as const, label: "Free User" },
  { id: "general_user" as const, label: "Basic User" },
  { id: "pro_user" as const, label: "Pro User" },
  { id: "max_user" as const, label: "Max User" },
  { id: "any_admin" as const, label: "Any Admin" },
  { id: "general_admin" as const, label: "Basic Admin" },
  { id: "super_admin" as const, label: "Super Admin" },
];

// User tiers (free/general/pro/max) are mutually exclusive — a user holds exactly
// one plan tier. Admin roles (general/super) are mutually exclusive among
// themselves. free_user must be part of the tier group or it would stack with
// the other tiers instead of replacing them.
const userTierRoles = ["free_user", "general_user", "pro_user", "max_user"];
const adminRoleKeys = ["general_admin", "super_admin"];

/** Single-select within a role group: picking another role replaces the previous
 *  one in that group; re-clicking the selected role clears it (so an admin can
 *  still demote/remove a role). Roles outside the group are left untouched. */
function selectRoleExclusive(currentRoles: string[], role: string): string[] {
  if (currentRoles.includes(role)) {
    return currentRoles.filter((item) => item !== role);
  }
  let next = currentRoles.filter(
    (item) => !(userTierRoles.includes(role) ? userTierRoles : adminRoleKeys).includes(item)
  );
  next.push(role);
  return next;
}

const planTabs = [
  { id: "all" as const, label: "All Plans", icon: null },
  { id: "expiring_soon" as const, label: "Expiring Soon (7 days)", icon: Clock },
  { id: "expiring_soon_3d" as const, label: "Expiring Soon (3 days)", icon: Clock },
  { id: "expired" as const, label: "Expired", icon: XCircle },
];

const statusTabs = [
  { id: "all" as const, label: "All Statuses", icon: null },
  { id: "active" as const, label: "Active", icon: CheckCircle },
  { id: "suspended" as const, label: "Suspended", icon: Ban },
];

const adminNotificationOptions = adminNotificationCategories.flatMap((category) =>
  category.settings.map((setting) => ({ value: setting.key, label: setting.label, description: setting.description }))
);

export function UsersTab({ adminPermissions, refreshTrigger }: { adminPermissions: Record<string, boolean>; refreshTrigger?: number }) {
  const { showConfirm, showAlert } = useDialog();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editingMode, setEditingMode] = useState<"user" | "admin" | null>(null);
  const [editPlanDuration, setEditPlanDuration] = useState<"1_month" | "1_quarter" | "custom">("1_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [planStatusFilter, setPlanStatusFilter] = useState<PlanStatusFilter>("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  const [creatingUser, setCreatingUser] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createRoles, setCreateRoles] = useState<string[]>(["general_user"]);
  const [planDuration, setPlanDuration] = useState<"1_month" | "1_quarter" | "custom">("1_month");
  const [createCustomStart, setCreateCustomStart] = useState("");
  const [createCustomEnd, setCreateCustomEnd] = useState("");

  const [notificationModalMode, setNotificationModalMode] = useState<NotificationModalMode>(null);
  const [notificationTargetUser, setNotificationTargetUser] = useState<UserRecord | null>(null);
  const [notificationScope, setNotificationScope] = useState<"all" | "filtered">("all");
  const [notificationCategory, setNotificationCategory] = useState("system");
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationBody, setNotificationBody] = useState("");
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  // SCHOLARDOCX-0147: fetch the full user list once per mount/refresh. No
  // cache-buster query param — admin data is authed and short-lived enough
  // that the default fetch behavior is fine; the `?t=` suffix only defeated
  // caching between mounts.
  const fetchUsers = () => {
    api.get<UserRecord[]>(`/admin/users`).then(setUsers).catch(console.error);
  };

  // Patch a single user in the local list after a mutation, instead of
  // refetching the entire list (which re-downloads + re-renders every row).
  const upsertUser = (updated: any) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
  };

  useEffect(() => {
    fetchUsers();
  }, [refreshTrigger]);

  useEffect(() => {
    const handleClickOutside = () => {
      setOpenActionMenuId(null);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const availableRoles = adminPermissions["admin_assign_admin_roles"]
    ? ["free_user", "general_user", "pro_user", "max_user", "general_admin", "super_admin"]
    : ["free_user", "general_user", "pro_user", "max_user"];

  const getPlanStatus = (user: UserRecord): "expired" | "expiring_soon" | "active" | "no_plan" => {
    if (!user.plan_ends_at) return "no_plan";
    const now = new Date();
    const endDate = new Date(user.plan_ends_at);
    const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) return "expired";
    if (daysUntilExpiry <= 7) return "expiring_soon";
    return "active";
  };

  const matchesRole = (user: UserRecord, filter: RoleFilter) => {
    if (filter === "all") return true;
    if (filter === "any_user") return user.roles.some(role => userTierRoles.includes(role));
    if (filter === "any_admin") return user.roles.some(role => adminRoleKeys.includes(role));
    return user.roles.includes(filter);
  };
  const matchesPlan = (user: UserRecord, filter: PlanStatusFilter) => {
    if (filter === "all") return true;
    if (!user.plan_ends_at) return false;
    const now = new Date();
    const endDate = new Date(user.plan_ends_at);
    const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (filter === "expired") return daysUntilExpiry < 0;
    if (filter === "expiring_soon") return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
    if (filter === "expiring_soon_3d") return daysUntilExpiry >= 0 && daysUntilExpiry <= 3;
    return false;
  };
  const matchesStatus = (user: UserRecord, filter: AccountStatusFilter) => {
    if (filter === "all") return true;
    return filter === "active" ? user.is_active : !user.is_active;
  };

  const matchesSearch = (user: UserRecord, query: string) => {
    if (!query) return true;
    const lowerQuery = query.toLowerCase();
    return (
      user.email.toLowerCase().includes(lowerQuery) ||
      (user.display_name && user.display_name.toLowerCase().includes(lowerQuery))
    );
  };

  const filterUsers = ({
    role = roleFilter,
    plan = planStatusFilter,
    status = statusFilter,
    query = searchQuery,
  }: {
    role?: RoleFilter;
    plan?: PlanStatusFilter;
    status?: AccountStatusFilter;
    query?: string;
  }) =>
    users.filter((user) => matchesRole(user, role) && matchesPlan(user, plan) && matchesStatus(user, status) && matchesSearch(user, query));

  const filteredUsers = useMemo(
    () => filterUsers({}),
    [users, roleFilter, planStatusFilter, statusFilter, searchQuery]
  );

  // Render guard (not pagination): cap how many heavy rows the DOM holds at
  // once. The full filtered set stays in memory for counts and for the
  // notification recipient list; only the rendered slice is bounded.
  const RENDER_CAP = 100;
  const cappedRender = filteredUsers.length > RENDER_CAP;

  const openBroadcastNotificationModal = () => {
    setNotificationModalMode("broadcast");
    setNotificationTargetUser(null);
    setNotificationScope("all");
    setNotificationCategory("system");
    setNotificationTitle("");
    setNotificationBody("");
  };

  const openUserNotificationModal = (user: UserRecord) => {
    setNotificationModalMode("user");
    setNotificationTargetUser(user);
    setNotificationScope("filtered");
    setNotificationCategory("system");
    setNotificationTitle("");
    setNotificationBody("");
  };

  const closeNotificationModal = () => {
    setNotificationModalMode(null);
    setNotificationTargetUser(null);
    setNotificationTitle("");
    setNotificationBody("");
    setNotificationCategory("system");
    setIsSendingNotification(false);
  };

  const handleSendNotification = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedTitle = notificationTitle.trim();
    const cleanedBody = notificationBody.trim();
    if (!cleanedTitle || !cleanedBody) {
      emitUiError({ title: "Validation error", message: "Notification title and body are required.", kind: "general" });
      return;
    }

    const recipientIds =
      notificationModalMode === "user"
        ? notificationTargetUser
          ? [notificationTargetUser.id]
          : []
        : notificationScope === "filtered"
          ? filteredUsers.map((user) => user.id)
          : [];

    if (notificationModalMode !== "user" && notificationScope === "filtered" && recipientIds.length === 0) {
      emitUiError({ title: "No recipients", message: "The current filters do not match any users.", kind: "general" });
      return;
    }

    setIsSendingNotification(true);
    try {
      const response = await api.post<{
        delivered_count: number;
        skipped_count: number;
      }>("/admin/notifications/send", {
        title: cleanedTitle,
        body: cleanedBody,
        category: notificationCategory,
        send_to_all: notificationModalMode === "broadcast" && notificationScope === "all",
        recipient_user_ids: recipientIds,
      });
      closeNotificationModal();
      const label = getNotificationSettingLabel(notificationCategory);
      showAlert(
        <p className="text-sm text-slate-600">
          {`${label} notice delivered to ${response.delivered_count} user${response.delivered_count === 1 ? "" : "s"}${response.skipped_count ? `, skipped ${response.skipped_count} based on preferences.` : "."}`}
        </p>,
        "Notification Sent"
      );
    } catch {
      setIsSendingNotification(false);
      emitUiError({ title: "Action failed", message: "Failed to send the notification.", kind: "general" });
    }
  };

  const handleToggleStatus = async (user: UserRecord) => {
    const confirmed = await showConfirm(
      `Are you sure you want to ${user.is_active ? "suspend" : "activate"} ${user.email}?`,
      "Confirm Status Change"
    );
    if (!confirmed) return;
    try {
      const updated = await api.post<UserRecord>(`/admin/users/${user.id}/toggle-status`, { is_active: !user.is_active });
      upsertUser(updated);
    } catch {
      emitUiError({ title: "Action failed", message: "Failed to toggle status.", kind: "general" });
    }
  };

  const handleRevoke = async (user: UserRecord) => {
    const confirmed = await showConfirm(
      `Revoke all tokens for ${user.email}? They will be logged out immediately.`,
      "Confirm Revoke"
    );
    if (!confirmed) return;
    try {
      const updated = await api.post<UserRecord>(`/admin/users/${user.id}/revoke`, {});
      upsertUser(updated);
    } catch {
      emitUiError({ title: "Action failed", message: "Failed to revoke tokens.", kind: "general" });
    }
  };

  const handleSaveRoles = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const hasUserRole = editingUser.roles.some((r: string) => ["free_user", "general_user", "pro_user", "max_user"].includes(r));
      const payload: any = { roles: editingUser.roles };

      if (hasUserRole && editingMode === "user") {
        if (editPlanDuration === "custom") {
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
          payload.plan_duration_days = editPlanDuration === "1_month" ? 30 : 90;
        }
      }

      const updated = await api.patch<UserRecord>(`/admin/users/${editingUser.id}/roles`, payload);
      upsertUser(updated);
      setEditingUser(null);
      setEditingMode(null);
      setEditPlanDuration("1_month");
      setCustomStartDate("");
      setCustomEndDate("");
    } catch {
      emitUiError({ title: "Permission denied", message: "Failed to update roles. You might not have super_admin permissions.", kind: "permission" });
    }
  };

  const toggleRole = (role: string) => {
    setEditingUser({ ...editingUser, roles: selectRoleExclusive(editingUser.roles, role) });
  };

  const toggleCreateRole = (role: string) => {
    setCreateRoles((prev) => selectRoleExclusive(prev, role));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const hasUserRole = createRoles.some((role) => ["free_user", "general_user", "pro_user", "max_user"].includes(role));
      const payload: any = {
        email: createEmail,
        password: createPassword,
        display_name: createDisplayName || "User",
        roles: createRoles,
      };
      if (hasUserRole) {
        if (planDuration === "custom") {
          if (!createCustomStart || !createCustomEnd) {
            emitUiError({ title: "Validation Error", message: "Please select both start and end dates for custom duration.", kind: "general" });
            return;
          }
          const start = new Date(createCustomStart);
          const end = new Date(createCustomEnd);
          if (end <= start) {
            emitUiError({ title: "Validation Error", message: "End date must be after start date.", kind: "general" });
            return;
          }
          payload.plan_start_date = createCustomStart;
          payload.plan_end_date = createCustomEnd;
        } else {
          payload.plan_duration = planDuration;
        }
      }
      const created = await api.post<UserRecord>("/admin/users", payload);
      // New users sort to the top by created_at DESC; prepend locally instead
      // of refetching the whole list.
      setUsers((prev) => [{ ...created }, ...prev]);
      setCreatingUser(false);
      setCreateEmail("");
      setCreatePassword("");
      setCreateDisplayName("");
      setCreateRoles(["general_user"]);
      setPlanDuration("1_month");
      setCreateCustomStart("");
      setCreateCustomEnd("");
    } catch (err: any) {
      const message = err?.response?.data?.detail || "Failed to create user";
      emitUiError({ title: "Action failed", message: String(message), kind: "general" });
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-300">
      <div className="shrink-0 flex flex-wrap justify-between gap-4 items-center profile-system-card glass-panel" style={{ padding: "16px" }}>
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-indigo-600" /> User Management
          </h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage user access, statuses, active tokens, plans, and targeted admin notices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative mr-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-2 bg-white border border-slate-200/50 rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
            />
          </div>
          {adminPermissions["admin_send_notifications"] && (
            <button onClick={openBroadcastNotificationModal} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors">
              <Megaphone size={16} />
              Send Notification
            </button>
          )}
          <button onClick={() => setCreatingUser(true)} className="profile-primary-button">
            <Users size={16} />
            Create User
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-slate-100/50 p-3.5 rounded-xl border border-slate-200/50 shrink-0">
        {/* Role Filters Group */}
        <div className="flex flex-col gap-1.5 w-full">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Role</span>
          <div className="flex gap-1.5 flex-wrap">
            {roleTabs.map((tab) => {
              const isActive = roleFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRoleFilter(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-all rounded-lg border border-transparent ${isActive
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    }`}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-slate-200/80 w-full" />

        {/* Plan / Status / Selection Filters Group */}
        <div className="flex flex-wrap gap-4 items-center w-full">
          {/* Plan Subgroup */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Plan</span>
            <div className="flex items-center gap-1.5">
              {planTabs.map((tab) => {
                const isActive = planStatusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setPlanStatusFilter(tab.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-all rounded-lg border border-transparent ${isActive
                      ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                      }`}
                  >
                    {tab.icon && <tab.icon size={13} />}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-px bg-slate-200 h-8 hidden sm:block" />

          {/* Status Subgroup */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Status</span>
            <div className="flex items-center gap-1.5">
              {statusTabs.map((tab) => {
                const isActive = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-all rounded-lg border border-transparent ${isActive
                      ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                      }`}
                  >
                    {tab.icon && <tab.icon size={13} />}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-px bg-slate-200 h-8 hidden sm:block" />

          {/* Selection Subgroup */}
          <div className="flex flex-col gap-1.5 justify-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Selection</span>
            <div className="flex items-center px-2 py-1">
              <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                {filteredUsers.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-system-card glass-panel flex-1 flex flex-col min-h-0 overflow-hidden" style={{ padding: "0" }}>
        <div className="overflow-auto flex-1 relative">
          <table className="w-full text-sm text-left whitespace-nowrap relative">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-200/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-semibold">ID</th>
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-6 py-4 font-semibold">Roles</th>
                <th className="px-6 py-4 font-semibold">Plan Duration</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Last Login</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.slice(0, RENDER_CAP).map((user) => {
                const planStatus = getPlanStatus(user);
                return (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-slate-500">{user.id}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{user.display_name || "Unknown User"}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {user.roles.map((role) => (
                          <span key={role} className={`px-2 py-0.5 rounded text-xs font-medium ${
                            role === "super_admin" ? "bg-rose-100 text-rose-700" :
                            role === "general_admin" ? "bg-amber-100 text-amber-700" :
                            "bg-indigo-100/50 text-indigo-700"
                          }`}>
                            {formatRoleName(role)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {user.plan_started_at || user.plan_ends_at ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/60 shadow-sm w-fit">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={12} className="text-emerald-500" />
                              <span className="text-slate-700 font-medium tracking-tight">
                                {user.plan_started_at ? new Date(user.plan_started_at).toLocaleDateString("en-GB") : "-"}
                              </span>
                            </div>
                            <span className="text-slate-300 text-xs px-0.5">→</span>
                            <div className="flex items-center gap-1.5">
                              <Calendar size={12} className={planStatus === "expired" ? "text-rose-500" : planStatus === "expiring_soon" ? "text-amber-500" : "text-slate-400"} />
                              <span className={`font-medium tracking-tight ${planStatus === "expired" ? "text-rose-600" : planStatus === "expiring_soon" ? "text-amber-600" : "text-slate-700"}`}>
                                {user.plan_ends_at ? new Date(user.plan_ends_at).toLocaleDateString("en-GB") : "-"}
                              </span>
                            </div>
                          </div>
                          {(planStatus === "expired" || planStatus === "expiring_soon") && (
                            <div className="flex gap-2">
                              {planStatus === "expired" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-rose-100 text-rose-700">
                                  <XCircle size={10} /> Expired
                                </span>
                              )}
                              {planStatus === "expiring_soon" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700">
                                  <Clock size={10} /> Soon
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="italic text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${user.is_active ? "bg-emerald-100/50 text-emerald-700" : "bg-slate-100/50 text-slate-600"}`}>
                        {user.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {user.is_active ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.last_login_at ? (
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/60 shadow-sm w-fit">
                          <Clock size={12} className="text-indigo-500" />
                          <span className="text-slate-700 font-medium text-[11px] tracking-tight">
                            {new Date(user.last_login_at).toLocaleString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-100 bg-slate-50/50 text-[11px] font-medium text-slate-400 italic tracking-tight">
                          Never logged in
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block text-left">
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenActionMenuId(openActionMenuId === user.id ? null : user.id); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 rounded-lg text-xs font-semibold transition-all shadow-sm"
                        >
                          Manage
                          <ChevronDown size={14} className={`transition-transform duration-200 ${openActionMenuId === user.id ? "rotate-180" : ""}`} />
                        </button>
                        {openActionMenuId === user.id && (
                          <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-slate-200 z-50 flex flex-col p-1.5 gap-1">
                            {adminPermissions["admin_send_notifications"] && (
                              <button
                                onClick={() => { setOpenActionMenuId(null); openUserNotificationModal(user); }}
                                className="px-3 py-2 bg-transparent text-sky-700 hover:bg-sky-50 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-left"
                              >
                                <BellRing size={14} />
                                <span>Notify</span>
                              </button>
                            )}
                            {(!user.roles.some((role) => ["general_admin", "super_admin"].includes(role)) || adminPermissions["admin_assign_admin_roles"]) ? (
                              <>
                                {(adminPermissions["admin_assign_user_roles"] || adminPermissions["admin_assign_admin_roles"]) && (
                                  <button
                                    onClick={() => { setOpenActionMenuId(null); setEditingUser(user); setEditingMode("user"); }}
                                    className="px-3 py-2 bg-transparent text-indigo-700 hover:bg-indigo-50 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-left"
                                  >
                                    <Pencil size={14} />
                                    <span>Plan</span>
                                  </button>
                                )}
                                {adminPermissions["admin_assign_admin_roles"] && (
                                  <button
                                    onClick={() => { setOpenActionMenuId(null); setEditingUser(user); setEditingMode("admin"); }}
                                    className="px-3 py-2 bg-transparent text-rose-700 hover:bg-rose-50 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-left"
                                  >
                                    <ShieldAlert size={14} />
                                    <span>Admin</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => { setOpenActionMenuId(null); handleToggleStatus(user); }}
                                  className={`px-3 py-2 bg-transparent rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-left ${user.is_active ? "text-amber-700 hover:bg-amber-50" : "text-emerald-700 hover:bg-emerald-50"}`}
                                >
                                  {user.is_active ? <XCircle size={14} /> : <CheckCircle size={14} />}
                                  <span>{user.is_active ? "Suspend" : "Activate"}</span>
                                </button>
                                <button
                                  onClick={() => { setOpenActionMenuId(null); handleRevoke(user); }}
                                  className="px-3 py-2 bg-transparent text-rose-700 hover:bg-rose-50 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-left"
                                >
                                  <KeyRound size={14} />
                                  <span>Revoke</span>
                                </button>
                              </>
                            ) : (
                              <div className="px-3 py-2 text-xs text-slate-400 italic">Protected Admin</div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {cappedRender && (
            <div className="px-6 py-3 text-xs text-slate-500 bg-slate-50/50 border-t border-slate-200/50">
              Showing the first {RENDER_CAP} of {filteredUsers.length} matching users. Refine the search or filters above to narrow the list.
            </div>
          )}
        </div>
      </div>

      {notificationModalMode && (
        <AdminPortal>
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 backdrop-blur-[10px]" style={{ background: "rgba(30, 41, 37, 0.22)" }} onClick={closeNotificationModal}>
            <form className="modal-panel shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={handleSendNotification}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Notifications</p>
                  <h2>{notificationModalMode === "user" ? `Notify ${notificationTargetUser?.email || "user"}` : "Send Common Notification"}</h2>
                </div>
                <button className="icon-button" type="button" onClick={closeNotificationModal} title="Close form">
                  <X size={20} />
                </button>
              </div>

              <div className="modal-content form-grid">
                <div style={{ gridColumn: "1 / -1" }} className="space-y-4">
                  {notificationModalMode === "broadcast" && (
                    <div className="p-4 rounded-xl border border-sky-100 bg-sky-50/40">
                      <label className="block text-sm font-semibold text-sky-900 mb-3">Recipients</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className={`rounded-xl border p-3 cursor-pointer transition-colors ${notificationScope === "all" ? "border-sky-300 bg-white" : "border-sky-100 bg-white/70"}`}>
                          <div className="flex items-start gap-3">
                            <input type="radio" name="notificationScope" checked={notificationScope === "all"} onChange={() => setNotificationScope("all")} className="mt-1" />
                            <div>
                              <p className="text-sm font-semibold text-slate-800">All users</p>
                              <p className="text-xs text-slate-500 mt-1">Send this notice to every user in the system.</p>
                              <p className="text-xs font-semibold text-sky-700 mt-2">{users.length} recipient{users.length === 1 ? "" : "s"}</p>
                            </div>
                          </div>
                        </label>
                        <label className={`rounded-xl border p-3 cursor-pointer transition-colors ${notificationScope === "filtered" ? "border-sky-300 bg-white" : "border-sky-100 bg-white/70"}`}>
                          <div className="flex items-start gap-3">
                            <input type="radio" name="notificationScope" checked={notificationScope === "filtered"} onChange={() => setNotificationScope("filtered")} className="mt-1" />
                            <div>
                              <p className="text-sm font-semibold text-slate-800">Current filtered users</p>
                              <p className="text-xs text-slate-500 mt-1">Use the active role, plan, and status filters as the recipient list.</p>
                              <p className="text-xs font-semibold text-sky-700 mt-2">{filteredUsers.length} recipient{filteredUsers.length === 1 ? "" : "s"}</p>
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {notificationModalMode === "user" && notificationTargetUser && (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-4 py-3 text-sm text-slate-700">
                      This notice will be sent only to <span className="font-semibold text-slate-900">{notificationTargetUser.email}</span>.
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notification Category</label>
                    <select
                      value={notificationCategory}
                      onChange={(event) => setNotificationCategory(event.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white"
                    >
                      {adminNotificationOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-slate-500">
                      {adminNotificationOptions.find((option) => option.value === notificationCategory)?.description || "Users can control this category from Settings unless it is a system notice."}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={notificationTitle}
                      onChange={(event) => setNotificationTitle(event.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white"
                      placeholder="Enter a clear notification title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Body</label>
                    <textarea
                      value={notificationBody}
                      onChange={(event) => setNotificationBody(event.target.value)}
                      rows={5}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white resize-y min-h-[132px]"
                      placeholder="Write the message users should receive."
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={closeNotificationModal} className="secondary">
                  Cancel
                </button>
                <button type="submit" className="primary inline-flex items-center gap-2" disabled={isSendingNotification}>
                  <Send size={15} />
                  {isSendingNotification ? "Sending..." : "Send Notification"}
                </button>
              </div>
            </form>
          </div>
        </AdminPortal>
      )}

      {editingUser && editingMode && (
        <AdminPortal>
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 backdrop-blur-[10px]" style={{ background: "rgba(30, 41, 37, 0.22)" }} onClick={() => { setEditingUser(null); setEditingMode(null); }}>
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
                <div style={{ gridColumn: "1 / -1" }}>
                  <p className="text-sm text-slate-500 mb-4">
                    Editing roles for <strong className="text-slate-700">{editingUser.email}</strong>
                  </p>

                  <div className="space-y-6">
                    {editingMode === "user" && (
                      <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30">
                        <label className="block text-sm font-semibold text-indigo-900 mb-3">User Roles &amp; Duration</label>
                        {editingUser.polar_subscription_id ? (
                          <div className="mb-4 p-3 rounded-lg border border-sky-200 bg-sky-50 flex flex-col gap-1">
                            <span className="text-sm font-semibold text-sky-800">Plan managed via Polar.sh</span>
                            <span className="text-xs text-sky-600">Manual plan changes are disabled. Subscription ID: {editingUser.polar_subscription_id}</span>
                          </div>
                        ) : (
                          <div className="space-y-2 mb-4">
                            {availableRoles.filter((role) => ["free_user", "general_user", "pro_user", "max_user"].includes(role)).map((role) => (
                              <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 cursor-pointer transition-colors">
                                <input
                                  type="radio"
                                  name="editUserTier"
                                  checked={editingUser.roles.includes(role)}
                                  onClick={() => toggleRole(role)}
                                  onChange={() => {}}
                                  className="w-4 h-4 accent-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm font-medium text-slate-700 capitalize">{formatRoleName(role)}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {editingUser.roles.some((role: string) => ["free_user", "general_user", "pro_user", "max_user"].includes(role)) && !editingUser.polar_subscription_id && (
                          <div className="pt-3 border-t border-indigo-200">
                            <label className="block text-xs font-medium text-indigo-800 mb-2">Duration</label>
                            <div className="flex gap-2">
                              {[
                                { value: "1_month" as const, label: "1 Month", icon: Clock },
                                { value: "1_quarter" as const, label: "1 Quarter", icon: Calendar },
                                { value: "custom" as const, label: "Custom", icon: Calendar },
                              ].map((option) => (
                                <label
                                  key={option.value}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${editPlanDuration === option.value ? "bg-indigo-500 border-indigo-600 text-white shadow-sm" : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50"}`}
                                >
                                  <input
                                    type="radio"
                                    name="editPlanDuration"
                                    value={option.value}
                                    checked={editPlanDuration === option.value}
                                    onChange={() => setEditPlanDuration(option.value)}
                                    className="sr-only"
                                  />
                                  <option.icon size={14} />
                                  <span className="font-medium">{option.label}</span>
                                </label>
                              ))}
                            </div>
                            {editPlanDuration === "custom" && (
                              <DateRangeCalendar
                                startDate={customStartDate}
                                endDate={customEndDate}
                                onChange={(start, end) => { setCustomStartDate(start); setCustomEndDate(end); }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {editingMode === "admin" && availableRoles.some((role) => ["general_admin", "super_admin"].includes(role)) && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800 mb-3">Admin Roles</h4>
                        <div className="space-y-3">
                          {availableRoles.filter((role) => ["general_admin", "super_admin"].includes(role)).map((role) => (
                            <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-rose-50 hover:bg-rose-100 cursor-pointer transition-colors">
                              <input
                                type="radio"
                                name="editAdminRole"
                                checked={editingUser.roles.includes(role)}
                                onClick={() => toggleRole(role)}
                                onChange={() => {}}
                                className="w-4 h-4 accent-rose-600 focus:ring-rose-500"
                              />
                              <span className="text-sm font-medium text-rose-700 capitalize">{formatRoleName(role)}</span>
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

      {creatingUser && (
        <AdminPortal>
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 backdrop-blur-[10px]" style={{ background: "rgba(30, 41, 37, 0.22)" }} onClick={() => setCreatingUser(false)}>
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
                <div style={{ gridColumn: "1 / -1" }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={createEmail}
                      onChange={(event) => setCreateEmail(event.target.value)}
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
                      onChange={(event) => setCreatePassword(event.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Display Name <span className="text-slate-400 font-normal">(Optional)</span></label>
                    <input
                      type="text"
                      value={createDisplayName}
                      onChange={(event) => setCreateDisplayName(event.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white"
                      placeholder="e.g. John Doe"
                    />
                  </div>

                  <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30">
                    <label className="block text-sm font-semibold text-indigo-900 mb-3">User Roles &amp; Duration</label>
                    <div className="space-y-2 mb-4">
                      {availableRoles.filter((role) => ["free_user", "general_user", "pro_user", "max_user"].includes(role)).map((role) => (
                        <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 cursor-pointer transition-colors">
                          <input
                            type="radio"
                            name="createUserTier"
                            checked={createRoles.includes(role)}
                            onClick={() => toggleCreateRole(role)}
                            onChange={() => {}}
                            className="w-4 h-4 accent-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-slate-700 capitalize">{formatRoleName(role)}</span>
                        </label>
                      ))}
                    </div>
                    {createRoles.some((role) => ["free_user", "general_user", "pro_user", "max_user"].includes(role)) && (
                      <div className="pt-3 border-t border-indigo-200">
                        <label className="block text-xs font-medium text-indigo-800 mb-2">Duration</label>
                        <div className="flex gap-2">
                          {[
                            { value: "1_month" as const, label: "1 Month", icon: Clock },
                            { value: "1_quarter" as const, label: "1 Quarter", icon: Calendar },
                            { value: "custom" as const, label: "Custom", icon: Calendar },
                          ].map((option) => (
                            <label
                              key={option.value}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${planDuration === option.value ? "bg-indigo-500 border-indigo-600 text-white shadow-sm" : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50"}`}
                            >
                              <input
                                type="radio"
                                name="planDuration"
                                value={option.value}
                                checked={planDuration === option.value}
                                onChange={() => setPlanDuration(option.value)}
                                className="sr-only"
                              />
                              <option.icon size={14} />
                              <span className="font-medium">{option.label}</span>
                            </label>
                          ))}
                        </div>
                        {planDuration === "custom" && (
                          <DateRangeCalendar
                            startDate={createCustomStart}
                            endDate={createCustomEnd}
                            onChange={(start, end) => { setCreateCustomStart(start); setCreateCustomEnd(end); }}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {availableRoles.some((role) => ["general_admin", "super_admin"].includes(role)) && (
                    <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/30">
                      <label className="block text-sm font-semibold text-rose-900 mb-3">Admin Roles</label>
                      <div className="space-y-2">
                        {availableRoles.filter((role) => ["general_admin", "super_admin"].includes(role)).map((role) => (
                          <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name="createAdminRole"
                              checked={createRoles.includes(role)}
                              onClick={() => toggleCreateRole(role)}
                              onChange={() => {}}
                              className="w-4 h-4 accent-rose-600 focus:ring-rose-500"
                            />
                            <span className="text-sm font-medium text-rose-700 capitalize">{formatRoleName(role)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => { setCreatingUser(false); setPlanDuration("1_month"); setCreateCustomStart(""); setCreateCustomEnd(""); }}
                  className="secondary"
                >
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
