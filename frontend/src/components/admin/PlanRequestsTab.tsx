import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, RefreshCcw, Search, ShieldAlert } from "lucide-react";
import { api } from "../../lib/api";
import { emitUiError } from "../../lib/uiError";

type PlanRequestType = "upgrade" | "extension";

type PlanRequestRecord = {
  id: number;
  user_email: string;
  requested_plan: string;
  billing_cycle?: string;
  message?: string;
  status: string;
  request_type?: PlanRequestType;
  created_at: string;
};

interface Props {
  requestType?: PlanRequestType | "all";
  title: string;
  description: string;
  emptyMessage: string;
}

function formatPlanLabel(plan: string) {
  if (plan === "pro_user") return "Pro";
  if (plan === "max_user") return "Max";
  if (plan === "general_user") return "General";
  return plan;
}

function formatRequestType(type: PlanRequestType) {
  return type === "extension" ? "Renewal" : "Change";
}

export function PlanRequestsTab({ requestType = "all", title, description, emptyMessage }: Props) {
  const [requests, setRequests] = useState<PlanRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "upgrade" | "extension">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "Pending" | "Approved" | "Rejected" | "Cancelled">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchRequests = async () => {
    try {
      const res = await api.get<PlanRequestRecord[]>(`/admin/plan-requests?request_type=${requestType}`);
      setRequests(res);
    } catch (error) {
      console.error(error);
      emitUiError({ title: "Failed to load requests", message: "Could not fetch plan requests." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const visibleRequests = useMemo(() => {
    let base = requestType === "all" ? requests : requests.filter((request) => (request.request_type ?? "upgrade") === requestType);
    if (filterType !== "all") {
      base = base.filter(req => (req.request_type ?? "upgrade") === filterType);
    }
    if (filterStatus !== "all") {
      base = base.filter(req => req.status === filterStatus);
    }
    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase();
      base = base.filter(req => req.user_email.toLowerCase().includes(lowerQ));
    }
    return base;
  }, [requests, requestType, filterType, filterStatus, searchQuery]);

  const handleReview = async (id: number, action: "Approve" | "Reject") => {
    try {
      await api.post(`/admin/plan-requests/${id}/review`, { action });
      fetchRequests();
    } catch (error: any) {
      emitUiError({ title: "Review failed", message: error.message || "Failed to process request." });
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading requests...</div>;

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-300">
      <div className="shrink-0 flex flex-wrap justify-between gap-4 items-center profile-system-card glass-panel" style={{ padding: "16px" }}>
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            {requestType === "extension" ? <RefreshCcw size={18} className="text-indigo-600" /> : <CheckCircle size={18} className="text-indigo-600" />}
            {title}
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">{description}</p>
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
          <button onClick={fetchRequests} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
            Refresh
          </button>
        </div>
      </div>

      <div className="flex overflow-x-auto items-start gap-4 shrink-0 bg-slate-100/50 p-2 rounded-xl border border-slate-200/50">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Type</span>
          <div className="flex items-center gap-1.5">
            {[
              { id: "all", label: "All Types" },
              { id: "upgrade", label: "Change" },
              { id: "extension", label: "Renewal" }
            ].map((tab) => {
              const isActive = filterType === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id as any)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-lg ${isActive
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

        <div className="w-px bg-slate-200 self-stretch hidden sm:block" />

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Status</span>
          <div className="flex items-center gap-1.5">
            {[
              { id: "all", label: "All Statuses" },
              { id: "Pending", label: "Pending" },
              { id: "Approved", label: "Approved" },
              { id: "Rejected", label: "Rejected" },
              { id: "Cancelled", label: "Cancelled" }
            ].map((tab) => {
              const isActive = filterStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id as any)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all rounded-lg ${isActive
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

      <div className="profile-system-card glass-panel flex-1 flex flex-col min-h-0 overflow-hidden" style={{ padding: 0 }}>
        <div className="flex-1 overflow-auto relative">
          {visibleRequests.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <ShieldAlert size={48} className="mb-4 opacity-20" />
              <p>{emptyMessage}</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-200/50 shadow-sm z-10">
                <tr>
                  <th className="px-4 py-3">User Email</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Cycle</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{request.user_email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        request.requested_plan === "pro_user" ? "bg-emerald-100 text-emerald-700" :
                        request.requested_plan === "max_user" ? "bg-indigo-100 text-indigo-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {formatPlanLabel(request.requested_plan)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium capitalize px-2.5 py-1 rounded-full ${
                        (request.request_type ?? "upgrade") === "extension" 
                          ? "bg-violet-100 text-violet-700" 
                          : "bg-sky-100 text-sky-700"
                      }`}>
                        {formatRequestType(request.request_type ?? "upgrade")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{request.billing_cycle || "-"}</td>
                    <td className="px-4 py-3 max-w-xs truncate" title={request.message}>{request.message || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        request.status === "Pending" ? "bg-amber-100 text-amber-700" :
                        request.status === "Approved" ? "bg-emerald-100 text-emerald-700" :
                        request.status === "Cancelled" ? "bg-slate-100 text-slate-600" :
                        "bg-rose-100 text-rose-700"
                      }`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(request.created_at).toLocaleDateString("en-GB")}</td>
                    <td className="px-4 py-3 text-right">
                      {request.status === "Pending" && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleReview(request.id, "Approve")}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded text-xs font-semibold transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReview(request.id, "Reject")}
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
