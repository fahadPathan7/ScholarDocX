import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";
import { hasRole } from "../../lib/auth";
import { emitUiError } from "../../lib/uiError";
import { useDialog } from "../DialogProvider";
import { Modal } from "../Modal";
import { 
  CheckCircle, XCircle, Info, Copy, Settings,
  ShieldAlert, Clock, Trash2, Check, X, Shield, Activity
, Users, Search} from "lucide-react";

export function InviteRequestsTab() {
  const { showAlert } = useDialog();
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

  const handleReview = async (id: string, action: string, req: any) => {
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
                    <td className="px-4 py-3 max-w-xs truncate text-slate-500">
                      {r.description ? (
                        <button
                          onClick={() => showAlert(r.description, "Request Description", "info")}
                          className="hover:text-indigo-600 truncate max-w-xs text-left"
                          title="Click to view full description"
                        >
                          {r.description}
                        </button>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${r.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(r.created_at).toLocaleDateString("en-GB")}
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

