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
  Settings
} from "lucide-react";
import { notificationCategories } from "../config/notificationLabels";
import { buildNotification, notificationTemplates } from "../config/notificationCatalog";
import { emitUiError } from "../lib/uiError";
import { useDialog } from "./DialogProvider";

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

  if (!stats) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading dashboard...</div>;

  return (
    <div className="h-full overflow-y-auto pr-2 space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600"><Users size={24} /></div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Users</p>
            <p className="text-2xl font-bold text-slate-800">{stats.counts.total_users}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600"><CheckCircle size={24} /></div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active (30d)</p>
            <p className="text-2xl font-bold text-slate-800">{stats.counts.active_users}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-blue-50 p-3 rounded-lg text-blue-600"><LayoutDashboard size={24} /></div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Projects</p>
            <p className="text-2xl font-bold text-slate-800">{stats.counts.total_projects}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-amber-50 p-3 rounded-lg text-amber-600"><HardDrive size={24} /></div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Storage Used</p>
            <p className="text-2xl font-bold text-slate-800">{(stats.counts.storage_bytes / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-semibold text-slate-700">Recent Registrations</div>
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-white border-b border-slate-100">
              <tr><th className="px-4 py-3">Email</th><th className="px-4 py-3 text-right">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.recent_registrations.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{u.email}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-semibold text-slate-700">Recent Logins</div>
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-white border-b border-slate-100">
              <tr><th className="px-4 py-3">Email</th><th className="px-4 py-3 text-right">Time</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.recent_logins.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{u.email}</td>
                  <td className="px-4 py-3 text-right text-slate-500 flex items-center justify-end gap-1"><Clock size={14} /> {new Date(u.last_login_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ adminPermissions = {} }: { adminPermissions?: Record<string, boolean> }) {
  const { showConfirm } = useDialog();
  const [users, setUsers] = useState<any[]>([]);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [roleFilter, setRoleFilter] = useState("all");

  // User Creation States
  const [creatingUser, setCreatingUser] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createRoles, setCreateRoles] = useState<string[]>(["general_user"]);

  const fetchUsers = () => {
    api.get<any[]>("/admin/users").then(setUsers).catch(console.error);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (user: any) => {
    const confirmed = await showConfirm(
      `Are you sure you want to ${user.is_active ? "deactivate" : "activate"} ${user.email}?`,
      "Confirm Status Change"
    );
    if (!confirmed) return;
    try {
      await api.post(`/admin/users/${user.id}/toggle-status`, { is_active: !user.is_active });
      fetchUsers();
    } catch (e) {
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
      await api.patch(`/admin/users/${editingUser.id}/roles`, { roles: editingUser.roles });
      setEditingUser(null);
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
      await api.post("/admin/users", {
        email: createEmail,
        password: createPassword,
        display_name: createDisplayName || "User",
        roles: createRoles
      });
      setCreatingUser(false);
      setCreateEmail("");
      setCreatePassword("");
      setCreateDisplayName("");
      setCreateRoles(["general_user"]);
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

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-300">
      <div className="shrink-0 flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-base font-semibold text-slate-800">User Management</h3>
          <p className="text-slate-500 text-xs mt-0.5">Manage user access, statuses, active tokens, and assign roles.</p>
        </div>
        <button
          onClick={() => setCreatingUser(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm inline-flex items-center gap-2"
        >
          <Users size={16} />
          Create User
        </button>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-2 border-b border-slate-200 pb-px shrink-0">
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
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${isActive
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="overflow-auto flex-1 bg-white relative">
          <table className="w-full text-sm text-left whitespace-nowrap relative">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-semibold">ID</th>
                <th className="px-6 py-4 font-semibold">Email</th>
                <th className="px-6 py-4 font-semibold">Roles</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Last Login</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.filter((u: any) => roleFilter === "all" ? true : u.roles.includes(roleFilter)).map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-500">{u.id}</td>
                  <td className="px-6 py-4 font-medium text-slate-800">{u.email}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {u.roles.map((r: string) => (
                        <span key={r} className={`px-2 py-0.5 rounded text-xs font-medium ${r === 'super_admin' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {r.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {u.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {u.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      {(!u.roles.some((r: string) => ["general_admin", "super_admin"].includes(r)) || adminPermissions["admin_assign_admin_roles"]) ? (
                        <>
                          {(adminPermissions["admin_assign_user_roles"] || adminPermissions["admin_assign_admin_roles"]) && (
                        <button
                          onClick={() => setEditingUser(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 hover:text-indigo-800 transition-colors"
                          title="Edit Roles"
                        >
                          <Pencil size={12} />
                          <span>Roles</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border rounded-lg transition-colors ${
                          u.is_active
                            ? 'text-amber-700 bg-amber-50 border-amber-100 hover:bg-amber-100 hover:text-amber-800'
                            : 'text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-100 hover:text-emerald-800'
                        }`}
                        title={u.is_active ? "Deactivate User" : "Activate User"}
                      >
                        {u.is_active ? <XCircle size={12} /> : <CheckCircle size={12} />}
                        <span>{u.is_active ? "Suspend" : "Activate"}</span>
                      </button>
                      <button
                        onClick={() => handleRevoke(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-lg hover:bg-rose-100 hover:text-rose-800 transition-colors"
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Roles Modal */}
      {editingUser && (
        <AdminPortal>
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 backdrop-blur-[10px]" style={{ background: 'rgba(30, 41, 37, 0.22)' }} onClick={() => setEditingUser(null)}>
            <form className="modal-panel shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={handleSaveRoles}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">User Management</p>
                  <h2>Edit Roles</h2>
                </div>
                <button className="icon-button" type="button" onClick={() => setEditingUser(null)} title="Close form">
                  <X size={20} />
                </button>
              </div>

              <div className="modal-content form-grid">
                <div style={{ gridColumn: '1 / -1' }}>
                  <p className="text-sm text-slate-500 mb-4">Editing roles for <strong className="text-slate-700">{editingUser.email}</strong></p>

                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 mb-3">User Roles</h4>
                      <div className="space-y-3">
                        {availableRoles.filter(role => ["general_user", "pro_user", "max_user"].includes(role)).map(role => (
                          <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={editingUser.roles.includes(role)}
                              onChange={() => toggleRole(role)}
                              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-slate-700 capitalize">{role.replace('_', ' ')}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    {availableRoles.some(role => ["general_admin", "super_admin"].includes(role)) && (
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
                <button type="button" onClick={() => setEditingUser(null)} className="secondary">
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

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-3">Roles</label>
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                      {availableRoles.map(role => (
                        <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={createRoles.includes(role)}
                            onChange={() => toggleCreateRole(role)}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-slate-700 capitalize">{role.replace('_', ' ')}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setCreatingUser(false)} className="secondary">
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

function LimitsTab() {
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
        { key: "admin_manage_admin_roles", label: "Can Manage Admin Roles & Settings", description: "Allows editing permissions for admin-level roles and application settings." }
      ]
    },
    {
      name: "System Configuration",
      features: [
        { key: "admin_manage_invites", label: "Can Manage Invite Codes", description: "Allows generating and managing invite codes for new user registration." },
        { key: "admin_manage_invite_requests", label: "Can Manage Invite Requests", description: "Allows approving or rejecting user invite requests." },
        { key: "admin_manage_plan_requests", label: "Can Manage Plan Requests", description: "Allows approving or rejecting user plan upgrade requests." },
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
              className="flex items-center gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group text-left"
            >
              <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
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
                className="flex items-center gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all group text-left"
              >
                <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
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
            <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full mx-4" style={{ width: '900px', maxWidth: '95vw', maxHeight: '85vh' }} onClick={(e) => e.stopPropagation()}>
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
                  <td className="px-6 py-4">
                    <span className="font-mono text-indigo-700 font-bold tracking-widest bg-indigo-50 px-3 py-1 rounded border border-indigo-100">{inv.code}</span>
                  </td>
                  <td className="px-6 py-4 text-center text-slate-700 font-medium">{inv.used_count}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${inv.max_uses === -1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                      {inv.max_uses === -1 ? "Unlimited" : inv.max_uses}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500 text-xs">{new Date(inv.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-slate-500 text-xs">
                    {inv.expires_at ? (
                      <span className={new Date(inv.expires_at) < new Date() ? 'text-red-500 font-medium' : ''}>
                        {new Date(inv.expires_at).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">Never</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="overflow-auto flex-1 bg-white relative">
          <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-6 py-4 font-semibold">Time</th>
              <th className="px-6 py-4 font-semibold">User</th>
              <th className="px-6 py-4 font-semibold">Action</th>
              <th className="px-6 py-4 font-semibold">Target</th>
              <th className="px-6 py-4 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap"><Clock size={12} className="inline mr-1" />{new Date(log.created_at).toLocaleString()}</td>
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
        window.location.href = `mailto:${req.email}?subject=${subject}&body=${body}`;
      }

      fetchRequests();
    } catch (err: any) {
      emitUiError({ title: "Review failed", message: err.message || "Failed to process request." });
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading requests...</div>;

  return (
    <div className="h-full overflow-y-auto pr-2 animate-in fade-in duration-300">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Invite Requests</h2>
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
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
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
                      {new Date(r.created_at + 'Z').toLocaleDateString()}
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Plan Upgrade Requests</h2>
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
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
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
                    <td className="px-4 py-3 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
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
      
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shrink-0 mb-6">
        <div className="p-5 border-b border-slate-100 flex items-center gap-3">
          <div className="bg-rose-100 p-2 rounded-lg">
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
              <input 
                type="text" 
                defaultValue={settings["jwt_secret_key"] || "scholar-dock-local-first-secret-key-do-not-use-in-cloud"}
                id="input-jwt_secret_key"
                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
              <button 
                onClick={() => {
                  const el = document.getElementById("input-jwt_secret_key") as HTMLInputElement;
                  if (el) handleUpdate("jwt_secret_key", el.value);
                }}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                Update
              </button>
            </div>
            <p className="text-xs text-rose-500">Warning: Changing this will instantly log out all active users!</p>
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
                className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                Update
              </button>
            </div>
            <p className="text-xs text-slate-500">How many days until a user session expires.</p>
          </div>
        </div>
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
    admin_view_audit_logs: isSuperAdmin,
    admin_manage_admin_roles: isSuperAdmin,
    admin_manage_plan_requests: true
  });

  const adminRole = isSuperAdmin ? "super_admin" : "general_admin";

  useEffect(() => {
    api.get<any[]>("/admin/limits").then(limits => {
      const myLimits = limits.filter(l => l.role === adminRole);
      const perms: Record<string, boolean> = { ...adminPermissions };
      myLimits.forEach(l => {
        if (l.feature.startsWith("admin_")) {
          perms[l.feature] = l.limit_count === 1;
        }
      });
      setAdminPermissions(perms);
    }).catch(console.error);
  }, [adminRole]);
  
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
    { id: "limits", label: "Role Limits", icon: ShieldAlert },
    { id: "notification_texts", label: "Notification Texts", icon: Bell },
  ];
  
  if (adminPermissions["admin_manage_plan_requests"]) {
    tabs.push({ id: "plan_requests", label: "Plan Requests", icon: CheckCircle });
  }

  if (adminPermissions["admin_manage_invite_requests"]) {
    tabs.push({ id: "invite_requests", label: "Invite Requests", icon: Users });
  }

  if (adminPermissions["admin_manage_invites"]) {
    tabs.push({ id: "invites", label: "Invite Codes", icon: KeyRound });
  }

  if (adminPermissions["admin_view_audit_logs"]) {
    tabs.push({ id: "audit", label: "Audit Logs", icon: FileClock });
  }

  if (adminPermissions["admin_manage_admin_roles"]) {
    tabs.push({ id: "settings", label: "Settings", icon: Settings });
  }

  return (
    <div id="admin-view-root" className="w-full flex-1 min-h-0 flex flex-col relative overflow-hidden">
      <div className="max-w-7xl mx-auto w-full p-6 md:p-8 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center gap-3 mb-8 shrink-0">
          <div className="bg-indigo-100 p-2.5 rounded-xl">
            <ShieldAlert className="w-7 h-7 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admin Dashboard</h1>
            <p className="text-slate-500 mt-1 text-sm">Manage workspace settings, user access, and system logs.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-200 pb-px shrink-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${isActive
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
              >
                <tab.icon size={16} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 flex flex-col pb-8">
          {activeTab === "dashboard" && <DashboardTab />}
          {activeTab === "users" && <UsersTab adminPermissions={adminPermissions} />}
          {activeTab === "limits" && <LimitsTab />}
          {activeTab === "notification_texts" && <NotificationTextsTab />}
          {activeTab === "plan_requests" && adminPermissions["admin_manage_plan_requests"] && <PlanRequestsTab />}
          {activeTab === "invite_requests" && adminPermissions["admin_manage_invite_requests"] && <InviteRequestsTab />}
          {activeTab === "invites" && adminPermissions["admin_manage_invites"] && <InvitesTab />}
          {activeTab === "audit" && adminPermissions["admin_view_audit_logs"] && <AuditLogsTab />}
          {activeTab === "settings" && adminPermissions["admin_manage_admin_roles"] && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}
