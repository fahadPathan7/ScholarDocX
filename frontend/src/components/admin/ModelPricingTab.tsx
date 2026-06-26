import { useEffect, useState } from "react";
import { CircleDollarSign, RefreshCcw, Check, RotateCcw, AlertTriangle } from "lucide-react";
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
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 pl-6 pr-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
      />
    </div>
  );
}

export function ModelPricingTab() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchModels = async () => {
    try {
      const res = await api.get<AiModel[]>("/ai-tokens/admin/models");
      setModels(res);
      setDrafts(Object.fromEntries(res.map((m) => [m.id, toDraft(m)])));
    } catch (error: any) {
      emitUiError({ title: "Failed to load models", message: error?.message || "Could not fetch AI models." });
    } finally {
      setLoading(false);
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
      await fetchModels();
    } catch (error: any) {
      emitUiError({ title: "Save failed", message: error?.message || "Could not update model pricing." });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading models...</div>;

  const activeCount = models.filter((m) => m.is_active).length;

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-300">
      <div
        className="shrink-0 flex flex-wrap justify-between gap-4 items-center profile-system-card glass-panel"
        style={{ padding: "16px" }}
      >
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <CircleDollarSign size={18} className="text-indigo-600" />
            AI Model Pricing
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Set the per-1M-token input/output price for each model. This drives real-cost metering (cost × tokens-per-dollar). Super-admin only.
            {activeCount < models.length && (
              <span className="ml-1 text-amber-600">· {activeCount} of {models.length} active</span>
            )}
          </p>
        </div>
        <button
          onClick={fetchModels}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCcw size={14} />
          Refresh
        </button>
      </div>

      <div className="profile-system-card glass-panel flex-1 flex flex-col min-h-0 overflow-hidden" style={{ padding: 0 }}>
        <div className="flex-1 overflow-auto relative">
          {models.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <AlertTriangle size={48} className="mb-4 opacity-20" />
              <p>No AI models found.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-200/50 shadow-sm z-10">
                <tr>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Display Name</th>
                  <th className="px-4 py-3">Input $ / 1M</th>
                  <th className="px-4 py-3">Output $ / 1M</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {models.map((model) => {
                  const draft = drafts[model.id];
                  if (!draft) return null;
                  const dirty = !isSame(model, draft);
                  return (
                    <tr key={model.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700 font-mono text-xs">{model.model_id}</div>
                        <div className="text-[11px] text-slate-400 capitalize">{model.provider}</div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={draft.display_name}
                          onChange={(e) => updateDraft(model.id, { display_name: e.target.value })}
                          className="w-44 px-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {priceInput(draft.input_price_per_1m, (v) => updateDraft(model.id, { input_price_per_1m: v }))}
                      </td>
                      <td className="px-4 py-3">
                        {priceInput(draft.output_price_per_1m, (v) => updateDraft(model.id, { output_price_per_1m: v }))}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => updateDraft(model.id, { is_active: !draft.is_active })}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${draft.is_active ? "bg-emerald-500" : "bg-slate-300"}`}
                          title={draft.is_active ? "Active (metered)" : "Inactive (free / un-metered)"}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${draft.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setDrafts((prev) => ({ ...prev, [model.id]: toDraft(model) }))}
                            disabled={!dirty}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Revert changes"
                          >
                            <RotateCcw size={13} />
                            Revert
                          </button>
                          <button
                            onClick={() => handleSave(model)}
                            disabled={!dirty || saving === model.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Check size={13} />
                            {saving === model.id ? "Saving…" : "Save"}
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
