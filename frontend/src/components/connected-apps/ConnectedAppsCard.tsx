import { useState } from "react";
import { ChevronRight, Plug } from "lucide-react";
import { Modal } from "../Modal";
import { ConnectedAppsPanel } from "./ConnectedAppsPanel";
import { CONNECTED_APPS_COPY } from "./connectedAppsHelpers";

/** Profile card that opens the Connected apps panel in a modal. */
export function ConnectedAppsCard({
  onToast,
  onViewPlans,
  refreshTrigger,
}: {
  onToast?: (msg: string) => void;
  onViewPlans?: () => void;
  refreshTrigger?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="profile-system-card glass-panel">
        <div className="profile-system-header">
          <Plug size={16} className="text-indigo-500" />
          <strong>{CONNECTED_APPS_COPY.title}</strong>
        </div>
        <p className="profile-system-hint">Use an AI app you already have with your workspace. You approve every change.</p>
        <div className="profile-actions-stack">
          <button onClick={() => setOpen(true)} className="profile-action-row" type="button" style={{ borderBottom: "none" }}>
            <div className="profile-action-content"><Plug size={16} className="text-indigo-500" /> Manage connected apps</div>
            <ChevronRight size={16} className="profile-action-chevron" />
          </button>
        </div>
      </div>

      {open && (
        <Modal onClose={() => setOpen(false)} label={CONNECTED_APPS_COPY.title}>
          <div
            className="bg-white rounded-2xl shadow-2xl flex flex-col w-full mx-4"
            style={{ width: "760px", maxWidth: "calc(100% - 32px)", maxHeight: "calc(100% - 28px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-slate-200 shrink-0 flex items-center gap-3">
              <Plug className="w-5 h-5 text-indigo-500" />
              <h2 className="text-xl font-bold text-slate-800">{CONNECTED_APPS_COPY.title}</h2>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
              <ConnectedAppsPanel onToast={onToast} onViewPlans={onViewPlans} refreshTrigger={refreshTrigger} />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
              <button onClick={() => setOpen(false)} className="px-5 py-2.5 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700" type="button">Close</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
