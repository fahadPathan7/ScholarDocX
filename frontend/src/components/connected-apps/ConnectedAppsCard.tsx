import { useCallback, useEffect, useState } from "react";
import { ChevronRight, ClipboardCheck, Plug } from "lucide-react";
import { Modal } from "../Modal";
import { ConnectedAppsPanel } from "./ConnectedAppsPanel";
import { listPendingSuggestions } from "./connectedAppsApi";
import { CONNECTED_APPS_COPY } from "./connectedAppsHelpers";

type OpenView = "manage" | "review" | null;

/** Profile card: Manage connected apps, and Review suggested changes (with a pending count). */
export function ConnectedAppsCard({
  onToast,
  onViewPlans,
  refreshTrigger,
}: {
  onToast?: (msg: string) => void;
  onViewPlans?: () => void;
  refreshTrigger?: number;
}) {
  const [open, setOpen] = useState<OpenView>(null);
  const [pending, setPending] = useState(0);

  // The count is a convenience: a failure just hides the badge.
  const loadPending = useCallback(async () => {
    try {
      setPending((await listPendingSuggestions()).suggestions.length);
    } catch {
      setPending(0);
    }
  }, []);

  useEffect(() => {
    void loadPending();
  }, [loadPending, refreshTrigger]);

  const close = () => {
    setOpen(null);
    void loadPending();
  };

  const review = open === "review";
  const title = review ? CONNECTED_APPS_COPY.suggestedTitle : CONNECTED_APPS_COPY.title;

  return (
    <>
      <div className="profile-system-card glass-panel">
        <div className="profile-system-header">
          <Plug size={16} className="text-indigo-500" />
          <strong>{CONNECTED_APPS_COPY.title}</strong>
        </div>
        <p className="profile-system-hint">Use an AI app you already have with your workspace. By default you approve every change.</p>
        <div className="profile-actions-stack">
          <button onClick={() => setOpen("manage")} className="profile-action-row" type="button">
            <div className="profile-action-content"><Plug size={16} className="text-indigo-500" /> Manage connected apps</div>
            <ChevronRight size={16} className="profile-action-chevron" />
          </button>
          <button onClick={() => setOpen("review")} className="profile-action-row" type="button" style={{ borderBottom: "none" }}>
            <div className="profile-action-content">
              <ClipboardCheck size={16} className="text-indigo-500" /> {CONNECTED_APPS_COPY.reviewTitle}
              {pending > 0 && (
                <span
                  aria-label={`${pending} waiting`}
                  className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                >
                  {pending}
                </span>
              )}
            </div>
            <ChevronRight size={16} className="profile-action-chevron" />
          </button>
        </div>
      </div>

      {open && (
        <Modal onClose={close} label={title}>
          <div
            className="bg-white rounded-2xl shadow-2xl flex flex-col w-full mx-4"
            style={{ width: "760px", maxWidth: "calc(100% - 32px)", maxHeight: "calc(100% - 28px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-slate-200 shrink-0 flex items-center gap-3">
              {review ? <ClipboardCheck className="w-5 h-5 text-indigo-500" /> : <Plug className="w-5 h-5 text-indigo-500" />}
              <h2 className="text-xl font-bold text-slate-800">{title}</h2>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
              <ConnectedAppsPanel
                view={review ? "suggestions" : "all"}
                onToast={onToast}
                onViewPlans={onViewPlans}
                refreshTrigger={refreshTrigger}
                onSuggestionsChanged={() => void loadPending()}
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
              <button onClick={close} className="px-5 py-2.5 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700" type="button">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
