import { ModelPricingTab } from "./ModelPricingTab";
import { TokenPacksTab } from "./TokenPacksTab";
import { PlanPricingTable } from "./PlanPricingTable";
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";
import { hasRole } from "../../lib/auth";
import { emitUiError } from "../../lib/uiError";
import { useDialog } from "../DialogProvider";
import { Modal } from "../Modal";
import { 
  CheckCircle, XCircle, Info, Copy, Settings,
  ShieldAlert, Clock, Trash2, Check, X, Shield, Activity
, ChevronRight, CircleDollarSign, Package, Globe, EyeOff, Eye, BookOpen} from "lucide-react";

export function SettingsTab() {
  const { showAlert } = useDialog();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [showJwtModal, setShowJwtModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showModelPricingModal, setShowModelPricingModal] = useState(false);
  const [showTokenPacksModal, setShowTokenPacksModal] = useState(false);
  const [showPolarModal, setShowPolarModal] = useState(false);
  const [showExternalApisModal, setShowExternalApisModal] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await api.get<Record<string, string>>("/admin/settings");
      setSettings(res);
    } catch (err: any) {
      console.error(err);
      const message = err?.message && typeof err.message === "string" ? err.message.trim() : "Could not fetch app settings.";
      emitUiError({ title: "Failed to load settings", message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleUpdate = async (key: string, value: string) => {
    try {
      await api.patch(`/admin/settings/${key}`, { value });
      setSettings(prev => ({ ...prev, [key]: value }));
      if (key === "jwt_secret_key") {
        await showAlert(
          "Warning: Updating the secret key will invalidate all active sessions immediately!",
          "Security Warning"
        );
      }
    } catch (err: any) {
      console.error(err);
      const message = err?.message && typeof err.message === "string" ? err.message.trim() : "Failed to update setting.";
      emitUiError({ title: "Update Failed", message });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-lg font-semibold text-slate-800">App Settings</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* JWT Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-rose-100/50 p-2 rounded-lg border border-rose-200 flex items-center justify-center w-9 h-9 shrink-0">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">JWT Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Manage secrets and session lifetimes.</p>
            </div>
          </div>
          <div className="px-3 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
            <button onClick={() => setShowJwtModal(true)} className="admin-config-btn">
              Configure <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Pricing Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-emerald-100/50 rounded-lg border border-emerald-200 flex items-center justify-center w-9 h-9 shrink-0">
              <span className="font-bold text-emerald-600 text-xs">BDT</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">Plan Pricing</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure pricing for all user plans.</p>
            </div>
          </div>
          <div className="px-3 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
            <button onClick={() => setShowPricingModal(true)} className="admin-config-btn">
              Configure <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Model Pricing Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-indigo-100/50 p-2 rounded-lg border border-indigo-200 flex items-center justify-center w-9 h-9 shrink-0">
              <CircleDollarSign className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">AI Models Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Set per-1M credit input/output prices for each model.</p>
            </div>
          </div>
          <div className="px-3 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
            <button onClick={() => setShowModelPricingModal(true)} className="admin-config-btn">
              Configure <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Token Packs Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-purple-100/50 p-2 rounded-lg border border-purple-200 flex items-center justify-center w-9 h-9 shrink-0">
              <Package className="w-5 h-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">AI Credit Packs</h3>
              <p className="text-xs text-slate-500 mt-0.5">Manage AI credit pack offerings and pricing.</p>
            </div>
          </div>
          <div className="px-3 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
            <button onClick={() => setShowTokenPacksModal(true)} className="admin-config-btn">
              Configure <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* External APIs Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-orange-100/50 p-2 rounded-lg border border-orange-200 flex items-center justify-center w-9 h-9 shrink-0">
              <Globe className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">External APIs</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure pricing for external tools like Tavily.</p>
            </div>
          </div>
          <div className="px-3 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
            <button onClick={() => setShowExternalApisModal(true)} className="admin-config-btn">
              Configure <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Polar.sh Integration Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-sky-100/50 p-2 rounded-lg border border-sky-200 flex items-center justify-center w-9 h-9 shrink-0">
              <Globe className="w-5 h-5 text-sky-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">Polar.sh Integration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure Polar.sh subscription product IDs.</p>
            </div>
          </div>
          <div className="px-3 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
            <button onClick={() => setShowPolarModal(true)} className="admin-config-btn">
              Configure <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Registration Card — SCHOLARDOCX-0162 */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-emerald-100/50 p-2 rounded-lg border border-emerald-200 flex items-center justify-center w-9 h-9 shrink-0">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">Registration</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                New users join via invite code or Google sign-up. Both get a
                free plan. Unused pending accounts are removed automatically.
              </p>
            </div>
          </div>
          {hasRole("super_admin") && (
            <div className="px-4 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex items-center justify-end flex-wrap gap-3">
              <button
                type="button"
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                onClick={async () => {
                  try {
                    const res = await api.post<{ deleted: number }>(
                      "/admin/cleanup/pending-accounts",
                      {}
                    );
                    await showAlert(
                      `Removed ${res.deleted ?? 0} pending account(s).`,
                      "Cleanup complete"
                    );
                    fetchSettings();
                  } catch (err: any) {
                    const message = err?.message && typeof err.message === "string" ? err.message.trim() : "Could not run the pending-account cleanup.";
                    emitUiError({
                      title: "Cleanup failed",
                      message,
                    });
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5 text-emerald-600" />
                Run cleanup now
              </button>
            </div>
          )}
        </div>

        {/* Expired Plan Maintenance Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-indigo-100/50 p-2 rounded-lg border border-indigo-200 flex items-center justify-center w-9 h-9 shrink-0">
              <Clock className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">Expired Plan Maintenance</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Downgrade users whose paid plan duration has ended to Free.
              </p>
            </div>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs text-slate-500 font-medium">Manual Trigger</span>
            {hasRole("super_admin") && (
              <button
                type="button"
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                onClick={async () => {
                  try {
                    const res = await api.post<{ downgraded: number }>(
                      "/admin/cleanup/expired-plans",
                      {}
                    );
                    await showAlert(
                      `Downgraded ${res.downgraded ?? 0} user(s) with expired plans.`,
                      "Downgrade complete"
                    );
                    fetchSettings();
                  } catch (err: any) {
                    const message = err?.message && typeof err.message === "string" ? err.message.trim() : "Could not run the expired plan downgrade cleanup.";
                    emitUiError({
                      title: "Downgrade failed",
                      message,
                    });
                  }
                }}
              >
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                Run downgrade now
              </button>
            )}
          </div>
        </div>
      </div>

      {showJwtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                JWT Configuration
              </h3>
              <button onClick={() => setShowJwtModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3 bg-slate-50 border border-slate-200/50 p-4 rounded-xl">
                <label className="block text-sm font-semibold text-slate-800">JWT Sign Key</label>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-700">Configured securely via environment variables (or auto-generated at startup)</span>
                </div>
                <p className="text-[11px] text-slate-400">For security compliance, the cryptographic signature key cannot be modified or viewed dynamically from this admin dashboard.</p>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">JWT Expiration (Days)</label>
                <div className="flex gap-3">
                  <input
                    type="number"
                    min="1"
                    defaultValue={settings["jwt_expiration_days"] || "30"}
                    id="modal-input-jwt_expiration_days"
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <button
                    onClick={() => {
                      const el = document.getElementById("modal-input-jwt_expiration_days") as HTMLInputElement;
                      if (el) handleUpdate("jwt_expiration_days", el.value);
                    }}
                    className="profile-primary-button px-5"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-slate-500 font-medium">How many days until a user session expires.</p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowJwtModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPricingModal && (
        <Modal onClose={() => setShowPricingModal(false)} zIndex={999} compact>
          <div
            className="modal-panel pricing-modal-panel max-h-[80vh] overflow-x-auto max-w-[95vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold shrink-0">BDT</span>
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Plan Pricing Configuration</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure pricing & monthly AI credits for all user plans.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPricingModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-content overflow-y-auto overflow-x-auto flex-1 min-h-[360px]">
              <PlanPricingTable />
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowPricingModal(false)}
                className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showModelPricingModal && (
        <Modal onClose={() => setShowModelPricingModal(false)} zIndex={999} compact>
          <div
            className="modal-panel pricing-modal-panel max-h-[80vh] overflow-x-auto max-w-[95vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <CircleDollarSign className="w-5 h-5 text-indigo-500 shrink-0" />
                <div>
                  <h3 className="text-base font-semibold text-slate-800">AI Models Configuration</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Set per-1M credit input/output prices for each model.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModelPricingModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-content overflow-y-auto overflow-x-auto flex-1 min-h-[360px]">
              <ModelPricingTab />
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowModelPricingModal(false)}
                className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showExternalApisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-orange-500" />
                External APIs & Agents Pricing
              </h3>
              <button onClick={() => setShowExternalApisModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">Brave Search Cost (USD per result)</label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      defaultValue={settings["brave_call_cost_per_hit_usd"] || "0.015"}
                      id="modal-input-brave_call_cost_per_hit_usd"
                      className="w-full pl-7 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const el = document.getElementById("modal-input-brave_call_cost_per_hit_usd") as HTMLInputElement;
                      if (el && el.value) handleUpdate("brave_call_cost_per_hit_usd", el.value);
                    }}
                    className="profile-primary-button px-5"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Scholarship Hunt charges this fee per result scanned (before filtering), so the cost scales with how many sources a deep search touches. Default 0.015.
                </p>
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">OpenAlex Author Lookup Cost (USD per lookup)</label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      defaultValue={settings["openalex_call_cost_usd"] || "0.001"}
                      id="modal-input-openalex_call_cost_usd"
                      className="w-full pl-7 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const el = document.getElementById("modal-input-openalex_call_cost_usd") as HTMLInputElement;
                      if (el && el.value) handleUpdate("openalex_call_cost_usd", el.value);
                    }}
                    className="profile-primary-button px-5"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Advisor Atlas charges this once per professor whose scholarly record is resolved from OpenAlex (h-index, citations, publication cadence, topics). Fetching that professor's publication list is a second, cheaper call and is charged at a tenth of this rate, matching OpenAlex's own 10:1 price difference between a search and a filtered list. Free record lookups are not charged. Their own list price is 0.001 per search. Default 0.001.
                </p>
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">Tavily Search Cost (USD per search)</label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      defaultValue={settings["tavily_call_cost_usd"] || "0.01"}
                      id="modal-input-tavily_call_cost_usd"
                      className="w-full pl-7 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const el = document.getElementById("modal-input-tavily_call_cost_usd") as HTMLInputElement;
                      if (el && el.value) handleUpdate("tavily_call_cost_usd", el.value);
                    }}
                    className="profile-primary-button px-5"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Controls the amount deducted from a user's AI credit balance (converted via credit rate) for each AI Research web search call.
                </p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button onClick={() => setShowExternalApisModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPolarModal && (
        <Modal onClose={() => setShowPolarModal(false)} zIndex={999}>
          <div className="modal-panel w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-sky-500" />
                Polar.sh Integration
              </h3>
              <button onClick={() => setShowPolarModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto flex-1">
              <h4 className="text-sm font-bold text-slate-800 border-b pb-2 mb-4">Plan Subscriptions</h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Basic Plan (Monthly)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      defaultValue={settings["polar_product_id_basic_monthly"] || ""}
                      id="modal-input-polar_product_id_basic_monthly"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono"
                    />
                    <button onClick={() => {
                        const el = document.getElementById("modal-input-polar_product_id_basic_monthly") as HTMLInputElement;
                        if (el) handleUpdate("polar_product_id_basic_monthly", el.value);
                      }} className="profile-primary-button px-4 py-2 shrink-0">Save</button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Basic Plan (Quarterly)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      defaultValue={settings["polar_product_id_basic_quarterly"] || ""}
                      id="modal-input-polar_product_id_basic_quarterly"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono"
                    />
                    <button onClick={() => {
                        const el = document.getElementById("modal-input-polar_product_id_basic_quarterly") as HTMLInputElement;
                        if (el) handleUpdate("polar_product_id_basic_quarterly", el.value);
                      }} className="profile-primary-button px-4 py-2 shrink-0">Save</button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Pro Plan (Monthly)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      defaultValue={settings["polar_product_id_pro_monthly"] || ""}
                      id="modal-input-polar_product_id_pro_monthly"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono"
                    />
                    <button onClick={() => {
                        const el = document.getElementById("modal-input-polar_product_id_pro_monthly") as HTMLInputElement;
                        if (el) handleUpdate("polar_product_id_pro_monthly", el.value);
                      }} className="profile-primary-button px-4 py-2 shrink-0">Save</button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Pro Plan (Quarterly)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      defaultValue={settings["polar_product_id_pro_quarterly"] || ""}
                      id="modal-input-polar_product_id_pro_quarterly"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono"
                    />
                    <button onClick={() => {
                        const el = document.getElementById("modal-input-polar_product_id_pro_quarterly") as HTMLInputElement;
                        if (el) handleUpdate("polar_product_id_pro_quarterly", el.value);
                      }} className="profile-primary-button px-4 py-2 shrink-0">Save</button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Max Plan (Monthly)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      defaultValue={settings["polar_product_id_max_monthly"] || ""}
                      id="modal-input-polar_product_id_max_monthly"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono"
                    />
                    <button onClick={() => {
                        const el = document.getElementById("modal-input-polar_product_id_max_monthly") as HTMLInputElement;
                        if (el) handleUpdate("polar_product_id_max_monthly", el.value);
                      }} className="profile-primary-button px-4 py-2 shrink-0">Save</button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Max Plan (Quarterly)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      defaultValue={settings["polar_product_id_max_quarterly"] || ""}
                      id="modal-input-polar_product_id_max_quarterly"
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono"
                    />
                    <button onClick={() => {
                        const el = document.getElementById("modal-input-polar_product_id_max_quarterly") as HTMLInputElement;
                        if (el) handleUpdate("polar_product_id_max_quarterly", el.value);
                      }} className="profile-primary-button px-4 py-2 shrink-0">Save</button>
                  </div>
                </div>
              </div>
              <h4 className="text-sm font-bold text-slate-800 border-b pb-2 mt-8 mb-4">Extra Credit Packs</h4>
              <div className="grid grid-cols-1 gap-4">
                {[
                  { id: 1, name: "Small Pack" },
                  { id: 2, name: "Medium Pack" },
                  { id: 3, name: "Large Pack" },
                  { id: 4, name: "Extra Large Pack" }
                ].map((pack) => (
                  <div key={pack.id} className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">{pack.name} Product ID</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        defaultValue={settings[`polar_extra_credits_id_${pack.id}`] || ""}
                        id={`modal-input-polar_extra_credits_id_${pack.id}`}
                        className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono"
                      />
                      <button onClick={() => {
                        const idEl = document.getElementById(`modal-input-polar_extra_credits_id_${pack.id}`) as HTMLInputElement;
                        if (idEl) handleUpdate(`polar_extra_credits_id_${pack.id}`, idEl.value);
                      }} className="profile-primary-button px-4 py-2 shrink-0">
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowPolarModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showTokenPacksModal && (
        <Modal onClose={() => setShowTokenPacksModal(false)} zIndex={999} compact>
          <div
            className="modal-panel pricing-modal-panel max-h-[80vh] overflow-x-auto max-w-[95vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-purple-500 shrink-0" />
                <div>
                  <h3 className="text-base font-semibold text-slate-800">AI Credit Packs</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Manage AI credit pack offerings and pricing.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTokenPacksModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-content overflow-y-auto overflow-x-auto flex-1 min-h-[360px]">
              <TokenPacksTab />
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setShowTokenPacksModal(false)}
                className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

