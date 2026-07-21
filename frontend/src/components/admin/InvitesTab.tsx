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
, KeyRound, Search, Eye} from "lucide-react";

export function InvitesTab() {
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
    return invites.filter((inv: any) => inv.code.toLowerCase().includes(lowerQ));
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
    } catch (err: any) {
      const message = err?.message && typeof err.message === "string" ? err.message.trim() : "Failed to create invite.";
      emitUiError({ title: "Action failed", message, kind: "general" });
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
    } catch (err: any) {
      const message = err?.message && typeof err.message === "string" ? err.message.trim() : "Failed to delete invite.";
      emitUiError({ title: "Action failed", message, kind: "general" });
    }
  };

  const handleViewUsages = async (code: string) => {
    setViewUsagesCode(code);
    setLoadingUsages(true);
    setUsages([]);
    try {
      const res = await api.get<any[]>(`/admin/invites/${code}/usages`);
      setUsages(res);
    } catch (err: any) {
      const message = err?.message && typeof err.message === "string" ? err.message.trim() : "Could not load invite code usages.";
      emitUiError({ title: "Failed to fetch usages", message, kind: "general" });
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
                      onClick={async () => {
                        try {
                          if (navigator.clipboard && window.isSecureContext) {
                            await navigator.clipboard.writeText(inv.code);
                          } else {
                            const textArea = document.createElement("textarea");
                            textArea.value = inv.code;
                            textArea.style.position = "absolute";
                            textArea.style.left = "-999999px";
                            document.body.prepend(textArea);
                            textArea.select();
                            try {
                              document.execCommand('copy');
                            } catch (error) {
                              console.error(error);
                            } finally {
                              textArea.remove();
                            }
                          }
                          setCopiedCode(inv.code);
                          setTimeout(() => setCopiedCode(null), 2000);
                        } catch (err) {
                          console.error("Failed to copy", err);
                        }
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

