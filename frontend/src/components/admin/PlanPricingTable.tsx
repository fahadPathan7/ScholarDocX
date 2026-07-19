import { useEffect, useState } from "react";
import { RefreshCcw, Check, RotateCcw, AlertTriangle, Info, Eye, EyeOff } from "lucide-react";
import { api } from "../../lib/api";
import { emitUiError } from "../../lib/uiError";

type PlanRow = {
  tier: string;
  displayName: string;
  monthlyKey: string;
  quarterlyKey: string;
  creditsKey: string;
  isActiveKey: string;
  isFree: boolean;
};

const PLAN_ROWS: PlanRow[] = [
  {
    tier: "free_user",
    displayName: "Free",
    monthlyKey: "",
    quarterlyKey: "",
    creditsKey: "plan_ai_credits_free",
    isActiveKey: "plan_is_active_free",
    isFree: true,
  },
  {
    tier: "general_user",
    displayName: "Basic",
    monthlyKey: "plan_price_general_monthly",
    quarterlyKey: "plan_price_general_quarterly",
    creditsKey: "plan_ai_credits_general",
    isActiveKey: "plan_is_active_general",
    isFree: false,
  },
  {
    tier: "pro_user",
    displayName: "Pro",
    monthlyKey: "plan_price_pro_monthly",
    quarterlyKey: "plan_price_pro_quarterly",
    creditsKey: "plan_ai_credits_pro",
    isActiveKey: "plan_is_active_pro",
    isFree: false,
  },
  {
    tier: "max_user",
    displayName: "Max",
    monthlyKey: "plan_price_max_monthly",
    quarterlyKey: "plan_price_max_quarterly",
    creditsKey: "plan_ai_credits_max",
    isActiveKey: "plan_is_active_max",
    isFree: false,
  },
];

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

type Draft = {
  monthly: string;
  quarterly: string;
  credits: string;
  is_active: boolean;
};

function toDraft(settings: Record<string, string>, row: PlanRow): Draft {
  return {
    monthly: row.isFree ? "0" : (settings[row.monthlyKey] || "0"),
    quarterly: row.isFree ? "0" : (settings[row.quarterlyKey] || "0"),
    credits: settings[row.creditsKey] || "0",
    is_active: settings[row.isActiveKey] === "1",
  };
}

function isSame(settings: Record<string, string>, row: PlanRow, draft: Draft) {
  const original = toDraft(settings, row);
  return (
    original.monthly === draft.monthly &&
    original.quarterly === draft.quarterly &&
    original.credits === draft.credits &&
    original.is_active === draft.is_active
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-16" /></td>
          <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded w-24" /></td>
          <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded w-24" /></td>
          <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded w-28" /></td>
          <td className="px-4 py-3"><div className="h-7 bg-slate-100 rounded w-24 ml-auto" /></td>
        </tr>
      ))}
    </>
  );
}

