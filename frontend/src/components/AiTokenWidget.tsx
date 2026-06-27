import { Coins, Infinity as InfinityIcon, Plus } from "lucide-react";
import { useTokenEconomy } from "../contexts/TokenEconomyContext";

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

export function AiTokenWidget() {
  const { balance, openBuyTokens } = useTokenEconomy();

  if (!balance) return null;

  if (balance.is_unlimited) {
    return (
      <button
        onClick={openBuyTokens}
        title="AI credits — unlimited (admin)"
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-200/60 transition-colors"
      >
        <InfinityIcon size={14} className="text-indigo-500" />
        <span>AI credits</span>
      </button>
    );
  }

  const sub = balance.subscription_remaining;
  const purch = balance.purchased_remaining;
  const total = sub + purch;
  const allowance = balance.monthly_allowance;
  const atZero = total <= 0;
  const low = allowance > 0 && sub <= Math.max(1, Math.round(allowance * 0.1));

  return (
    <button
      onClick={openBuyTokens}
      title={
        `Subscription used: ${balance.monthly_allowance === -1 ? 0 : Math.max(0, balance.monthly_allowance - sub).toLocaleString()} / ${allowance === -1 ? "∞" : allowance.toLocaleString()} credits this month\n` +
        `Purchased used: ${Math.max(0, balance.purchased_total - purch).toLocaleString()} / ${balance.purchased_total.toLocaleString()} credits`
      }
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-200/60 transition-colors"
    >
      <Coins size={14} className={atZero ? "text-red-500" : low ? "text-amber-500" : "text-emerald-500"} />
      <span>
        {atZero ? (
          "Out of credits"
        ) : (
          <>
            {formatTokens(sub)}
            {purch > 0 && <span className="text-slate-400"> +{formatTokens(purch)}</span>}
          </>
        )}
      </span>
      <Plus size={12} className="text-indigo-500" />
    </button>
  );
}
