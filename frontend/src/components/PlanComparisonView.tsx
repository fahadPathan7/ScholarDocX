import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X, ArrowLeft, Sparkles, Database, MessageSquare, Globe, Layout, Table, Layers, Target, Presentation } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

function ModalPortal({ children }: { children: React.ReactNode }) {
  const root = document.getElementById('root') || document.body;
  if (!root) return null;
  return createPortal(children, root);
}

type PlanLimits = {
  [feature: string]: {
    limit_count: number;
    reset_period: string;
  };
};

type PlansResponse = {
  general_user: PlanLimits;
  pro_user: PlanLimits;
  max_user: PlanLimits;
};

interface Props {
  onBack: () => void;
  onToast?: (msg: string) => void;
}

export function PlanComparisonView({ onBack, onToast }: Props) {
  const { user } = useAuth();
  const currentPlan = user?.roles?.includes("max_user") ? "max_user" : user?.roles?.includes("pro_user") ? "pro_user" : "general_user";
  
  const planRanks: Record<string, number> = { general_user: 1, pro_user: 2, max_user: 3 };
  
  const getButtonText = (targetPlan: string) => {
    const currentRank = planRanks[currentPlan] || 1;
    const targetRank = planRanks[targetPlan] || 1;
    return targetRank > currentRank ? "Request Upgrade" : "Change Plan";
  };
  
  let recommendedPlan = "pro_user";
  if (currentPlan === "pro_user" || currentPlan === "max_user") {
    recommendedPlan = "max_user";
  }

  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [requestPlan, setRequestPlan] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestPlan) return;
    setSubmitting(true);
    try {
      const res = await api.post<{message: string}>("/auth/plans/request", { requested_plan: requestPlan, message });
      if (onToast) onToast(res.message);
      setRequestPlan(null);
      setMessage("");
    } catch (err: any) {
      if (onToast) onToast(err.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await api.get<{ status: string; plans: PlansResponse }>("/auth/plans");
        setPlans(response.plans);
      } catch (err) {
        console.error("Failed to load plans", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!plans) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-red-500">
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100 flex flex-col items-center">
          <X size={32} className="mb-2" />
          <p className="font-medium">Failed to load subscription plans.</p>
        </div>
      </div>
    );
  }

  interface PlanFeature {
    key: string;
    label: string;
    icon: React.ElementType;
    format?: (v: number) => string;
  }

  const coreFeatures: PlanFeature[] = [
    { key: "total_projects", label: "Max Projects", icon: Layout },
    { key: "total_documents_bytes", label: "Storage Capacity", icon: Database, format: (v: number) => v === -1 ? "Unlimited" : `${Math.round(v / (1024 * 1024))} MB` },
    { key: "monthly_ai_chats", label: "AI Messages / Month", icon: MessageSquare },
    { key: "total_records", label: "Total Records", icon: Database },
  ];

  const extendedFeatures: PlanFeature[] = [
    { key: "ai_messages_per_session", label: "AI Messages / Session", icon: MessageSquare },
    { key: "daily_ai_chats", label: "AI Messages / Day", icon: MessageSquare },
    { key: "web_searches_per_day", label: "Web Searches / Day", icon: Globe },
    { key: "web_searches_per_month", label: "Web Searches / Month", icon: Globe },
    { key: "total_sheets", label: "Total Sheets", icon: Table },
    { key: "sheets_per_project", label: "Sheets per Project", icon: Layers },
    { key: "records_per_sheet", label: "Records per Sheet", icon: Database },
    { key: "total_sticky_notes", label: "Sticky Notes", icon: Target },
    { key: "total_whiteboards", label: "Whiteboards", icon: Presentation },
  ];

  const displayedFeatures = showAll ? [...coreFeatures, ...extendedFeatures] : coreFeatures;

  const formatLimit = (count: number, formatter?: (v: number) => string) => {
    if (count === -1) return "Unlimited";
    if (formatter) return formatter(count);
    return count.toString();
  };

  return (
    <div className="animate-fade-in p-6 lg:p-12 max-w-7xl mx-auto h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 mb-8 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            className="p-2.5 rounded-full bg-white shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
            onClick={onBack}
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Choose Your Plan</h2>
            <p className="text-slate-500 mt-1">Unlock the full potential of your academic workspace.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-sm font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-colors border border-emerald-200"
        >
          {showAll ? "Show Core Features" : "View All Features"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pt-4 pb-12 pr-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* General User */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <Layout size={100} />
          </div>
          <div className="mb-8 relative">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">General</h3>
            <p className="text-slate-500 text-sm">Basic access for simple planning.</p>
          </div>
          <div className="space-y-4 flex-1 relative">
            {displayedFeatures.map((f) => {
              const limit = plans.general_user?.[f.key]?.limit_count ?? 0;
              const Icon = f.icon;
              return (
                <div key={f.key} className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3 text-slate-600">
                    <Icon size={16} className={limit > 0 || limit === -1 ? "text-emerald-500" : "text-slate-300"} />
                    <span>{f.label}</span>
                  </div>
                  <span className="font-semibold text-slate-800">{formatLimit(limit, f.format)}</span>
                </div>
              );
            })}
          </div>
          {currentPlan === "general_user" ? (
            <div className="mt-8 text-center font-semibold text-slate-500 bg-slate-100 py-3 rounded-xl border border-slate-200 relative z-10">
              Current Plan
            </div>
          ) : (
            <button
              onClick={() => setRequestPlan("general_user")}
              className="mt-8 w-full py-3 rounded-xl font-semibold border-2 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors relative z-10"
            >
              {getButtonText("general_user")}
            </button>
          )}
        </div>

        {/* Pro User */}
        <div className="bg-gradient-to-b from-emerald-50 to-white rounded-3xl p-8 border-2 border-emerald-400 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500 pointer-events-none"></div>
          {recommendedPlan === "pro_user" && (
            <div className="absolute top-4 right-4 bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
              <Sparkles size={12} />
              RECOMMENDED
            </div>
          )}
          <div className="mb-8">
            <h3 className="text-2xl font-bold text-emerald-950 mb-2 mt-4">Pro</h3>
            <p className="text-emerald-700/70 text-sm">Advanced features and more AI capabilities.</p>
          </div>
          <div className="space-y-4 flex-1">
            {displayedFeatures.map((f) => {
              const limit = plans.pro_user?.[f.key]?.limit_count ?? 0;
              const Icon = f.icon;
              return (
                <div key={f.key} className="flex items-center justify-between text-sm py-2 border-b border-emerald-100 last:border-0">
                  <div className="flex items-center gap-3 text-emerald-800">
                    <Icon size={16} className={limit > 0 || limit === -1 ? "text-emerald-500" : "text-emerald-200"} />
                    <span>{f.label}</span>
                  </div>
                  <span className="font-bold text-emerald-950">{formatLimit(limit, f.format)}</span>
                </div>
              );
            })}
          </div>
          {currentPlan === "pro_user" ? (
            <div className="mt-8 text-center font-bold text-emerald-700 bg-emerald-100 py-3 rounded-xl border border-emerald-200 shadow-inner relative z-10">
              Current Plan
            </div>
          ) : (
            <button
              onClick={() => setRequestPlan("pro_user")}
              className="mt-8 w-full py-3 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md hover:shadow-lg transition-all relative z-10"
            >
              {getButtonText("pro_user")}
            </button>
          )}
        </div>

        {/* Max User */}
        <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 opacity-50 pointer-events-none"></div>
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity text-indigo-300 pointer-events-none">
            <Database size={100} />
          </div>
          {recommendedPlan === "max_user" && (
            <div className="absolute top-4 right-4 bg-indigo-500/20 text-indigo-300 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 z-10 border border-indigo-500/30">
              <Sparkles size={12} />
              RECOMMENDED
            </div>
          )}
          <div className="mb-8 relative">
            <h3 className="text-2xl font-bold text-white mb-2">Max</h3>
            <p className="text-slate-400 text-sm">Unlimited power and maximum storage.</p>
          </div>
          <div className="space-y-4 flex-1 relative">
            {displayedFeatures.map((f) => {
              const limit = plans.max_user?.[f.key]?.limit_count ?? -1;
              const Icon = f.icon;
              return (
                <div key={f.key} className="flex items-center justify-between text-sm py-2 border-b border-slate-800 last:border-0">
                  <div className="flex items-center gap-3 text-slate-300">
                    <Icon size={16} className={limit > 0 || limit === -1 ? "text-indigo-400" : "text-slate-700"} />
                    <span>{f.label}</span>
                  </div>
                  <span className="font-semibold text-white">{formatLimit(limit, f.format)}</span>
                </div>
              );
            })}
          </div>
          {currentPlan === "max_user" ? (
            <div className="mt-8 text-center font-bold text-indigo-300 bg-indigo-900/50 py-3 rounded-xl border border-indigo-700 relative z-10">
              Current Plan
            </div>
          ) : (
            <button
              onClick={() => setRequestPlan("max_user")}
              className="mt-8 w-full py-3 rounded-xl font-bold bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg hover:shadow-indigo-500/25 transition-all relative z-10"
            >
              {getButtonText("max_user")}
            </button>
          )}
        </div>

        </div>
      </div>

      {requestPlan && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-[10px]"
            style={{ background: "rgba(30, 41, 37, 0.4)" }}
            onClick={() => setRequestPlan(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <h3 className="font-semibold text-slate-800">Request Plan Upgrade</h3>
                <button
                  onClick={() => setRequestPlan(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-600 mb-4">
                  You are requesting to change your plan to <strong>{requestPlan === "pro_user" ? "Pro" : requestPlan === "max_user" ? "Max" : "General"}</strong>. Please provide a brief reason or context for this request.
                </p>
                <form onSubmit={handleRequestSubmit} className="flex flex-col gap-4">
                  <textarea
                    className="w-full p-3 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    rows={4}
                    placeholder="E.g., I need more API usage limits for my research project..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                  ></textarea>
                  <div className="flex justify-end gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setRequestPlan(null)}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors disabled:opacity-50"
                    >
                      {submitting ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