export function PlanPricingTable() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSettings = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get<Record<string, string>>("/admin/settings");
      setSettings(res);
      const newDrafts: Record<string, Draft> = {};
      PLAN_ROWS.forEach((row) => {
        newDrafts[row.tier] = toDraft(res, row);
      });
      setDrafts(newDrafts);
    } catch (error: any) {
      emitUiError({ title: "Failed to load settings", message: error?.message || "Could not fetch plan pricing." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateDraft = (tier: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [tier]: { ...prev[tier], ...patch } }));
  };

  const handleSave = async (row: PlanRow) => {
    const draft = drafts[row.tier];
    if (!draft) return;

    const monthly = parseFloat(draft.monthly);
    const quarterly = parseFloat(draft.quarterly);
    const credits = parseInt(draft.credits, 10);

    if (!row.isFree) {
      if (!Number.isFinite(monthly) || monthly < 0) {
        emitUiError({ title: "Invalid monthly price", message: "Monthly price cannot be negative." });
        return;
      }
      if (!Number.isFinite(quarterly) || quarterly < 0) {
        emitUiError({ title: "Invalid quarterly price", message: "Quarterly price cannot be negative." });
        return;
      }
    }

    if (!Number.isFinite(credits) || credits < 0) {
      emitUiError({ title: "Invalid credits", message: "Monthly AI credits must be a non-negative number." });
      return;
    }

    setSaving(row.tier);
    try {
      const updates: Array<{ key: string; value: string }> = [];

      if (!row.isFree) {
        if (draft.monthly !== settings[row.monthlyKey]) {
          updates.push({ key: row.monthlyKey, value: draft.monthly });
        }
        if (draft.quarterly !== settings[row.quarterlyKey]) {
          updates.push({ key: row.quarterlyKey, value: draft.quarterly });
        }
      }

      if (draft.credits !== settings[row.creditsKey]) {
        updates.push({ key: row.creditsKey, value: draft.credits });
      }

      if (draft.is_active !== (settings[row.isActiveKey] === "1")) {
        updates.push({ key: row.isActiveKey, value: draft.is_active ? "1" : "0" });
      }

      for (const { key, value } of updates) {
        await api.patch(`/admin/settings/${key}`, { value });
      }

      await fetchSettings({ silent: true });
    } catch (error: any) {
      emitUiError({ title: "Save failed", message: error?.message || "Could not update plan pricing." });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col min-h-0 min-w-0 space-y-3 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
        <div className="bg-emerald-50/70 text-emerald-700 text-xs px-3 py-2 rounded-md border border-emerald-100/80 flex items-start gap-2 min-w-0 flex-1">
          <Info size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="mb-1">
              <strong>Plan Pricing:</strong> Configure monthly/quarterly subscription prices (USD) and monthly AI credit allowances for each user tier. Free tier is locked at $0.
            </p>
            <p>
              <strong>Pricing Guide:</strong> The internal base cost is <strong>10,000 credits = $1.00</strong> of API usage. Set plan prices higher than API cost to maintain margin.
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchSettings({ silent: true })}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="profile-system-card glass-panel flex flex-col min-h-0 min-w-0 overflow-hidden" style={{ padding: 0 }}>
        <div className="overflow-y-auto overflow-x-hidden relative min-h-[240px]">
          <table className="w-full min-w-0 table-fixed text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-200/50 shadow-sm z-10">
              <tr>
                <th className="px-3 py-3 w-[14%]">Plan</th>
                <th className="px-3 py-3 w-[18%]">Monthly Price ($)</th>
                <th className="px-3 py-3 w-[18%]">Quarterly Price ($)</th>
                <th className="px-3 py-3 w-[22%]">Monthly AI Credits</th>
                <th className="px-3 py-3 w-[8%]">Active</th>
                <th className="px-3 py-3 w-[20%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton />
              ) : PLAN_ROWS.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <AlertTriangle size={40} className="mx-auto mb-3 opacity-20" />
                    No plans configured.
                  </td>
                </tr>
              ) : (
                PLAN_ROWS.map((row) => {
                  const draft = drafts[row.tier];
                  if (!draft) return null;
                  const dirty = !isSame(settings, row, draft);
                  return (
                    <tr key={row.tier} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-3 min-w-0 align-middle">
                        <span className="font-semibold text-slate-700 truncate block">{row.displayName}</span>
                        <div className="text-[11px] text-slate-400">
                          {row.isFree ? "Always free" : `${formatTokens(parseInt(draft.credits || "0", 10))} credits/month`}
                        </div>
                      </td>
                      <td className="px-3 py-3 min-w-0 align-middle">
                        <div className="relative min-w-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.monthly}
                            onChange={(e) => updateDraft(row.tier, { monthly: e.target.value })}
                            disabled={row.isFree}
                            className="w-full min-w-0 pl-6 pr-2 py-2 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 min-w-0 align-middle">
                        <div className="relative min-w-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.quarterly}
                            onChange={(e) => updateDraft(row.tier, { quarterly: e.target.value })}
                            disabled={row.isFree}
                            className="w-full min-w-0 pl-6 pr-2 py-2 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 min-w-0 align-middle">
                        <input
                          type="number"
                          min={0}
                          value={draft.credits}
                          onChange={(e) => updateDraft(row.tier, { credits: e.target.value })}
                          placeholder={formatTokens(parseInt(draft.credits || "0", 10))}
                          className="w-full min-w-0 px-2 py-2 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all"
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <button
                          onClick={() => updateDraft(row.tier, { is_active: !draft.is_active })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${draft.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                          title={draft.is_active ? "Plan visible to users (click to hide)" : "Plan hidden from users (click to show)"}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${draft.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right min-w-0 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDrafts((prev) => ({ ...prev, [row.tier]: toDraft(settings, row) }))}
                            disabled={!dirty}
                            className="inline-flex items-center justify-center p-1.5 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Revert changes"
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => handleSave(row)}
                            disabled={!dirty || saving === row.tier}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            <Check size={13} />
                            {saving === row.tier ? "…" : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
