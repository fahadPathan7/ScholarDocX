import { useEffect, useState } from "react";
import { Coins, Sparkles, CheckCircle2, Clock3, XCircle, RefreshCcw, X } from "lucide-react";
import { api } from "../lib/api";
import { Modal } from "./Modal";
import { emitUiError } from "../lib/uiError";

type Pack = {
  code: string;
  display_name: string;
  token_amount: number;
  price_usd: number;
};

type MyRequest = {
  id: number;
  status: string;
  pack_name: string;
  pack_code: string;
  token_amount: number;
  price_usd: number;
  requested_at: string;
  reviewed_at?: string | null;
  admin_notes?: string | null;
};

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

const statusBadge = (s: string) => {
  switch (s) {
    case "Approved":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "Rejected":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "Cancelled":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-amber-100 text-amber-700 border-amber-200";
  }
};

const statusIcon = (s: string) => {
  switch (s) {
    case "Approved":
      return <CheckCircle2 size={13} />;
    case "Rejected":
    case "Cancelled":
      return <XCircle size={13} />;
    default:
      return <Clock3 size={13} />;
  }
};

interface Props {
  open: boolean;
  onClose: () => void;
  onPurchased?: () => void;
}

export function BuyTokensModal({ open, onClose, onPurchased }: Props) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [justRequested, setJustRequested] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        api.get<Pack[]>("/ai-tokens/packs"),
        api.get<MyRequest[]>("/ai-tokens/purchase-requests/me"),
      ]);
      setPacks(p);
      setRequests(r);
    } catch (error: any) {
      emitUiError({ title: "Couldn't load packs", message: error?.message || "Try again later." });
    } finally {
      setLoading(false);
    }
  };

  const cancelRequest = async (id: number) => {
    try {
      await api.post(`/ai-tokens/purchase-requests/${id}/cancel`, {});
      fetchAll();
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (open) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRequest = async (code: string) => {
    setSubmitting(code);
    try {
      await api.post("/ai-tokens/purchase-requests", { pack_code: code });
      setJustRequested(code);
      await fetchAll();
      onPurchased?.();
    } catch (error: any) {
      emitUiError({ title: "Request failed", message: error?.message || "Couldn't submit request." });
    } finally {
      setSubmitting(null);
    }
  };

  if (!open) return null;

  return (
    <Modal onClose={onClose} zIndex={1050}>
      <div className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins size={18} className="text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-800">Buy AI Extra Tokens</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAll}
              title="Refresh"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RefreshCcw size={15} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-content space-y-4">
          <p className="text-xs text-slate-500">
            Submit a request for a token pack. An admin approves it, then the tokens are added to
            your balance. Purchased tokens never expire.
          </p>

          <div className="grid grid-cols-1 gap-3">
            {loading ? (
              <div className="text-center text-slate-400 py-6 text-sm animate-pulse">Loading packs…</div>
            ) : packs.length === 0 ? (
              <div className="text-center text-slate-400 py-6 text-sm">No token packs available right now.</div>
            ) : (
              packs.map((pack) => (
                <div
                  key={pack.code}
                  className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{pack.display_name}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                        <Sparkles size={11} />
                        {formatTokens(pack.token_amount)} tokens
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">৳{pack.price_usd.toFixed(2)}</div>
                  </div>
                  <button
                    onClick={() => handleRequest(pack.code)}
                    disabled={submitting === pack.code}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {submitting === pack.code ? "Requesting…" : justRequested === pack.code ? "Requested ✓" : "Request"}
                  </button>
                </div>
              ))
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">My Requests</h4>
            {requests.length === 0 ? (
              <p className="text-xs text-slate-400">No purchase requests yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-auto">
                {requests.map((req) => (
                  <div key={req.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700 truncate">
                        {req.pack_name} · {formatTokens(req.token_amount)} tokens
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Requested {new Date(req.requested_at).toLocaleDateString("en-GB")}
                        {req.reviewed_at ? ` · Reviewed ${new Date(req.reviewed_at).toLocaleDateString("en-GB")}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {req.status === "Pending" && (
                        <button
                          onClick={() => cancelRequest(req.id)}
                          className="text-[11px] font-medium text-rose-500 hover:text-rose-700 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(req.status)}`}>
                        {statusIcon(req.status)}
                        {req.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
