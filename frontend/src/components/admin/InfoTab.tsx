import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { emitUiError } from "../../lib/uiError";
import { ShieldAlert, RefreshCw, Upload, Clock, Library } from "lucide-react";

type RateLimitRule = {
  rule_key: string;
  label: string;
  description: string;
  method: string;
  path: string;
  max_requests: number;
  window_seconds: number;
  window_label: string;
  scope: "ip" | "user";
};

const SCOPE_LABEL: Record<string, string> = {
  ip: "Per IP address",
  user: "Per user",
};

const METHOD_BADGE: Record<string, string> = {
  POST: "bg-amber-100 text-amber-700",
  GET: "bg-sky-100 text-sky-700",
};

/**
 * Read-only admin tab that lists every active request rate limit and cron job in the app.
 * Data comes from `GET /admin/info/rate-limits`, which reads the central
 * registry in `backend/app/auth/rate_limit.py`. There is nothing to edit
 * here — values are backend constants; this surface exists for visibility.
 */
export function InfoTab() {
  const [rules, setRules] = useState<RateLimitRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = () => {
    setLoading(true);
    api
      .get<RateLimitRule[]>("/admin/info/rate-limits")
      .then(setRules)
      .catch((err) => {
        emitUiError({
          title: "Failed to load rate limits",
          message: "Could not fetch rate-limit configuration.",
          kind: "general",
        });
        console.error(err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRules();
  }, []);

  return (
    <div className="h-full overflow-y-auto pr-1 flex flex-col space-y-6 animate-in fade-in duration-300 pb-6">
      {/* Upload limits */}
      <div className="shrink-0 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Upload size={18} className="text-indigo-500" />
          Document Upload Limits
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border border-slate-200 rounded-lg">
              <tr>
                <th className="px-4 py-3 font-semibold">Constraint</th>
                <th className="px-4 py-3 font-semibold">Value</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">Max file size</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-xs">
                    10 MB
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">Per document upload</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Save & Storage Caps */}
      <div className="shrink-0 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Library size={18} className="text-indigo-500" />
          Save & Storage Caps
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border border-slate-200 rounded-lg">
              <tr>
                <th className="px-4 py-3 font-semibold">Constraint</th>
                <th className="px-4 py-3 font-semibold">Value</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">Opportunity Library (Scholarship Hunt)</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-xs">
                    100 per user
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">Fixed limit, not admin-configurable. Saving beyond it is rejected until an existing entry is removed.</td>
              </tr>
              <tr className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">Saved Analyses per Paper (Research Expert)</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-xs">
                    10 per paper
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">Fixed limit, not admin-configurable. Saving beyond it is rejected until an existing saved analysis is removed.</td>
              </tr>
              <tr className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">Documents</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-xs">
                    100 per user
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">Fixed limit, not admin-configurable. Separate from the per-role storage byte quota. Uploading beyond it is rejected until an existing document is removed.</td>
              </tr>
              <tr className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">Previous Searches (Scholarship Hunt)</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-xs">
                    10 per user
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">Fixed limit, not admin-configurable. Starting a search past the cap deletes the oldest run first (FIFO) — saved Library opportunities are kept.</td>
              </tr>
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">Ask AI Chat History</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-xs">
                    10 per user
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">Fixed limit, stored in the browser only (not the backend). Starting a new chat past the cap deletes the oldest session first (FIFO).</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* System Cron Jobs & Automated Maintenance */}
      <div className="shrink-0 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-base font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Clock size={18} className="text-indigo-500" />
          System Cron Jobs & Automated Maintenance
        </h3>
        <p className="text-slate-500 text-xs mb-4">
          Automated background maintenance workflows running on scheduled intervals across the system.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border border-slate-200 rounded-lg">
              <tr>
                <th className="px-4 py-3 font-semibold">Cron Job</th>
                <th className="px-4 py-3 font-semibold">Frequency</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Purpose & Automated Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">
                  Expired Plan Downgrade
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                    <Clock size={12} /> Daily (00:00 UTC)
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Active
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs leading-normal">
                  Automatically moves users whose paid plan duration has ended to the Free plan tier. User access is updated while preserving all admin privileges intact.
                </td>
              </tr>
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">
                  Unpaid Pending Account Cleanup
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                    <Clock size={12} /> Every 2 hours
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Active
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs leading-normal">
                  Automatically removes unconfirmed pending registration accounts if paid checkout is not completed within 2 hours.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Rules table */}
      <div className="shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[480px] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200/50 bg-transparent shrink-0">
          <div className="text-sm font-medium text-slate-600 flex items-center gap-2">
            <ShieldAlert size={16} className="text-rose-500" />
            {rules.length} active {rules.length === 1 ? "limit" : "limits"}
          </div>
          <button
            onClick={fetchRules}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
        <div className="overflow-auto flex-1 bg-white relative">
          <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-semibold">Endpoint</th>
                <th className="px-4 py-4 font-semibold">Description</th>
                <th className="px-4 py-4 font-semibold">Method</th>
                <th className="px-4 py-4 font-semibold">Path</th>
                <th className="px-4 py-4 font-semibold">Limit</th>
                <th className="px-4 py-4 font-semibold">Window</th>
                <th className="px-4 py-4 font-semibold">Scope</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    No rate limits configured.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr
                    key={rule.rule_key}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{rule.label}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        {rule.rule_key}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-slate-500 leading-snug">
                        {rule.description}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          METHOD_BADGE[rule.method] || "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {rule.method}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <code className="text-xs text-slate-600 font-mono break-all">
                        {rule.path}
                      </code>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-semibold text-slate-800">
                        {rule.max_requests}
                      </span>
                      <span className="text-slate-400"> req</span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{rule.window_label}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 capitalize">
                        {SCOPE_LABEL[rule.scope] || rule.scope}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
