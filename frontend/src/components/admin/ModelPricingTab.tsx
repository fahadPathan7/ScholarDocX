import { useEffect, useState } from "react";
import { RefreshCcw, Check, RotateCcw, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import { emitUiError } from "../../lib/uiError";

type AiModel = {
  id: number;
  provider: string;
  model_id: string;
  display_name: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
  is_active: boolean;
  sort_order: number;
};

type Draft = {
  display_name: string;
  input_price_per_1m: string;
  output_price_per_1m: string;
  is_active: boolean;
};

function toDraft(m: AiModel): Draft {
  return {
    display_name: m.display_name,
    input_price_per_1m: String(m.input_price_per_1m),
    output_price_per_1m: String(m.output_price_per_1m),
    is_active: m.is_active,
  };
}

function isSame(m: AiModel, d: Draft) {
  return (
    m.display_name === d.display_name.trim() &&
    String(m.input_price_per_1m) === String(Number(d.input_price_per_1m)) &&
    String(m.output_price_per_1m) === String(Number(d.output_price_per_1m)) &&
    m.is_active === d.is_active
  );
}

function priceInput(value: string, onChange: (v: string) => void) {
  return (
    <div className="relative min-w-0">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 pl-6 pr-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
      />
    </div>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-28" /></td>
          <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded w-44" /></td>
          <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded w-24" /></td>
          <td className="px-4 py-3"><div className="h-8 bg-slate-100 rounded w-24" /></td>
          <td className="px-4 py-3"><div className="h-5 bg-slate-100 rounded-full w-9" /></td>
          <td className="px-4 py-3"><div className="h-7 bg-slate-100 rounded w-24 ml-auto" /></td>
        </tr>
      ))}
    </>
  );
}

export function ModelPricingTab() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchModels = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get<AiModel[]>("/ai-tokens/admin/models");
      setModels(res);
      setDrafts(Object.fromEntries(res.map((m) => [m.id, toDraft(m)])));
    } catch (error: any) {
      emitUiError({ title: "Failed to load models", message: error?.message || "Could not fetch AI models." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const updateDraft = (id: number, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleSave = async (model: AiModel) => {
    const draft = drafts[model.id];
    if (!draft) return;
    const inputPrice = parseFloat(draft.input_price_per_1m);
    const outputPrice = parseFloat(draft.output_price_per_1m);
    if (!Number.isFinite(inputPrice) || inputPrice < 0 || !Number.isFinite(outputPrice) || outputPrice < 0) {
      emitUiError({ title: "Invalid price", message: "Prices cannot be negative." });
      return;
    }
    setSaving(model.id);
    try {
      await api.patch(`/ai-tokens/admin/models/${model.id}`, {
        display_name: draft.display_name.trim() || model.display_name,
        input_price_per_1m: inputPrice,
        output_price_per_1m: outputPrice,
        is_active: draft.is_active,
      });
      await fetchModels({ silent: true });
    } catch (error: any) {
      emitUiError({ title: "Save failed", message: error?.message || "Could not update model pricing." });
    } finally {
      setSaving(null);
    }
  };

  const activeCount = models.filter((m) => m.is_active).length;

  return (
    <div className="flex flex-col min-h-0 min-w-0 space-y-3 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <p className="text-xs text-slate-500 min-w-0">
          Prices drive real-cost metering (cost × tokens-per-dollar).
          {!loading && activeCount < models.length && (
            <span className="ml-1 text-amber-600">· {activeCount} of {models.length} active</span>
          )}
        </p>
        <button
          onClick={() => fetchModels({ silent: true })}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="profile-system-card glass-panel flex flex-col min-h-0 min-w-0 overflow-hidden" style={{ padding: 0 }}>
        <div className="overflow-y-auto overflow-x-hidden relative min-h-[280px]">
          <table className="w-full min-w-0 table-fixed text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-200/50 shadow-sm z-10">
              <tr>
                <th className="px-3 py-3 w-[22%]">Model</th>
                <th className="px-3 py-3 w-[22%]">Display Name</th>
                <th className="px-3 py-3 w-[14%]">Input $ / 1M</th>
                <th className="px-3 py-3 w-[14%]">Output $ / 1M</th>
                <th className="px-3 py-3 w-[8%]">Active</th>
                <th className="px-3 py-3 w-[22%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton />
              ) : models.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    <AlertTriangle size={40} className="mx-auto mb-3 opacity-20" />
                    No AI models found.
                  </td>
                </tr>
              ) : (
                models.map((model) => {
                  const draft = drafts[model.id];
                  if (!draft) return null;
                  const dirty = !isSame(model, draft);
                  return (
                    <tr key={model.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-3 min-w-0">
                        <div className="font-medium text-slate-700 font-mono text-xs truncate" title={model.model_id}>{model.model_id}</div>
                        <div className="text-[11px] text-slate-400 capitalize truncate">{model.provider}</div>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <input
                          type="text"
                          value={draft.display_name}
                          onChange={(e) => updateDraft(model.id, { display_name: e.target.value })}
                          className="w-full min-w-0 px-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                        />
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        {priceInput(draft.input_price_per_1m, (v) => updateDraft(model.id, { input_price_per_1m: v }))}
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        {priceInput(draft.output_price_per_1m, (v) => updateDraft(model.id, { output_price_per_1m: v }))}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => updateDraft(model.id, { is_active: !draft.is_active })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${draft.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                          title={draft.is_active ? "Active (metered)" : "Inactive (free / un-metered)"}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${draft.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right min-w-0">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDrafts((prev) => ({ ...prev, [model.id]: toDraft(model) }))}
                            disabled={!dirty}
                            className="inline-flex items-center justify-center p-1.5 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Revert changes"
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => handleSave(model)}
                            disabled={!dirty || saving === model.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            <Check size={13} />
                            {saving === model.id ? "…" : "Save"}
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
