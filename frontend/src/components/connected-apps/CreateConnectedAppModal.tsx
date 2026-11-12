import { FormEvent, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Modal } from "../Modal";
import { API_BASE } from "../../lib/api";
import { createConnectedApp, type ConnectedAppScope } from "./connectedAppsApi";
import {
  CONNECTED_APPS_COPY,
  EXPIRY_LABELS,
  buildClaudeCodeCommand,
  buildJsonConfig,
  mcpUrlFromApiBase,
  scopeLabel,
} from "./connectedAppsHelpers";

/** Create an access key; after creating, the key is shown once with setup help. */
export function CreateConnectedAppModal({
  expiryChoices,
  onClose,
  onCreated,
}: {
  expiryChoices: number[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ConnectedAppScope>("read");
  const [days, setDays] = useState(90);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState("");

  const url = mcpUrlFromApiBase(API_BASE);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isCreating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the app a name, for example “Claude Code”.");
      return;
    }
    setIsCreating(true);
    setError("");
    try {
      const created = await createConnectedApp(trimmed, scope, days);
      setKey(created.key);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Could not copy. Select the text and copy it manually.");
    }
  };

  return (
    <Modal onClose={onClose} zIndex={1060} label="Connect an app">
      <div
        className="bg-white rounded-2xl shadow-xl flex flex-col w-full mx-4"
        style={{ maxWidth: "560px", maxHeight: "calc(100% - 28px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-slate-800">{key ? "Your access key" : "Connect an app"}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        {!key ? (
          <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto">
            <label className="block text-sm font-medium text-slate-700">
              App name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="Claude Code"
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">What can it do?</legend>
              {(["read", "read_suggest"] as ConnectedAppScope[]).map((option) => (
                <label key={option} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" name="scope" checked={scope === option} onChange={() => setScope(option)} className="mt-1" />
                  <span>
                    <strong>{scopeLabel(option)}</strong>
                    <span className="block text-xs text-slate-500">
                      {option === "read"
                        ? "It can look at your projects, sheets and deadlines."
                        : "It can also suggest changes. You approve each one before anything happens."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="block text-sm font-medium text-slate-700">
              Expires after
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                {expiryChoices.map((d) => (
                  <option key={d} value={d}>{EXPIRY_LABELS[d] ?? `${d} days`}</option>
                ))}
              </select>
            </label>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} disabled={isCreating} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-60">
                Cancel
              </button>
              <button type="submit" disabled={isCreating} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {isCreating ? "Creating..." : "Create access key"}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4 overflow-y-auto">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{CONNECTED_APPS_COPY.keyWarning}</p>
            <Snippet label={CONNECTED_APPS_COPY.keyLabel} value={key} copied={copied === "key"} onCopy={() => copy("key", key)} />
            <p className="text-sm text-slate-600">{CONNECTED_APPS_COPY.setupIntro}</p>
            <Snippet label="Claude Code" value={buildClaudeCodeCommand(url, key)} copied={copied === "cmd"} onCopy={() => copy("cmd", buildClaudeCodeCommand(url, key))} />
            <Snippet label="Cursor or VS Code (settings file)" value={buildJsonConfig(url, key)} copied={copied === "json"} onCopy={() => copy("json", buildJsonConfig(url, key))} />
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700">Done</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Snippet({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{value}</pre>
    </div>
  );
}
