import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Coins,
  Lock,
  RefreshCcw,
  Sparkles,
  Wallet,
  XCircle,
  ShoppingCart,
  Calendar,
  Info,
} from "lucide-react";
import { api } from "../lib/api";
import { emitUiError } from "../lib/uiError";
import { emitNavigate } from "../lib/tokenEvents";
import { useTokenEconomy } from "../contexts/TokenEconomyContext";
import { useUsage } from "../contexts/UsageContext";
import { useAuth } from "../contexts/AuthContext";

type Pack = {
  code: string;
  display_name: string;
  token_amount: number;
  price_usd: number;
};

type MyRequest = {
  id: string;
  status: string;
  pack_name: string;
  pack_code: string;
  token_amount: number;
  price_usd: number;
  requested_at: string;
  reviewed_at?: string | null;
  admin_notes?: string | null;
};

type ViewMode = "packs" | "requests";
type RequestFilter = "all" | "pending" | "approved" | "cancelled";

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const statusBadgeStyle = (s: string) => {
  switch (s) {
    case "Approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-sm";
    case "Rejected":
      return "bg-rose-50 text-rose-700 border-rose-200/80 shadow-sm";
    case "Cancelled":
      return "bg-slate-100 text-slate-600 border-slate-200/80 shadow-sm";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200/80 shadow-sm";
  }
};

const statusIcon = (s: string) => {
  switch (s) {
    case "Approved":
      return <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />;
    case "Rejected":
    case "Cancelled":
      return <XCircle size={13} className="shrink-0" />;
    default:
      return <Clock3 size={13} className="text-amber-600 shrink-0" />;
  }
};

interface Props {
  onBack: () => void;
  onToast?: (msg: string) => void;
  refreshTrigger?: number;
}

