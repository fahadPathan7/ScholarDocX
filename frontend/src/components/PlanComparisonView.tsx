import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowLeft, Sparkles, Database, MessageSquare, Globe, Layout, Table, Layers, Target, Presentation, Coins } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { PlanRequestHistoryTab, type UserPlanRequest } from "./plan/PlanRequestHistoryTab";

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

type PricingResponse = {
  [key: string]: string;
};

interface Props {
  onBack: () => void;
  onToast?: (msg: string) => void;
}

type PlanRequestType = "upgrade" | "extension";
type PlanViewMode = "plans" | "requests";

export function PlanComparisonView({ onBack, onToast }: Props) {
  const { user } = useAuth();
  const currentPlan = user?.roles?.includes("max_user") 
    ? "max_user" 
    : user?.roles?.includes("pro_user") 
      ? "pro_user" 
      : user?.roles?.includes("general_user") 
        ? "general_user" 
        : null;
  
  const planRanks: Record<string, number> = { general_user: 1, pro_user: 2, max_user: 3 };
  
  let recommendedPlan = "pro_user";
  if (currentPlan === "pro_user" || currentPlan === "max_user") {
    recommendedPlan = "max_user";
  }

  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [activeView, setActiveView] = useState<PlanViewMode>("plans");
  const [requests, setRequests] = useState<UserPlanRequest[]>([]);
  const [requestPlan, setRequestPlan] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<PlanRequestType>("upgrade");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isYearly, setIsYearly] = useState(false);

  const openRequestModal = (plan: string, type: PlanRequestType) => {
    setRequestPlan(plan);
    setRequestType(type);
    setMessage("");
    setIsYearly(false);
  };

  const closeRequestModal = () => {
    setRequestPlan(null);
    setRequestType("upgrade");
    setMessage("");
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestPlan) return;
    setSubmitting(true);
    try {
      const res = await api.post<{message: string}>("/auth/plans/request", { 
        requested_plan: requestPlan, 
        request_type: requestType,
        billing_cycle: isYearly ? "yearly" : "monthly",
        message 
      });
      if (onToast) onToast(res.message);
      await fetchRequests();
      setActiveView("requests");
      closeRequestModal();
    } catch (err: any) {
      if (onToast) onToast(err.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const fetchRequests = async () => {
    setRequestsLoading(true);
    try {
      const response = await api.get<{ status: string; requests: UserPlanRequest[] }>("/auth/plans/requests");
      setRequests(response.requests);
    } catch (err) {
      console.error("Failed to load plan requests", err);
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await api.get<{ status: string; plans: PlansResponse; pricing: PricingResponse }>("/auth/plans");
        setPlans(response.plans);
        setPricing(response.pricing);
      } catch (err) {
        console.error("Failed to load plans", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
    fetchRequests();
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
    { key: "ai_tokens_per_month", label: "Monthly AI Tokens", icon: Coins, format: (v: number) => v === -1 ? "Unlimited" : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}` },
    { key: "total_records", label: "Total Records", icon: Database },
  ];

  const extendedFeatures: PlanFeature[] = [
    { key: "ai_messages_per_session", label: "AI Messages / Session", icon: MessageSquare },
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

  const hasPendingRequest = requests.some(r => r.status === "Pending");

  const getButtonText = (targetPlan: string, type: PlanRequestType = "upgrade") => {
    if (hasPendingRequest) return "Request Pending";
    if (type === "extension") return "Request Renewal";
    if (!currentPlan) return "Select Plan";
    const currentRank = planRanks[currentPlan] || 0;
    const targetRank = planRanks[targetPlan] || 1;
    return targetRank > currentRank ? "Request Upgrade" : "Change Plan";
  };

  const getRequestModalTitle = () => {
    if (requestType === "extension") return "Request Plan Renewal";
    return "Request Plan Upgrade";
  };

  const getRequestModalHint = () => {
    if (requestType !== "extension") return null;
    return "Renewals extend your current plan. If it has already expired, the new deadline starts when the admin approves it.";
  };

  return (
    <div className="animate-fade-in p-6 lg:p-12 max-w-7xl mx-auto h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-4 mb-8 shrink-0 flex-wrap">
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
        
        <div className="flex items-center gap-4">
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 shadow-inner">
            <button
              onClick={() => setActiveView("plans")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeView === "plans" ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Plans
            </button>
            <button
              onClick={() => setActiveView("requests")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeView === "requests" ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              My Requests
            </button>
          </div>

          {activeView === "plans" && (
            <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 shadow-inner">
              <button
                onClick={() => setIsYearly(false)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${!isYearly ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsYearly(true)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${isYearly ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Yearly
              </button>
            </div>
          )}

          {activeView === "plans" && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-colors border border-emerald-200"
            >
              {showAll ? "Show Core Features" : "View All Features"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-4 pb-12 pr-2">
        {activeView === "requests" ? (
          <PlanRequestHistoryTab
            loading={requestsLoading}
            requests={requests}
            onRefresh={fetchRequests}
          />
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* General User */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <Layout size={100} />
          </div>
          <div className="mb-8 relative">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">General</h3>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-slate-800">{isYearly ? `${pricing?.plan_price_general_yearly || '0'} BDT` : `${pricing?.plan_price_general_monthly || '0'} BDT`}</span>
              <span className="text-slate-500 font-medium">{isYearly ? '/yr' : '/mo'}</span>
            </div>
            <p className="text-slate-500 text-sm">Essential features to get started.</p>
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
            <div className="mt-8 space-y-3 relative z-10">
              <div className="text-center font-semibold text-slate-500 bg-slate-100 py-3 rounded-xl border border-slate-200">
                Current Plan
              </div>
              <button
                onClick={() => openRequestModal("general_user", "extension")}
                disabled={hasPendingRequest}
                className={`w-full py-3 rounded-xl font-semibold border-2 transition-colors ${hasPendingRequest ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                {getButtonText("general_user", "extension")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => openRequestModal("general_user", "upgrade")}
              disabled={hasPendingRequest}
              className={`mt-8 w-full py-3 rounded-xl font-bold transition-all relative z-10 ${hasPendingRequest ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}`}
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
          <div className="mb-8 relative">
            <h3 className="text-2xl font-bold text-emerald-950 mb-2 mt-4">Pro</h3>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-emerald-900">{isYearly ? `${pricing?.plan_price_pro_yearly || '500'} BDT` : `${pricing?.plan_price_pro_monthly || '50'} BDT`}</span>
              <span className="text-emerald-700/80 font-medium">{isYearly ? '/yr' : '/mo'}</span>
            </div>
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
            <div className="mt-8 space-y-3 relative z-10">
              <div className="text-center font-bold text-emerald-700 bg-emerald-100 py-3 rounded-xl border border-emerald-200 shadow-inner">
                Current Plan
              </div>
              <button
                onClick={() => openRequestModal("pro_user", "extension")}
                disabled={hasPendingRequest}
                className={`w-full py-3 rounded-xl font-bold transition-all relative z-10 ${hasPendingRequest ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md hover:shadow-lg'}`}
              >
                {getButtonText("pro_user", "extension")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => openRequestModal("pro_user", "upgrade")}
              disabled={hasPendingRequest}
              className={`mt-8 w-full py-3 rounded-xl font-bold transition-all relative z-10 ${hasPendingRequest ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md hover:shadow-lg'}`}
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
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-white">{isYearly ? `${pricing?.plan_price_max_yearly || '1500'} BDT` : `${pricing?.plan_price_max_monthly || '180'} BDT`}</span>
              <span className="text-slate-300 font-medium">{isYearly ? '/yr' : '/mo'}</span>
            </div>
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
            <div className="mt-8 space-y-3 relative z-10">
              <div className="text-center font-bold text-indigo-300 bg-indigo-900/50 py-3 rounded-xl border border-indigo-700">
                Current Plan
              </div>
              <button
                onClick={() => openRequestModal("max_user", "extension")}
                disabled={hasPendingRequest}
                className={`w-full py-3 rounded-xl font-bold transition-all relative z-10 ${hasPendingRequest ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg hover:shadow-indigo-500/25'}`}
              >
                {getButtonText("max_user", "extension")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => openRequestModal("max_user", "upgrade")}
              disabled={hasPendingRequest}
              className={`mt-8 w-full py-3 rounded-xl font-bold transition-all relative z-10 ${hasPendingRequest ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg hover:shadow-indigo-500/25'}`}
            >
              {getButtonText("max_user")}
            </button>
          )}
        </div>

        </div>
        )}
      </div>

      {requestPlan && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-[10px]"
            style={{ background: "rgba(30, 41, 37, 0.4)" }}
            onClick={closeRequestModal}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <h3 className="font-semibold text-slate-800">{getRequestModalTitle()}</h3>
                <button
                  onClick={closeRequestModal}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                {getRequestModalHint() && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {getRequestModalHint()}
                  </div>
                )}
                <div className="mb-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-slate-700">Plan</label>
                      <span className={`text-sm font-bold px-3 py-1 rounded-lg border shadow-sm ${
                        requestPlan === "pro_user" 
                          ? "text-emerald-700 bg-emerald-50 border-emerald-200" 
                          : requestPlan === "max_user" 
                            ? "text-indigo-700 bg-indigo-50 border-indigo-200" 
                            : "text-slate-700 bg-white border-slate-200"
                      }`}>
                        {requestPlan === "pro_user" ? "Pro" : requestPlan === "max_user" ? "Max" : "General"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-slate-700">Billing Cycle</label>
                      <select 
                        value={isYearly ? "yearly" : "monthly"} 
                        onChange={(e) => setIsYearly(e.target.value === "yearly")}
                        className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block px-3 py-1.5 outline-none"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                      <span className="text-sm font-medium text-slate-600">Total Price</span>
                      <span className="text-lg font-bold text-emerald-600">
                        {requestPlan === "general_user" ? (isYearly ? `${pricing?.plan_price_general_yearly || '0'} BDT` : `${pricing?.plan_price_general_monthly || '0'} BDT`) : 
                         requestPlan === "pro_user" ? (isYearly ? `${pricing?.plan_price_pro_yearly || '500'} BDT` : `${pricing?.plan_price_pro_monthly || '50'} BDT`) : 
                         (isYearly ? `${pricing?.plan_price_max_yearly || '1500'} BDT` : `${pricing?.plan_price_max_monthly || '180'} BDT`)}
                      </span>
                    </div>
                  </div>
                </div>
                <form onSubmit={handleRequestSubmit} className="flex flex-col gap-4">
                  <textarea
                    className="w-full p-3 border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    rows={4}
                    placeholder="E.g., I need more API usage limits for my research project... (Optional)"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  ></textarea>
                  <div className="flex justify-end gap-3 mt-2">
                    <button
                      type="button"
                      onClick={closeRequestModal}
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
                      {submitting ? "Submitting..." : requestType === "extension" ? "Submit Renewal Request" : "Submit Request"}
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
