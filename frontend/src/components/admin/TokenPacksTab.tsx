import { useEffect, useState } from "react";
import { RefreshCcw, Check, RotateCcw, AlertTriangle, Info } from "lucide-react";
import { api } from "../../lib/api";
import { emitUiError } from "../../lib/uiError";

type Pack = {
  id: number;
  code: string;
  display_name: string;
  token_amount: number;
  price_usd: number;
  is_active: boolean;
  sort_order: number;
};

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

type Draft = {
  display_name: string;
  token_amount: string;
  price_usd: string;
  is_active: boolean;
};

function toDraft(p: Pack): Draft {
  return {
    display_name: p.display_name,
    token_amount: String(p.token_amount),
    price_usd: p.price_usd.toFixed(2),
    is_active: p.is_active,
  };
}

function isSame(p: Pack, d: Draft) {
  return (
    p.display_name === d.display_name.trim() &&
    String(p.token_amount) === d.token_amount.trim() &&
    p.price_usd.toFixed(2) === Number(d.price_usd).toFixed(2) &&
    p.is_active === d.is_active
  );
}

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-20" /></td>
          <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded w-40" /></td>
          <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded w-32" /></td>
          <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded w-28" /></td>
          <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded-full w-9" /></td>
          <td className="px-4 py-3"><div className="h-7 bg-slate-100 rounded w-24 ml-auto" /></td>
        </tr>
      ))}
    </>
  );
}

export function TokenPacksTab() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPacks = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get<Pack[]>("/ai-tokens/admin/packs");
      setPacks(res);
      setDrafts(Object.fromEntries(res.map((p) => [p.code, toDraft(p)])));
    } catch (error: any) {
      emitUiError({ title: "Failed to load packs", message: error?.message || "Could not fetch AI credit packs." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPacks();
  }, []);

  const updateDraft = (code: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  };

  const handleSave = async (pack: Pack) => {
    const draft = drafts[pack.code];
    if (!draft) return;
    const tokenAmount = parseInt(draft.token_amount, 10);
    const priceUsd = parseFloat(draft.price_usd);
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
      emitUiError({ title: "Invalid credit amount", message: "Credit amount must be a positive whole number." });
      return;
    }
    if (!Number.isFinite(priceUsd) || priceUsd < 0) {
      emitUiError({ title: "Invalid price", message: "Price cannot be negative." });
      return;
    }
    setSaving(pack.code);
    try {
      await api.patch(`/ai-tokens/admin/packs/${pack.code}`, {
        display_name: draft.display_name.trim() || pack.display_name,
        token_amount: tokenAmount,
        price_usd: priceUsd,
        is_active: draft.is_active,
      });
      await fetchPacks({ silent: true });
    } catch (error: any) {
      emitUiError({ title: "Save failed", message: error?.message || "Could not update pack." });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col min-h-0 min-w-0 space-y-3 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
        <div className="bg-indigo-50/70 text-indigo-700 text-xs px-3 py-2 rounded-md border border-indigo-100/80 flex items-start gap-2 min-w-0 flex-1">
          <Info size={14} className="shrink-0 mt-0.5" />
          <p>
            <strong>Pricing Guide:</strong> The internal base cost is <strong>10,000 tokens = $1.00</strong> of API usage.
            Set pack prices higher than API cost to maintain margin.
          </p>
        </div>
        <button
          onClick={() => fetchPacks({ silent: true })}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
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
                <th className="px-3 py-3 w-[18%]">Code</th>
                <th className="px-3 py-3 w-[24%]">Display Name</th>
                <th className="px-3 py-3 w-[18%]">Credit Amount</th>
                <th className="px-3 py-3 w-[14%]">Price (BDT)</th>
                <th className="px-3 py-3 w-[8%]">Active</th>
                <th className="px-3 py-3 w-[22%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton />
              ) : packs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    <AlertTriangle size={40} className="mx-auto mb-3 opacity-20" />
                    No AI credit packs configured.
                  </td>
                </tr>
              ) : (
                packs.map((pack) => {
                  const draft = drafts[pack.code];
                  if (!draft) return null;
                  const dirty = !isSame(pack, draft);
                  return (
                    <tr key={pack.code} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-3 min-w-0">
                        <span className="font-mono text-xs text-slate-500 truncate block" title={pack.code}>{pack.code}</span>
                        <div className="text-[11px] text-slate-400 truncate">{formatTokens(pack.token_amount)} · ৳{pack.price_usd.toFixed(2)}</div>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <input
                          type="text"
                          value={draft.display_name}
                          onChange={(e) => updateDraft(pack.code, { display_name: e.target.value })}
                          className="w-full min-w-0 px-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                        />
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <input
                          type="number"
                          min={1}
                          value={draft.token_amount}
                          onChange={(e) => updateDraft(pack.code, { token_amount: e.target.value })}
                          className="w-full min-w-0 px-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                        />
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <div className="relative min-w-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">৳</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.price_usd}
                            onChange={(e) => updateDraft(pack.code, { price_usd: e.target.value })}
                            className="w-full min-w-0 pl-6 pr-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => updateDraft(pack.code, { is_active: !draft.is_active })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${draft.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                          title={draft.is_active ? "Active (shown in buy UI)" : "Inactive (hidden from users)"}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${draft.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right min-w-0">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDrafts((prev) => ({ ...prev, [pack.code]: toDraft(pack) }))}
                            disabled={!dirty}
                            className="inline-flex items-center justify-center p-1.5 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Revert changes"
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => handleSave(pack)}
                            disabled={!dirty || saving === pack.code}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            <Check size={13} />
                            {saving === pack.code ? "…" : "Save"}
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
