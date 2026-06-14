import { X, Zap } from "lucide-react";
import { useUsage } from "../contexts/UsageContext";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

const USAGE_LABELS: Record<string, string> = {
  news_searches_per_day: "Scholarship Hunt Searches Per Day",
  news_searches_per_month: "Scholarship Hunt Searches Per Month",
  advisor_atlas_searches_per_month: "Advisor Atlas Searches & Refreshes Per Month",
};

function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const root = document.getElementById("root") || document.body;
  return createPortal(children, root);
}

export function UsageModal({ onClose }: { onClose: () => void }) {
  const { usageData } = useUsage();

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-[10px]"
        style={{ background: "rgba(30, 41, 37, 0.22)" }}
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-[960px] overflow-hidden"
          style={{ maxHeight: "80vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-5 border-b border-slate-200 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Settings</p>
                <h2 className="text-xl font-bold text-slate-800">Your Current Usage & Limits</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="Close"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-6">
            {usageData ? (
              (() => {
                const isBooleanFeature = (k: string) => k.startsWith("can_use_") || k.startsWith("admin_");
                const booleanEntries = Object.entries(usageData.limits).filter(([k]) => isBooleanFeature(k));
                const quotaEntries = Object.entries(usageData.limits).filter(([k]) => 
                  !isBooleanFeature(k) && 
                  k !== "ai_messages_per_session" &&
                  k !== "records_per_sheet" &&
                  k !== "sheets_per_project"
                );
                const formatLabel = (k: string) => USAGE_LABELS[k]
                  ?? k.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

                return (
                  <div className="space-y-6">
                    {/* Quota-based limits */}
                    {quotaEntries.length > 0 && (
                      <div className="mb-2">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Usage Quotas</h3>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {quotaEntries.map(([key, limit]) => {
                        const usage = usageData.usage[key] || 0;
                        const isUnlimited = limit === -1;
                        const percent = isUnlimited ? 0 : Math.min(100, Math.round((usage / limit) * 100));
                        const formatValue = (val: number) => {
                          if (val === -1) return "Unlimited";
                          if (key === "total_documents_bytes") return `${Math.round(val / (1024 * 1024))} MB`;
                          return val.toString();
                        };
                        const label = formatLabel(key);
                        return (
                          <div key={key} className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <div className="flex justify-between items-end mb-3">
                              <span className="text-sm font-medium text-slate-600 truncate mr-2" title={label}>{label}</span>
                              <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                                {formatValue(usage)} / {formatValue(limit)}
                              </span>
                            </div>
                            {!isUnlimited && (
                              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full transition-all duration-500 ease-out ${percent > 90 ? "bg-red-500" : percent > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Boolean permissions */}
                    {booleanEntries.length > 0 && (
                      <>
                        <div className="border-t border-slate-200 pt-5">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Permissions</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {booleanEntries.map(([key, limit]) => {
                            const isEnabled = limit === 1;
                            const label = formatLabel(key);
                            return (
                              <div key={key} className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-600 truncate mr-3" title={label}>{label}</span>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                                  isEnabled
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-200 text-slate-500"
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                                  {isEnabled ? "Enabled" : "Disabled"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                    
                    {/* Session Information */}
                    {(usageData.limits["ai_messages_per_session"] !== undefined || usageData.limits["records_per_sheet"] !== undefined) && (
                      <>
                        <div className="border-t border-slate-200 pt-5 mt-6">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Structural & Session Limits</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {usageData.limits["ai_messages_per_session"] !== undefined && (
                            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-600 truncate mr-3" title="Ai Messages Per Session">Ai Messages Per Session</span>
                              <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                                {usageData.limits["ai_messages_per_session"] === -1 ? "Unlimited" : `${usageData.limits["ai_messages_per_session"]} max`}
                              </span>
                            </div>
                          )}
                          {usageData.limits["sheets_per_project"] !== undefined && (
                            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-600 truncate mr-3" title="Sheets Per Project">Sheets Per Project</span>
                              <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                                {usageData.limits["sheets_per_project"] === -1 ? "Unlimited" : `${usageData.limits["sheets_per_project"]} max`}
                              </span>
                            </div>
                          )}
                          {usageData.limits["records_per_sheet"] !== undefined && (
                            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-600 truncate mr-3" title="Records Per Sheet">Records Per Sheet</span>
                              <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                                {usageData.limits["records_per_sheet"] === -1 ? "Unlimited" : `${usageData.limits["records_per_sheet"]} max`}
                              </span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="text-sm text-slate-500">Usage data is not available yet.</div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
