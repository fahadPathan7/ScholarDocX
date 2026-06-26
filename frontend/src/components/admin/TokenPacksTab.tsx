import { useEffect, useState } from "react";
import { Package, RefreshCcw, Check, RotateCcw, AlertTriangle } from "lucide-react";
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

export function TokenPacksTab() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPacks = async () => {
    try {
      const res = await api.get<Pack[]>("/ai-tokens/admin/packs");
      setPacks(res);
      setDrafts(Object.fromEntries(res.map((p) => [p.code, toDraft(p)])));
    } catch (error: any) {
      emitUiError({ title: "Failed to load packs", message: error?.message || "Could not fetch token packs." });
    } finally {
      setLoading(false);
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
      emitUiError({ title: "Invalid token amount", message: "Token amount must be a positive whole number." });
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
      await fetchPacks();
    } catch (error: any) {
      emitUiError({ title: "Save failed", message: error?.message || "Could not update pack." });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading packs...</div>;

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-300">
      <div
        className="shrink-0 flex flex-wrap justify-between gap-4 items-center profile-system-card glass-panel"
        style={{ padding: "16px" }}
      >
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Package size={18} className="text-indigo-600" />
            AI Token Packs
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Configure the packs users can buy. Price is the charge; token amount is granted on approval. Super-admin only.
          </p>
        </div>
        <button
          onClick={fetchPacks}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCcw size={14} />
          Refresh
        </button>
      </div>

      <div className="profile-system-card glass-panel flex-1 flex flex-col min-h-0 overflow-hidden" style={{ padding: 0 }}>
        <div className="flex-1 overflow-auto relative">
          {packs.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <AlertTriangle size={48} className="mb-4 opacity-20" />
              <p>No token packs configured.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-200/50 shadow-sm z-10">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Display Name</th>
                  <th className="px-4 py-3">Token Amount</th>
                  <th className="px-4 py-3">Price (USD)</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {packs.map((pack) => {
                  const draft = drafts[pack.code];
                  if (!draft) return null;
                  const dirty = !isSame(pack, draft);
                  return (
                    <tr key={pack.code} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-slate-500">{pack.code}</span>
                        <div className="text-[11px] text-slate-400">{formatTokens(pack.token_amount)} · ${pack.price_usd.toFixed(2)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={draft.display_name}
                          onChange={(e) => updateDraft(pack.code, { display_name: e.target.value })}
                          className="w-40 px-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={1}
                          value={draft.token_amount}
                          onChange={(e) => updateDraft(pack.code, { token_amount: e.target.value })}
                          className="w-32 px-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.price_usd}
                            onChange={(e) => updateDraft(pack.code, { price_usd: e.target.value })}
                            className="w-28 pl-6 pr-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => updateDraft(pack.code, { is_active: !draft.is_active })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${draft.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                          title={draft.is_active ? "Active (shown in buy UI)" : "Inactive (hidden from users)"}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${draft.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setDrafts((prev) => ({ ...prev, [pack.code]: toDraft(pack) }))}
                            disabled={!dirty}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Revert changes"
                          >
                            <RotateCcw size={13} />
                            Revert
                          </button>
                          <button
                            onClick={() => handleSave(pack)}
                            disabled={!dirty || saving === pack.code}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Check size={13} />
                            {saving === pack.code ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
