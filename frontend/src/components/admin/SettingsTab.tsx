import { ModelPricingTab } from "./ModelPricingTab";
import { TokenPacksTab } from "./TokenPacksTab";
import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";
import { hasRole } from "../../lib/auth";
import { emitUiError } from "../../lib/uiError";
import { useDialog } from "../DialogProvider";
import { Modal } from "../Modal";
import { 
  CheckCircle, XCircle, Info, Copy, Settings,
  ShieldAlert, Clock, Trash2, Check, X, Shield, Activity
, ChevronRight, CircleDollarSign, Package, Globe, EyeOff, Eye} from "lucide-react";

export function SettingsTab() {
  const { showAlert } = useDialog();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showJwt, setShowJwt] = useState(false);

  const [showJwtModal, setShowJwtModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showModelPricingModal, setShowModelPricingModal] = useState(false);
  const [showTokenPacksModal, setShowTokenPacksModal] = useState(false);
  const [showExternalApisModal, setShowExternalApisModal] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await api.get<Record<string, string>>("/admin/settings");
      setSettings(res);
    } catch (err) {
      console.error(err);
      emitUiError({ title: "Failed to load settings", message: "Could not fetch app settings." });
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
    } catch (err) {
      console.error(err);
      emitUiError({ title: "Update Failed", message: "Failed to update setting." });
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
              <p className="text-xs text-slate-500 mt-0.5">Set per-1M token input/output prices for each model.</p>
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
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">JWT Sign Key</label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type={showJwt ? "text" : "password"}
                      defaultValue={settings["jwt_secret_key"] || "scholar-docx-secure personal workspace-secret-key-do-not-use-in-cloud"}
                      id="modal-input-jwt_secret_key"
                      className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowJwt(!showJwt)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showJwt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      const el = document.getElementById("modal-input-jwt_secret_key") as HTMLInputElement;
                      if (el) handleUpdate("jwt_secret_key", el.value);
                    }}
                    className="profile-primary-button px-5"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-rose-500 font-medium">Warning: Changing this will instantly log out all active users!</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-sm font-bold">BDT</span>
                Plan Pricing Configuration
              </h3>
              <button onClick={() => setShowPricingModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="space-y-6">
                {/* General Plan */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                    General Plan
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input
                          type="number"
                          min="0"
                          defaultValue={settings["plan_price_general_monthly"] || "0"}
                          id="modal-input-plan_price_general_monthly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Yearly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input
                          type="number"
                          min="0"
                          defaultValue={settings["plan_price_general_yearly"] || "0"}
                          id="modal-input-plan_price_general_yearly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pro Plan */}
                <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-5">
                  <h4 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    Pro Plan
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input
                          type="number"
                          min="0"
                          defaultValue={settings["plan_price_pro_monthly"] || "50"}
                          id="modal-input-plan_price_pro_monthly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Yearly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input
                          type="number"
                          min="0"
                          defaultValue={settings["plan_price_pro_yearly"] || "500"}
                          id="modal-input-plan_price_pro_yearly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Max Plan */}
                <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-5">
                  <h4 className="font-semibold text-purple-900 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    Max Plan
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Monthly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input
                          type="number"
                          min="0"
                          defaultValue={settings["plan_price_max_monthly"] || "180"}
                          id="modal-input-plan_price_max_monthly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Yearly</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">৳</span>
                        <input
                          type="number"
                          min="0"
                          defaultValue={settings["plan_price_max_yearly"] || "1500"}
                          id="modal-input-plan_price_max_yearly"
                          className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowPricingModal(false)}
                className="px-5 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const keys = [
                    "plan_price_general_monthly", "plan_price_general_yearly",
                    "plan_price_pro_monthly", "plan_price_pro_yearly",
                    "plan_price_max_monthly", "plan_price_max_yearly"
                  ];
                  let updated = false;
                  for (const key of keys) {
                    const el = document.getElementById(`modal-input-${key}`) as HTMLInputElement;
                    if (el && el.value !== String(settings[key] || "0")) {
                      await handleUpdate(key, el.value);
                      updated = true;
                    }
                  }
                  if (updated) fetchSettings();
                  setShowPricingModal(false);
                }}
                className="px-6 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm hover:shadow transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showModelPricingModal && (
        <Modal onClose={() => setShowModelPricingModal(false)} zIndex={999}>
          <div
            className="modal-panel pricing-modal-panel max-h-[85vh] overflow-x-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <CircleDollarSign className="w-5 h-5 text-indigo-500 shrink-0" />
                <div>
                  <h3 className="text-base font-semibold text-slate-800">AI Models Configuration</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Set per-1M token input/output prices for each model.
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
            <div className="modal-content overflow-y-auto overflow-x-hidden flex-1 min-h-[360px]">
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-orange-500" />
                External APIs & Agents Pricing
              </h3>
              <button onClick={() => setShowExternalApisModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
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
                  Controls the amount deducted from a user's AI token balance (converted via token rate) for each Web Search and Scholarship Hunt API call.
                </p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button onClick={() => setShowExternalApisModal(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showTokenPacksModal && (
        <Modal onClose={() => setShowTokenPacksModal(false)} zIndex={999}>
          <div
            className="modal-panel pricing-modal-panel max-h-[85vh] overflow-x-hidden"
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
            <div className="modal-content overflow-y-auto overflow-x-hidden flex-1 min-h-[360px]">
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

