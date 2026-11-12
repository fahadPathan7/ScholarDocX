import { useCallback, useEffect, useState } from "react";
import { Plug, Plus, Trash2 } from "lucide-react";
import {
  confirmSuggestion,
  dismissSuggestion,
  listConnectedApps,
  listPendingSuggestions,
  revokeConnectedApp,
  type ConnectedAppsResponse,
  type Suggestion,
} from "./connectedAppsApi";
import { CONNECTED_APPS_COPY, formatWhen, scopeLabel } from "./connectedAppsHelpers";
import { CreateConnectedAppModal } from "./CreateConnectedAppModal";

const messageOf = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong. Please try again.");

/** Connected apps list + the Suggested changes inbox. Reloads when `refreshTrigger` changes. */
export function ConnectedAppsPanel({
  onToast,
  onViewPlans,
  refreshTrigger,
}: {
  onToast?: (msg: string) => void;
  onViewPlans?: () => void;
  refreshTrigger?: number;
}) {
  const [data, setData] = useState<ConnectedAppsResponse | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [apps, pending] = await Promise.all([listConnectedApps(), listPendingSuggestions()]);
      setData(apps);
      setSuggestions(pending.suggestions);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const run = async (id: string, action: () => Promise<string | void>) => {
    if (busyId) return; // guard against double clicks
    setBusyId(id);
    try {
      const message = await action();
      if (message) onToast?.(message);
    } catch (err) {
      onToast?.(messageOf(err));
    } finally {
      setBusyId(null);
      await load();
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-8">
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}

      <section>
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="text-sm text-slate-600">{CONNECTED_APPS_COPY.hint}</p>
          {data?.can_create && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              disabled={(data.apps.filter((a) => !a.expired).length) >= data.max_apps}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
            >
              <Plus size={14} /> Connect an app
            </button>
          )}
        </div>

        {data && !data.can_create && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {CONNECTED_APPS_COPY.notIncluded}{" "}
            {onViewPlans && (
              <button type="button" onClick={onViewPlans} className="underline font-medium">See plans</button>
            )}
          </p>
        )}

        {data && data.apps.length === 0 && data.can_create && (
          <p className="text-sm text-slate-500">No apps connected yet.</p>
        )}

        <ul className="space-y-2">
          {data?.apps.map((app) => (
            <li key={app.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Plug size={14} className="text-indigo-500 shrink-0" />
                  <span className="truncate">{app.name}</span>
                  {app.expired && <span className="text-xs text-rose-600">Expired</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {scopeLabel(app.scope)} · {app.key_prefix}… · Last used {formatWhen(app.last_used_at)} · Expires {formatWhen(app.expires_at)}
                </div>
              </div>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => {
                  if (!window.confirm(`Remove “${app.name}”? It will stop working immediately.`)) return;
                  void run(app.id, async () => {
                    await revokeConnectedApp(app.id);
                    return `${app.name} removed.`;
                  });
                }}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 disabled:opacity-60"
              >
                <Trash2 size={13} /> Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">{CONNECTED_APPS_COPY.suggestedTitle}</h3>
        {suggestions.length === 0 ? (
          <p className="text-sm text-slate-500">{CONNECTED_APPS_COPY.suggestedEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.id} className="border border-slate-200 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">From {s.app_name} · expires {formatWhen(s.expires_at)}</div>
                {s.summary && <p className="text-sm font-medium text-slate-800">{s.summary}</p>}
                <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
                  {s.actions.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void run(s.id, async () => { await dismissSuggestion(s.id); return "Suggestion dismissed."; })}
                    className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void run(s.id, async () => (await confirmSuggestion(s.id)).message)}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {busyId === s.id ? "Applying..." : "Confirm"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showCreate && data && (
        <CreateConnectedAppModal
          expiryChoices={data.expiry_choices_days}
          onClose={() => setShowCreate(false)}
          onCreated={() => void load()}
        />
      )}
    </div>
  );
}
