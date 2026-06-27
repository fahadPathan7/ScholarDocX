import { Coins, Infinity as InfinityIcon, Plus } from "lucide-react";
import { useTokenEconomy } from "../contexts/TokenEconomyContext";

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

type Props = {
  /** When false, render a non-interactive <span> pill (e.g. embedded as a trailing
   *  indicator inside another button) instead of a clickable <button>. */
  interactive?: boolean;
};

export function AiTokenWidget({ interactive = true }: Props) {
  const { balance, openBuyTokens } = useTokenEconomy();

  if (!balance) return null;

  const pillClass =
    "flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-xs font-medium text-slate-600 shadow-sm border border-slate-200";

  if (balance.is_unlimited) {
    const inner = (
      <>
        <InfinityIcon size={14} className="text-indigo-500" />
        <span>AI credits</span>
      </>
    );
    return interactive ? (
      <button onClick={openBuyTokens} title="AI credits — unlimited (admin)" className={`${pillClass} hover:bg-slate-200/60 transition-colors`}>
        {inner}
      </button>
    ) : (
      <span title="AI credits — unlimited (admin)" className={pillClass}>
        {inner}
      </span>
    );
  }

  const sub = balance.subscription_remaining;
  const purch = balance.purchased_remaining;
  const total = sub + purch;
  const allowance = balance.monthly_allowance;
  const atZero = total <= 0;
  const low = allowance > 0 && sub <= Math.max(1, Math.round(allowance * 0.1));

  const subGranted = balance.subscription_used + Math.max(0, sub);
  const title =
    `Subscription used: ${balance.subscription_used.toLocaleString()} / ${subGranted.toLocaleString()} credits this month\n` +
    `Purchased used: ${Math.max(0, balance.purchased_total - purch).toLocaleString()} / ${balance.purchased_total.toLocaleString()} credits`;

  const inner = (
    <>
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
      {interactive && <Plus size={12} className="text-indigo-500" />}
    </>
  );

  return interactive ? (
    <button onClick={openBuyTokens} title={title} className={`${pillClass} hover:bg-slate-200/60 transition-colors`}>
      {inner}
    </button>
  ) : (
    <span title={title} className={pillClass}>
      {inner}
    </span>
  );
}