export function BuyTokensView({ onBack, onToast, refreshTrigger }: Props) {
  const { balance, canPurchasePacks, refresh } = useTokenEconomy();
  const { usageData } = useUsage();
  const { user } = useAuth();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [pricing, setPricing] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [justRequested, setJustRequested] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>("packs");
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");
  const [polarLoading, setPolarLoading] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, r, planRes] = await Promise.all([
        api.get<Pack[]>("/ai-tokens/packs"),
        api.get<MyRequest[]>("/ai-tokens/purchase-requests/me"),
        api.get<{ pricing: Record<string, string> }>("/auth/plans")
      ]);
      setPacks(p);
      setRequests(r);
      setPricing(planRes.pricing || {});
    } catch (error: any) {
      emitUiError({ title: "Couldn't load packs", message: error?.message || "Try again later." });
    } finally {
      setLoading(false);
    }
  };

  const cancelRequest = async (id: string) => {
    try {
      await api.post(`/ai-tokens/purchase-requests/${id}/cancel`, {});
      setRequests((prev) =>
        prev.map((req) => (req.id === id ? { ...req, status: "Cancelled" } : req))
      );
      onToast?.("Purchase request cancelled.");
    } catch (err: any) {
      emitUiError({ title: "Couldn't cancel", message: err?.message || "Try again later." });
    }
  };

  const handleRequest = async (code: string) => {
    setSubmitting(code);
    try {
      await api.post("/ai-tokens/purchase-requests", { pack_code: code });
      setJustRequested(code);
      onToast?.("Request submitted — an admin will review it.");
      await fetchAll();
      await refresh();
    } catch (error: any) {
      emitUiError({ title: "Request failed", message: error?.message || "Couldn't submit request." });
    } finally {
      setSubmitting(null);
    }
  };

  const handlePolarCheckout = async (polarId: string, code: string) => {
    try {
      setPolarLoading(code);
      const res = await api.post<{ url: string }>("/auth/plans/checkout", {
        product_id: polarId,
        success_url: window.location.href,
      });
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (e: any) {
      console.error("Checkout error:", e);
      const message = e?.message && typeof e.message === "string" ? e.message.trim() : "Failed to initialize checkout session.";
      emitUiError({ title: "Checkout failed", message });
    } finally {
      setPolarLoading(null);
    }
  };

  useEffect(() => {
    refresh();
    if (canPurchasePacks) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPurchasePacks, refreshTrigger]);

  const showBalance = !!balance && !balance.is_unlimited;
  const allowanceLabel = !balance ? "" : balance.monthly_allowance === -1 ? "∞" : formatTokens(balance.monthly_allowance);

  const filteredRequests = requests.filter((req) => {
    if (requestFilter === "pending") return req.status === "Pending";
    if (requestFilter === "approved") return req.status === "Approved";
    if (requestFilter === "cancelled") return req.status === "Cancelled" || req.status === "Rejected";
    return true;
  });

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
            <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Buy AI Credits</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {canPurchasePacks && (
            <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 shadow-inner">
              <button
                onClick={() => setActiveView("packs")}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeView === "packs" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
              >
                Packs
              </button>
              <button
                onClick={() => setActiveView("requests")}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeView === "requests" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
              >
                My Requests
              </button>
            </div>
          )}
        </div>
      </div>

      {showBalance && canPurchasePacks && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 shrink-0">
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/70 to-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700 mb-2">
              <Sparkles size={15} />
              <span className="text-xs font-bold uppercase tracking-widest">Subscription</span>
            </div>
            <div className="text-2xl font-black text-slate-800">{formatTokens(balance!.subscription_remaining)}</div>
            <div className="text-xs text-slate-500 mt-0.5">of {allowanceLabel} credits / month</div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/70 to-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-indigo-700 mb-2">
              <Wallet size={15} />
              <span className="text-xs font-bold uppercase tracking-widest">Purchased Credits</span>
            </div>
            <div className="text-2xl font-black text-slate-800">{formatTokens(balance!.purchased_remaining)}</div>
            <div className="text-xs text-slate-500 mt-0.5">never expire</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-600 mb-2">
              <Coins size={15} />
              <span className="text-xs font-bold uppercase tracking-widest">Total available</span>
            </div>
            <div className="text-2xl font-black text-slate-800">
              {formatTokens(balance!.subscription_remaining + balance!.purchased_remaining)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">used across all AI features</div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pt-2 pb-12 pr-2">
        {!canPurchasePacks ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="max-w-md w-full rounded-3xl border border-indigo-100 bg-gradient-to-b from-indigo-50/70 to-white p-8 text-center shadow-lg">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <Lock size={26} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Upgrade your plan to buy AI credit packs</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Extra AI credit packs aren't available on your current plan. Upgrade to unlock more credits whenever you need them.
              </p>
              <button
                onClick={() => emitNavigate("plans")}
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Choose a plan <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ) : activeView === "requests" ? (
          <div className="w-full space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  My purchase requests
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Track status and history of your requested AI credit top-ups
                </p>
              </div>

              <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 self-start sm:self-auto">
                {[
                  { id: "all", label: "All" },
                  { id: "pending", label: "Pending" },
                  { id: "approved", label: "Approved" },
                  { id: "cancelled", label: "Cancelled / Rejected" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setRequestFilter(tab.id as RequestFilter)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      requestFilter === tab.id
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredRequests.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-gradient-to-b from-slate-50/50 to-white p-12 text-center my-4">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Clock3 size={24} />
                </div>
                <h4 className="text-sm font-bold text-slate-700 mb-1">
                  {requestFilter === "all" ? "No purchase requests yet" : `No ${requestFilter} requests`}
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
                  When you request token packs, their progress and review status will appear here.
                </p>
                <button
                  onClick={() => setActiveView("packs")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Coins size={14} /> Browse Credit Packs
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRequests.map((req) => (
                  <div
                    key={req.id}
                    className="group rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 transition-all duration-200 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="h-11 w-11 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shrink-0 group-hover:scale-105 transition-transform">
                          <Coins size={20} className="text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-slate-800 tracking-tight">
                              {req.pack_name || req.pack_code}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {formatTokens(req.token_amount)} credits
                            </span>
                            {req.price_usd > 0 && (
                              <span className="text-xs font-semibold text-slate-500">
                                ${req.price_usd.toFixed(2)} USD
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} className="text-slate-400" />
                              Requested {formatDate(req.requested_at)}
                            </span>
                            {req.reviewed_at && (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 size={12} className="text-slate-400" />
                                Reviewed {formatDate(req.reviewed_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        {req.status === "Pending" && (
                          <button
                            onClick={() => cancelRequest(req.id)}
                            className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50/50 text-xs font-semibold text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-colors"
                          >
                            Cancel Request
                          </button>
                        )}
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeStyle(req.status)}`}>
                          {statusIcon(req.status)}
                          {req.status}
                        </span>
                      </div>
                    </div>

                    {req.admin_notes && (
                      <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-600 bg-slate-50/80 rounded-xl p-3 border border-slate-200/50">
                        <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-slate-700 mr-1">Admin note:</span>
                          <span className="text-slate-600">{req.admin_notes}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          </div>
        ) : packs.length === 0 ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
              <Coins size={24} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-400">No AI credit packs available right now.</p>
            </div>
          </div>
        ) : (
          <div className="pt-0">
            <div className="mb-7 flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-indigo-50/70 via-white to-white px-5 py-4 shadow-sm">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/25">
                <Sparkles size={18} />
              </div>
              <div style={{ fontFamily: "'Nunito', sans-serif" }}>
                <h3 className="text-slate-800 text-[15px] font-bold leading-snug">
                  Top up with extra AI credit packs — credits never expire.
                </h3>
                <p className="text-slate-500 text-[13px] mt-0.5 leading-snug">
                  You can only buy and use extra credit packs while subscribed to {usageData?.token_packs_plan_phrase || "an eligible plan"}.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {packs.map((pack, idx) => {
              const theme = [
                {
                  card: "bg-white border border-slate-200",
                  text: "text-slate-800",
                  button: "bg-slate-800 text-white hover:bg-slate-900 hover:shadow-md"
                },
                {
                  card: "bg-gradient-to-b from-emerald-50/80 to-white border border-emerald-100/60",
                  text: "text-emerald-600",
                  button: "bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-md hover:shadow-emerald-500/20"
                },
                {
                  card: "bg-gradient-to-b from-indigo-50/80 to-white border border-indigo-100/60",
                  text: "text-indigo-600",
                  button: "bg-indigo-500 text-white hover:bg-indigo-600 hover:shadow-md hover:shadow-indigo-500/20"
                },
                {
                  card: "bg-gradient-to-b from-rose-50/80 to-white border border-rose-100/60",
                  text: "text-rose-600",
                  button: "bg-rose-500 text-white hover:bg-rose-600 hover:shadow-md hover:shadow-rose-500/20"
                }
              ][idx % 4];

              const popular = packs.length > 1 && idx === Math.min(1, packs.length - 1);
              const justDone = justRequested === pack.code;
              return (
                <div
                  key={pack.code}
                  className={`rounded-3xl p-8 transition-all duration-300 flex flex-col relative group shadow-lg hover:shadow-xl ${theme.card}`}
                >
                  {popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-full flex items-center gap-1 z-20 shadow-md tracking-wider uppercase">
                      <Sparkles size={12} />
                      Popular
                    </div>
                  )}
                  <div className="mb-8 relative z-10">
                    <h3 className="text-2xl font-black text-slate-800 mb-2">{pack.display_name}</h3>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className={`text-4xl font-black ${theme.text}`}>{formatTokens(pack.token_amount)}</span>
                      <span className="text-slate-500 font-medium ml-1">credits</span>
                    </div>
                    <p className="text-slate-500 text-sm leading-relaxed">One-time top-up. Credits never expire.</p>
                  </div>
                  <div className="mt-auto pt-6 relative z-10 flex flex-col gap-3">
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-2xl font-bold text-slate-800">${pack.price_usd.toFixed(2)}</span>
                      <span className="text-slate-400 text-sm">USD</span>
                    </div>

                    {(() => {
                      const polarId = pricing[`polar_extra_credits_id_${idx + 1}`];
                      if (polarId) {
                        return (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => handlePolarCheckout(polarId, pack.code)}
                              disabled={polarLoading === pack.code || submitting === pack.code}
                              className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ShoppingCart size={16} className="mr-2" />
                              {polarLoading === pack.code ? "Redirecting..." : "Buy Online"}
                            </button>
                            
                            <div className="relative flex py-1 items-center">
                              <div className="flex-grow border-t border-slate-200"></div>
                              <span className="flex-shrink-0 mx-4 text-slate-400 text-[10px] font-semibold uppercase tracking-wider">or request manual</span>
                              <div className="flex-grow border-t border-slate-200"></div>
                            </div>

                            <button
                              onClick={() => handleRequest(pack.code)}
                              disabled={submitting === pack.code || justDone}
                              className={`w-full py-2.5 px-4 rounded-xl font-medium transition-all text-sm border-2 border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:cursor-not-allowed`}
                            >
                              {submitting === pack.code ? "Requesting…" : justDone ? "Requested ✓" : "Request Manual Top-up"}
                            </button>
                          </div>
                        );
                      }

                      return (
                        <button
                          onClick={() => handleRequest(pack.code)}
                          disabled={submitting === pack.code || justDone}
                          className={`w-full py-3.5 px-4 rounded-xl font-bold transition-all shadow-sm disabled:cursor-not-allowed ${justDone ? "bg-emerald-100 text-emerald-700" : theme.button} ${submitting === pack.code ? "opacity-70" : ""}`}
                        >
                          {submitting === pack.code ? "Requesting…" : justDone ? "Requested ✓" : "Request Pack"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
