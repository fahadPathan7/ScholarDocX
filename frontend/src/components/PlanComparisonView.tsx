import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowLeft, Sparkles, Database, MessageSquare, Globe, Layout, Table, Layers, Target, Presentation, Coins, Package, HardDrive, Rows3, Compass, Rocket, Gem, Crown, CheckCircle2, Map } from "lucide-react";
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
  free_user: PlanLimits;
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
  refreshTrigger?: number;
}

type PlanRequestType = "upgrade" | "extension";
type PlanViewMode = "plans" | "requests";

export function PlanComparisonView({ onBack, onToast, refreshTrigger }: Props) {
  const { user } = useAuth();
  const currentPlan = user?.roles?.includes("max_user") 
    ? "max_user" 
    : user?.roles?.includes("pro_user") 
      ? "pro_user" 
      : user?.roles?.includes("general_user") 
        ? "general_user" 
        : user?.roles?.includes("free_user")
          ? "free_user"
          : null;
  
  const planRanks: Record<string, number> = { free_user: 0, general_user: 1, pro_user: 2, max_user: 3 };
  
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

  const handleCancelRequest = async (id: number) => {
    try {
      await api.post(`/auth/plans/requests/${id}/cancel`, {});
      fetchRequests();
    } catch (err) {
      console.error("Failed to cancel plan request", err);
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
  }, [refreshTrigger]);

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
    boolean?: boolean;
  }

  const coreFeatures: PlanFeature[] = [
    { key: "total_projects", label: "Max Projects", icon: Layout },
    { key: "total_documents_bytes", label: "Storage Capacity", icon: HardDrive, format: (v: number) => v === -1 ? "Unlimited" : `${Math.round(v / (1024 * 1024))} MB` },
    { key: "ai_tokens_per_month", label: "Monthly AI Credits", icon: Coins, format: (v: number) => v === -1 ? "Unlimited" : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}` },
    { key: "can_purchase_token_packs", label: "Extra AI Credit Packs", icon: Package, boolean: true },
    { key: "can_use_advisor_atlas", label: "Advisor Atlas", icon: Map, boolean: true },
    { key: "can_use_scholarship_hunt", label: "Scholarship Hunt", icon: Compass, boolean: true },
    { key: "can_use_scholarship_deep_hunt", label: "Scholarship Deep Hunt", icon: Sparkles, boolean: true },
  ];

  const extendedFeatures: PlanFeature[] = [
    { key: "ai_messages_per_session", label: "AI Messages / Session", icon: MessageSquare },
    { key: "total_sheets", label: "Total Sheets", icon: Table },
    { key: "total_records", label: "Total Records", icon: Database },
    { key: "sheets_per_project", label: "Sheets per Project", icon: Layers },
    { key: "records_per_sheet", label: "Records per Sheet", icon: Rows3 },
    { key: "total_sticky_notes", label: "Sticky Notes", icon: Target },
    { key: "total_whiteboards", label: "Whiteboards", icon: Presentation },
  ];

  const displayedFeatures = showAll ? [...coreFeatures, ...extendedFeatures] : coreFeatures;

  const formatLimit = (count: number, formatter?: (v: number) => string) => {
    if (count === -1) return "Unlimited";
    if (formatter) return formatter(count);
    return count.toString();
  };

  // Renders the right-hand value for a feature row. Boolean features (e.g. token
  // pack purchasing) show ✓/✗ instead of a formatted number. numericClass is the
  // colour used for non-boolean values (varies per plan column).
  const renderFeatureValue = (f: PlanFeature, limit: number, numericClass: string) => {
    if (f.boolean) {
      return limit >= 1
        ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
        : <X size={16} className="text-slate-300 shrink-0" />;
    }
    return <span className={`font-bold ${numericClass}`}>{formatLimit(limit, f.format)}</span>;
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
    <div className="animate-fade-in p-6 lg:p-12 h-full flex flex-col overflow-hidden">
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
          {activeView === "plans" && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-colors border border-emerald-200"
            >
              {showAll ? "Show Core Features" : "View All Features"}
            </button>
          )}

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
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-4 pb-12 pr-2">
        {activeView === "requests" ? (
          <PlanRequestHistoryTab
            loading={requestsLoading}
            requests={requests}
            onRefresh={fetchRequests}
            onCancel={handleCancelRequest}
          />
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pt-6">
        
        {/* Free User */}
        <div className={`rounded-3xl p-8 transition-all duration-300 flex flex-col relative group ${currentPlan === "free_user" ? 'ring-2 ring-emerald-500 shadow-2xl shadow-emerald-500/20 bg-white border-transparent scale-[1.02]' : 'bg-white border border-slate-200 shadow-lg hover:shadow-xl'}`}>
          {currentPlan === "free_user" && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-400 to-emerald-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 z-20 shadow-md tracking-wider uppercase">
              <CheckCircle2 size={12} className="stroke-[3]" />
              ACTIVE
            </div>
          )}
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none overflow-hidden rounded-tr-3xl">
            <Compass size={120} className="-mr-4 -mt-4" />
          </div>
          <div className="mb-8 relative z-10">
            <h3 className="text-2xl font-black text-slate-800 mb-2">Free</h3>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-4xl font-black text-slate-800">0</span>
              <span className="text-lg font-bold text-slate-800">BDT</span>
              <span className="text-slate-500 font-medium ml-1">{isYearly ? '/yr' : '/mo'}</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed">Basic plan to explore features.</p>
          </div>
          <div className="space-y-4 flex-1 relative z-10">
            {displayedFeatures.map((f) => {
              const limit = plans.free_user?.[f.key]?.limit_count ?? 0;
              const Icon = f.icon;
              return (
                <div key={f.key} className="flex items-center justify-between text-sm py-2.5 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3 text-slate-600">
                    <Icon size={16} className={limit > 0 || limit === -1 ? "text-slate-800" : "text-slate-300"} />
                    <span className="font-medium">{f.label}</span>
                  </div>
                  {renderFeatureValue(f, limit, "text-slate-800")}
                </div>
              );
            })}
          </div>
          
          <div className="mt-8 pt-6 relative z-10">
          {currentPlan !== "free_user" && (
            <button
              onClick={() => openRequestModal("free_user", "upgrade")}
              disabled={hasPendingRequest}
              className={`w-full py-3.5 px-4 rounded-xl font-bold transition-all shadow-sm ${hasPendingRequest ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-800 text-white hover:bg-slate-900 hover:shadow-md'}`}
            >
              {getButtonText("free_user")}
            </button>
          )}
          </div>
        </div>

        {/* General User */}
        <div className={`rounded-3xl p-8 transition-all duration-300 flex flex-col relative group ${currentPlan === "general_user" ? 'ring-2 ring-emerald-500 shadow-2xl shadow-emerald-500/20 bg-gradient-to-b from-blue-50/80 to-white border-transparent scale-[1.02]' : 'bg-gradient-to-b from-blue-50/40 to-white border border-blue-100/60 shadow-lg hover:shadow-xl'}`}>
          {currentPlan === "general_user" && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-400 to-emerald-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 z-20 shadow-md tracking-wider uppercase">
              <CheckCircle2 size={12} className="stroke-[3]" />
              ACTIVE
            </div>
          )}
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none overflow-hidden rounded-tr-3xl text-blue-600">
            <Rocket size={120} className="-mr-4 -mt-4" />
          </div>
          <div className="mb-8 relative z-10">
            <h3 className="text-2xl font-black text-slate-800 mb-2">General</h3>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-4xl font-black text-blue-600">{isYearly ? `${pricing?.plan_price_general_yearly || '0'}` : `${pricing?.plan_price_general_monthly || '0'}`}</span>
              <span className="text-lg font-bold text-blue-600">BDT</span>
              <span className="text-slate-500 font-medium ml-1">{isYearly ? '/yr' : '/mo'}</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed">Essential features to get started.</p>
          </div>
          <div className="space-y-4 flex-1 relative z-10">
            {displayedFeatures.map((f) => {
              const limit = plans.general_user?.[f.key]?.limit_count ?? 0;
              const Icon = f.icon;
              return (
                <div key={f.key} className="flex items-center justify-between text-sm py-2.5 border-b border-blue-50 last:border-0">
                  <div className="flex items-center gap-3 text-slate-600">
                    <Icon size={16} className={limit > 0 || limit === -1 ? "text-blue-500" : "text-blue-200"} />
                    <span className="font-medium">{f.label}</span>
                  </div>
                  {renderFeatureValue(f, limit, "text-slate-800")}
                </div>
              );
            })}
          </div>
          <div className="mt-8 relative z-10">
            <button
              onClick={() => openRequestModal("general_user", currentPlan === "general_user" ? "extension" : "upgrade")}
              disabled={hasPendingRequest}
              className={`w-full py-3.5 rounded-xl font-bold transition-all shadow-sm ${hasPendingRequest ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/20'}`}
            >
              {currentPlan === "general_user" ? getButtonText("general_user", "extension") : getButtonText("general_user")}
            </button>
          </div>
        </div>

        {/* Pro User */}
        <div className={`rounded-3xl p-8 transition-all duration-300 flex flex-col relative group ${currentPlan === "pro_user" ? 'ring-2 ring-emerald-500 shadow-2xl shadow-emerald-500/20 bg-gradient-to-b from-emerald-50/80 to-white border-transparent scale-[1.02]' : 'bg-gradient-to-b from-emerald-50/40 to-white border border-emerald-100/60 shadow-lg hover:shadow-xl'}`}>
          {currentPlan === "pro_user" && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-400 to-emerald-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 z-20 shadow-md tracking-wider uppercase">
              <CheckCircle2 size={12} className="stroke-[3]" />
              ACTIVE
            </div>
          )}
          {recommendedPlan === "pro_user" && currentPlan !== "pro_user" && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-full flex items-center gap-1 z-20 shadow-md tracking-wider uppercase">
              <Sparkles size={12} />
              RECOMMENDED
            </div>
          )}
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none overflow-hidden rounded-tr-3xl text-emerald-600">
            <Gem size={120} className="-mr-4 -mt-4" />
          </div>
          <div className="mb-8 relative z-10">
            <h3 className="text-2xl font-black text-slate-800 mb-2">Pro</h3>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-4xl font-black text-emerald-600">{isYearly ? `${pricing?.plan_price_pro_yearly || '500'}` : `${pricing?.plan_price_pro_monthly || '50'}`}</span>
              <span className="text-lg font-bold text-emerald-600">BDT</span>
              <span className="text-slate-500 font-medium ml-1">{isYearly ? '/yr' : '/mo'}</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed">For power users with latest AI.</p>
          </div>
          <div className="space-y-4 flex-1 relative z-10">
            {displayedFeatures.map((f) => {
              const limit = plans.pro_user?.[f.key]?.limit_count ?? 0;
              const Icon = f.icon;
              return (
                <div key={f.key} className="flex items-center justify-between text-sm py-2.5 border-b border-emerald-50 last:border-0">
                  <div className="flex items-center gap-3 text-slate-600">
                    <Icon size={16} className={limit > 0 || limit === -1 ? "text-emerald-500" : "text-emerald-200"} />
                    <span className="font-medium">{f.label}</span>
                  </div>
                  {renderFeatureValue(f, limit, "text-slate-800")}
                </div>
              );
            })}
          </div>
          <div className="mt-8 relative z-10">
            <button
              onClick={() => openRequestModal("pro_user", currentPlan === "pro_user" ? "extension" : "upgrade")}
              disabled={hasPendingRequest}
              className={`w-full py-3.5 rounded-xl font-bold transition-all shadow-sm ${hasPendingRequest ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-md hover:shadow-emerald-500/20'}`}
            >
              {currentPlan === "pro_user" ? getButtonText("pro_user", "extension") : getButtonText("pro_user")}
            </button>
          </div>
        </div>

        {/* Max User */}
        <div className={`text-white rounded-3xl p-8 transition-all duration-300 flex flex-col relative group ${currentPlan === "max_user" ? 'ring-2 ring-emerald-400 shadow-2xl shadow-emerald-500/20 bg-slate-900 border-transparent scale-[1.02]' : 'bg-slate-900 border border-slate-800 shadow-xl hover:shadow-2xl'}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none rounded-3xl"></div>
          {currentPlan === "max_user" && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-400 to-emerald-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 z-20 shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] tracking-wider uppercase">
              <CheckCircle2 size={12} className="stroke-[3]" />
              ACTIVE
            </div>
          )}
          {recommendedPlan === "max_user" && currentPlan !== "max_user" && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-full flex items-center gap-1 z-20 shadow-md tracking-wider uppercase">
              <Sparkles size={12} />
              RECOMMENDED
            </div>
          )}
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none overflow-hidden rounded-tr-3xl text-indigo-400">
            <Crown size={120} className="-mr-4 -mt-4" />
          </div>
          <div className="mb-8 relative z-10">
            <h3 className="text-2xl font-black text-white mb-2">Max</h3>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-4xl font-black text-white">{isYearly ? `${pricing?.plan_price_max_yearly || '1500'}` : `${pricing?.plan_price_max_monthly || '180'}`}</span>
              <span className="text-lg font-bold text-white">BDT</span>
              <span className="text-slate-400 font-medium ml-1">{isYearly ? '/yr' : '/mo'}</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">Unlimited power and maximum storage.</p>
          </div>
          <div className="space-y-4 flex-1 relative z-10">
            {displayedFeatures.map((f) => {
              const limit = plans.max_user?.[f.key]?.limit_count ?? -1;
              const Icon = f.icon;
              return (
                <div key={f.key} className="flex items-center justify-between text-sm py-2.5 border-b border-slate-800 last:border-0">
                  <div className="flex items-center gap-3 text-slate-300">
                    <Icon size={16} className={limit > 0 || limit === -1 ? "text-indigo-400" : "text-slate-700"} />
                    <span className="font-medium">{f.label}</span>
                  </div>
                  {renderFeatureValue(f, limit, "text-white")}
                </div>
              );
            })}
          </div>
          <div className="mt-8 relative z-10">
            <button
              onClick={() => openRequestModal("max_user", currentPlan === "max_user" ? "extension" : "upgrade")}
              disabled={hasPendingRequest}
              className={`w-full py-3.5 rounded-xl font-bold transition-all shadow-sm ${hasPendingRequest ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-500 text-white hover:bg-indigo-600 hover:shadow-lg hover:shadow-indigo-500/25'}`}
            >
              {currentPlan === "max_user" ? getButtonText("max_user", "extension") : getButtonText("max_user")}
            </button>
          </div>
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
