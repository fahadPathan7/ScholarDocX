import { useEffect, useState } from "react";
import { KeyRound, RefreshCcw, Search, ShieldAlert, X } from "lucide-react";
import { api } from "../../lib/api";
import { emitUiError } from "../../lib/uiError";

type PasswordResetRecord = {
  id: string;
  email: string;
  user_id: string | null;
  user_email: string | null;
  status: string;
  ip_address?: string | null;
  created_at: string;
  reviewed_at?: string | null;
};

type StatusFilter = "all" | "Pending" | "Completed" | "Dismissed";

interface Props {
  refreshTrigger?: number;
}

export function PasswordResetRequestsTab({ refreshTrigger }: Props) {
  const [requests, setRequests] = useState<PasswordResetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Set-password modal state
  const [activeRequest, setActiveRequest] = useState<PasswordResetRecord | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRequests = async () => {
    try {
      const res = await api.get<PasswordResetRecord[]>(`/admin/password-reset-requests?status=all`);
      setRequests(res);
    } catch (error) {
      console.error(error);
      emitUiError({ title: "Failed to load requests", message: "Could not fetch password reset requests." });
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch on mount and whenever the parent triggers a state-preserving refresh.
  useEffect(() => {
    fetchRequests();
  }, [refreshTrigger]);

  // Escape closes the set-password modal.
  useEffect(() => {
    if (!activeRequest) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRequest]);

  const visibleRequests = requests.filter((req) => {
    if (filterStatus !== "all" && req.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const email = (req.user_email || req.email || "").toLowerCase();
      if (!email.includes(q)) return false;
    }
    return true;
  });

  const closeModal = () => {
    setActiveRequest(null);
    setNewPassword("");
    setConfirmPassword("");
    setModalError("");
    setSaving(false);
  };

  const openSetPassword = (req: PasswordResetRecord) => {
    setNewPassword("");
    setConfirmPassword("");
    setModalError("");
    setSaving(false);
    setActiveRequest(req);
  };

  const submitSetPassword = async () => {
    if (!activeRequest) return;
    if (!newPassword.trim()) {
      setModalError("Please enter a new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setModalError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setModalError("");
    try {
      await api.post(`/admin/password-reset-requests/${activeRequest.id}/resolve`, {
        action: "set_password",
        new_password: newPassword,
      });
      closeModal();
      fetchRequests();
    } catch (error: any) {
      setModalError(error.message || "Failed to set the new password.");
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await api.post(`/admin/password-reset-requests/${id}/resolve`, { action: "dismiss" });
      fetchRequests();
    } catch (error: any) {
      emitUiError({ title: "Dismiss failed", message: error.message || "Failed to dismiss request." });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 animate-pulse">Loading requests...</div>;
  }

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="shrink-0 flex flex-wrap justify-between gap-4 items-center profile-system-card glass-panel" style={{ padding: "16px" }}>
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <KeyRound size={18} className="text-indigo-600" />
            Forgot Password Requests
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Set a new password for a user or dismiss a request.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative mr-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-200/50 rounded-xl text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
            />
          </div>
          <button
            onClick={fetchRequests}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex overflow-x-auto items-start gap-4 shrink-0 bg-slate-100/50 p-2 rounded-xl border border-slate-200/50">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Status</span>
          <div className="flex items-center gap-1.5">
            {([
              { id: "all", label: "All Statuses" },
              { id: "Pending", label: "Pending" },
              { id: "Completed", label: "Completed" },
              { id: "Dismissed", label: "Dismissed" },
            ] as { id: StatusFilter; label: string }[]).map((tab) => {
              const isActive = filterStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-lg ${
                    isActive
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

        <div className="w-px bg-slate-200 self-stretch hidden sm:block ml-auto" />

        <div className="flex flex-col gap-1.5 pr-2 sm:ml-0 ml-auto justify-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Selection</span>
          <div className="flex items-center px-2 py-2">
            <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
              {visibleRequests.length}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="profile-system-card glass-panel flex-1 flex flex-col min-h-0 overflow-hidden" style={{ padding: 0 }}>
        <div className="flex-1 overflow-auto relative">
          {visibleRequests.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <ShieldAlert size={48} className="mb-4 opacity-20" />
              <p>No password reset requests found.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-200/50 shadow-sm z-10">
                <tr>
                  <th className="px-4 py-3">User Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3">Reviewed</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {request.user_email || request.email}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          request.status === "Pending"
                            ? "bg-amber-100 text-amber-700"
                            : request.status === "Completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(request.created_at).toLocaleString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {request.reviewed_at ? new Date(request.reviewed_at).toLocaleString("en-GB") : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {request.status === "Pending" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openSetPassword(request)}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded text-xs font-semibold transition-colors"
                          >
                            Set Password
                          </button>
                          <button
                            onClick={() => handleDismiss(request.id)}
                            className="px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded text-xs font-semibold transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Set-password modal */}
      {activeRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Set New Password</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  For <span className="font-medium text-slate-700">{activeRequest.user_email || activeRequest.email}</span>
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="newPassword">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="confirmPassword">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitSetPassword();
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Re-enter new password"
                />
              </div>
              <p className="text-xs text-slate-400">
                Setting a password will sign the user out of all existing sessions.
              </p>

              {modalError && (
                <div className="rounded-md bg-rose-50 p-2 text-xs text-rose-600 border border-rose-200">
                  {modalError}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitSetPassword}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving..." : "Set Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
