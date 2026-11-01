import { Coins, ZapOff } from "lucide-react";
import { Modal } from "./Modal";
import { useTokenEconomy } from "../contexts/TokenEconomyContext";
import { openUsageModal } from "../lib/usageEvents";

/**
 * Derive the next monthly-allowance reset date from the balance's
 * subscription_period. The backend stores either "YYYY-MM" (calendar-month
 * reset on the 1st) or "YYYY-MM-DD-cycle-N" (30-day cycles from the plan
 * start date, N = current cycle index). Returns null when unknown/unparsed
 * so the copy degrades gracefully to "wait for your monthly allowance".
 */
function formatAllowanceResetDate(period: string | null | undefined): string | null {
  if (!period) return null;
  const format = (date: Date) =>
    date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

  const cycle = period.match(/^(\d{4})-(\d{2})-(\d{2})-cycle-(\d+)$/);
  if (cycle) {
    const start = new Date(Date.UTC(Number(cycle[1]), Number(cycle[2]) - 1, Number(cycle[3])));
    if (Number.isNaN(start.getTime())) return null;
    const dayMs = 24 * 60 * 60 * 1000;
    const nextCycleStart = new Date(start.getTime() + (Number(cycle[4]) + 1) * 30 * dayMs);
    return format(nextCycleStart);
  }

  const month = period.match(/^(\d{4})-(\d{2})$/);
  if (month) {
    // Date.UTC months are 0-indexed, so month[2] + 1 = the 1st of next month.
    const firstOfNextMonth = new Date(Date.UTC(Number(month[1]), Number(month[2]), 1));
    if (Number.isNaN(firstOfNextMonth.getTime())) return null;
    return format(firstOfNextMonth);
  }

  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onBuyTokens: () => void;
}

export function OutOfTokensModal({ open, onClose, onBuyTokens }: Props) {
  // The provider that mounts this modal also owns the balance, so the reset
  // period is available without new plumbing.
  const { balance } = useTokenEconomy();
  const resetDate = formatAllowanceResetDate(balance?.subscription_period);

  if (!open) return null;
  return (
    <Modal onClose={onClose} zIndex={999}>
      <div className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header flex items-center gap-2">
          <ZapOff size={18} className="text-amber-500" />
          <h3 className="text-base font-semibold text-slate-800">You're out of AI credits</h3>
        </div>
        <div className="modal-content space-y-2">
          <p className="text-sm text-slate-600">
            Your AI credit balance is empty, so this action was blocked. Credits power AI chat,
            research, Advisor Atlas, and Scholarship Hunt query building.
          </p>
          <p className="text-xs text-slate-500">
            Buy an Extra AI Credit pack to keep going (credits never expire), or wait for your
            monthly allowance to reset{resetDate ? ` on ${resetDate}` : ""}.
          </p>
        </div>
        <div className="modal-footer flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">
            Maybe later
          </button>
          <button
            onClick={() => {
              onClose();
              openUsageModal();
            }}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            See usage
          </button>
          <button
            onClick={onBuyTokens}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
          >
            <Coins size={15} />
            Buy AI credits
          </button>
        </div>
      </div>
    </Modal>
  );
}
