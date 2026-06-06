import React from "react";
import { CheckCircle2, Clock3, RefreshCcw, ShieldAlert, Sparkles, XCircle } from "lucide-react";

export type UserPlanRequest = {
  id: number;
  request_type?: "upgrade" | "extension";
  requested_plan: string;
  billing_cycle?: string;
  message?: string;
  status: string;
  reviewed_at?: string | null;
  created_at: string;
};

interface Props {
  loading: boolean;
  requests: UserPlanRequest[];
  onRefresh: () => void;
}

function getPlanLabel(plan: string) {
  if (plan === "pro_user") return "Pro";
  if (plan === "max_user") return "Max";
  if (plan === "general_user") return "General";
  return plan;
}

function getRequestLabel(requestType?: "upgrade" | "extension") {
  return requestType === "extension" ? "Renewal" : "Plan Change";
}

function getStatusClass(status: string) {
  if (status === "Approved") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "Rejected") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function getStatusIcon(status: string) {
  if (status === "Approved") return <CheckCircle2 size={14} />;
  if (status === "Rejected") return <XCircle size={14} />;
  return <Clock3 size={14} />;
}

export function PlanRequestHistoryTab({ loading, requests, onRefresh }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-2xl font-bold text-slate-800 tracking-tight">My Requests</h3>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Track your submitted plan changes, upgrades, and renewals here.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-xl transition-colors border border-emerald-200"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <ShieldAlert size={26} />
          </div>
          <h4 className="text-lg font-semibold text-slate-800">No plan requests yet</h4>
          <p className="mt-2 text-sm text-slate-500">
            When you send a change, upgrade, or renewal request, its status will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      <Sparkles size={13} />
                      {getRequestLabel(request.request_type)}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                      {getPlanLabel(request.requested_plan)}
                    </span>
                    {request.billing_cycle && (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium capitalize text-slate-500">
                        {request.billing_cycle}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">
                    Requested on {new Date(request.created_at).toLocaleString("en-GB")}
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {request.message?.trim() || "No message added."}
                  </div>
                </div>

                <div className="min-w-[180px] space-y-3">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusClass(request.status)}`}>
                    {getStatusIcon(request.status)}
                    {request.status}
                  </div>
                  {request.reviewed_at && (
                    <div className="text-xs text-slate-500">
                      Reviewed on {new Date(request.reviewed_at).toLocaleString("en-GB")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
