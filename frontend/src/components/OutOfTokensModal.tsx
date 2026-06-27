import { Coins, ZapOff } from "lucide-react";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onBuyTokens: () => void;
}

export function OutOfTokensModal({ open, onClose, onBuyTokens }: Props) {
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
            Buy an Extra AI Credit pack to keep going (credits never expire), or wait for your monthly
            allowance to reset.
          </p>
        </div>
        <div className="modal-footer flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">
            Maybe later
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
